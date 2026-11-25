import { TFile } from "obsidian";
import { observeTranslation } from "../../helpers/real-i18n";
import type TaskNotesPlugin from "../../../src/main";
import type { TaskInfo } from "../../../src/types";
import { renderTaskCardMetadata } from "../../../src/ui/taskCardMetadata";
import { renderPropertyMetadata } from "../../../src/ui/taskCardProperties";

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

function createPlugin(start: string[], finish: string[]): TaskNotesPlugin {
	return {
		settings: {},
		app: {
			metadataCache: {
				getFirstLinkpathDest: jest.fn((linkpath: string) => new TFile(linkpath)),
				getCache: jest.fn(() => ({ frontmatter: {} })),
			},
			vault: { getAbstractFileByPath: jest.fn(() => null) },
			workspace: { openLinkText: jest.fn() },
		},
		dependencyCache: {
			getStartBlockingPredecessorPaths: jest.fn(() => start),
			getFinishBlockingPredecessorPaths: jest.fn(() => finish),
		},
		fieldMapper: {
			isPropertyForField: jest.fn(() => false),
			lookupMappingKey: jest.fn((propertyId: string) => propertyId),
			toUserField: jest.fn((field: string) => field),
		},
		i18n: {
			translate: observeTranslation(),
		},
	} as unknown as TaskNotesPlugin;
}

function renderBlockedPill(task: TaskInfo, plugin: TaskNotesPlugin): HTMLElement | null {
	const card = document.createElement("div");
	card.className = "task-card";
	const metadataLine = document.createElement("div");
	card.appendChild(metadataLine);
	document.body.appendChild(card);
	renderTaskCardMetadata({
		metadataLine,
		card,
		task,
		plugin,
		visibleProperties: ["blocked"],
		onBlockedByToggle: jest.fn(),
	});
	return metadataLine.querySelector<HTMLElement>(".task-card__metadata-pill--blocked");
}

describe("blocked metadata pill", () => {
	beforeEach(() => {
		document.body.innerHTML = "";
	});

	it("labels a start-blocked task with the predecessors holding its start", () => {
		const pill = renderBlockedPill(
			createTask({
				isBlocked: true,
				startBlocked: true,
				blockedBy: [
					{ uid: "Tasks/a.md", reltype: "STARTTOSTART" },
					{ uid: "Tasks/b.md", reltype: "STARTTOSTART" },
				],
			}),
			createPlugin(["Tasks/a.md"], [])
		);

		expect(pill?.textContent).toBe("Blocked · start (1)");
		expect(pill?.classList.contains("is-start-blocked")).toBe(true);
		expect(pill?.getAttribute("aria-label")).toBe("Blocked · start (1)");
		expect(pill?.getAttribute("data-tooltip")).toBe(
			"Cannot start yet — waiting on a predecessor"
		);
	});

	it("labels a task that can start but not finish as finish-blocked", () => {
		const pill = renderBlockedPill(
			createTask({
				isBlocked: true,
				startBlocked: false,
				finishBlocked: true,
				blockedBy: [{ uid: "Tasks/a.md", reltype: "FINISHTOFINISH" }],
			}),
			createPlugin([], ["Tasks/a.md"])
		);

		expect(pill?.textContent).toBe("Blocked · finish (1)");
		expect(pill?.classList.contains("is-finish-blocked")).toBe(true);
		expect(pill?.classList.contains("is-start-blocked")).toBe(false);
		expect(pill?.getAttribute("data-tooltip")).toBe(
			"Can start, but cannot finish yet — waiting on a predecessor"
		);
	});

	it("is not rendered when every dependency is released", () => {
		const pill = renderBlockedPill(
			createTask({
				isBlocked: false,
				startBlocked: false,
				finishBlocked: false,
				blockedBy: [{ uid: "Tasks/a.md", reltype: "STARTTOSTART" }],
			}),
			createPlugin([], [])
		);

		expect(pill).toBeNull();
	});

	it("carries a custom property label in place of the default one", () => {
		const container = document.createElement("div");
		const task = createTask({
			isBlocked: true,
			startBlocked: false,
			finishBlocked: true,
			blockedBy: [{ uid: "Tasks/a.md", reltype: "FINISHTOFINISH" }],
		});
		const plugin = createPlugin([], ["Tasks/a.md"]);

		const withDefaultLabel = renderPropertyMetadata(container, "blocked", task, plugin);
		const withCustomLabel = renderPropertyMetadata(container, "blocked", task, plugin, {
			propertyLabels: { blocked: "Waiting" },
		});

		expect(withDefaultLabel?.textContent).toBe("Blocked · finish (1)");
		expect(withCustomLabel?.textContent).toBe("Waiting · finish (1)");
		expect(withCustomLabel?.classList.contains("task-card__metadata-pill--blocked")).toBe(true);
		expect(withCustomLabel?.classList.contains("is-finish-blocked")).toBe(true);
	});
});
