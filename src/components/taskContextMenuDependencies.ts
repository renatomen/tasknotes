import { Notice } from "obsidian";
import TaskNotesPlugin from "../main";
import { TaskDependency, TaskDependencyRelType, TaskInfo } from "../types";
import {
	DEFAULT_DEPENDENCY_RELTYPE,
	formatDependencyLink,
	normalizeDependencyEntry,
} from "../utils/dependencyUtils";
import { createTaskNotesLogger } from "../utils/tasknotesLogger";

const logger = createTaskNotesLogger({ tag: "Components/TaskContextMenuDependencies" });

export type DependencyTranslate = (
	key: string,
	params?: Record<string, string | number>
) => string;

export interface AddDependencyContext {
	plugin: TaskNotesPlugin;
	task: TaskInfo;
	selectedTask: TaskInfo;
	reltype?: TaskDependencyRelType;
	translate: DependencyTranslate;
	onUpdate?: () => void;
}

function dependencyKey(entry: TaskDependency): string {
	return `${entry.uid}::${entry.reltype}::${entry.gap ?? ""}`;
}

function dedupeDependencies(entries: Array<TaskDependency | string>): TaskDependency[] {
	const seen = new Map<string, TaskDependency>();
	for (const entry of entries) {
		const normalized = normalizeDependencyEntry(entry);
		if (!normalized) {
			continue;
		}
		const key = dependencyKey(normalized);
		if (!seen.has(key)) {
			seen.set(key, normalized);
		}
	}
	return Array.from(seen.values());
}

export async function addBlockedByDependency({
	plugin,
	task,
	selectedTask,
	reltype = DEFAULT_DEPENDENCY_RELTYPE,
	translate,
	onUpdate,
}: AddDependencyContext): Promise<void> {
	if (selectedTask.path === task.path) {
		return;
	}

	try {
		const dependency: TaskDependency = {
			uid: formatDependencyLink(
				plugin.app,
				task.path,
				selectedTask.path,
				plugin.settings.useFrontmatterMarkdownLinks
			),
			reltype,
		};
		const existing = Array.isArray(task.blockedBy) ? task.blockedBy : [];
		const combined = dedupeDependencies([...existing, dependency]);
		if (combined.length === existing.length) {
			return;
		}

		const updatedTask = await plugin.updateTaskProperty(task, "blockedBy", combined);
		Object.assign(task, updatedTask);

		new Notice(
			translate("contextMenus.task.dependencies.notices.blockedByAdded", { count: 1 })
		);
		onUpdate?.();
	} catch (error) {
		logger.error("Failed to add blocked-by dependency via selector:", {
			category: "persistence",
			operation: "add-blocked-by-dependency-via-selector",
			error,
		});
		new Notice(translate("contextMenus.task.dependencies.notices.updateFailed"));
	}
}

export async function addBlockingDependency({
	plugin,
	task,
	selectedTask,
	reltype = DEFAULT_DEPENDENCY_RELTYPE,
	translate,
	onUpdate,
}: AddDependencyContext): Promise<void> {
	const blockedPath = selectedTask.path;
	if (blockedPath === task.path) {
		return;
	}
	if (task.blocking?.includes(blockedPath)) {
		return;
	}

	try {
		const rawEntry: TaskDependency = {
			uid: formatDependencyLink(
				plugin.app,
				blockedPath,
				task.path,
				plugin.settings.useFrontmatterMarkdownLinks
			),
			reltype,
		};
		await plugin.taskService.updateBlockingRelationships(task, [blockedPath], [], {
			[blockedPath]: rawEntry,
		});

		const refreshed = await plugin.cacheManager.getTaskInfo(task.path);
		if (refreshed) {
			Object.assign(task, refreshed);
		} else if (Array.isArray(task.blocking)) {
			task.blocking = Array.from(new Set([...task.blocking, blockedPath]));
		} else {
			task.blocking = [blockedPath];
		}

		new Notice(
			translate("contextMenus.task.dependencies.notices.blockingAdded", { count: 1 })
		);
		onUpdate?.();
	} catch (error) {
		logger.error("Failed to add blocking dependency via selector:", {
			category: "persistence",
			operation: "add-blocking-dependency-via-selector",
			error,
		});
		new Notice(translate("contextMenus.task.dependencies.notices.updateFailed"));
	}
}
