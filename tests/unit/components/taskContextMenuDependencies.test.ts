import { App, Menu } from "obsidian";
import { TaskContextMenu } from "../../../src/components/TaskContextMenu";
import { createI18nService } from "../../../src/i18n";
import type TaskNotesPlugin from "../../../src/main";
import { openTaskSelector } from "../../../src/modals/TaskSelectorWithCreateModal";
import type { TaskInfo } from "../../../src/types";
import { changeTaskProperty } from "../../../src/ui/taskPropertyPickers";

jest.mock("../../../src/ui/taskPropertyPickers", () => ({
	...jest.requireActual("../../../src/ui/taskPropertyPickers"),
	changeTaskProperty: jest.fn(async (_plugin, tasks, property, value) =>
		tasks.map((task: TaskInfo) => ({ ...task, [property]: value }))),
}));

jest.mock("../../../src/modals/TaskSelectorWithCreateModal", () => ({
	...jest.requireActual("../../../src/modals/TaskSelectorWithCreateModal"),
	openTaskSelector: jest.fn(),
}));

type MockMenuItem = Record<string, jest.Mock> | { type: string };
type MockMenu = { items: MockMenuItem[] };

const menuMock = Menu as unknown as jest.Mock;
const openTaskSelectorMock = openTaskSelector as jest.Mock;
const changeTaskPropertyMock = changeTaskProperty as jest.Mock;

const ADD_BLOCKED_BY = "Add “blocked by”…";
const ADD_BLOCKING = "Add “blocking”…";

const BLOCKED_BY_RELTYPES = [
	"Finish → start · this can't start until that finishes",
	"Start → start · this can't start until that starts",
	"Finish → finish · this can't finish until that finishes",
	"Start → finish · this can't finish until that starts",
];
const BLOCKING_RELTYPES = [
	"Finish → start · they can't start until this finishes",
	"Start → start · they can't start until this starts",
	"Finish → finish · they can't finish until this finishes",
	"Start → finish · they can't finish until this starts",
];
const [, BLOCKED_BY_START_TO_START] = BLOCKED_BY_RELTYPES;
const [, BLOCKING_START_TO_START, BLOCKING_FINISH_TO_FINISH] = BLOCKING_RELTYPES;

function task(path: string): TaskInfo {
	return {
		id: path,
		path,
		title: path,
		status: "open",
		priority: "normal",
		complete_instances: [],
		skipped_instances: [],
	} as TaskInfo;
}

const otherTask = task("Tasks/other.md");

function createPlugin(options: {
	advancedDependencyTypes: boolean;
	locale?: string;
}): TaskNotesPlugin {
	return {
		app: new App(),
		i18n: createI18nService({ initialLocale: options.locale ?? "en" }),
		settings: {
			defaultTaskStatus: "open",
			customStatuses: [
				{ value: "open", label: "Open", order: 0 },
				{ value: "done", label: "Done", order: 1, isCompleted: true },
			],
			customPriorities: [{ value: "normal", label: "Normal", weight: 0 }],
			calendarViewSettings: { enableTimeblocking: false },
			useFrontmatterMarkdownLinks: false,
			enableAdvancedDependencyTypes: options.advancedDependencyTypes,
		},
		statusManager: {
			getAllStatuses: jest.fn(() => [
				{ value: "open", label: "Open" },
				{ value: "done", label: "Done" },
			]),
			getNonCompletionStatuses: jest.fn(() => [{ value: "open", label: "Open" }]),
			getCompletedStatuses: jest.fn(() => ["done"]),
			isCompletedStatus: jest.fn((status: string) => status === "done"),
		},
		priorityManager: {
			getAllPriorities: jest.fn(() => [{ value: "normal", label: "Normal" }]),
			getPrioritiesByWeight: jest.fn(() => [{ value: "normal", label: "Normal" }]),
		},
		taskService: {
			toggleRecurringTaskSkipped: jest.fn(),
			updateBlockingRelationships: jest.fn(),
		},
		cacheManager: {
			getAllContexts: jest.fn(() => []),
			getAllTasks: jest.fn(() => [otherTask]),
			getTaskInfo: jest.fn(),
		},
		updateTaskProperty: jest.fn(),
		toggleRecurringTaskComplete: jest.fn(),
		getActiveTimeSession: jest.fn(() => null),
		stopTimeTracking: jest.fn(),
		startTimeTracking: jest.fn(),
		openDueDateModal: jest.fn(),
		openScheduledDateModal: jest.fn(),
		openTimeEntryEditor: jest.fn(),
		toggleTaskArchive: jest.fn(),
		openTaskEditModal: jest.fn(),
		openTaskCreationModal: jest.fn(),
	} as unknown as TaskNotesPlugin;
}

function titleOf(item: MockMenuItem): string | undefined {
	return "type" in item ? undefined : item.setTitle?.mock.calls[0]?.[0];
}

function submenuOf(item: MockMenuItem | undefined): MockMenu | undefined {
	if (!item || "type" in item) return undefined;
	const results = item.setSubmenu?.mock.results;
	return results && results.length ? (results[results.length - 1].value as MockMenu) : undefined;
}

function findItem(
	title: string,
	menu: MockMenu | undefined = menuMock.mock.results[0]?.value as MockMenu,
	seen = new Set<MockMenu>()
): Record<string, jest.Mock> | undefined {
	if (!menu || seen.has(menu)) return undefined;
	seen.add(menu);
	for (const item of menu.items) {
		if ("type" in item) continue;
		if (titleOf(item) === title) return item as Record<string, jest.Mock>;
		const found = findItem(title, submenuOf(item), seen);
		if (found) return found;
	}
	return undefined;
}

function reltypeItem(addTitle: string, reltypeTitle: string): Record<string, jest.Mock> | undefined {
	return submenuOf(findItem(addTitle))?.items.find(
		(item): item is Record<string, jest.Mock> => titleOf(item) === reltypeTitle
	);
}

function openMenu(plugin: TaskNotesPlugin): TaskInfo {
	const menuTask = task("Tasks/this.md");
	new TaskContextMenu({ task: menuTask, plugin, targetDate: new Date("2026-06-15T12:00:00") });
	return menuTask;
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

async function click(item: Record<string, jest.Mock> | undefined): Promise<void> {
	item?.onClick.mock.calls[0]?.[0]();
	await settle();
}

async function chooseInTaskSelector(chosen: TaskInfo | null): Promise<void> {
	openTaskSelectorMock.mock.calls[0][2](chosen);
	await settle();
}

function propertyWrites(): Array<{ path: string; property: string; value: unknown }> {
	return changeTaskPropertyMock.mock.calls.map(([, tasks, property, value]) => ({
		path: tasks[0].path,
		property,
		value,
	}));
}

describe("adding a dependency from the task menu", () => {
	beforeEach(() => {
		menuMock.mockClear();
		openTaskSelectorMock.mockClear();
		changeTaskPropertyMock.mockClear();
	});

	describe("with advanced dependency types off", () => {
		it.each([ADD_BLOCKED_BY, ADD_BLOCKING])(
			"%s opens the task selector directly",
			async (title) => {
				openMenu(createPlugin({ advancedDependencyTypes: false }));
				const addItem = findItem(title);

				expect(addItem?.setSubmenu).not.toHaveBeenCalled();
				await click(addItem);

				expect(openTaskSelectorMock).toHaveBeenCalledTimes(1);
			}
		);

		it("adds a finish-to-start dependency", async () => {
			openMenu(createPlugin({ advancedDependencyTypes: false }));

			await click(findItem(ADD_BLOCKED_BY));
			await chooseInTaskSelector(otherTask);

			expect(propertyWrites()).toEqual([
				{
					path: "Tasks/this.md",
					property: "blockedBy",
					value: [{ uid: "other", reltype: "FINISHTOSTART" }],
				},
			]);
		});
	});

	describe("with advanced dependency types on", () => {
		it.each([
			[ADD_BLOCKED_BY, BLOCKED_BY_RELTYPES],
			[ADD_BLOCKING, BLOCKING_RELTYPES],
		])(
			"%s lists the four relationship types for its side before the task selector",
			(title, reltypeTitles) => {
				openMenu(createPlugin({ advancedDependencyTypes: true }));
				const addItem = findItem(title);

				expect(submenuOf(addItem)?.items.map(titleOf)).toEqual(reltypeTitles);
				expect(addItem?.onClick).not.toHaveBeenCalled();
				expect(openTaskSelectorMock).not.toHaveBeenCalled();
			}
		);

		it("writes the picked type on this task for the blocked-by side", async () => {
			openMenu(createPlugin({ advancedDependencyTypes: true }));

			await click(reltypeItem(ADD_BLOCKED_BY, BLOCKED_BY_START_TO_START));
			await chooseInTaskSelector(otherTask);

			expect(propertyWrites()).toEqual([
				{
					path: "Tasks/this.md",
					property: "blockedBy",
					value: [{ uid: "other", reltype: "STARTTOSTART" }],
				},
			]);
		});

		it("writes the picked type on the chosen task for the blocking side", async () => {
			const plugin = createPlugin({ advancedDependencyTypes: true });
			const menuTask = openMenu(plugin);

			await click(reltypeItem(ADD_BLOCKING, BLOCKING_FINISH_TO_FINISH));
			await chooseInTaskSelector(otherTask);

			expect(plugin.taskService.updateBlockingRelationships).toHaveBeenCalledTimes(1);
			expect(plugin.taskService.updateBlockingRelationships).toHaveBeenCalledWith(
				menuTask,
				["Tasks/other.md"],
				[],
				{ "Tasks/other.md": { uid: "[[this]]", reltype: "FINISHTOFINISH" } },
				expect.any(Function)
			);
		});

		it.each([
			[ADD_BLOCKED_BY, BLOCKED_BY_START_TO_START],
			[ADD_BLOCKING, BLOCKING_START_TO_START],
		])(
			"%s writes nothing when the task selector is cancelled",
			async (title, reltypeTitle) => {
				const plugin = createPlugin({ advancedDependencyTypes: true });
				openMenu(plugin);

				await click(reltypeItem(title, reltypeTitle));
				await chooseInTaskSelector(null);

				expect(openTaskSelectorMock).toHaveBeenCalledTimes(1);
				expect(propertyWrites()).toEqual([]);
				expect(plugin.taskService.updateBlockingRelationships).not.toHaveBeenCalled();
			}
		);

		it.each([
			[
				"„Blockiert durch“ hinzufügen…",
				[
					"Ende → Anfang · diese Aufgabe kann erst beginnen, wenn die andere abgeschlossen ist",
					"Anfang → Anfang · diese Aufgabe kann erst beginnen, wenn die andere begonnen hat",
					"Ende → Ende · diese Aufgabe kann erst abgeschlossen werden, wenn die andere abgeschlossen ist",
					"Anfang → Ende · diese Aufgabe kann erst abgeschlossen werden, wenn die andere begonnen hat",
				],
			],
			[
				"„Blockiert“ hinzufügen…",
				[
					"Ende → Anfang · sie können erst beginnen, wenn diese Aufgabe abgeschlossen ist",
					"Anfang → Anfang · sie können erst beginnen, wenn diese Aufgabe begonnen hat",
					"Ende → Ende · sie können erst abgeschlossen werden, wenn diese Aufgabe abgeschlossen ist",
					"Anfang → Ende · sie können erst abgeschlossen werden, wenn diese Aufgabe begonnen hat",
				],
			],
		])("%s shows the relationship types in the interface language", (title, reltypeTitles) => {
			openMenu(createPlugin({ advancedDependencyTypes: true, locale: "de" }));

			expect(submenuOf(findItem(title))?.items.map(titleOf)).toEqual(reltypeTitles);
		});
	});
});
