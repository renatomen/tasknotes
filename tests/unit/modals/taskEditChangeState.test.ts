import type { App } from "obsidian";
import {
	buildTaskEditChangesFromModalState,
	readTaskEditFrontmatter,
	type TaskEditModalChangeState,
} from "../../../src/modals/taskEditChangeState";
import type { TaskDependency, TaskInfo } from "../../../src/types";
import { MockObsidian } from "../../helpers/obsidian-runtime";

const createMockApp = (mockApp: unknown): App => mockApp as App;

function createTask(overrides: Partial<TaskInfo> = {}): TaskInfo {
	return {
		title: "Edit task",
		status: "open",
		priority: "normal",
		path: "TaskNotes/Edit task.md",
		archived: false,
		contexts: [],
		projects: [],
		tags: [],
		...overrides,
	};
}

function createState(
	overrides: Partial<TaskEditModalChangeState> = {}
): TaskEditModalChangeState {
	const task = overrides.task ?? createTask();

	return {
		task,
		title: task.title,
		dueDate: task.due || "",
		scheduledDate: task.scheduled || "",
		priority: task.priority,
		status: task.status,
		contexts: (task.contexts || []).join(", "),
		projects: (task.projects || []).join(", "),
		tags: (task.tags || []).join(", "),
		initialTags: (task.tags || []).join(", "),
		timeEstimate: task.timeEstimate || 0,
		recurrenceRule: typeof task.recurrence === "string" ? task.recurrence : "",
		recurrenceAnchor: task.recurrence_anchor || "scheduled",
		reminders: task.reminders || [],
		blockedByItems: [],
		initialBlockedBy: task.blockedBy || [],
		blockingItems: [],
		initialBlockingPaths: task.blocking || [],
		details: task.details || "",
		originalDetails: task.details || "",
		completedInstancesChanges: [],
		skippedInstancesChanges: [],
		userFields: {},
		...overrides,
	};
}

describe("taskEditChangeState", () => {
	beforeEach(() => {
		MockObsidian.reset();
	});

	it("reads edit frontmatter from the Obsidian metadata cache", () => {
		const app = createMockApp(MockObsidian.createMockApp());
		MockObsidian.createTestFile(
			"TaskNotes/Edit task.md",
			"---\nreview: old\nflagged: true\n---\nBody"
		);
		app.metadataCache.setCache("TaskNotes/Edit task.md", {
			frontmatter: {
				review: "old",
				flagged: true,
			},
		});

		expect(
			readTaskEditFrontmatter({
				app,
				taskPath: "TaskNotes/Edit task.md",
			})
		).toEqual({
			review: "old",
			flagged: true,
		});
	});

	it("returns empty frontmatter when the task file is missing", () => {
		const app = createMockApp(MockObsidian.createMockApp());
		const logger = { warn: jest.fn() };

		expect(
			readTaskEditFrontmatter({
				app,
				taskPath: "TaskNotes/Missing.md",
				logger,
			})
		).toEqual({});
		expect(logger.warn).not.toHaveBeenCalled();
	});

	it("logs and falls back to empty frontmatter when cache lookup fails", () => {
		const error = new Error("metadata unavailable");
		const logger = { warn: jest.fn() };
		const app = {
			vault: {
				getAbstractFileByPath: jest.fn(() => {
					throw error;
				}),
			},
			metadataCache: {
				getFileCache: jest.fn(),
			},
		} as unknown as Pick<App, "vault" | "metadataCache">;

		expect(
			readTaskEditFrontmatter({
				app,
				taskPath: "TaskNotes/Edit task.md",
				logger,
			})
		).toEqual({});
		expect(logger.warn).toHaveBeenCalledWith(
			"Error reading user field frontmatter",
			expect.objectContaining({
				category: "stale-data",
				operation: "task-edit-frontmatter-read",
				details: { path: "TaskNotes/Edit task.md" },
				error,
			})
		);
	});

	it("builds edit changes from modal state, settings, and cached user-field frontmatter", () => {
		const app = createMockApp(MockObsidian.createMockApp());
		MockObsidian.createTestFile(
			"TaskNotes/Edit task.md",
			"---\nreview: old\n---\nBody"
		);
		app.metadataCache.setCache("TaskNotes/Edit task.md", {
			frontmatter: { review: "old" },
		});
		const task = createTask({ path: "TaskNotes/Edit task.md" });

		const result = buildTaskEditChangesFromModalState({
			...createState({
				task,
				userFields: { review: "new" },
			}),
			app,
			settings: {
				userFields: [
					{
						id: "review",
						displayName: "Review",
						key: "review",
						type: "text",
					},
				],
				taskIdentificationMethod: "property",
				taskTag: "task",
				maintainDueDateOffsetInRecurring: false,
			},
			normalizeDetails: (value) => value,
		});

		expect((result.changes as Record<string, unknown>).customFrontmatter).toEqual({
			review: "new",
		});
		expect(result.changes.dateModified).toEqual(expect.any(String));
		expect(result.blockingUpdates).toEqual({ added: [], removed: [], modified: [], raw: {} });
		expect(result.unresolvedBlockingEntries).toEqual([]);
	});

	const dependencySettings = {
		userFields: [],
		taskIdentificationMethod: "property" as const,
		taskTag: "task",
		maintainDueDateOffsetInRecurring: false,
	};

	it("reports a blocking row whose reltype changed as modified, with the entry to write", () => {
		const app = createMockApp(MockObsidian.createMockApp());
		const task = createTask({ blocking: ["TaskNotes/Successor.md"] });

		const result = buildTaskEditChangesFromModalState({
			...createState({
				task,
				blockingItems: [
					{
						path: "TaskNotes/Successor.md",
						dependency: { uid: "[[TaskNotes/Successor.md]]", reltype: "STARTTOSTART" },
					},
				],
				initialBlockingEntries: {
					"TaskNotes/Successor.md": {
						uid: "[[TaskNotes/Successor.md]]",
						reltype: "FINISHTOSTART",
					},
				},
			}),
			app,
			settings: dependencySettings,
			normalizeDetails: (value) => value,
		});

		expect(result.blockingUpdates).toEqual({
			added: [],
			removed: [],
			modified: ["TaskNotes/Successor.md"],
			raw: {
				"TaskNotes/Successor.md": {
					uid: "[[TaskNotes/Successor.md]]",
					reltype: "STARTTOSTART",
				},
			},
		});
	});

	it("reports a blocking row whose gap alone changed as modified", () => {
		const app = createMockApp(MockObsidian.createMockApp());
		const task = createTask({ blocking: ["TaskNotes/Successor.md"] });
		const stored = { uid: "[[TaskNotes/Successor.md]]", reltype: "FINISHTOSTART" as const };

		const result = buildTaskEditChangesFromModalState({
			...createState({
				task,
				blockingItems: [
					{ path: "TaskNotes/Successor.md", dependency: { ...stored, gap: "P2D" } },
				],
				initialBlockingEntries: { "TaskNotes/Successor.md": stored },
			}),
			app,
			settings: dependencySettings,
			normalizeDetails: (value) => value,
		});

		expect(result.blockingUpdates.modified).toEqual(["TaskNotes/Successor.md"]);
		expect(result.blockingUpdates.raw["TaskNotes/Successor.md"]).toEqual({
			...stored,
			gap: "P2D",
		});
	});

	it("reports an untouched blocking row as neither added, removed nor modified", () => {
		const app = createMockApp(MockObsidian.createMockApp());
		const task = createTask({ blocking: ["TaskNotes/Successor.md"] });
		const stored = {
			uid: "[[TaskNotes/Successor.md]]",
			reltype: "STARTTOFINISH" as const,
			gap: "P1DT2H",
		};

		const result = buildTaskEditChangesFromModalState({
			...createState({
				task,
				blockingItems: [{ path: "TaskNotes/Successor.md", dependency: { ...stored } }],
				initialBlockingEntries: { "TaskNotes/Successor.md": stored },
			}),
			app,
			settings: dependencySettings,
			normalizeDetails: (value) => value,
		});

		expect(result.blockingUpdates).toEqual({ added: [], removed: [], modified: [], raw: {} });
	});

	it("reports a newly added blocking row as added, not modified", () => {
		const app = createMockApp(MockObsidian.createMockApp());
		const task = createTask({ blocking: [] });

		const result = buildTaskEditChangesFromModalState({
			...createState({
				task,
				blockingItems: [
					{
						path: "TaskNotes/New.md",
						dependency: { uid: "[[TaskNotes/New.md]]", reltype: "STARTTOSTART" },
					},
				],
				initialBlockingEntries: {},
			}),
			app,
			settings: dependencySettings,
			normalizeDetails: (value) => value,
		});

		expect(result.blockingUpdates.added).toEqual(["TaskNotes/New.md"]);
		expect(result.blockingUpdates.modified).toEqual([]);
	});

	it("writes a blocked-by row whose reltype or gap alone changed to the task's blockedBy", () => {
		const app = createMockApp(MockObsidian.createMockApp());
		const stored = { uid: "[[Design]]", reltype: "FINISHTOSTART" as const, gap: "P2D" };
		const task = createTask({ blockedBy: [stored] });
		const changesFor = (dependency: TaskDependency) =>
			buildTaskEditChangesFromModalState({
				...createState({ task, blockedByItems: [{ dependency }] }),
				app,
				settings: dependencySettings,
				normalizeDetails: (value) => value,
			}).changes.blockedBy;

		expect(changesFor({ ...stored })).toBeUndefined();
		expect(changesFor({ ...stored, reltype: "STARTTOSTART" })).toEqual([
			{ ...stored, reltype: "STARTTOSTART" },
		]);
		expect(changesFor({ ...stored, gap: "P1W" })).toEqual([{ ...stored, gap: "P1W" }]);
		expect(changesFor({ ...stored, gap: undefined })).toEqual([
			{ uid: "[[Design]]", reltype: "FINISHTOSTART" },
		]);
	});

	it("normalizes scalar task contexts before comparing edit changes", () => {
		const app = createMockApp(MockObsidian.createMockApp());
		const task = createTask({
			contexts: "Routine" as unknown as string[],
		});
		const state = createState({
			contexts: "Routine",
		});

		const result = buildTaskEditChangesFromModalState({
			...state,
			task,
			app,
			settings: {
				maintainDueDateOffsetInRecurring: false,
			},
			normalizeDetails: (value) => value,
		});

		expect(result.changes.contexts).toBeUndefined();
	});

	it("builds skipped recurring instance changes from modal state", () => {
		const app = createMockApp(MockObsidian.createMockApp());
		const task = createTask({
			path: "TaskNotes/Recurring.md",
			recurrence: "DTSTART:20260517;FREQ=DAILY;INTERVAL=1",
			scheduled: "2026-05-17",
			complete_instances: ["2026-05-17"],
			skipped_instances: [],
		});

		const result = buildTaskEditChangesFromModalState({
			...createState({
				task,
				skippedInstancesChanges: ["2026-05-17"],
			}),
			app,
			settings: {
				maintainDueDateOffsetInRecurring: false,
			},
			normalizeDetails: (value) => value,
		});

		expect(result.changes.complete_instances).toEqual([]);
		expect(result.changes.skipped_instances).toEqual(["2026-05-17"]);
		expect(result.changes.scheduled).toEqual(expect.any(String));
		expect(result.changes.dateModified).toEqual(expect.any(String));
	});

	it("builds completed recurring instance changes that clear skipped state", () => {
		const app = createMockApp(MockObsidian.createMockApp());
		const task = createTask({
			path: "TaskNotes/Recurring.md",
			recurrence: "DTSTART:20260517;FREQ=DAILY;INTERVAL=1",
			scheduled: "2026-05-17",
			complete_instances: [],
			skipped_instances: ["2026-05-17"],
		});

		const result = buildTaskEditChangesFromModalState({
			...createState({
				task,
				completedInstancesChanges: ["2026-05-17"],
				skippedInstancesChanges: ["2026-05-17"],
			}),
			app,
			settings: {
				maintainDueDateOffsetInRecurring: false,
			},
			normalizeDetails: (value) => value,
		});

		expect(result.changes.complete_instances).toEqual(["2026-05-17"]);
		expect(result.changes.skipped_instances).toEqual([]);
		expect(result.changes.scheduled).toEqual(expect.any(String));
		expect(result.changes.dateModified).toEqual(expect.any(String));
	});
});
