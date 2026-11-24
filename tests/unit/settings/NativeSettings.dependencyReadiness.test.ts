import { Modal, Setting, type SettingDefinitionItem } from "obsidian";
import type { TaskNotesSettingTab } from "../../../src/settings/TaskNotesSettingTab";
import type { StatusCategory } from "../../../src/types";
import { list, page, settingsFixture, settle } from "../../helpers/native-settings";

const OPT_IN = "enableAdvancedDependencyTypes";
const STARTED_MISSING = "No status is categorized as Started.";

function dependencySettings(options: { missing?: StatusCategory[]; enabled?: boolean } = {}) {
	const fixture = settingsFixture();
	const { app, plugin, tab } = fixture;
	plugin.settings.customStatuses = plugin.settings.customStatuses.filter(
		(status) => !options.missing?.includes(status.category ?? "planned")
	);
	plugin.settings.enableAdvancedDependencyTypes = options.enabled ?? false;

	const navigateToPage = jest.fn();
	Object.assign(app, {
		setting: {
			open: jest.fn(),
			openTabById: () => tab,
			navigateToPage,
			scrollToDefinition: jest.fn(),
		},
	});
	Object.assign(tab, { getElementForDefinition: () => null });

	const dialogs: Modal[] = [];
	jest.spyOn(Modal.prototype, "open").mockImplementation(function (this: Modal) {
		dialogs.push(this);
		this.onOpen();
	});

	tab.update();
	const redraw = jest.spyOn(tab, "update");
	return { ...fixture, dialogs, navigateToPage, redraw };
}

function press(dialog: Modal, label: string): void {
	const button = Array.from(dialog.contentEl.querySelectorAll("button")).find(
		(candidate) => candidate.textContent === label
	);
	if (!button) throw new Error(`Missing button: ${label}`);
	button.click();
}

async function turnOnAndAnswer(
	tab: TaskNotesSettingTab,
	dialogs: Modal[],
	answer: string
): Promise<void> {
	const pending = tab.setControlValue(OPT_IN, true);
	await settle();
	const dialog = dialogs[dialogs.length - 1];
	if (!dialog) throw new Error("No dialog opened");
	press(dialog, answer);
	await pending;
}

function shownNotices(items: SettingDefinitionItem[] = []): string[] {
	const host = document.createElement("div");
	return items.flatMap((item) => {
		if (!("render" in item) || !item.render) return [];
		const visible = typeof item.visible === "function" ? item.visible() : (item.visible ?? true);
		if (!visible) return [];
		const setting = new Setting(host);
		item.render(setting, undefined as never);
		return [setting.descEl.textContent ?? ""];
	});
}

function shownWarnings(tab: TaskNotesSettingTab) {
	const dependencies = page(tab.settingItems, "Properties").items?.find(
		(item) => "heading" in item && item.heading === "Dependencies"
	);
	return {
		besideOptIn: shownNotices(dependencies && "items" in dependencies ? dependencies.items : []),
		besideStatusList: shownNotices(page(tab.settingItems, "Status").items),
	};
}

describe("enabling advanced dependency types", () => {
	it("asks for acknowledgement before taking effect when no status is Started", async () => {
		const { plugin, tab, dialogs } = dependencySettings({ missing: ["in-progress"] });

		const pending = tab.setControlValue(OPT_IN, true);
		await settle();

		expect(dialogs).toHaveLength(1);
		expect(dialogs[0].contentEl.textContent).toContain(STARTED_MISSING);
		expect(plugin.settings.enableAdvancedDependencyTypes).toBe(false);

		dialogs[0].close();
		await pending;
	});

	it("turns the opt-in on and saves when the user just enables", async () => {
		const { plugin, tab, dialogs, navigateToPage } = dependencySettings({
			missing: ["in-progress"],
		});

		await turnOnAndAnswer(tab, dialogs, "Just enable");

		expect(plugin.settings.enableAdvancedDependencyTypes).toBe(true);
		expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
		expect(navigateToPage).not.toHaveBeenCalled();
	});

	it("leaves the opt-in off and redraws the toggle when the user goes back", async () => {
		const { plugin, tab, dialogs, redraw } = dependencySettings({ missing: ["in-progress"] });

		await turnOnAndAnswer(tab, dialogs, "Go back");

		expect(plugin.settings.enableAdvancedDependencyTypes).toBe(false);
		expect(plugin.saveSettings).not.toHaveBeenCalled();
		expect(redraw).toHaveBeenCalled();
		expect(tab.getControlValue(OPT_IN)).toBe(false);
	});

	it("releases the focused toggle before redrawing, because Obsidian leaves a focused control as drawn", async () => {
		const { tab, dialogs, redraw } = dependencySettings({ missing: ["in-progress"] });
		const toggle = document.body.appendChild(document.createElement("input"));
		toggle.focus();
		let focusedAtRedraw: Element | null = toggle;
		redraw.mockImplementation(() => {
			focusedAtRedraw = document.activeElement;
		});

		await turnOnAndAnswer(tab, dialogs, "Go back");
		toggle.remove();

		expect(redraw).toHaveBeenCalled();
		expect(focusedAtRedraw).not.toBe(toggle);
	});

	it("turns the opt-in on, saves and opens the status settings on enable and go to statuses", async () => {
		const { plugin, tab, dialogs, navigateToPage } = dependencySettings({
			missing: ["in-progress"],
		});

		await turnOnAndAnswer(tab, dialogs, "Enable and go to statuses...");

		expect(plugin.settings.enableAdvancedDependencyTypes).toBe(true);
		expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
		expect(navigateToPage.mock.calls.map(([, path]) => path)).toEqual([["Properties", "Status"]]);
	});

	it("opens no dialog when both start categories have a status", async () => {
		const { plugin, tab, dialogs } = dependencySettings();

		await tab.setControlValue(OPT_IN, true);

		expect(dialogs).toHaveLength(0);
		expect(plugin.settings.enableAdvancedDependencyTypes).toBe(true);
		expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
	});

	it("opens no dialog when the opt-in is turned off", async () => {
		const { plugin, tab, dialogs } = dependencySettings({
			missing: ["in-progress"],
			enabled: true,
		});

		await tab.setControlValue(OPT_IN, false);

		expect(dialogs).toHaveLength(0);
		expect(plugin.settings.enableAdvancedDependencyTypes).toBe(false);
		expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
	});

	it("asks again the next time, remembering no acknowledgement", async () => {
		const { plugin, tab, dialogs } = dependencySettings({ missing: ["in-progress"] });

		await turnOnAndAnswer(tab, dialogs, "Just enable");
		await tab.setControlValue(OPT_IN, false);
		await turnOnAndAnswer(tab, dialogs, "Just enable");

		expect(dialogs).toHaveLength(2);
		expect(plugin.settings.enableAdvancedDependencyTypes).toBe(true);
	});

	it("leaves the opt-in off and redraws the toggle when the dialog fails", async () => {
		const { plugin, tab, redraw } = dependencySettings({ missing: ["in-progress"] });
		jest.spyOn(Modal.prototype, "open").mockImplementation(() => {
			throw new Error("dialog failed");
		});

		await expect(tab.setControlValue(OPT_IN, true)).rejects.toThrow("dialog failed");

		expect(plugin.settings.enableAdvancedDependencyTypes).toBe(false);
		expect(plugin.saveSettings).not.toHaveBeenCalled();
		expect(redraw).toHaveBeenCalled();
	});
});

describe("start readiness warning", () => {
	it("shows beside the opt-in and beside the status list while the opt-in is on and Started is missing", () => {
		const { tab } = dependencySettings({ missing: ["in-progress"], enabled: true });

		const { besideOptIn, besideStatusList } = shownWarnings(tab);

		expect(besideOptIn).toHaveLength(1);
		expect(besideOptIn[0]).toContain(STARTED_MISSING);
		expect(besideStatusList).toEqual(besideOptIn);
	});

	it.each<[string, StatusCategory, string]>([
		["Started", "in-progress", "release only when the predecessor completes, not when it starts"],
		[
			"Not started",
			"planned",
			"release immediately instead of holding the task until the predecessor starts",
		],
	])("names the consequence of a missing %s status", (label, category, consequence) => {
		const { tab } = dependencySettings({ missing: [category], enabled: true });

		const { besideOptIn, besideStatusList } = shownWarnings(tab);

		expect(besideOptIn[0]).toContain(`No status is categorized as ${label}.`);
		expect(besideOptIn[0]).toContain(consequence);
		expect(besideStatusList).toEqual(besideOptIn);
	});

	it("stays hidden while the opt-in is off", () => {
		const { tab } = dependencySettings({ missing: ["in-progress"] });

		expect(shownWarnings(tab)).toEqual({ besideOptIn: [], besideStatusList: [] });
	});

	it("stays hidden when both start categories have a status", () => {
		const { tab } = dependencySettings({ enabled: true });

		expect(shownWarnings(tab)).toEqual({ besideOptIn: [], besideStatusList: [] });
	});

	it("appears in both places once the opt-in is acknowledged on", async () => {
		const { tab, dialogs } = dependencySettings({ missing: ["in-progress"] });

		await turnOnAndAnswer(tab, dialogs, "Just enable");

		const { besideOptIn, besideStatusList } = shownWarnings(tab);
		expect(besideOptIn[0]).toContain(STARTED_MISSING);
		expect(besideStatusList[0]).toContain(STARTED_MISSING);
	});

	it("clears from both places once an added status is categorized as Started", async () => {
		const { plugin, tab } = dependencySettings({ missing: ["in-progress"], enabled: true });

		list(tab.settingItems, "Statuses").addItem!.action(document.createElement("button"));
		expect(shownWarnings(tab).besideStatusList).toHaveLength(1);

		const added = plugin.settings.customStatuses[plugin.settings.customStatuses.length - 1];
		await tab.setControlValue(`status.${added.id}.category`, "in-progress");

		expect(shownWarnings(tab)).toEqual({ besideOptIn: [], besideStatusList: [] });
	});
});
