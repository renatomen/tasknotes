import {
	renderDependencyList,
	type DependencyItem,
} from "../../../src/modals/taskModalDependencies";
import type { TaskDependencyRelType } from "../../../src/types";

function unresolvedItem(reltype: TaskDependencyRelType): DependencyItem {
	return { dependency: { uid: "[[A]]", reltype }, name: "A", unresolved: true };
}

function baseOptions(listEl: HTMLElement) {
	return {
		plugin: {} as never,
		listEl,
		items: [unresolvedItem("STARTTOSTART")],
		linkServices: {} as never,
		translate: (key: string) => key,
		onRemove: () => {},
	};
}

describe("renderDependencyList reltype control", () => {
	it("renders a 4-option reltype select seeded from the item and fires onReltypeChange", async () => {
		const listEl = document.createElement("div");
		const changes: Array<[number, string]> = [];
		await renderDependencyList({
			...baseOptions(listEl),
			showReltypeControls: true,
			onReltypeChange: (index, reltype) => changes.push([index, reltype]),
		});

		const select = listEl.querySelector(
			"select.task-project-item__reltype"
		) as HTMLSelectElement | null;
		expect(select).not.toBeNull();
		expect(select!.querySelectorAll("option")).toHaveLength(4);
		expect(select!.value).toBe("STARTTOSTART");

		select!.value = "FINISHTOFINISH";
		select!.dispatchEvent(new Event("change"));
		expect(changes).toEqual([[0, "FINISHTOFINISH"]]);
	});

	it("renders no reltype select when the control is disabled (default behaviour)", async () => {
		const listEl = document.createElement("div");
		await renderDependencyList({ ...baseOptions(listEl), showReltypeControls: false });
		expect(listEl.querySelector("select.task-project-item__reltype")).toBeNull();
	});

	it("renders no reltype select when the option is omitted", async () => {
		const listEl = document.createElement("div");
		await renderDependencyList(baseOptions(listEl));
		expect(listEl.querySelector("select.task-project-item__reltype")).toBeNull();
	});
});
