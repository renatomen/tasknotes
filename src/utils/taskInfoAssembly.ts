import { taskInfoTitle } from "../i18n/taskInfoTitle";
import type { TaskInfo } from "../types";
import { calculateTotalTimeSpent } from "./helpers";

export interface BuildTaskInfoFromMappedTaskInput {
	path: string;
	mappedTask: Partial<TaskInfo>;
	defaultTaskStatus: string;
	isBlocked: boolean;
	blockingTasks: string[];
	startBlocked?: boolean;
	finishBlocked?: boolean;
	isBlockingStart?: boolean;
	isBlockingFinish?: boolean;
}

/** Omitted per-endpoint flags default to the start endpoint: blocked means start-blocked. */
export function buildTaskInfoFromMappedTask({
	path,
	mappedTask,
	defaultTaskStatus,
	isBlocked,
	blockingTasks,
	startBlocked,
	finishBlocked,
	isBlockingStart,
	isBlockingFinish,
}: BuildTaskInfoFromMappedTaskInput): TaskInfo {
	const totalTrackedTime = mappedTask.timeEntries
		? calculateTotalTimeSpent(mappedTask.timeEntries)
		: 0;

	return {
		...mappedTask,
		path,
		title: taskInfoTitle(mappedTask.title),
		status: mappedTask.status || defaultTaskStatus,
		priority: mappedTask.priority || "",
		archived: mappedTask.archived || false,
		tags: Array.isArray(mappedTask.tags) ? mappedTask.tags : [],
		contexts: Array.isArray(mappedTask.contexts) ? mappedTask.contexts : [],
		projects: Array.isArray(mappedTask.projects) ? mappedTask.projects : [],
		totalTrackedTime,
		isBlocked,
		startBlocked: startBlocked ?? isBlocked,
		finishBlocked: finishBlocked ?? false,
		isBlocking: blockingTasks.length > 0,
		isBlockingStart: isBlockingStart ?? blockingTasks.length > 0,
		isBlockingFinish: isBlockingFinish ?? false,
		blocking: blockingTasks.length > 0 ? blockingTasks : undefined,
	};
}
