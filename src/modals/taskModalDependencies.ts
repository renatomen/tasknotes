import { setTooltip, TFile } from "obsidian";
import TaskNotesPlugin from "../main";
import { TaskDependency, TaskDependencyRelType, TaskInfo } from "../types";
import {
	composeDependencyGap,
	DEFAULT_DEPENDENCY_RELTYPE,
	type DependencyGapUnit,
	formatDependencyLink,
	normalizeDependencyEntry,
	parseDependencyGap,
	resolveDependencyEntry,
} from "../utils/dependencyUtils";
import { appendInternalLink, type LinkServices } from "../ui/renderers/linkRenderer";
import { createTaskCard } from "../ui/TaskCard";
import { stringifyUnknown } from "../utils/stringUtils";

export interface DependencyItem {
	dependency: TaskDependency;
	name: string;
	path?: string;
	unresolved?: boolean;
}

export interface CreateDependencyContext {
	plugin: TaskNotesPlugin;
	sourcePath: string;
}

export type DependencyListSide = "blocked-by" | "blocking";

export interface RenderDependencyListOptions {
	plugin: TaskNotesPlugin;
	listEl: HTMLElement | undefined;
	items: DependencyItem[];
	linkServices: LinkServices;
	translate: (key: string, params?: Record<string, string | number>) => string;
	onRemove: (index: number) => void;
	side: DependencyListSide;
	selfName: string;
	showReltypeControls?: boolean;
	onReltypeChange?: (index: number, reltype: TaskDependencyRelType) => void;
	onGapChange?: (index: number, gap: string | undefined) => void;
}

const RELTYPE_ORDER: TaskDependencyRelType[] = [
	"FINISHTOSTART",
	"STARTTOSTART",
	"FINISHTOFINISH",
	"STARTTOFINISH",
];

const RELTYPE_KEY: Record<TaskDependencyRelType, string> = {
	FINISHTOSTART: "finishToStart",
	STARTTOSTART: "startToStart",
	FINISHTOFINISH: "finishToFinish",
	STARTTOFINISH: "startToFinish",
};

const GAP_UNITS: DependencyGapUnit[] = ["days", "weeks", "hours"];

export function createDependencyItemFromFile(
	{ plugin, sourcePath }: CreateDependencyContext,
	file: TFile
): DependencyItem {
	const uid = formatDependencyLink(
		plugin.app,
		sourcePath,
		file.path,
		plugin.settings.useFrontmatterMarkdownLinks
	);
	return {
		dependency: { uid, reltype: DEFAULT_DEPENDENCY_RELTYPE },
		path: file.path,
		name: file.basename,
	};
}

export function createDependencyItemFromDependency(
	{ plugin, sourcePath }: CreateDependencyContext,
	dependency: TaskDependency
): DependencyItem {
	const normalized = normalizeDependencyEntry(dependency);
	if (!normalized) {
		const fallbackName =
			typeof dependency === "object" &&
			dependency &&
			"uid" in dependency &&
			typeof dependency.uid === "string"
				? dependency.uid
				: stringifyUnknown(dependency);
		return {
			dependency: { uid: fallbackName, reltype: DEFAULT_DEPENDENCY_RELTYPE },
			name: fallbackName,
			unresolved: true,
		};
	}

	const resolution = resolveDependencyEntry(plugin.app, sourcePath, normalized);
	if (resolution) {
		const name = resolution.file?.basename || resolution.path.split("/").pop() || normalized.uid;
		return {
			dependency: normalized,
			path: resolution.path,
			name,
		};
	}

	const cleaned = normalized.uid.replace(/^\[\[/, "").replace(/\]\]$/, "");
	return {
		dependency: normalized,
		name: cleaned || dependency.uid,
		unresolved: true,
	};
}

// A blocking edge's canonical reltype/gap lives in the blocked task's blockedBy, not on this
// task; find the entry there that points back to this task so the row shows the real values.
export function findBlockingEdgeDependency(
	plugin: TaskNotesPlugin,
	thisTaskPath: string,
	blockingTask: Pick<TaskInfo, "path" | "blockedBy">
): TaskDependency | null {
	const entries = Array.isArray(blockingTask.blockedBy) ? blockingTask.blockedBy : [];
	for (const entry of entries) {
		const normalized = normalizeDependencyEntry(entry);
		if (!normalized) {
			continue;
		}
		const resolved = resolveDependencyEntry(plugin.app, blockingTask.path, normalized);
		if (resolved?.path === thisTaskPath) {
			return normalized;
		}
	}
	return null;
}

export function createDependencyItemFromPath(
	{ plugin, sourcePath }: CreateDependencyContext,
	path: string
): DependencyItem {
	const file = plugin.app.vault.getAbstractFileByPath(path);
	if (file instanceof TFile) {
		return createDependencyItemFromFile({ plugin, sourcePath }, file);
	}

	const basename = path.split("/").pop() || path;
	const nameWithoutExt = basename.replace(/\.md$/i, "");
	return {
		dependency: {
			uid: `[[${nameWithoutExt}]]`,
			reltype: DEFAULT_DEPENDENCY_RELTYPE,
		},
		path,
		name: nameWithoutExt,
		unresolved: true,
	};
}

export interface DependencyCandidateOptions {
	plugin: TaskNotesPlugin;
	sourcePath: string;
	allTasks: readonly TaskInfo[];
	existingItems: readonly DependencyItem[];
	currentPath?: string;
}

export function dependencyItemExists(
	items: readonly DependencyItem[],
	item: DependencyItem
): boolean {
	return items.some(
		(existing) =>
			existing.dependency.uid === item.dependency.uid ||
			(Boolean(item.path) && existing.path === item.path)
	);
}

export function addDependencyItem(
	items: readonly DependencyItem[],
	item: DependencyItem
): DependencyItem[] {
	if (dependencyItemExists(items, item)) {
		return [...items];
	}

	return [...items, item];
}

export function removeDependencyItemAtIndex(
	items: readonly DependencyItem[],
	indexToRemove: number
): DependencyItem[] {
	return items.filter((_, index) => index !== indexToRemove);
}

export function updateDependencyItemAtIndex(
	items: readonly DependencyItem[],
	indexToUpdate: number,
	patch: Partial<TaskDependency>
): DependencyItem[] {
	return items.map((item, index) =>
		index === indexToUpdate
			? { ...item, dependency: { ...item.dependency, ...patch } }
			: item
	);
}

export async function renderDependencyList({
	plugin,
	listEl,
	items,
	linkServices,
	translate,
	onRemove,
	side,
	selfName,
	showReltypeControls,
	onReltypeChange,
	onGapChange,
}: RenderDependencyListOptions): Promise<void> {
	if (!listEl) {
		return;
	}

	listEl.empty();
	if (items.length === 0) {
		return;
	}

	for (const [index, item] of items.entries()) {
		const hasResolvedTaskPath = Boolean(item.path && !item.unresolved);
		const itemEl = listEl.createDiv({
			cls: hasResolvedTaskPath
				? "task-project-item task-project-item--task-card"
				: "task-project-item",
		});
		if (showReltypeControls) {
			itemEl.addClass("task-project-item--with-reltype");
		}
		if (item.unresolved) {
			itemEl.addClass("task-project-item--unresolved");
			setTooltip(
				itemEl,
				translate("contextMenus.task.dependencies.notices.unresolved", {
					entries: item.dependency.uid,
				}),
				{ placement: "top" }
			);
		}

		const contentEl = itemEl.createDiv({
			cls: hasResolvedTaskPath ? "task-project-card-host" : "task-project-info",
		});

		if (item.path && !item.unresolved) {
			await renderResolvedDependency(plugin, contentEl, item, linkServices);
		} else {
			renderUnresolvedDependency(contentEl, item);
		}

		const removeBtn = itemEl.createEl("button", {
			cls: "task-project-remove",
			text: "×",
		});
		setTooltip(removeBtn, translate("modals.task.dependencies.removeTaskTooltip"), {
			placement: "top",
		});
		removeBtn.addEventListener("click", (event) => {
			event.preventDefault();
			event.stopPropagation();
			onRemove(index);
		});

		if (showReltypeControls) {
			renderReltypeControls(itemEl, {
				item,
				index,
				side,
				selfName,
				translate,
				onReltypeChange,
				onGapChange,
			});
		}
	}
}

interface ReltypeControlsOptions {
	item: DependencyItem;
	index: number;
	side: DependencyListSide;
	selfName: string;
	translate: (key: string, params?: Record<string, string | number>) => string;
	onReltypeChange?: (index: number, reltype: TaskDependencyRelType) => void;
	onGapChange?: (index: number, gap: string | undefined) => void;
}

function renderReltypeControls(itemEl: HTMLElement, options: ReltypeControlsOptions): void {
	const { item, index, side, selfName, translate, onReltypeChange, onGapChange } = options;
	const controlsEl = itemEl.createDiv({ cls: "task-dependency-controls" });

	const reltypeField = controlsEl.createDiv({ cls: "task-dependency-field" });
	reltypeField.createSpan({
		cls: "task-dependency-field-label",
		text: translate("modals.task.dependencies.reltype.label"),
	});
	const reltypeSelect = reltypeField.createEl("select", {
		cls: "task-dependency-reltype dropdown",
	});
	for (const reltype of RELTYPE_ORDER) {
		const option = reltypeSelect.createEl("option", {
			value: reltype,
			text: translate(`modals.task.dependencies.reltype.${RELTYPE_KEY[reltype]}`),
		});
		if (reltype === item.dependency.reltype) {
			option.selected = true;
		}
	}
	reltypeSelect.addEventListener("change", () => {
		onReltypeChange?.(index, reltypeSelect.value as TaskDependencyRelType);
	});

	renderGapField(controlsEl, { item, index, translate, onGapChange });

	const sideKey = side === "blocked-by" ? "blockedBy" : "blocking";
	controlsEl.createDiv({
		cls: "task-dependency-summary",
		text: translate(
			`modals.task.dependencies.summary.${sideKey}.${RELTYPE_KEY[item.dependency.reltype]}`,
			{ self: selfName, other: item.name }
		),
	});
}

function renderGapField(
	controlsEl: HTMLElement,
	options: Pick<ReltypeControlsOptions, "item" | "index" | "translate" | "onGapChange">
): void {
	const { item, index, translate, onGapChange } = options;
	const parsed = parseDependencyGap(item.dependency.gap);

	const gapField = controlsEl.createDiv({ cls: "task-dependency-field" });
	gapField.createSpan({
		cls: "task-dependency-field-label",
		text: translate("modals.task.dependencies.gap.label"),
	});

	// A stored gap this UI can't compose stays read-only so an edit never silently rewrites it.
	if (item.dependency.gap && !parsed) {
		gapField.createSpan({
			cls: "task-dependency-gap-exotic",
			text: translate("modals.task.dependencies.gap.exotic", { gap: item.dependency.gap }),
		});
		return;
	}

	const gapValue = gapField.createEl("input", {
		cls: "task-dependency-gap-value",
		type: "number",
	});
	gapValue.min = "0";
	gapValue.placeholder = translate("modals.task.dependencies.gap.placeholder");
	if (parsed) {
		gapValue.value = String(parsed.value);
	}

	const gapUnit = gapField.createEl("select", { cls: "task-dependency-gap-unit dropdown" });
	for (const unit of GAP_UNITS) {
		const option = gapUnit.createEl("option", {
			value: unit,
			text: translate(`modals.task.dependencies.gap.unit.${unit}`),
		});
		if (parsed?.unit === unit) {
			option.selected = true;
		}
	}

	const emitGap = () => {
		onGapChange?.(index, composeDependencyGap(Number(gapValue.value), gapUnit.value as DependencyGapUnit));
	};
	gapValue.addEventListener("change", emitGap);
	gapUnit.addEventListener("change", emitGap);
}

async function renderResolvedDependency(
	plugin: TaskNotesPlugin,
	contentEl: HTMLElement,
	item: DependencyItem,
	linkServices: LinkServices
): Promise<void> {
	if (!item.path) {
		return;
	}

	const taskInfo = await plugin.cacheManager.getCachedTaskInfo(item.path);
	if (taskInfo) {
		const taskCard = createTaskCard(taskInfo, plugin, undefined, {
			layout: "default",
			showSecondaryBadges: false,
			enableHoverPreview: false,
		});
		contentEl.appendChild(taskCard);
		return;
	}

	const nameEl = contentEl.createSpan({ cls: "task-project-name clickable-dependency" });
	appendInternalLink(nameEl, item.path, item.name, linkServices, {
		cssClass: "task-dependency-link internal-link",
		hoverSource: "tasknotes-dependency-link",
		showErrorNotices: true,
	});
	if (item.path !== item.name) {
		contentEl.createDiv({ cls: "task-project-path", text: item.path });
	}
}

function renderUnresolvedDependency(contentEl: HTMLElement, item: DependencyItem): void {
	const nameEl = contentEl.createSpan({ cls: "task-project-name" });
	nameEl.textContent = item.name;
	const pathText = item.path ?? item.dependency.uid;
	contentEl.createDiv({ cls: "task-project-path", text: pathText });
}

export function candidateDependencyUid(
	plugin: TaskNotesPlugin,
	sourcePath: string,
	task: TaskInfo
): string {
	return formatDependencyLink(
		plugin.app,
		sourcePath,
		task.path,
		plugin.settings.useFrontmatterMarkdownLinks
	);
}

export function getBlockedByDependencyCandidates({
	plugin,
	sourcePath,
	allTasks,
	existingItems,
	currentPath,
}: DependencyCandidateOptions): TaskInfo[] {
	const existingUids = new Set(existingItems.map((item) => item.dependency.uid));
	return allTasks.filter((candidate) => {
		if (currentPath && candidate.path === currentPath) {
			return false;
		}
		const candidateUid = candidateDependencyUid(plugin, sourcePath, candidate);
		return !existingUids.has(candidateUid);
	});
}

export function getBlockingDependencyCandidates({
	plugin,
	sourcePath,
	allTasks,
	existingItems,
	currentPath,
}: DependencyCandidateOptions): TaskInfo[] {
	const existingPaths = new Set(
		existingItems
			.map((item) => item.path)
			.filter((path): path is string => typeof path === "string")
	);
	const existingUids = new Set(existingItems.map((item) => item.dependency.uid));

	return allTasks.filter((candidate) => {
		if (currentPath && candidate.path === currentPath) {
			return false;
		}
		if (existingPaths.has(candidate.path)) {
			return false;
		}
		const candidateUid = candidateDependencyUid(plugin, sourcePath, candidate);
		return !existingUids.has(candidateUid);
	});
}
