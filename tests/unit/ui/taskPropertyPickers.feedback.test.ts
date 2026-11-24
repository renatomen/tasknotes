import { TFile, stringifyYaml } from "obsidian";
import type TaskNotesPlugin from "../../../src/main";
import { normalizeBlockedByValue } from "../../../src/services/task-service/taskPropertyUpdate";
import type { TaskDependency, TaskInfo } from "../../../src/types";
import { showToast } from "../../../src/ui/kit/toast";
import { changeTaskProperty } from "../../../src/ui/taskPropertyPickers";

jest.mock("../../../src/ui/kit/toast", () => ({ showToast: jest.fn() }));

const blockedBy = (...uids: string[]): TaskDependency[] =>
	uids.map((uid) => ({ uid, reltype: "FINISHTOSTART" }));

async function toastAfterBlockedByChange(
	existing: TaskDependency[] | undefined,
	next: TaskDependency[] | undefined
): Promise<string> {
	const task: TaskInfo = {
		title: "Parent",
		status: "open",
		priority: "normal",
		path: "Tasks/Parent.md",
		archived: false,
		blockedBy: existing,
	};
	const files = ["Tasks/Parent.md", "Tasks/Child Task F1.md", "Archive/Child Task F2.md"].map(
		(path) => new TFile(path)
	);
	const note = (dependencies: TaskDependency[] | undefined) =>
		`---\n${stringifyYaml(dependencies ? { blockedBy: dependencies } : {})}---\n`;
	let content = note(existing);
	const plugin = {
		app: {
			vault: {
				getAbstractFileByPath: (path: string) =>
					files.find((file) => file.path === path) ?? null,
				read: async () => content,
			},
			metadataCache: {
				getFirstLinkpathDest: (linkpath: string) =>
					files.find(
						(file) => file.basename === linkpath || file.path === `${linkpath}.md`
					) ?? null,
			},
		},
		settings: {},
		cacheManager: { getTaskInfo: async () => task },
		fieldMapper: {
			toUserField: (field: string) => field,
			mapFromFrontmatter: (frontmatter: Record<string, unknown>) => frontmatter,
		},
		updateTaskProperty: async (before: TaskInfo, _property: string, value: unknown) => {
			const updated = { ...before, blockedBy: normalizeBlockedByValue(value) };
			content = note(updated.blockedBy);
			return updated;
		},
	} as unknown as TaskNotesPlugin;

	await changeTaskProperty(plugin, [task], "blockedBy", next);

	const [[toast]] = (showToast as jest.Mock).mock.calls as [[{ message: string }]];
	return toast.message;
}

describe("toast after a blocked-by change", () => {
	it("names the property and the blocking tasks instead of [object Object]", async () => {
		const message = await toastAfterBlockedByChange(
			blockedBy("Child Task F1"),
			blockedBy("Child Task F1", "[[Archive/Child Task F2]]")
		);

		expect(message).toBe("1 task updated: Blocked by → Child Task F1, Child Task F2");
	});

	it("names a blocking task whose note cannot be found by its stored link", async () => {
		const message = await toastAfterBlockedByChange(undefined, blockedBy("[[Missing task]]"));

		expect(message).toBe("1 task updated: Blocked by → Missing task");
	});

	it("shows a dash once the last blocking task is removed", async () => {
		const message = await toastAfterBlockedByChange(blockedBy("Child Task F1"), undefined);

		expect(message).toBe("1 task updated: Blocked by → —");
	});
});
