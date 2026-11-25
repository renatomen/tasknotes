import type { App } from "obsidian";
import { App as MockApp, MockObsidian } from "../../helpers/obsidian-runtime";
import { createTaskInfoFromBasesData } from "../../../src/bases/helpers";
import type TaskNotesPlugin from "../../../src/main";
import { FieldMapper } from "../../../src/services/FieldMapper";
import { StatusManager } from "../../../src/services/StatusManager";
import {
	DEFAULT_FIELD_MAPPING,
	DEFAULT_SETTINGS,
	DEFAULT_STATUSES,
} from "../../../src/settings/defaults";
import { DependencyCache } from "../../../src/utils/DependencyCache";
import { TaskManager } from "../../../src/utils/TaskManager";

function createPlugin(dependencyCache?: unknown): TaskNotesPlugin {
	return {
		fieldMapper: new FieldMapper({ ...DEFAULT_FIELD_MAPPING }),
		settings: { defaultTaskStatus: "open", storeTitleInFilename: false },
		dependencyCache,
		cacheManager: { getCachedTaskInfoSync: jest.fn() },
	} as unknown as TaskNotesPlugin;
}

function createCacheStub(overrides: Record<string, unknown> = {}) {
	return {
		isTaskStartBlocked: jest.fn(() => false),
		isTaskFinishBlocked: jest.fn(() => false),
		getBlockedTaskPaths: jest.fn((): string[] => []),
		getStartBlockedDependentPaths: jest.fn((): string[] => []),
		getFinishBlockedDependentPaths: jest.fn((): string[] => []),
		...overrides,
	};
}

describe("Bases rows carry per-endpoint blocking state", () => {
	beforeEach(() => MockObsidian.reset());

	it("flags a start-blocked task's row as start-blocked", () => {
		const cache = createCacheStub({ isTaskStartBlocked: jest.fn(() => true) });

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

		expect(task).toMatchObject({ startBlocked: true, finishBlocked: false, isBlocked: true });
		expect(cache.isTaskStartBlocked).toHaveBeenCalledWith("Tasks/Dep.md");
	});

	it("carries no blocked flag when the row's only dependency is released", () => {
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
			createPlugin(createCacheStub())
		);

		expect(task).toMatchObject({ startBlocked: false, finishBlocked: false, isBlocked: false });
	});

	it("flags which endpoint of its successors a row's task blocks", () => {
		const cache = createCacheStub({
			getBlockedTaskPaths: jest.fn(() => ["Tasks/Succ.md"]),
			getFinishBlockedDependentPaths: jest.fn(() => ["Tasks/Succ.md"]),
		});

		const task = createTaskInfoFromBasesData(
			{ path: "Tasks/Pred.md", name: "Pred", properties: { title: "Pred", status: "open" } },
			createPlugin(cache)
		);

		expect(task).toMatchObject({
			isBlocking: true,
			isBlockingStart: false,
			isBlockingFinish: true,
			blocking: ["Tasks/Succ.md"],
		});
	});

	it("falls back to the row's own dependency list when there is no dependency cache", () => {
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

		expect(task).toMatchObject({
			startBlocked: false,
			finishBlocked: true,
			isBlocked: true,
			isBlockingStart: false,
			isBlockingFinish: false,
		});
	});

	it("carries the same four flags as task info assembled by the task manager", async () => {
		const app = new MockApp() as unknown as App;
		const mapper = new FieldMapper(DEFAULT_FIELD_MAPPING);
		const manager = new TaskManager(
			app,
			{
				...DEFAULT_SETTINGS,
				taskIdentificationMethod: "tag" as const,
				taskTag: "task",
				excludedFolders: "",
				storeTitleInFilename: false,
			},
			mapper
		);
		const predecessor = { title: "Pred", tags: ["task"], status: "in-progress" };
		const successor = {
			title: "Dep",
			tags: ["task"],
			status: "open",
			blockedBy: [
				{ uid: "[[pred]]", reltype: "STARTTOSTART" },
				{ uid: "[[pred]]", reltype: "FINISHTOFINISH" },
			],
		};
		MockObsidian.createTestFile("Tasks/pred.md", "---\ntitle: Pred\n---\n");
		MockObsidian.createTestFile("Tasks/dep.md", "---\ntitle: Dep\n---\n");
		app.metadataCache.setCache("Tasks/pred.md", { frontmatter: predecessor });
		app.metadataCache.setCache("Tasks/dep.md", { frontmatter: successor });
		app.metadataCache.getFirstLinkpathDest = jest.fn((linkpath: string) =>
			linkpath === "pred" ? app.vault.getAbstractFileByPath("Tasks/pred.md") : null
		);
		const dependencyCache = new DependencyCache(
			app,
			{} as never,
			mapper,
			new StatusManager(DEFAULT_STATUSES),
			(frontmatter) => manager.isTaskFile(frontmatter)
		);
		await dependencyCache.buildIndexes();
		manager.setDependencyCache(dependencyCache);

		const flags = ({ startBlocked, finishBlocked, isBlockingStart, isBlockingFinish }: {
			startBlocked?: boolean;
			finishBlocked?: boolean;
			isBlockingStart?: boolean;
			isBlockingFinish?: boolean;
		}) => ({ startBlocked, finishBlocked, isBlockingStart, isBlockingFinish });

		for (const [path, properties] of [
			["Tasks/pred.md", predecessor],
			["Tasks/dep.md", successor],
		] as const) {
			const fromManager = await manager.getTaskInfo(path);
			const fromBases = createTaskInfoFromBasesData(
				{ path, properties },
				createPlugin(dependencyCache)
			);

			expect(flags(fromBases ?? {})).toEqual(flags(fromManager ?? {}));
		}
		expect(flags((await manager.getTaskInfo("Tasks/dep.md")) ?? {})).toEqual({
			startBlocked: false,
			finishBlocked: true,
			isBlockingStart: false,
			isBlockingFinish: false,
		});
		expect(flags((await manager.getTaskInfo("Tasks/pred.md")) ?? {})).toEqual({
			startBlocked: false,
			finishBlocked: false,
			isBlockingStart: false,
			isBlockingFinish: true,
		});
	});
});
