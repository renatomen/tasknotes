import type { App } from "obsidian";
import type { TaskDependency, TaskInfo } from "../types";
import { normalizeDependencyEntry, resolveDependencyEntry } from "../utils/dependencyUtils";
import { stringifyUnknown } from "../utils/stringUtils";

export type ExpandedRelationshipFilterMode = "inherit" | "show-all";

export interface TaskCardRelationshipOptions {
	expandedRelationshipFilterMode?: ExpandedRelationshipFilterMode;
	resolveExpandedRelationshipFilterMode?: () => ExpandedRelationshipFilterMode;
	expandedRelationshipTaskPaths?: ReadonlySet<string>;
	expandedRelationshipTaskOrder?: ReadonlyMap<string, number>;
}

export function parseExpandedRelationshipFilterMode(
	value: unknown
): ExpandedRelationshipFilterMode {
	if (typeof value === "number") {
		return value === 1 ? "show-all" : "inherit";
	}

	const normalized = stringifyUnknown(value)
		.trim()
		.toLowerCase()
		.replace(/^['"]|['"]$/g, "")
		.replace(/[_\s]+/g, "-");

	if (normalized === "show-all" || normalized === "1") {
		return "show-all";
	}

	if (normalized === "inherit" || normalized === "0") {
		return "inherit";
	}

	return "inherit";
}

export function filterExpandedRelationshipTasks(
	tasks: TaskInfo[],
	options: TaskCardRelationshipOptions = {}
): TaskInfo[] {
	const filterMode = parseExpandedRelationshipFilterMode(
		options.resolveExpandedRelationshipFilterMode?.() ?? options.expandedRelationshipFilterMode
	);
	if (filterMode !== "inherit") {
		return tasks;
	}

	const allowedTaskPaths = options.expandedRelationshipTaskPaths;
	if (!allowedTaskPaths) {
		return tasks;
	}

	return tasks.filter((relatedTask) => allowedTaskPaths.has(relatedTask.path));
}

export function sortExpandedRelationshipTasks(
	tasks: TaskInfo[],
	options: TaskCardRelationshipOptions = {},
	sortTasks: (tasks: TaskInfo[]) => TaskInfo[]
): TaskInfo[] {
	const taskOrder = options.expandedRelationshipTaskOrder;
	if (!taskOrder || taskOrder.size === 0) {
		return sortTasks([...tasks]);
	}

	const ranked: TaskInfo[] = [];
	const unranked: TaskInfo[] = [];
	for (const task of tasks) {
		if (taskOrder.has(task.path)) {
			ranked.push(task);
		} else {
			unranked.push(task);
		}
	}

	ranked.sort((a, b) => {
		const aOrder = taskOrder.get(a.path);
		const bOrder = taskOrder.get(b.path);
		if (aOrder === undefined || bOrder === undefined) {
			return 0;
		}
		return aOrder - bOrder;
	});

	return [...ranked, ...sortTasks([...unranked])];
}

export function getBlockedByTaskPaths(task: TaskInfo, app: App): string[] {
	const entries = Array.isArray(task.blockedBy)
		? (task.blockedBy as Array<TaskDependency | string>)
		: [];
	const paths = new Set<string>();

	for (const entry of entries) {
		const normalized = normalizeDependencyEntry(entry);
		if (!normalized) continue;

		const resolved = resolveDependencyEntry(app, task.path, normalized);
		const path = resolved?.path || normalized.uid;
		if (path) {
			paths.add(path);
		}
	}

	return Array.from(paths);
}

export function hasUnresolvedBlockedBy(task: TaskInfo, app: App): boolean {
	const entries = Array.isArray(task.blockedBy) ? task.blockedBy : [];
	return entries.some((entry) => {
		const normalized = normalizeDependencyEntry(entry);
		return normalized !== null && !resolveDependencyEntry(app, task.path, normalized);
	});
}

export interface DependencyConstraintSource {
	getStartBlockingPredecessorPaths(taskPath: string): string[];
	getFinishBlockingPredecessorPaths(taskPath: string): string[];
}

export function getStartBlockingTaskPaths(
	task: TaskInfo,
	cache: DependencyConstraintSource | undefined
): string[] {
	return cache ? cache.getStartBlockingPredecessorPaths(task.path) : [];
}

export function getFinishBlockingTaskPaths(
	task: TaskInfo,
	cache: DependencyConstraintSource | undefined
): string[] {
	return cache ? cache.getFinishBlockingPredecessorPaths(task.path) : [];
}

export type BlockedConstraintState = "start" | "finish" | "released" | "none";

export interface BlockedConstraintInfo {
	state: BlockedConstraintState;
	count: number;
}

// Start wins over finish (an un-startable task is implicitly un-finishable), and the count
// excludes released edges: a satisfied dependency is listed but not counted.
export function resolveBlockedConstraint(
	task: TaskInfo,
	app: App,
	cache: DependencyConstraintSource | undefined
): BlockedConstraintInfo {
	const existence = getBlockedByTaskPaths(task, app);
	if (existence.length === 0) {
		return { state: "none", count: 0 };
	}
	if (task.startBlocked) {
		const constraining = getStartBlockingTaskPaths(task, cache).length;
		return { state: "start", count: constraining || existence.length };
	}
	if (task.finishBlocked) {
		const constraining = getFinishBlockingTaskPaths(task, cache).length;
		return { state: "finish", count: constraining || existence.length };
	}
	// A broken-link blocker can't be confirmed satisfied — hold it pessimistically blocked.
	if (hasUnresolvedBlockedBy(task, app)) {
		return { state: "start", count: existence.length };
	}
	return { state: "released", count: existence.length };
}
