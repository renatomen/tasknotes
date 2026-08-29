import { describe, it, expect, jest } from "@jest/globals";
import {
	addBlockedByDependency,
	addBlockingDependency,
	addReltypeMenuItems,
} from "../../../src/components/taskContextMenuDependencies";
import type { Menu } from "obsidian";
import type { TaskInfo } from "../../../src/types";

function makePlugin() {
	return {
		app: {
			vault: {
				// Non-TFile return routes formatDependencyLink through its basename-wikilink fallback.
				getAbstractFileByPath: jest.fn().mockReturnValue(null),
			},
		},
		settings: { useFrontmatterMarkdownLinks: false },
		updateTaskProperty: jest
			.fn()
			.mockImplementation(async (t: any, property: string, value: unknown) => ({
				...t,
				[property]: value,
			})),
		taskService: {
			updateBlockingRelationships: jest.fn().mockResolvedValue(undefined),
		},
		cacheManager: {
			getTaskInfo: jest.fn().mockResolvedValue(null),
		},
	} as any;
}

function task(path: string, extra: Partial<TaskInfo> = {}): TaskInfo {
	return { path, ...extra } as unknown as TaskInfo;
}

function fakeSubmenu() {
	const items: Array<{ title: string; onClick: () => void }> = [];
	const submenu = {
		addItem(cb: (item: any) => void) {
			const rec = { title: "", onClick: () => {} };
			const item: any = {
				setTitle: (t: string) => {
					rec.title = t;
					return item;
				},
				onClick: (fn: () => void) => {
					rec.onClick = fn;
					return item;
				},
			};
			cb(item);
			items.push(rec);
			return submenu;
		},
	};
	return { submenu: submenu as unknown as Menu, items };
}

const translate = (key: string) => key;

describe("taskContextMenuDependencies", () => {
	describe("addBlockedByDependency", () => {
		it("writes the chosen reltype", async () => {
			const plugin = makePlugin();
			const t = task("Tasks/dependent.md", { blockedBy: [] });
			await addBlockedByDependency({
				plugin,
				task: t,
				selectedTask: task("Tasks/blocker.md"),
				reltype: "STARTTOSTART",
				translate,
			});
			expect(plugin.updateTaskProperty).toHaveBeenCalledTimes(1);
			const [, property, value] = plugin.updateTaskProperty.mock.calls[0];
			expect(property).toBe("blockedBy");
			expect(value).toHaveLength(1);
			expect(value[0].reltype).toBe("STARTTOSTART");
		});

		it("defaults to FINISHTOSTART when no reltype is given", async () => {
			const plugin = makePlugin();
			const t = task("Tasks/dependent.md", { blockedBy: [] });
			await addBlockedByDependency({
				plugin,
				task: t,
				selectedTask: task("Tasks/blocker.md"),
				translate,
			});
			const value = plugin.updateTaskProperty.mock.calls[0][2];
			expect(value[0].reltype).toBe("FINISHTOSTART");
		});

		it("does not write when the selected task is itself", async () => {
			const plugin = makePlugin();
			const t = task("Tasks/self.md", { blockedBy: [] });
			await addBlockedByDependency({
				plugin,
				task: t,
				selectedTask: task("Tasks/self.md"),
				translate,
			});
			expect(plugin.updateTaskProperty).not.toHaveBeenCalled();
		});

		it("does not write a duplicate blocked-by edge", async () => {
			const plugin = makePlugin();
			const t = task("Tasks/dependent.md", {
				blockedBy: [{ uid: "blocker", reltype: "FINISHTOSTART" }],
			});
			await addBlockedByDependency({
				plugin,
				task: t,
				selectedTask: task("Tasks/blocker.md"),
				reltype: "FINISHTOSTART",
				translate,
			});
			expect(plugin.updateTaskProperty).not.toHaveBeenCalled();
		});
	});

	describe("addBlockingDependency", () => {
		it("passes the chosen reltype to the blocking write", async () => {
			const plugin = makePlugin();
			const t = task("Tasks/blocker.md", { blocking: [] });
			await addBlockingDependency({
				plugin,
				task: t,
				selectedTask: task("Tasks/blocked.md"),
				reltype: "FINISHTOFINISH",
				translate,
			});
			expect(plugin.taskService.updateBlockingRelationships).toHaveBeenCalledTimes(1);
			const [, added, removed, entryMap] =
				plugin.taskService.updateBlockingRelationships.mock.calls[0];
			expect(added).toEqual(["Tasks/blocked.md"]);
			expect(removed).toEqual([]);
			expect(entryMap["Tasks/blocked.md"].reltype).toBe("FINISHTOFINISH");
		});

		it("does not write when already blocking the target", async () => {
			const plugin = makePlugin();
			const t = task("Tasks/blocker.md", { blocking: ["Tasks/blocked.md"] });
			await addBlockingDependency({
				plugin,
				task: t,
				selectedTask: task("Tasks/blocked.md"),
				reltype: "FINISHTOSTART",
				translate,
			});
			expect(plugin.taskService.updateBlockingRelationships).not.toHaveBeenCalled();
		});
	});

	describe("addReltypeMenuItems", () => {
		it("builds the four types in order with side titles and threads the reltype", () => {
			const { submenu, items } = fakeSubmenu();
			const picks: string[] = [];
			addReltypeMenuItems(
				submenu,
				"blocking",
				(key) => key,
				(rel) => {
					picks.push(rel);
				}
			);

			expect(items).toHaveLength(4);
			expect(items.map((i) => i.title)).toEqual([
				"contextMenus.task.dependencies.reltype.blocking.finishToStart",
				"contextMenus.task.dependencies.reltype.blocking.startToStart",
				"contextMenus.task.dependencies.reltype.blocking.finishToFinish",
				"contextMenus.task.dependencies.reltype.blocking.startToFinish",
			]);

			items.forEach((i) => i.onClick());
			expect(picks).toEqual([
				"FINISHTOSTART",
				"STARTTOSTART",
				"FINISHTOFINISH",
				"STARTTOFINISH",
			]);
		});

		it("uses blocked-by titles for the blocked-by side", () => {
			const { submenu, items } = fakeSubmenu();
			addReltypeMenuItems(submenu, "blockedBy", (key) => key, () => {});
			expect(items[0].title).toBe(
				"contextMenus.task.dependencies.reltype.blockedBy.finishToStart"
			);
		});
	});
});
