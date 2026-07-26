import TaskNotesPlugin from "../../../src/main";
import { DEFAULT_SETTINGS } from "../../../src/settings/defaults";
import { createI18nService } from "../../../src/i18n";
import {
	renderStatusPropertyCard,
	renderStatusReadinessIndicator,
} from "../../../src/settings/tabs/taskProperties/statusPropertyCard";
import { StatusCategory, StatusConfig } from "../../../src/types";

(HTMLElement.prototype as any).appendText ??= function (text: string) {
	this.appendChild(document.createTextNode(text));
};
(HTMLElement.prototype as any).setAttr ??= function (name: string, value: string) {
	this.setAttribute(name, value);
};

function createStatus(value: string, category: StatusCategory, order: number): StatusConfig {
	return {
		id: value,
		value,
		label: value,
		color: "#808080",
		isCompleted: category === "completed",
		category,
		order,
		autoArchive: false,
		autoArchiveDelay: 5,
	};
}

const ALL_CATEGORIES: StatusConfig[] = [
	createStatus("todo", "planned", 0),
	createStatus("doing", "in-progress", 1),
	createStatus("done", "completed", 2),
];

function renderTab(customStatuses: StatusConfig[], enableAdvancedDependencyTypes: boolean) {
	(global as any).Platform = { isMobile: false };
	const app: any = {
		workspace: { onLayoutReady: (fn: any) => fn() },
		metadataCache: {},
		vault: { getConfig: jest.fn().mockReturnValue(false) },
	};
	const plugin = new TaskNotesPlugin(app);
	(plugin as any).settings = {
		...DEFAULT_SETTINGS,
		customStatuses,
		defaultTaskStatus: customStatuses[0].value,
		enableAdvancedDependencyTypes,
	};
	(plugin as any).registerEvent = jest.fn();
	(plugin as any).manifest = { version: "0.0.0" };
	const i18n = createI18nService();
	(plugin as any).i18n = i18n;
	const navigateToTab = jest.fn();
	(plugin as any).settingTab = { navigateToTab };

	const translate = (key: string, params?: Record<string, string | number>) =>
		i18n.translate(key, params);
	const container = document.createElement("div");
	const readinessHost = container.createDiv();
	const refreshReadiness = () => renderStatusReadinessIndicator(readinessHost, plugin, translate);
	refreshReadiness();
	renderStatusPropertyCard(container, plugin, jest.fn(), translate, refreshReadiness);

	return { container, readinessHost, navigateToTab, translate };
}

function indicator(container: HTMLElement): HTMLElement | null {
	return container.querySelector(".tn-status-category-advisory");
}

function categorySelects(container: HTMLElement): HTMLSelectElement[] {
	return Array.from(container.querySelectorAll("select")).filter((select) =>
		Array.from(select.options).some((option) => option.value === "planned")
	);
}

function choose(select: HTMLSelectElement, value: string): void {
	select.value = value;
	select.dispatchEvent(new Event("change"));
}

describe("Status readiness indicator", () => {
	it("warns and names the missing start category", () => {
		const { container, translate } = renderTab(
			[ALL_CATEGORIES[0], ALL_CATEGORIES[2]].map((status) => ({ ...status })),
			true
		);

		const el = indicator(container);
		expect(el?.classList.contains("tn-status-category-advisory--warning")).toBe(true);
		expect(el?.textContent).toContain(
			translate("settings.taskProperties.taskStatuses.badges.inProgress")
		);
	});

	it("renders the warning in the tab container, outside the status card", () => {
		const { container, readinessHost } = renderTab(
			[ALL_CATEGORIES[0], ALL_CATEGORIES[2]].map((status) => ({ ...status })),
			true
		);

		const el = indicator(container);
		expect(readinessHost.contains(el as Node)).toBe(true);
		expect(el?.closest(".tasknotes-settings__card")).toBeNull();
		expect(container.firstElementChild).toBe(readinessHost);
	});

	it("renders the ready state when both start categories have a status", () => {
		const { container, translate } = renderTab(
			ALL_CATEGORIES.map((status) => ({ ...status })),
			true
		);

		const el = indicator(container);
		expect(el?.classList.contains("tn-status-category-advisory--ready")).toBe(true);
		expect(el?.textContent).toContain(
			translate("settings.taskProperties.taskStatuses.categoryReady")
		);
	});

	it("renders nothing while advanced dependency types are off", () => {
		const { container } = renderTab(
			[ALL_CATEGORIES[0], ALL_CATEGORIES[2]].map((status) => ({ ...status })),
			false
		);

		expect(indicator(container)).toBeNull();
	});

	it("treats a missing Completed category as ready", () => {
		const { container } = renderTab(
			[ALL_CATEGORIES[0], ALL_CATEGORIES[1]].map((status) => ({ ...status })),
			true
		);

		expect(indicator(container)?.classList.contains("tn-status-category-advisory--ready")).toBe(
			true
		);
	});

	it("flips to ready when a status becomes Started, keeping the status list in place", () => {
		const { container } = renderTab(
			[ALL_CATEGORIES[0], ALL_CATEGORIES[2]].map((status) => ({ ...status })),
			true
		);
		const statusList = container.querySelector(".tasknotes-statuses-container");
		const select = categorySelects(container)[1];

		choose(select, "in-progress");

		expect(indicator(container)?.classList.contains("tn-status-category-advisory--ready")).toBe(
			true
		);
		expect(container.querySelector(".tasknotes-statuses-container")).toBe(statusList);
		expect(categorySelects(container)[1]).toBe(select);
	});

	it("flips back to a warning when the last Started status changes category", () => {
		const { container, translate } = renderTab(
			ALL_CATEGORIES.map((status) => ({ ...status })),
			true
		);

		choose(categorySelects(container)[1], "completed");

		const el = indicator(container);
		expect(el?.classList.contains("tn-status-category-advisory--warning")).toBe(true);
		expect(el?.textContent).toContain(
			translate("settings.taskProperties.taskStatuses.badges.inProgress")
		);
	});

	it("opens the Dependencies settings from the warning link", () => {
		const { container, navigateToTab } = renderTab(
			[ALL_CATEGORIES[0], ALL_CATEGORIES[2]].map((status) => ({ ...status })),
			true
		);

		container.querySelector<HTMLAnchorElement>(".tn-status-category-advisory__link")?.click();

		expect(navigateToTab).toHaveBeenCalledWith("features");
	});
});
