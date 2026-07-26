import TaskNotesPlugin from "../../../src/main";
import { TaskNotesSettingTab } from "../../../src/settings/TaskNotesSettingTab";
import { DEFAULT_SETTINGS } from "../../../src/settings/defaults";
import { createI18nService } from "../../../src/i18n";
import { StatusConfig } from "../../../src/types";

(HTMLElement.prototype as any).appendText ??= function (text: string) {
	this.appendChild(document.createTextNode(text));
};
(HTMLElement.prototype as any).setAttr ??= function (name: string, value: string) {
	this.setAttribute(name, value);
};

function createTab(): { tab: TaskNotesSettingTab; plugin: TaskNotesPlugin } {
	(global as any).Platform = { isMobile: false };
	const app: any = {
		workspace: { onLayoutReady: (fn: any) => fn() },
		metadataCache: {},
		vault: { getConfig: jest.fn().mockReturnValue(false) },
	};
	const plugin = new TaskNotesPlugin(app);
	(plugin as any).settings = {
		...DEFAULT_SETTINGS,
		customStatuses: JSON.parse(
			JSON.stringify(DEFAULT_SETTINGS.customStatuses)
		) as StatusConfig[],
	};
	(plugin as any).i18n = createI18nService();
	(plugin as any).registerEvent = jest.fn();
	(plugin as any).manifest = { version: "0.0.0" };
	(plugin as any).fieldMapper = {
		isPropertyForField: jest.fn(() => false),
		toUserField: jest.fn((field: any) => field),
		toInternalField: jest.fn((field: any) => field),
	};

	return { tab: new TaskNotesSettingTab(app, plugin), plugin };
}

function tabContent(tab: TaskNotesSettingTab, tabId: string): HTMLElement {
	return tab.containerEl.querySelector(`#settings-tab-${tabId}`) as HTMLElement;
}

function tabButton(tab: TaskNotesSettingTab, tabId: string): HTMLElement {
	return tab.containerEl.querySelector(`#tab-button-${tabId}`) as HTMLElement;
}

describe("Settings tab programmatic navigation", () => {
	it("renders a tab that has never been rendered", () => {
		const { tab } = createTab();
		tab.display();
		expect(tabContent(tab, "features").children.length).toBe(0);

		tab.navigateToTab("features");

		expect(tabContent(tab, "features").children.length).toBeGreaterThan(0);
	});

	it("re-renders an already rendered tab so it reflects settings changed since", () => {
		const { tab, plugin } = createTab();
		plugin.settings.customStatuses[0].label = "Label before";
		tab.display();

		tab.navigateToTab("task-properties");
		expect(tabContent(tab, "task-properties").textContent).toContain("Label before");

		plugin.settings.customStatuses[0].label = "Label after";
		tab.navigateToTab("task-properties");

		expect(tabContent(tab, "task-properties").textContent).toContain("Label after");
		expect(tabContent(tab, "task-properties").textContent).not.toContain("Label before");
	});

	it("moves the active state onto the target button and off the previous one", () => {
		const { tab } = createTab();
		tab.display();

		tab.navigateToTab("features");

		const general = tabButton(tab, "general");
		const features = tabButton(tab, "features");
		expect(features.classList.contains("active")).toBe(true);
		expect(features.classList.contains("is-active")).toBe(true);
		expect(features.getAttribute("aria-selected")).toBe("true");
		expect(general.classList.contains("active")).toBe(false);
		expect(general.classList.contains("is-active")).toBe(false);
		expect(general.getAttribute("aria-selected")).toBe("false");
		expect(
			tabContent(tab, "features").classList.contains("settings-view__tab-content--active")
		).toBe(true);
		expect(
			tabContent(tab, "general").classList.contains("settings-view__tab-content--active")
		).toBe(false);
	});

	it("focuses the target tab button", () => {
		jest.useFakeTimers();
		try {
			const { tab } = createTab();
			document.body.appendChild(tab.containerEl);
			tab.display();

			tab.navigateToTab("features");
			jest.runOnlyPendingTimers();

			expect(document.activeElement).toBe(tabButton(tab, "features"));
		} finally {
			jest.useRealTimers();
		}
	});

	it("ignores an unknown tab id", () => {
		const { tab } = createTab();
		tab.display();

		expect(() => tab.navigateToTab("dependencies")).not.toThrow();

		expect(tabButton(tab, "general").classList.contains("active")).toBe(true);
		expect(tabContent(tab, "general").classList.contains("active")).toBe(true);
	});

	it("does nothing when the settings view has never been displayed", () => {
		const { tab } = createTab();

		expect(() => tab.navigateToTab("features")).not.toThrow();
	});
});
