import type { SettingDefinitionItem, SettingDefinitionPage } from "obsidian";
import { control, flattenSettings, list, page, settingsFixture } from "../../helpers/native-settings";

function statusSettings() {
	const fixture = settingsFixture();
	const { plugin, tab } = fixture;
	let definitions = tab.getSettingDefinitions();
	const update = jest.spyOn(tab, "update").mockImplementation(() => {
		definitions = tab.getSettingDefinitions();
	});
	const status = (value: string) => {
		const match = plugin.settings.customStatuses.find((entry) => entry.value === value);
		if (!match) throw new Error(`Missing status: ${value}`);
		return match;
	};
	const row = (name: string) => page(list(definitions, "Statuses").items ?? [], name);
	return { ...fixture, update, status, row, definitions: () => definitions };
}

function shownValue(row: SettingDefinitionPage): string | undefined {
	return typeof row.displayValue === "function" ? row.displayValue() : row.displayValue;
}

function pageAt(items: SettingDefinitionItem[], path: string[]): SettingDefinitionPage {
	return path.reduce<SettingDefinitionPage>((parent, name) => page(parent.items ?? [], name), {
		type: "page",
		name: "",
		items,
	});
}

describe("status category editing", () => {
	it("offers the three categories on every status page", () => {
		const { plugin, definitions } = statusSettings();
		const pages = list(definitions(), "Statuses").items ?? [];

		expect(pages).toHaveLength(plugin.settings.customStatuses.length);
		plugin.settings.customStatuses.forEach((status, index) => {
			const entry = pages[index];
			const category = control("items" in entry ? (entry.items ?? []) : [], `status.${status.id}.category`);
			expect(category.name).toBe("Category:");
			expect(category.control).toMatchObject({ type: "dropdown" });
			expect(Object.entries("options" in category.control ? category.control.options : {})).toEqual([
				["planned", "Not started"],
				["in-progress", "Started"],
				["completed", "Completed"],
			]);
		});
	});

	it("sets the completed flag and saves when Completed is chosen", async () => {
		const { plugin, tab, status } = statusSettings();
		const open = status("open");
		const saved: unknown[] = [];
		(plugin.saveSettings as jest.Mock).mockImplementation(() => {
			saved.push({ category: open.category, isCompleted: open.isCompleted });
			return Promise.resolve();
		});

		await tab.setControlValue(`status.${open.id}.category`, "completed");

		expect(saved).toEqual([{ category: "completed", isCompleted: true }]);
	});

	it("clears the completed flag when Started is chosen on a completed status", async () => {
		const { tab, status } = statusSettings();
		const done = status("done");

		await tab.setControlValue(`status.${done.id}.category`, "in-progress");

		expect(done).toMatchObject({ category: "in-progress", isCompleted: false });
	});

	it("moves the category to Completed when the completed flag is turned on", async () => {
		const { tab, status } = statusSettings();
		const started = status("in-progress");

		await tab.setControlValue(`status.${started.id}.isCompleted`, true);

		expect(started).toMatchObject({ category: "completed", isCompleted: true });
	});

	it("moves a Completed status to Not started when the completed flag is turned off", async () => {
		const { plugin, tab, status } = statusSettings();
		const done = status("done");

		await tab.setControlValue(`status.${done.id}.isCompleted`, false);

		expect(done).toMatchObject({ category: "planned", isCompleted: false });
		expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
	});

	it("shows the new category on the status row once the tab has re-rendered", async () => {
		const { tab, status, row, update } = statusSettings();
		expect(shownValue(row("Open"))).toBe("Not started");

		await tab.setControlValue(`status.${status("open").id}.category`, "in-progress");
		expect(update).toHaveBeenCalledTimes(1);
		expect(shownValue(row("Open"))).toBe("Started");

		await tab.setControlValue(`status.${status("open").id}.isCompleted`, true);
		expect(update).toHaveBeenCalledTimes(2);
		expect(shownValue(row("Open"))).toBe("Completed");
	});

	it("re-renders the open status page so the other control shows the change", async () => {
		const { app, tab, status, update, definitions } = statusSettings();
		const open = status("open");
		const path = ["Properties", "Status", "Open"];
		const openPage = { pagePath: [...path], title: "Open" };
		Object.assign(app, { setting: { activeTab: tab, pageStack: [{ page: openPage }] } });

		await tab.setControlValue(`status.${open.id}.category`, "completed");
		expect(update).toHaveBeenCalledTimes(1);
		expect(tab.getControlValue(`status.${open.id}.isCompleted`)).toBe(true);

		await tab.setControlValue(`status.${open.id}.isCompleted`, false);
		expect(update).toHaveBeenCalledTimes(2);
		expect(tab.getControlValue(`status.${open.id}.category`)).toBe("planned");

		expect(openPage.pagePath).toEqual(path);
		const rendered = pageAt(definitions(), path).items ?? [];
		expect(control(rendered, `status.${open.id}.category`)).toBeDefined();
		expect(control(rendered, `status.${open.id}.isCompleted`)).toBeDefined();
	});

	it("adds no category to priorities", () => {
		const { definitions } = statusSettings();
		const priorities = list(definitions(), "Priorities").items ?? [];

		expect(priorities.length).toBeGreaterThan(0);
		expect(
			flattenSettings(priorities).flatMap((item) =>
				"control" in item && item.control?.key.endsWith(".category") ? [item.control.key] : []
			)
		).toEqual([]);
		expect(priorities.filter((item) => "displayValue" in item)).toEqual([]);
	});
});
