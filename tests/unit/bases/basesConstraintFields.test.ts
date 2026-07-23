import { createTaskInfoFromBasesData } from "../../../src/bases/helpers";
import type TaskNotesPlugin from "../../../src/main";
import { FieldMapper } from "../../../src/services/FieldMapper";
import { DEFAULT_FIELD_MAPPING } from "../../../src/settings/defaults";

function createPlugin(dependencyCache?: unknown): TaskNotesPlugin {
	return {
		fieldMapper: new FieldMapper({ ...DEFAULT_FIELD_MAPPING }),
		settings: { defaultTaskStatus: "open", storeTitleInFilename: false },
		dependencyCache,
		cacheManager: { getCachedTaskInfoSync: jest.fn() },
	} as unknown as TaskNotesPlugin;
}

describe("Bases items carry per-endpoint constraint state (U8)", () => {
	it("carries start/finish-blocked from the dependency cache", () => {
		const cache = {
			isTaskStartBlocked: jest.fn(() => true),
			isTaskFinishBlocked: jest.fn(() => false),
			getBlockedTaskPaths: jest.fn(() => []),
			getStartBlockedDependentPaths: jest.fn(() => []),
			getFinishBlockedDependentPaths: jest.fn(() => []),
		};

		const task = createTaskInfoFromBasesData(
			{
				path: "Tasks/Dep.md",
				name: "Dep",
				properties: {
					title: "Dep",
					status: "open",
					blockedBy: [{ uid: "[[Pred]]", reltype: "STARTTOSTART" }],
				},
			},
			createPlugin(cache)
		);

		expect(task?.startBlocked).toBe(true);
		expect(task?.finishBlocked).toBe(false);
		expect(task?.isBlocked).toBe(true);
		expect(cache.isTaskStartBlocked).toHaveBeenCalledWith("Tasks/Dep.md");
	});

	it("marks the reverse (blocking) endpoints from the cache", () => {
		const cache = {
			isTaskStartBlocked: jest.fn(() => false),
			isTaskFinishBlocked: jest.fn(() => false),
			getBlockedTaskPaths: jest.fn(() => ["Tasks/Succ.md"]),
			getStartBlockedDependentPaths: jest.fn(() => ["Tasks/Succ.md"]),
			getFinishBlockedDependentPaths: jest.fn(() => []),
		};

		const task = createTaskInfoFromBasesData(
			{ path: "Tasks/Pred.md", name: "Pred", properties: { title: "Pred", status: "open" } },
			createPlugin(cache)
		);

		expect(task?.isBlockingStart).toBe(true);
		expect(task?.isBlockingFinish).toBe(false);
		expect(task?.isBlocking).toBe(true);
	});

	it("falls back to existence-based endpoint blocking when the cache is absent", () => {
		const task = createTaskInfoFromBasesData(
			{
				path: "Tasks/Dep.md",
				name: "Dep",
				properties: {
					title: "Dep",
					status: "open",
					blockedBy: [{ uid: "[[Pred]]", reltype: "FINISHTOFINISH" }],
				},
			},
			createPlugin(undefined)
		);

		expect(task?.startBlocked).toBe(false);
		expect(task?.finishBlocked).toBe(true);
	});
});
