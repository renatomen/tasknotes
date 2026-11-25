import { describe, expect, it, beforeEach, jest } from "@jest/globals";
import type { App } from "obsidian";
import { App as MockApp, MockObsidian } from "../../helpers/obsidian-runtime";
import { FieldMapper } from "../../../src/core/FieldMapper";
import { StatusManager } from "../../../src/services/StatusManager";
import {
	DEFAULT_FIELD_MAPPING,
	DEFAULT_SETTINGS,
	DEFAULT_STATUSES,
} from "../../../src/settings/defaults";
import type { TaskInfo } from "../../../src/types";
import { DependencyCache } from "../../../src/utils/DependencyCache";
import { TaskManager } from "../../../src/utils/TaskManager";
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

describe("buildTaskInfoFromMappedTask per-endpoint flags", () => {
	it("carries the start, finish and reverse flags it is given", () => {
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

	it("reads a caller that passes no per-endpoint flags as start-only blocking", () => {
		const task = buildTaskInfoFromMappedTask({
			path: "Tasks/legacy.md",
			mappedTask: makeTask(),
			defaultTaskStatus: "open",
			isBlocked: true,
			blockingTasks: ["Tasks/succ.md"],
		});

		expect(task).toMatchObject({
			startBlocked: true,
			finishBlocked: false,
			isBlockingStart: true,
			isBlockingFinish: false,
		});
	});

	it("marks an unblocked task as neither start- nor finish-blocked", () => {
		const task = buildTaskInfoFromMappedTask({
			path: "Tasks/free.md",
			mappedTask: makeTask(),
			defaultTaskStatus: "open",
			isBlocked: false,
			blockingTasks: [],
			startBlocked: false,
			finishBlocked: false,
		});

		expect(task).toMatchObject({ startBlocked: false, finishBlocked: false, isBlocked: false });
	});
});

describe("TaskManager task info per-endpoint flags", () => {
	const predecessorPath = "Tasks/pred.md";
	const successorPath = "Tasks/dep.md";

	function createManager(): { app: App; manager: TaskManager; mapper: FieldMapper } {
		const app = new MockApp() as unknown as App;
		const settings = {
			...DEFAULT_SETTINGS,
			taskIdentificationMethod: "tag" as const,
			taskTag: "task",
			excludedFolders: "",
			storeTitleInFilename: false,
		};
		const mapper = new FieldMapper(DEFAULT_FIELD_MAPPING);
		MockObsidian.createTestFile(
			predecessorPath,
			"---\ntitle: Pred\ntags: [task]\nstatus: in-progress\n---\n"
		);
		// The successor's id differs from its path; blocking state is looked up by path.
		MockObsidian.createTestFile(
			successorPath,
			[
				"---",
				"id: stable-dep-id",
				"title: Dep",
				"tags: [task]",
				"status: open",
				"blockedBy:",
				"  - uid: '[[pred]]'",
				"    reltype: STARTTOSTART",
				"  - uid: '[[pred]]'",
				"    reltype: FINISHTOFINISH",
				"    gap: P1D",
				"---",
				"",
			].join("\n")
		);
		app.metadataCache.getFirstLinkpathDest = jest.fn((linkpath: string) =>
			linkpath === "pred" ? app.vault.getAbstractFileByPath(predecessorPath) : null
		) as never;
		return { app, manager: new TaskManager(app, settings, mapper), mapper };
	}

	beforeEach(() => MockObsidian.reset());

	it("carries the flags the dependency cache computes for the task's path", async () => {
		const { app, manager, mapper } = createManager();
		const dependencyCache = new DependencyCache(
			app,
			{} as never,
			mapper,
			new StatusManager(DEFAULT_STATUSES),
			(frontmatter) => manager.isTaskFile(frontmatter)
		);
		await dependencyCache.buildIndexes();
		manager.setDependencyCache(dependencyCache);

		expect(await manager.getTaskInfo(successorPath)).toMatchObject({
			id: "stable-dep-id",
			path: successorPath,
			isBlocked: true,
			startBlocked: false,
			finishBlocked: true,
			isBlocking: false,
			isBlockingStart: false,
			isBlockingFinish: false,
		});
		expect(await manager.getTaskInfo(predecessorPath)).toMatchObject({
			isBlocked: false,
			startBlocked: false,
			finishBlocked: false,
			isBlocking: true,
			isBlockingStart: false,
			isBlockingFinish: true,
			blocking: [successorPath],
		});
	});

	it("without a dependency cache, counts every listed dependency as unreleased", async () => {
		const { manager } = createManager();

		expect(await manager.getTaskInfo(successorPath)).toMatchObject({
			isBlocked: true,
			startBlocked: true,
			finishBlocked: true,
			isBlockingStart: false,
			isBlockingFinish: false,
		});
		expect(await manager.getTaskInfo(predecessorPath)).toMatchObject({
			isBlocked: false,
			startBlocked: false,
			finishBlocked: false,
		});
	});
});
