import type TaskNotesPlugin from "../../../src/main";
import type { TaskDependencyRelType } from "../../../src/types";
import {
	type DependencyItem,
	type DependencyListSide,
	renderDependencyList,
} from "../../../src/modals/taskModalDependencies";
import type { LinkServices } from "../../../src/ui/renderers/linkRenderer";

function unresolvedItem(uid: string, reltype: TaskDependencyRelType, gap?: string): DependencyItem {
	return { dependency: gap ? { uid, reltype, gap } : { uid, reltype }, name: uid, unresolved: true };
}

const translate = (key: string, params?: Record<string, string | number>): string =>
	params ? `${key}|self=${params.self}|other=${params.other}` : key;

async function render(
	side: DependencyListSide,
	items: DependencyItem[],
	overrides: Partial<Parameters<typeof renderDependencyList>[0]> = {}
): Promise<HTMLElement> {
	const listEl = document.createElement("div");
	await renderDependencyList({
		plugin: {} as TaskNotesPlugin,
		listEl,
		items,
		linkServices: {} as LinkServices,
		translate,
		onRemove: jest.fn(),
		side,
		selfName: "This Task",
		showReltypeControls: true,
		...overrides,
	});
	return listEl;
}

describe("dependency reltype controls on both sides (U6)", () => {
	it("renders a 4-option reltype dropdown reflecting the stored type", async () => {
		const listEl = await render("blocked-by", [unresolvedItem("[[Pred]]", "STARTTOSTART")]);
		const select = listEl.querySelector<HTMLSelectElement>("select.task-dependency-reltype");
		expect(select).not.toBeNull();
		expect(select?.options.length).toBe(4);
		expect(select?.value).toBe("STARTTOSTART");
	});

	it("names both concrete tasks in the blocked-by directional summary", async () => {
		const listEl = await render("blocked-by", [unresolvedItem("[[Pred]]", "STARTTOSTART")]);
		const summary = listEl.querySelector(".task-dependency-summary");
		expect(summary?.textContent).toContain(
			"modals.task.dependencies.summary.blockedBy.startToStart"
		);
		expect(summary?.textContent).toContain("self=This Task");
		expect(summary?.textContent).toContain("other=[[Pred]]");
	});

	it("uses the reversed blocking-side summary template", async () => {
		const listEl = await render("blocking", [unresolvedItem("[[Succ]]", "FINISHTOSTART")]);
		const summary = listEl.querySelector(".task-dependency-summary");
		expect(summary?.textContent).toContain(
			"modals.task.dependencies.summary.blocking.finishToStart"
		);
	});

	it("emits the picked reltype", async () => {
		const onReltypeChange = jest.fn();
		const listEl = await render("blocked-by", [unresolvedItem("[[Pred]]", "FINISHTOSTART")], {
			onReltypeChange,
		});
		const select = listEl.querySelector<HTMLSelectElement>("select.task-dependency-reltype");
		select!.value = "FINISHTOFINISH";
		select!.dispatchEvent(new Event("change"));
		expect(onReltypeChange).toHaveBeenCalledWith(0, "FINISHTOFINISH");
	});

	it("composes the gap into ISO-8601 on change", async () => {
		const onGapChange = jest.fn();
		const listEl = await render("blocked-by", [unresolvedItem("[[Pred]]", "FINISHTOSTART")], {
			onGapChange,
		});
		const value = listEl.querySelector<HTMLInputElement>("input.task-dependency-gap-value");
		value!.value = "2";
		value!.dispatchEvent(new Event("change"));
		expect(onGapChange).toHaveBeenCalledWith(0, "P2D");
	});

	it("shows an exotic stored gap read-only", async () => {
		const listEl = await render("blocked-by", [
			unresolvedItem("[[Pred]]", "FINISHTOSTART", "P1DT2H"),
		]);
		expect(listEl.querySelector(".task-dependency-gap-exotic")).not.toBeNull();
		expect(listEl.querySelector("input.task-dependency-gap-value")).toBeNull();
	});

	it("omits all controls when the advanced-types flag is off", async () => {
		const listEl = await render("blocked-by", [unresolvedItem("[[Pred]]", "FINISHTOSTART")], {
			showReltypeControls: false,
		});
		expect(listEl.querySelector(".task-dependency-controls")).toBeNull();
	});
});
