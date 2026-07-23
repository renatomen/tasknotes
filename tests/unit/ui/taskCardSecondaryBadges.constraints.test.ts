import { describe, expect, it } from "@jest/globals";
import type { App } from "obsidian";
import type { TaskDependency, TaskInfo } from "../../../src/types";
import {
	type DependencyConstraintSource,
	resolveBlockedConstraint,
} from "../../../src/ui/taskCardRelationships";

const app = {
	metadataCache: { getFirstLinkpathDest: () => null },
	vault: { getAbstractFileByPath: () => null },
} as unknown as App;

function makeTask(overrides: Partial<TaskInfo> = {}): TaskInfo {
	return {
		title: "Task",
		status: "open",
		priority: "normal",
		path: "Tasks/dep.md",
		archived: false,
		tags: ["task"],
		contexts: [],
		projects: [],
		...overrides,
	};
}

function edge(uid: string, reltype: TaskDependency["reltype"]): TaskDependency {
	return { uid, reltype };
}

function cache(start: string[], finish: string[]): DependencyConstraintSource {
	return {
		getStartBlockingPredecessorPaths: () => start,
		getFinishBlockingPredecessorPaths: () => finish,
	};
}

describe("resolveBlockedConstraint honest signal (U5)", () => {
	it("an SS edge to a not-started predecessor is start-blocked", () => {
		const task = makeTask({
			blockedBy: [edge("Tasks/pred.md", "STARTTOSTART")],
			startBlocked: true,
			finishBlocked: false,
			isBlocked: true,
		});
		expect(resolveBlockedConstraint(task, app, cache(["Tasks/pred.md"], []))).toEqual({
			state: "start",
			count: 1,
		});
	});

	it("an FF edge to an incomplete predecessor is finish-blocked (can start)", () => {
		const task = makeTask({
			blockedBy: [edge("Tasks/pred.md", "FINISHTOFINISH")],
			startBlocked: false,
			finishBlocked: true,
			isBlocked: true,
		});
		expect(resolveBlockedConstraint(task, app, cache([], ["Tasks/pred.md"]))).toEqual({
			state: "finish",
			count: 1,
		});
	});

	it("both-blocked collapses to start (an un-startable task is implicitly un-finishable)", () => {
		const task = makeTask({
			blockedBy: [edge("Tasks/a.md", "STARTTOSTART"), edge("Tasks/b.md", "FINISHTOFINISH")],
			startBlocked: true,
			finishBlocked: true,
			isBlocked: true,
		});
		expect(resolveBlockedConstraint(task, app, cache(["Tasks/a.md"], ["Tasks/b.md"]))).toEqual({
			state: "start",
			count: 1,
		});
	});

	it("a released edge drops the blocked label but still lists as a dependency", () => {
		const task = makeTask({
			blockedBy: [edge("Tasks/pred.md", "STARTTOSTART")],
			startBlocked: false,
			finishBlocked: false,
			isBlocked: false,
		});
		expect(resolveBlockedConstraint(task, app, cache([], []))).toEqual({
			state: "released",
			count: 1,
		});
	});

	it("the count reflects only currently-constraining predecessors, not existence", () => {
		const task = makeTask({
			blockedBy: [edge("Tasks/a.md", "STARTTOSTART"), edge("Tasks/b.md", "STARTTOSTART")],
			startBlocked: true,
			finishBlocked: false,
			isBlocked: true,
		});
		expect(resolveBlockedConstraint(task, app, cache(["Tasks/a.md"], []))).toEqual({
			state: "start",
			count: 1,
		});
	});

	it("no blocked-by edges yields state none", () => {
		expect(resolveBlockedConstraint(makeTask(), app, cache([], []))).toEqual({
			state: "none",
			count: 0,
		});
	});

	it("falls back to the existence count when no cache is available", () => {
		const task = makeTask({
			blockedBy: [edge("Tasks/pred.md", "STARTTOSTART")],
			startBlocked: true,
			finishBlocked: false,
			isBlocked: true,
		});
		expect(resolveBlockedConstraint(task, app, undefined)).toEqual({
			state: "start",
			count: 1,
		});
	});
});
