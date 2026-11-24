import { App, TFile } from "obsidian";
import { observeTranslation } from "../../helpers/real-i18n";
import type TaskNotesPlugin from "../../../src/main";
import type { TaskDependency, TaskInfo } from "../../../src/types";
import {
	type DependencyConstraintSource,
	resolveBlockedConstraint,
} from "../../../src/ui/taskCardRelationships";
import {
	renderTaskCardSecondaryBadges,
	updateTaskCardSecondaryBadges,
	type TaskCardSecondaryBadgeHandlers,
} from "../../../src/ui/taskCardSecondaryBadges";

const resolvingApp = {
	metadataCache: { getFirstLinkpathDest: (linkpath: string) => new TFile(linkpath) },
	vault: { getAbstractFileByPath: () => null },
} as unknown as App;

const brokenLinkApp = {
	metadataCache: { getFirstLinkpathDest: () => null },
	vault: { getAbstractFileByPath: () => null },
} as unknown as App;

function createTask(overrides: Partial<TaskInfo> = {}): TaskInfo {
	return {
		title: "Task",
		status: "open",
		priority: "normal",
		path: "Tasks/task.md",
		archived: false,
		...overrides,
	};
}

function edge(uid: string, reltype: TaskDependency["reltype"]): TaskDependency {
	return { uid, reltype };
}

function predecessors(start: string[], finish: string[]): DependencyConstraintSource {
	return {
		getStartBlockingPredecessorPaths: () => start,
		getFinishBlockingPredecessorPaths: () => finish,
	};
}

describe("resolveBlockedConstraint", () => {
	it("reports a start-to-start edge to an unstarted predecessor as start-blocked", () => {
		const task = createTask({
			blockedBy: [edge("Tasks/pred.md", "STARTTOSTART")],
			startBlocked: true,
			finishBlocked: false,
			isBlocked: true,
		});

		expect(
			resolveBlockedConstraint(task, resolvingApp, predecessors(["Tasks/pred.md"], []))
		).toEqual({ state: "start", count: 1 });
	});

	it("reports a finish-to-finish edge to an unfinished predecessor as finish-blocked", () => {
		const task = createTask({
			blockedBy: [edge("Tasks/pred.md", "FINISHTOFINISH")],
			startBlocked: false,
			finishBlocked: true,
			isBlocked: true,
		});

		expect(
			resolveBlockedConstraint(task, resolvingApp, predecessors([], ["Tasks/pred.md"]))
		).toEqual({ state: "finish", count: 1 });
	});

	it("reports a task blocked at both endpoints as start-blocked", () => {
		const task = createTask({
			blockedBy: [edge("Tasks/a.md", "STARTTOSTART"), edge("Tasks/b.md", "FINISHTOFINISH")],
			startBlocked: true,
			finishBlocked: true,
			isBlocked: true,
		});

		expect(
			resolveBlockedConstraint(
				task,
				resolvingApp,
				predecessors(["Tasks/a.md"], ["Tasks/b.md"])
			)
		).toEqual({ state: "start", count: 1 });
	});

	it("reports released dependencies as released while still counting them", () => {
		const task = createTask({
			blockedBy: [edge("Tasks/pred.md", "STARTTOSTART")],
			startBlocked: false,
			finishBlocked: false,
			isBlocked: false,
		});

		expect(resolveBlockedConstraint(task, resolvingApp, predecessors([], []))).toEqual({
			state: "released",
			count: 1,
		});
	});

	it("holds a dependency whose link does not resolve as start-blocked", () => {
		const task = createTask({
			blockedBy: [edge("[[Missing]]", "STARTTOSTART")],
			startBlocked: false,
			finishBlocked: false,
			isBlocked: false,
		});

		expect(resolveBlockedConstraint(task, brokenLinkApp, predecessors([], []))).toEqual({
			state: "start",
			count: 1,
		});
	});

	it("counts only the predecessors that currently hold the task", () => {
		const task = createTask({
			blockedBy: [edge("Tasks/a.md", "STARTTOSTART"), edge("Tasks/b.md", "STARTTOSTART")],
			startBlocked: true,
			finishBlocked: false,
			isBlocked: true,
		});

		expect(
			resolveBlockedConstraint(task, resolvingApp, predecessors(["Tasks/a.md"], []))
		).toEqual({ state: "start", count: 1 });
	});

	it("reports no state for a task without dependencies", () => {
		expect(resolveBlockedConstraint(createTask(), resolvingApp, predecessors([], []))).toEqual({
			state: "none",
			count: 0,
		});
	});

	it("counts every dependency when no dependency cache is available", () => {
		const task = createTask({
			blockedBy: [edge("Tasks/pred.md", "STARTTOSTART")],
			startBlocked: true,
			finishBlocked: false,
			isBlocked: true,
		});

		expect(resolveBlockedConstraint(task, resolvingApp, undefined)).toEqual({
			state: "start",
			count: 1,
		});
	});
});

interface DependencyPaths {
	startBlockingPredecessors?: string[];
	finishBlockingPredecessors?: string[];
	startBlockedDependents?: string[];
	finishBlockedDependents?: string[];
}

function createPlugin(paths: DependencyPaths = {}, locale = "en"): TaskNotesPlugin {
	return {
		settings: {
			showExpandableSubtasks: true,
			expandSubtasksByDefault: false,
			enableDebugLogging: false,
		},
		app: resolvingApp,
		dependencyCache: {
			getStartBlockingPredecessorPaths: () => paths.startBlockingPredecessors ?? [],
			getFinishBlockingPredecessorPaths: () => paths.finishBlockingPredecessors ?? [],
			getStartBlockedDependentPaths: () => paths.startBlockedDependents ?? [],
			getFinishBlockedDependentPaths: () => paths.finishBlockedDependents ?? [],
		},
		i18n: {
			translate: observeTranslation(locale),
		},
		projectSubtasksService: {
			isTaskUsedAsProjectSync: jest.fn(() => false),
			isTaskUsedAsProject: jest.fn(async () => false),
		},
		expandedProjectsService: {
			isExpanded: jest.fn(() => false),
			toggle: jest.fn(() => true),
		},
	} as unknown as TaskNotesPlugin;
}

function createHandlers(): jest.Mocked<TaskCardSecondaryBadgeHandlers> {
	return {
		toggleSubtasks: jest.fn(async () => undefined),
		toggleBlockingTasks: jest.fn(async () => undefined),
		toggleBlockedByTasks: jest.fn(async () => undefined),
	};
}

function renderBadges(task: TaskInfo, plugin: TaskNotesPlugin) {
	const card = document.createElement("div");
	card.className = "task-card";
	const mainRow = card.createDiv({ cls: "task-card__main-row" });
	const badgesContainer = mainRow.createDiv({ cls: "task-card__badges" });
	document.body.appendChild(card);
	const handlers = createHandlers();
	renderTaskCardSecondaryBadges({
		card,
		badgesContainer,
		task,
		plugin,
		hasDetails: false,
		propertyOptions: {},
		handlers,
	});
	return {
		card,
		mainRow,
		handlers,
		blockedToggle: card.querySelector<HTMLElement>(".task-card__blocked-toggle"),
		blockingToggle: card.querySelector<HTMLElement>(".task-card__blocking-toggle"),
	};
}

describe("task card dependency badges", () => {
	beforeEach(() => {
		document.body.innerHTML = "";
	});

	it("shows the start-blocked state on the badge of a task that cannot start", () => {
		const { blockedToggle } = renderBadges(
			createTask({
				isBlocked: true,
				startBlocked: true,
				blockedBy: [
					edge("Tasks/a.md", "FINISHTOSTART"),
					edge("Tasks/b.md", "FINISHTOSTART"),
				],
			}),
			createPlugin({ startBlockingPredecessors: ["Tasks/a.md"] })
		);

		expect(blockedToggle?.classList.contains("is-start-blocked")).toBe(true);
		expect(blockedToggle?.dataset.blockedState).toBe("start");
		expect(blockedToggle?.dataset.count).toBe("1");
		expect(blockedToggle?.getAttribute("data-tooltip")).toBe("Blocked · start (1)");
		expect(blockedToggle?.getAttribute("aria-label")).toBe("Blocked · start (1)");
	});

	it("shows finish-blocked, not start-blocked, on a task that can start but not finish", () => {
		const { blockedToggle } = renderBadges(
			createTask({
				isBlocked: true,
				startBlocked: false,
				finishBlocked: true,
				blockedBy: [edge("Tasks/a.md", "FINISHTOFINISH")],
			}),
			createPlugin({ finishBlockingPredecessors: ["Tasks/a.md"] })
		);

		expect(blockedToggle?.classList.contains("is-finish-blocked")).toBe(true);
		expect(blockedToggle?.classList.contains("is-start-blocked")).toBe(false);
		expect(blockedToggle?.dataset.blockedState).toBe("finish");
		expect(blockedToggle?.getAttribute("data-tooltip")).toBe("Blocked · finish (1)");
	});

	it("shows no blocked state when every dependency in a non-empty list is released", () => {
		const { blockedToggle } = renderBadges(
			createTask({
				isBlocked: false,
				startBlocked: false,
				finishBlocked: false,
				blockedBy: [
					edge("Tasks/a.md", "FINISHTOSTART"),
					edge("Tasks/b.md", "STARTTOSTART"),
				],
			}),
			createPlugin()
		);

		expect(blockedToggle?.classList.contains("is-released")).toBe(true);
		expect(blockedToggle?.classList.contains("is-start-blocked")).toBe(false);
		expect(blockedToggle?.classList.contains("is-finish-blocked")).toBe(false);
		expect(blockedToggle?.dataset.blockedState).toBe("released");
		expect(blockedToggle?.getAttribute("data-tooltip")).toBe("Dependencies (2)");
	});

	it("breaks the blocking tooltip down by endpoint, one per line", () => {
		const { blockingToggle } = renderBadges(
			createTask({
				isBlocking: true,
				isBlockingStart: true,
				isBlockingFinish: true,
				blocking: ["Tasks/waits-to-start.md", "Tasks/waits-to-finish.md"],
			}),
			createPlugin({
				startBlockedDependents: ["Tasks/waits-to-start.md"],
				finishBlockedDependents: ["Tasks/waits-to-finish.md"],
			})
		);

		expect(blockingToggle?.getAttribute("data-tooltip")).toBe(
			"Blocking 2 tasks:\n1 to start\n1 to finish"
		);
		expect(blockingToggle?.getAttribute("data-tooltip-placement")).toBe("top");
	});

	it("keeps the one-line blocking tooltip when no successor's finish is held", () => {
		const { blockingToggle } = renderBadges(
			createTask({
				isBlocking: true,
				isBlockingStart: true,
				blocking: ["Tasks/a.md", "Tasks/b.md"],
			}),
			createPlugin({ startBlockedDependents: ["Tasks/a.md", "Tasks/b.md"] })
		);

		expect(blockingToggle?.getAttribute("data-tooltip")).toBe("Blocking 2 tasks");
	});

	it("moves an existing badge from start-blocked to released on update", () => {
		const blockedBy = [edge("Tasks/a.md", "FINISHTOSTART")];
		const { card, mainRow, handlers, blockedToggle } = renderBadges(
			createTask({ isBlocked: true, startBlocked: true, blockedBy }),
			createPlugin({ startBlockingPredecessors: ["Tasks/a.md"] })
		);

		updateTaskCardSecondaryBadges({
			card,
			mainRow,
			task: createTask({ isBlocked: false, startBlocked: false, blockedBy }),
			plugin: createPlugin(),
			hasDetails: false,
			propertyOptions: {},
			handlers,
		});

		expect(card.querySelector(".task-card__blocked-toggle")).toBe(blockedToggle);
		expect(blockedToggle?.classList.contains("is-released")).toBe(true);
		expect(blockedToggle?.classList.contains("is-start-blocked")).toBe(false);
		expect(blockedToggle?.dataset.blockedState).toBe("released");
		expect(blockedToggle?.getAttribute("data-tooltip")).toBe("Dependencies (1)");
	});

	it("translates the badge tooltips when the interface is in German", () => {
		const { blockedToggle, blockingToggle } = renderBadges(
			createTask({
				isBlocked: true,
				startBlocked: true,
				blockedBy: [edge("Tasks/a.md", "FINISHTOSTART")],
				isBlocking: true,
				blocking: ["Tasks/waits-to-start.md", "Tasks/waits-to-finish.md"],
			}),
			createPlugin(
				{
					startBlockingPredecessors: ["Tasks/a.md"],
					startBlockedDependents: ["Tasks/waits-to-start.md"],
					finishBlockedDependents: ["Tasks/waits-to-finish.md"],
				},
				"de"
			)
		);

		expect(blockedToggle?.getAttribute("data-tooltip")).toBe("Blockiert · Beginn (1)");
		expect(blockingToggle?.getAttribute("data-tooltip")).toBe(
			"Durch diese Aufgabe blockierte Aufgaben: 2\nBeginn: 1\nAbschluss: 1"
		);
	});
});
