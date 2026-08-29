import type TaskNotesPlugin from "../../../src/main";
import type { TaskInfo } from "../../../src/types";
import { renderTaskCardMetadata } from "../../../src/ui/taskCardMetadata";

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
				getFirstLinkpathDest: jest.fn(() => null),
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
			translate: jest.fn((key: string) => {
				const translations: Record<string, string> = {
					"ui.taskCard.blockedStart": "Blocked · start",
					"ui.taskCard.blockedStartTooltip": "Cannot start yet",
					"ui.taskCard.blockedFinish": "Blocked · finish",
					"ui.taskCard.blockedFinishTooltip": "Cannot finish yet",
				};
				return translations[key] ?? key;
			}),
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

describe("blocked metadata pill per-endpoint state (U5)", () => {
	beforeEach(() => {
		document.body.innerHTML = "";
		jest.clearAllMocks();
	});

	it("labels a start-blocked task 'Blocked · start' with the constraining count", () => {
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
	});

	it("labels a finish-blocked task 'Blocked · finish' and uses the warning treatment", () => {
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
	});

	it("renders no blocked pill for a released task", () => {
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
});
