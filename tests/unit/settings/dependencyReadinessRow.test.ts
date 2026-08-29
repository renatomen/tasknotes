import TaskNotesPlugin from "../../../src/main";
import { DEFAULT_SETTINGS, DEFAULT_STATUSES } from "../../../src/settings/defaults";
import { createI18nService } from "../../../src/i18n";
import { renderFeaturesTab } from "../../../src/settings/tabs/featuresTab";
import { StatusConfig } from "../../../src/types";

function statusesWithout(category: string): StatusConfig[] {
	return (JSON.parse(JSON.stringify(DEFAULT_STATUSES)) as StatusConfig[]).filter(
		(status) => status.category !== category
	);
}

function renderFeatures(customStatuses: StatusConfig[], enabled: boolean): HTMLElement {
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
		enableAdvancedDependencyTypes: enabled,
	};
	(plugin as any).i18n = createI18nService();
	(plugin as any).registerEvent = jest.fn();
	(plugin as any).manifest = { version: "0.0.0" };
	(plugin as any).fieldMapper = {
		isPropertyForField: jest.fn(() => false),
		toUserField: jest.fn((field: any) => field),
		toInternalField: jest.fn((field: any) => field),
	};

	const container = document.createElement("div");
	renderFeaturesTab(container, plugin, jest.fn());
	return container;
}

describe("Dependencies status readiness row", () => {
	it("marks the missing category with a decorative glyph and the warning class", () => {
		const container = renderFeatures(statusesWithout("in-progress"), true);

		const warning = container.querySelector(".tn-start-readiness-warning");
		const glyph = warning?.querySelector(".tn-start-readiness-warning__glyph");

		expect(glyph?.textContent).toBe("!");
		expect(glyph?.getAttribute("aria-hidden")).toBe("true");
		expect(warning?.textContent).toBe("!No status is categorized as Started.");
	});

	it("leaves the consequence and the remedy to the modal", () => {
		const container = renderFeatures(statusesWithout("in-progress"), true);

		expect(container.textContent).not.toContain("need at least one not-started status");
		expect(container.textContent).not.toContain(
			"Categorize a status in the task properties settings."
		);
	});

	it("carries no warning treatment when both start categories have a status", () => {
		const container = renderFeatures(JSON.parse(JSON.stringify(DEFAULT_STATUSES)), true);

		expect(container.querySelector(".tn-start-readiness-warning")).toBeNull();
		expect(container.querySelector(".tn-start-readiness-warning__glyph")).toBeNull();
		expect(container.textContent).toContain("Start-based dependencies are ready.");
	});

	it("counts the configured statuses by category", () => {
		expect(renderFeatures(statusesWithout("in-progress"), true).textContent).toContain(
			"Not started: 2, Started: 0, Completed: 1."
		);
		expect(
			renderFeatures(JSON.parse(JSON.stringify(DEFAULT_STATUSES)), true).textContent
		).toContain("Not started: 2, Started: 1, Completed: 1.");
	});

	it("says nothing about readiness while advanced dependency types are off", () => {
		const container = renderFeatures(statusesWithout("in-progress"), false);

		expect(container.textContent).not.toContain("Status readiness");
		expect(container.querySelector(".tn-start-readiness-warning")).toBeNull();
	});
});
