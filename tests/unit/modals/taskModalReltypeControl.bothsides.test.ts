import type { App } from "obsidian";

const mockNotes = new Map<string, unknown>();
jest.mock("../../../src/ui/taskMutationUndo", () => ({
	captureTaskUndo: async (
		_plugin: unknown,
		task: { path: string },
		operation: () => Promise<unknown>
	) => {
		const before = mockNotes.get(task.path);
		return {
			task: await operation(),
			undo: async () => {
				mockNotes.set(task.path, before);
			},
		};
	},
}));
jest.mock("../../../src/ui/taskPropertyPickers", () => ({ showTaskUndo: jest.fn() }));
jest.mock("../../../src/modals/taskModalTaskSelector", () => ({
	openTaskModalTaskSelector: jest.fn(
		async (options: { onSelect: (task: { path: string }) => void }) =>
			options.onSelect({ path: "Tasks/Added.md" })
	),
}));

import { createI18nService } from "../../../src/i18n";
import { TaskEditModal } from "../../../src/modals/TaskEditModal";
import {
	type DependencyItem,
	type DependencyListSide,
	type DependencyReltypeControls,
	renderDependencyList,
} from "../../../src/modals/taskModalDependencies";
import { TaskService } from "../../../src/services/TaskService";
import type { TaskDependency, TaskDependencyRelType, TaskInfo } from "../../../src/types";
import { showTaskUndo } from "../../../src/ui/taskPropertyPickers";
import { MockObsidian } from "../../helpers/obsidian-runtime";
import { englishText } from "../../helpers/real-i18n";

function unresolvedRow(name: string, reltype: TaskDependencyRelType, gap?: string): DependencyItem {
	const uid = `[[${name}]]`;
	return { dependency: gap ? { uid, reltype, gap } : { uid, reltype }, name, unresolved: true };
}

async function renderRows(
	items: DependencyItem[],
	side?: DependencyListSide,
	handlers: Partial<DependencyReltypeControls> = {}
): Promise<HTMLElement> {
	const listEl = document.createElement("div");
	await renderDependencyList({
		plugin: {} as never,
		listEl,
		items,
		linkServices: {} as never,
		translate: englishText,
		onRemove: jest.fn(),
		reltypeControls: side
			? {
					side,
					selfName: "Write report",
					onReltypeChange: jest.fn(),
					onGapChange: jest.fn(),
					...handlers,
				}
			: undefined,
	});
	return listEl;
}

function reltypeSelect(root: ParentNode): HTMLSelectElement {
	return root.querySelector("select.task-dependency-reltype") as HTMLSelectElement;
}

function gapInput(root: ParentNode): HTMLInputElement {
	return root.querySelector("input.task-dependency-gap-value") as HTMLInputElement;
}

function gapUnit(root: ParentNode): HTMLSelectElement {
	return root.querySelector("select.task-dependency-gap-unit") as HTMLSelectElement;
}

function typeGap(input: HTMLInputElement, value: string): void {
	input.value = value;
	input.dispatchEvent(new Event("input"));
}

function choose(select: HTMLSelectElement, value: string): void {
	select.value = value;
	select.dispatchEvent(new Event("change"));
}

describe("dependency row reltype and gap controls", () => {
	it("renders no reltype or gap control when advanced dependency types are off", async () => {
		const listEl = await renderRows([unresolvedRow("Design", "STARTTOSTART", "P2D")]);

		expect(listEl.querySelectorAll(".task-project-item")).toHaveLength(1);
		expect(listEl.querySelector(".task-project-item--with-reltype")).toBeNull();
		expect(listEl.querySelector(".task-dependency-controls")).toBeNull();
		expect(listEl.querySelector("select, input")).toBeNull();
	});

	it("shows the stored reltype among the four types, in a fixed order", async () => {
		const listEl = await renderRows([unresolvedRow("Design", "FINISHTOFINISH")], "blocked-by");
		const select = reltypeSelect(listEl);

		expect(select.value).toBe("FINISHTOFINISH");
		expect(Array.from(select.options).map((option) => [option.value, option.text])).toEqual([
			["FINISHTOSTART", "Finish-to-start"],
			["STARTTOSTART", "Start-to-start"],
			["FINISHTOFINISH", "Finish-to-finish"],
			["STARTTOFINISH", "Start-to-finish"],
		]);
	});

	it.each([
		["P2D", "2", "days"],
		["P1W", "1", "weeks"],
		["PT4H", "4", "hours"],
	])("shows a stored gap of %s as %s %s", async (gap, value, unit) => {
		const listEl = await renderRows([unresolvedRow("Design", "FINISHTOSTART", gap)], "blocked-by");

		expect(gapInput(listEl).value).toBe(value);
		expect(gapUnit(listEl).value).toBe(unit);
	});

	it("shows an empty gap in days when none is stored", async () => {
		const listEl = await renderRows([unresolvedRow("Design", "FINISHTOSTART")], "blocked-by");

		expect(gapInput(listEl).value).toBe("");
		expect(gapUnit(listEl).value).toBe("days");
		expect(Array.from(gapUnit(listEl).options).map((option) => option.text)).toEqual([
			"days",
			"weeks",
			"hours",
		]);
	});

	it.each([
		["FINISHTOSTART", "Design must finish before Write report can start"],
		["STARTTOSTART", "Design must start before Write report can start"],
		["FINISHTOFINISH", "Design must finish before Write report can finish"],
		["STARTTOFINISH", "Design must start before Write report can finish"],
	] as const)("summarises a blocked-by %s row with the other task first", async (reltype, summary) => {
		const listEl = await renderRows([unresolvedRow("Design", reltype)], "blocked-by");

		expect(listEl.querySelector(".task-dependency-summary")?.textContent).toBe(summary);
	});

	it.each([
		["FINISHTOSTART", "Write report must finish before Publish can start"],
		["STARTTOSTART", "Write report must start before Publish can start"],
		["FINISHTOFINISH", "Write report must finish before Publish can finish"],
		["STARTTOFINISH", "Write report must start before Publish can finish"],
	] as const)("summarises a blocking %s row with this task first", async (reltype, summary) => {
		const listEl = await renderRows([unresolvedRow("Publish", reltype)], "blocking");

		expect(listEl.querySelector(".task-dependency-summary")?.textContent).toBe(summary);
	});

	it("puts the controls on their own line after the row and its remove button", async () => {
		const listEl = await renderRows([unresolvedRow("Design", "FINISHTOSTART")], "blocked-by");
		const item = listEl.querySelector(".task-project-item") as HTMLElement;

		expect(item.classList.contains("task-project-item--with-reltype")).toBe(true);
		expect(Array.from(item.children).map((child) => child.classList[0])).toEqual([
			"task-project-info",
			"task-project-remove",
			"task-dependency-controls",
		]);
		expect(item.querySelector(".tn-task-modal__task-row-placeholder")).not.toBeNull();
	});

	it("reports the reltype picked on a row", async () => {
		const onReltypeChange = jest.fn();
		const listEl = await renderRows(
			[unresolvedRow("Design", "FINISHTOSTART"), unresolvedRow("Review", "FINISHTOSTART")],
			"blocked-by",
			{ onReltypeChange }
		);

		choose(listEl.querySelectorAll<HTMLSelectElement>("select.task-dependency-reltype")[1], "STARTTOFINISH");

		expect(onReltypeChange).toHaveBeenCalledWith(1, "STARTTOFINISH");
	});

	it.each([
		["blocked-by", "Design must start before Write report can finish"],
		["blocking", "Write report must start before Design can finish"],
	] as const)("rewords a %s row's summary in place for the reltype picked", async (side, summary) => {
		const listEl = await renderRows([unresolvedRow("Design", "FINISHTOSTART")], side);
		const summaryEl = listEl.querySelector(".task-dependency-summary");

		choose(reltypeSelect(listEl), "STARTTOFINISH");

		expect(listEl.querySelector(".task-dependency-summary")).toBe(summaryEl);
		expect(summaryEl?.textContent).toBe(summary);
	});

	it("reports a typed gap as a duration in the chosen unit", async () => {
		const onGapChange = jest.fn();
		const listEl = await renderRows([unresolvedRow("Design", "FINISHTOSTART")], "blocked-by", {
			onGapChange,
		});

		typeGap(gapInput(listEl), "2");
		choose(gapUnit(listEl), "weeks");
		choose(gapUnit(listEl), "hours");

		expect(onGapChange.mock.calls).toEqual([
			[0, "P2D"],
			[0, "P2W"],
			[0, "PT2H"],
		]);
	});

	it.each(["", "0", "-3", "100001"])("reports no gap for an entry of '%s'", async (entry) => {
		const onGapChange = jest.fn();
		const listEl = await renderRows([unresolvedRow("Design", "FINISHTOSTART", "P2D")], "blocked-by", {
			onGapChange,
		});

		typeGap(gapInput(listEl), entry);

		expect(onGapChange).toHaveBeenCalledWith(0, undefined);
	});

	it("shows a gap it cannot compose as read-only text", async () => {
		const listEl = await renderRows(
			[unresolvedRow("Design", "FINISHTOSTART", "P1DT2H")],
			"blocked-by"
		);

		expect(listEl.querySelector(".task-dependency-gap-exotic")?.textContent).toBe(
			"Custom offset: P1DT2H"
		);
		expect(gapInput(listEl)).toBeNull();
		expect(gapUnit(listEl)).toBeNull();
		expect(reltypeSelect(listEl).value).toBe("FINISHTOSTART");
	});

	it("ignores controls on rows that a newer render is replacing", async () => {
		const onGapChange = jest.fn();
		let releaseLookup: (task: null) => void = () => undefined;
		const lookup = new Promise<null>((resolve) => {
			releaseLookup = resolve;
		});
		const listEl = document.createElement("div");
		const options = {
			plugin: { cacheManager: { getCachedTaskInfo: () => lookup } } as never,
			listEl,
			items: [unresolvedRow("Design", "FINISHTOSTART")],
			linkServices: {} as never,
			translate: englishText,
			onRemove: jest.fn(),
			reltypeControls: {
				side: "blocked-by" as const,
				selfName: "Write report",
				onReltypeChange: jest.fn(),
				onGapChange,
			},
		};
		await renderDependencyList(options);
		const staleInput = gapInput(listEl);

		const replacement = renderDependencyList({
			...options,
			items: [{ ...unresolvedRow("Review", "FINISHTOSTART"), path: "Review.md", unresolved: false }],
		});
		typeGap(staleInput, "5");
		releaseLookup(null);
		await replacement;

		expect(onGapChange).not.toHaveBeenCalled();
	});
});

describe("task edit dialog reltype and gap", () => {
	const editedPath = "Tasks/Write report.md";
	const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
	let app: App;

	function note(path: string, blockedBy?: TaskDependency[]): TaskInfo {
		const task: TaskInfo = {
			title: path.replace(/^Tasks\//, "").replace(/\.md$/, ""),
			status: "open",
			priority: "normal",
			path,
			archived: false,
			contexts: [],
			projects: [],
			tags: [],
			...(blockedBy ? { blockedBy } : {}),
		};
		MockObsidian.createTestFile(path, "");
		(app.metadataCache as unknown as { setCache: (path: string, cache: unknown) => void }).setCache(
			path,
			{ frontmatter: { title: task.title } }
		);
		mockNotes.set(path, task);
		return task;
	}

	function storedNote(path: string): TaskInfo {
		return mockNotes.get(path) as TaskInfo;
	}

	async function openDialog(task: TaskInfo, enableAdvancedDependencyTypes = true) {
		const plugin = {
			app,
			i18n: createI18nService(),
			settings: {
				taskIdentificationMethod: "property",
				taskTag: "task",
				userFields: [],
				useFrontmatterMarkdownLinks: false,
				enableAdvancedDependencyTypes,
			},
			cacheManager: {
				isTaskFile: () => true,
				getTaskInfo: jest.fn(async (path: string) => mockNotes.get(path) ?? null),
				getCachedTaskInfo: jest.fn(async () => null),
				getCachedTaskInfoSync: jest.fn((path: string) => mockNotes.get(path) ?? null),
			},
		} as Record<string, unknown>;
		const taskService = new TaskService(plugin as never);
		const updateTask = jest
			.spyOn(taskService, "updateTask")
			.mockImplementation(async (original, updates) => {
				const updated = { ...original, ...updates } as TaskInfo;
				mockNotes.set(original.path, updated);
				return updated;
			});
		plugin.taskService = taskService;

		const modal = new TaskEditModal(app, plugin as never, { task });
		const internals = modal as unknown as {
			initializeSubtasks: jest.Mock;
			blockedByItems: DependencyItem[];
			blockingItems: DependencyItem[];
			blockedByList: HTMLElement;
			blockingList: HTMLElement;
			renderDependencyLists: () => void;
			hasUnsavedChanges: () => boolean;
			openBlockedBySelector: () => Promise<void>;
			addBlockingTaskFromPath: (path: string) => void;
		};
		internals.initializeSubtasks = jest.fn().mockResolvedValue(undefined);
		await modal.initializeFormData();
		internals.blockedByList = document.body.createDiv();
		internals.blockingList = document.body.createDiv();
		internals.renderDependencyLists();
		await flush();
		return { modal, internals, updateTask };
	}

	beforeEach(() => {
		MockObsidian.reset();
		app = MockObsidian.createMockApp() as unknown as App;
		mockNotes.clear();
		document.body.empty();
		jest.mocked(showTaskUndo).mockClear();
	});

	it("shows no reltype or gap control on either list when advanced dependency types are off", async () => {
		note("Tasks/Design.md");
		note("Tasks/Publish.md", [{ uid: "[[Write report]]", reltype: "STARTTOSTART", gap: "P2D" }]);
		const task = note(editedPath, [{ uid: "[[Design]]", reltype: "FINISHTOFINISH", gap: "P1W" }]);
		task.blocking = ["Tasks/Publish.md"];

		const { internals } = await openDialog(task, false);

		expect(document.querySelectorAll(".task-project-item")).toHaveLength(2);
		expect(document.querySelector(".task-dependency-controls")).toBeNull();
		expect(internals.blockedByList.querySelector("select, input")).toBeNull();
		expect(internals.blockingList.querySelector("select, input")).toBeNull();
	});

	it("shows a blocked-by row's stored reltype and gap", async () => {
		note("Tasks/Design.md");
		const task = note(editedPath, [{ uid: "[[Design]]", reltype: "FINISHTOFINISH", gap: "P1W" }]);

		const { internals } = await openDialog(task);

		expect(reltypeSelect(internals.blockedByList).value).toBe("FINISHTOFINISH");
		expect(gapInput(internals.blockedByList).value).toBe("1");
		expect(gapUnit(internals.blockedByList).value).toBe("weeks");
		expect(
			internals.blockedByList.querySelector(".task-dependency-summary")?.textContent
		).toBe("Design must finish before Write report can finish");
	});

	it("shows a blocking row's reltype and gap as stored on the blocked task", async () => {
		note("Tasks/Publish.md", [{ uid: "[[Write report]]", reltype: "STARTTOSTART", gap: "P2D" }]);
		const task = note(editedPath);
		task.blocking = ["Tasks/Publish.md"];

		const { internals } = await openDialog(task);

		expect(reltypeSelect(internals.blockingList).value).toBe("STARTTOSTART");
		expect(gapInput(internals.blockingList).value).toBe("2");
		expect(gapUnit(internals.blockingList).value).toBe("days");
		expect(internals.blockingList.querySelector(".task-dependency-summary")?.textContent).toBe(
			"Write report must start before Publish can start"
		);
	});

	it("writes a changed blocked-by reltype to the edited task", async () => {
		note("Tasks/Design.md");
		const task = note(editedPath, [{ uid: "[[Design]]", reltype: "FINISHTOSTART", gap: "P2D" }]);
		const { modal, internals, updateTask } = await openDialog(task);

		choose(reltypeSelect(internals.blockedByList), "STARTTOSTART");
		await flush();
		await modal.handleSave();

		expect(reltypeSelect(internals.blockedByList).value).toBe("STARTTOSTART");
		expect(updateTask).toHaveBeenCalledTimes(1);
		expect(updateTask.mock.calls[0][1].blockedBy).toEqual([
			{ uid: "Design", reltype: "STARTTOSTART", gap: "P2D" },
		]);
	});

	it("writes a changed blocking reltype to the blocked task, leaving the edited task alone", async () => {
		note("Tasks/Publish.md", [
			{ uid: "[[Write report]]", reltype: "FINISHTOSTART", gap: "P2D" },
			{ uid: "[[Other]]", reltype: "STARTTOSTART" },
		]);
		const task = note(editedPath);
		task.blocking = ["Tasks/Publish.md"];
		const { modal, internals, updateTask } = await openDialog(task);

		choose(reltypeSelect(internals.blockingList), "FINISHTOFINISH");
		await flush();
		await modal.handleSave();

		expect(updateTask).toHaveBeenCalledTimes(1);
		expect(updateTask.mock.calls[0][0].path).toBe("Tasks/Publish.md");
		expect(storedNote("Tasks/Publish.md").blockedBy).toEqual([
			{ uid: "Write report", reltype: "FINISHTOFINISH", gap: "P2D" },
			{ uid: "Other", reltype: "STARTTOSTART" },
		]);
	});

	it("restores the blocked task's previous entry when a blocking-side save is undone", async () => {
		const stored: TaskDependency[] = [
			{ uid: "[[Write report]]", reltype: "FINISHTOSTART", gap: "P2D" },
		];
		note("Tasks/Publish.md", stored);
		const task = note(editedPath);
		task.blocking = ["Tasks/Publish.md"];
		const { modal, internals } = await openDialog(task);

		choose(reltypeSelect(internals.blockingList), "STARTTOFINISH");
		await flush();
		typeGap(gapInput(internals.blockingList), "");
		await modal.handleSave();
		expect(storedNote("Tasks/Publish.md").blockedBy).toEqual([
			{ uid: "Write report", reltype: "STARTTOFINISH" },
		]);

		const undo = jest.mocked(showTaskUndo).mock.calls[0][0];
		expect(undo).toHaveLength(1);
		await undo[0]();

		expect(storedNote("Tasks/Publish.md").blockedBy).toEqual(stored);
	});

	async function openWithOneRowPerList() {
		note("Tasks/Design.md");
		note("Tasks/Publish.md", [{ uid: "[[Write report]]", reltype: "FINISHTOSTART" }]);
		const task = note(editedPath, [{ uid: "[[Design]]", reltype: "FINISHTOSTART" }]);
		task.blocking = ["Tasks/Publish.md"];
		return (await openDialog(task)).internals;
	}

	it.each(["blockedBy", "blocking"] as const)(
		"keeps the %s reltype select in place and focused when its type is changed",
		async (side) => {
			const internals = await openWithOneRowPerList();
			const select = reltypeSelect(internals[`${side}List`]);
			select.focus();

			choose(select, "STARTTOSTART");
			await flush();

			expect(reltypeSelect(internals[`${side}List`])).toBe(select);
			expect(document.activeElement).toBe(select);
		}
	);

	it.each([
		["blockedBy", "Design must start before Write report can finish"],
		["blocking", "Write report must start before Publish can finish"],
	] as const)(
		"shows the new type's summary and stores the type as soon as a %s row's type is changed",
		async (side, summary) => {
			const internals = await openWithOneRowPerList();
			const listEl = internals[`${side}List`];

			choose(reltypeSelect(listEl), "STARTTOFINISH");

			expect(listEl.querySelector(".task-dependency-summary")?.textContent).toBe(summary);
			expect(internals[`${side}Items`][0].dependency.reltype).toBe("STARTTOFINISH");
		}
	);

	it("keeps a lag being typed on another row when a row's type is changed", async () => {
		note("Tasks/Design.md");
		note("Tasks/Review.md");
		const task = note(editedPath, [
			{ uid: "[[Design]]", reltype: "FINISHTOSTART" },
			{ uid: "[[Review]]", reltype: "FINISHTOSTART" },
		]);
		const { internals } = await openDialog(task);
		const otherRowLag = internals.blockedByList.querySelectorAll<HTMLInputElement>(
			"input.task-dependency-gap-value"
		)[1];

		choose(reltypeSelect(internals.blockedByList), "STARTTOSTART");
		typeGap(otherRowLag, "4");
		await flush();

		expect(internals.blockedByList.contains(otherRowLag)).toBe(true);
		expect(otherRowLag.value).toBe("4");
		expect(internals.blockedByItems.map((item) => item.dependency)).toEqual([
			{ uid: "Design", reltype: "STARTTOSTART" },
			{ uid: "Review", reltype: "FINISHTOSTART", gap: "P4D" },
		]);
	});

	it("counts a gap change alone as an unsaved change, without moving focus off the field", async () => {
		note("Tasks/Design.md");
		const task = note(editedPath, [{ uid: "[[Design]]", reltype: "FINISHTOSTART" }]);
		const { modal, internals, updateTask } = await openDialog(task);
		const input = gapInput(internals.blockedByList);
		input.focus();
		expect(internals.hasUnsavedChanges()).toBe(false);

		typeGap(input, "3");
		await flush();

		expect(internals.hasUnsavedChanges()).toBe(true);
		expect(gapInput(internals.blockedByList)).toBe(input);
		expect(document.activeElement).toBe(input);

		await modal.handleSave();
		expect(updateTask.mock.calls[0][1].blockedBy).toEqual([
			{ uid: "Design", reltype: "FINISHTOSTART", gap: "P3D" },
		]);
	});

	it.each(["", "0"])("removes the stored gap when the field is set to '%s'", async (entry) => {
		note("Tasks/Design.md");
		const task = note(editedPath, [{ uid: "[[Design]]", reltype: "STARTTOSTART", gap: "P2D" }]);
		const { modal, internals, updateTask } = await openDialog(task);

		typeGap(gapInput(internals.blockedByList), entry);
		await modal.handleSave();

		expect(updateTask.mock.calls[0][1].blockedBy).toEqual([
			{ uid: "Design", reltype: "STARTTOSTART" },
		]);
	});

	it.each(["-3", "100001"])("stores no gap for an entry of '%s'", async (entry) => {
		note("Tasks/Design.md");
		const task = note(editedPath, [{ uid: "[[Design]]", reltype: "STARTTOSTART" }]);
		const { modal, internals, updateTask } = await openDialog(task);

		typeGap(gapInput(internals.blockedByList), entry);
		await modal.handleSave();

		expect(updateTask).not.toHaveBeenCalled();
	});

	it("keeps a gap it cannot compose when the row's reltype is changed and saved", async () => {
		note("Tasks/Design.md");
		const task = note(editedPath, [{ uid: "[[Design]]", reltype: "FINISHTOSTART", gap: "P1DT2H" }]);
		const { modal, internals, updateTask } = await openDialog(task);
		expect(internals.blockedByList.querySelector(".task-dependency-gap-exotic")).not.toBeNull();

		await modal.handleSave();
		expect(updateTask).not.toHaveBeenCalled();

		choose(reltypeSelect(internals.blockedByList), "STARTTOSTART");
		await flush();
		await modal.handleSave();

		expect(updateTask.mock.calls[0][1].blockedBy).toEqual([
			{ uid: "Design", reltype: "STARTTOSTART", gap: "P1DT2H" },
		]);
	});

	it("gives a dependency added from the dialog the default reltype on both lists", async () => {
		note("Tasks/Added.md");
		note("Tasks/Publish.md");
		const task = note(editedPath);
		const { modal, internals, updateTask } = await openDialog(task);

		await internals.openBlockedBySelector();
		internals.addBlockingTaskFromPath("Tasks/Publish.md");
		await flush();

		expect(reltypeSelect(internals.blockedByList).value).toBe("FINISHTOSTART");
		expect(reltypeSelect(internals.blockingList).value).toBe("FINISHTOSTART");

		await modal.handleSave();

		expect(updateTask.mock.calls[0][1].blockedBy).toEqual([
			expect.objectContaining({ reltype: "FINISHTOSTART" }),
		]);
		expect(updateTask.mock.calls[0][1].blockedBy?.[0].gap).toBeUndefined();
		expect(storedNote("Tasks/Publish.md").blockedBy).toEqual([
			expect.objectContaining({ reltype: "FINISHTOSTART" }),
		]);
	});
});
