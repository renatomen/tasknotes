import { describe, expect, it } from "@jest/globals";
import type { TaskInfo } from "../../../src/types";
import { buildTaskInfoFromMappedTask } from "../../../src/utils/taskInfoAssembly";

function makeTask(overrides: Partial<TaskInfo> = {}): TaskInfo {
	return {
		title: "Task",
		status: "open",
		priority: "normal",
		path: "Tasks/t.md",
		archived: false,
		tags: ["task"],
		contexts: [],
		projects: [],
		...overrides,
	};
}

describe("buildTaskInfoFromMappedTask per-endpoint fields (U4)", () => {
	it("threads start/finish-blocked and reverse flags, with isBlocked as their OR", () => {
		const task = buildTaskInfoFromMappedTask({
			path: "Tasks/dep.md",
			mappedTask: makeTask(),
			defaultTaskStatus: "open",
			isBlocked: true,
			blockingTasks: ["Tasks/succ.md"],
			startBlocked: false,
			finishBlocked: true,
			isBlockingStart: false,
			isBlockingFinish: true,
		});
		expect(task).toMatchObject({
			startBlocked: false,
			finishBlocked: true,
			isBlocked: true,
			isBlockingStart: false,
			isBlockingFinish: true,
			isBlocking: true,
		});
	});

	it("defaults per-endpoint fields for a legacy caller (backward compatible)", () => {
		const task = buildTaskInfoFromMappedTask({
			path: "Tasks/legacy.md",
			mappedTask: makeTask(),
			defaultTaskStatus: "open",
			isBlocked: true,
			blockingTasks: ["Tasks/succ.md"],
		});
		// No per-endpoint input: startBlocked mirrors isBlocked; isBlockingStart mirrors isBlocking.
		expect(task).toMatchObject({
			startBlocked: true,
			finishBlocked: false,
			isBlockingStart: true,
			isBlockingFinish: false,
		});
	});

	it("an unblocked task is neither start- nor finish-blocked", () => {
		const task = buildTaskInfoFromMappedTask({
			path: "Tasks/free.md",
			mappedTask: makeTask(),
			defaultTaskStatus: "open",
			isBlocked: false,
			blockingTasks: [],
			startBlocked: false,
			finishBlocked: false,
		});
		expect(task.startBlocked).toBe(false);
		expect(task.finishBlocked).toBe(false);
		expect(task.isBlocked).toBe(false);
	});
});
