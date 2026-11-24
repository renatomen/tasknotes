import { uiData } from "../i18n/dataText";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { setIcon, setTooltip, TFile } from "obsidian";
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
import { createTaskModalTaskRow } from "./taskModalTaskRow";
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

export interface RenderDependencyListOptions {
	plugin: TaskNotesPlugin;
	listEl: HTMLElement | undefined;
	items: DependencyItem[];
	linkServices: LinkServices;
	translate: (key: MessageDescriptor, params?: Record<string, string | number>) => string;
	onRemove: (index: number) => void;
	/** Omit to render rows without reltype and gap controls. */
	reltypeControls?: DependencyReltypeControls;
}

export type DependencyListSide = "blocked-by" | "blocking";

export interface DependencyReltypeControls {
	side: DependencyListSide;
	/** How the summary line names the task being edited. */
	selfName: string;
	onReltypeChange: (index: number, reltype: TaskDependencyRelType) => void;
	/**
	 * Called on each keystroke, so re-rendering the list from it would take focus from the field.
	 * `gap` is undefined when the entry composes no duration, which removes a stored gap.
	 */
	onGapChange: (index: number, gap: string | undefined) => void;
}

const DEPENDENCY_RELTYPE_LABELS: Record<TaskDependencyRelType, MessageDescriptor> = {
	FINISHTOSTART: msg({ message: "Finish-to-start", context: "ui.dependencies.reltype.finishToStart" }),
	STARTTOSTART: msg({ message: "Start-to-start", context: "ui.dependencies.reltype.startToStart" }),
	FINISHTOFINISH: msg({ message: "Finish-to-finish", context: "ui.dependencies.reltype.finishToFinish" }),
	STARTTOFINISH: msg({ message: "Start-to-finish", context: "ui.dependencies.reltype.startToFinish" }),
};

const DEPENDENCY_SUMMARIES: Record<TaskDependencyRelType, MessageDescriptor> = {
	FINISHTOSTART: msg({ message: "{predecessor} must finish before {successor} can start", context: "modals.task.dependencies.summary.finishToStart" }),
	STARTTOSTART: msg({ message: "{predecessor} must start before {successor} can start", context: "modals.task.dependencies.summary.startToStart" }),
	FINISHTOFINISH: msg({ message: "{predecessor} must finish before {successor} can finish", context: "modals.task.dependencies.summary.finishToFinish" }),
	STARTTOFINISH: msg({ message: "{predecessor} must start before {successor} can finish", context: "modals.task.dependencies.summary.startToFinish" }),
};

const GAP_UNIT_LABELS: Record<DependencyGapUnit, MessageDescriptor> = {
	days: msg({ message: "days", context: "settings.defaults.reminders.units.days" }),
	weeks: msg({ message: "weeks", context: "modals.task.dependencies.gap.units.weeks" }),
	hours: msg({ message: "hours", context: "settings.defaults.reminders.units.hours" }),
};

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

/** The entry on the blocked task that links back to `taskPath`: a blocking edge is stored there, not on the blocker. */
export function findBlockingEdgeDependency(
	plugin: TaskNotesPlugin,
	taskPath: string,
	blockedTask: Pick<TaskInfo, "path" | "blockedBy">
): TaskDependency | null {
	for (const entry of blockedTask.blockedBy ?? []) {
		const normalized = normalizeDependencyEntry(entry);
		if (
			normalized &&
			resolveDependencyEntry(plugin.app, blockedTask.path, normalized)?.path === taskPath
		) {
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
		index === indexToUpdate ? { ...item, dependency: { ...item.dependency, ...patch } } : item
	);
}

const dependencyListRenderVersions = new WeakMap<HTMLElement, number>();

export async function renderDependencyList({
	plugin,
	listEl,
	items,
	linkServices,
	translate,
	onRemove,
	reltypeControls,
}: RenderDependencyListOptions): Promise<void> {
	if (!listEl) {
		return;
	}

	const version = (dependencyListRenderVersions.get(listEl) ?? 0) + 1;
	dependencyListRenderVersions.set(listEl, version);
	// Build off-DOM so concurrent renders cannot interleave rows in the visible list.
	const rows = listEl.cloneNode(false) as HTMLElement;

	for (const [index, item] of items.entries()) {
		if (dependencyListRenderVersions.get(listEl) !== version) return;

		const hasResolvedTaskPath = Boolean(item.path && !item.unresolved);
		const itemEl = rows.createDiv({
			cls: hasResolvedTaskPath
				? "task-project-item task-project-item--task-card"
				: "task-project-item",
		});
		if (item.unresolved) {
			itemEl.addClass("task-project-item--unresolved");
			setTooltip(
				itemEl,
				translate(msg({ message: "Could not resolve: {entries}", context: "contextMenus.task.dependencies.notices.unresolved" }), {
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
			if (dependencyListRenderVersions.get(listEl) !== version) return;
		} else {
			renderUnresolvedDependency(contentEl, item);
		}

		const removeBtn = itemEl.createEl("button", {
			cls: "task-project-remove",
			text: "×",
		});
		setTooltip(removeBtn, translate(msg({ message: "Remove task", context: "modals.task.dependencies.removeTaskTooltip" })), {
			placement: "top",
		});
		removeBtn.addEventListener("click", (event) => {
			event.preventDefault();
			event.stopPropagation();
			// The visible rows may belong to an older list while its replacement loads.
			if (dependencyListRenderVersions.get(listEl) !== version) return;
			onRemove(index);
		});

		if (reltypeControls) {
			renderReltypeControls(itemEl, {
				item,
				index,
				controls: reltypeControls,
				translate,
				isCurrent: () => dependencyListRenderVersions.get(listEl) === version,
			});
		}
	}

	if (dependencyListRenderVersions.get(listEl) === version) {
		listEl.replaceChildren(...rows.childNodes);
	}
}

interface ReltypeControlsOptions {
	item: DependencyItem;
	index: number;
	controls: DependencyReltypeControls;
	translate: RenderDependencyListOptions["translate"];
	/** False once a newer render has started, when `index` may no longer be this row's. */
	isCurrent: () => boolean;
}

function renderReltypeControls(itemEl: HTMLElement, options: ReltypeControlsOptions): void {
	const { item, index, controls, translate, isCurrent } = options;
	itemEl.addClass("task-project-item--with-reltype");
	const controlsEl = itemEl.createDiv({ cls: "task-dependency-controls" });

	const reltypeLabel = translate(msg({ message: "Relationship", context: "modals.task.dependencies.reltype.label" }));
	const reltypeField = controlsEl.createDiv({ cls: "task-dependency-field" });
	reltypeField.createSpan({ cls: "task-dependency-field-label", text: reltypeLabel });
	const reltypeSelect = reltypeField.createEl("select", {
		cls: "tn-select task-dependency-reltype",
		attr: { "aria-label": reltypeLabel },
	});
	for (const [reltype, label] of Object.entries(DEPENDENCY_RELTYPE_LABELS)) {
		reltypeSelect.createEl("option", { value: reltype, text: translate(label) });
	}
	reltypeSelect.value = item.dependency.reltype;
	reltypeSelect.addEventListener("change", () => {
		if (!isCurrent()) return;
		controls.onReltypeChange(index, reltypeSelect.value as TaskDependencyRelType);
	});

	renderGapField(controlsEl, options);

	controlsEl.createDiv({
		cls: "task-dependency-summary",
		text: translate(
			DEPENDENCY_SUMMARIES[item.dependency.reltype],
			controls.side === "blocked-by"
				? { predecessor: item.name, successor: controls.selfName }
				: { predecessor: controls.selfName, successor: item.name }
		),
	});
}

function renderGapField(
	controlsEl: HTMLElement,
	{ item, index, controls, translate, isCurrent }: ReltypeControlsOptions
): void {
	const gapLabel = translate(msg({ message: "Lag", context: "modals.task.dependencies.gap.label" }));
	const gapField = controlsEl.createDiv({ cls: "task-dependency-field" });
	gapField.createSpan({ cls: "task-dependency-field-label", text: gapLabel });

	const parsed = parseDependencyGap(item.dependency.gap);
	if (item.dependency.gap && !parsed) {
		// Read-only: any value composed here would replace a duration these fields cannot express.
		gapField.createSpan({
			cls: "task-dependency-gap-exotic",
			text: translate(msg({ message: "Custom offset: {gap}", context: "modals.task.dependencies.gap.exotic" }), {
				gap: item.dependency.gap,
			}),
		});
		return;
	}

	const valueInput = gapField.createEl("input", {
		cls: "task-dependency-gap-value",
		type: "number",
		value: parsed ? String(parsed.value) : "",
		attr: { "aria-label": gapLabel, min: "0", max: "100000", step: "1", placeholder: "0" },
	});
	const unitSelect = gapField.createEl("select", {
		cls: "tn-select task-dependency-gap-unit",
		attr: { "aria-label": gapLabel },
	});
	for (const [unit, label] of Object.entries(GAP_UNIT_LABELS)) {
		unitSelect.createEl("option", { value: unit, text: translate(label) });
	}
	unitSelect.value = parsed?.unit ?? "days";

	const emitGap = () => {
		if (!isCurrent()) return;
		controls.onGapChange(
			index,
			composeDependencyGap(Number(valueInput.value), unitSelect.value as DependencyGapUnit)
		);
	};
	// Not "change": saving from the keyboard leaves the field focused, so "change" would never fire.
	valueInput.addEventListener("input", emitGap);
	unitSelect.addEventListener("change", emitGap);
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
		contentEl.appendChild(createTaskModalTaskRow(taskInfo, plugin));
		return;
	}

	const nameEl = contentEl.createSpan({ cls: "task-project-name clickable-dependency" });
	appendInternalLink(nameEl, item.path, uiData(item.name, "Resolved vault/Markdown link alias or filename; preserve user-authored link data"), linkServices, {
		cssClass: "task-dependency-link internal-link",
		hoverSource: "tasknotes-dependency-link",
		showErrorNotices: true,
	});
	if (item.path !== item.name) {
		contentEl.createDiv({ cls: "task-project-path", text: item.path });
	}
}

/** Sits where a task's status glyph would, so missing tasks align with the found ones. */
function renderUnresolvedDependency(contentEl: HTMLElement, item: DependencyItem): void {
	setIcon(contentEl.createSpan({ cls: "tn-task-modal__task-row-placeholder" }), "unlink");
	const nameEl = contentEl.createSpan({ cls: "task-project-name" });
	nameEl.textContent = item.name;
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
