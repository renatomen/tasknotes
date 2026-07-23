import TaskNotesPlugin from "../../../src/main";
import { DEFAULT_SETTINGS } from "../../../src/settings/defaults";
import { createI18nService } from "../../../src/i18n";
import { renderStatusPropertyCard } from "../../../src/settings/tabs/taskProperties/statusPropertyCard";
import { StatusConfig } from "../../../src/types";

(HTMLElement.prototype as any).appendText ??= function (text: string) {
	this.appendChild(document.createTextNode(text));
};
(HTMLElement.prototype as any).setAttr ??= function (name: string, value: string) {
	this.setAttribute(name, value);
};

// Deliberately named "todo" (not a category name) so findCategorySelect can key on the
// "planned" option to disambiguate the category dropdown from the default/next-status selects.
function createStatus(overrides: Partial<StatusConfig> = {}): StatusConfig {
	return {
		id: "todo",
		value: "todo",
		label: "Todo",
		color: "#808080",
		isCompleted: false,
		order: 0,
		autoArchive: false,
		autoArchiveDelay: 5,
		...overrides,
	};
}

function renderCard(status: StatusConfig) {
	(global as any).Platform = { isMobile: false };
	const app: any = {
		workspace: { onLayoutReady: (fn: any) => fn() },
		metadataCache: {},
		vault: { getConfig: jest.fn().mockReturnValue(false) },
	};
	const plugin = new TaskNotesPlugin(app);
	(plugin as any).settings = {
		...DEFAULT_SETTINGS,
		customStatuses: [status],
		defaultTaskStatus: status.value,
	};
	(plugin as any).registerEvent = jest.fn();
	(plugin as any).manifest = { version: "0.0.0" };
	const i18n = createI18nService();
	(plugin as any).i18n = i18n;
	const translate = (key: string, params?: Record<string, string | number>) =>
		i18n.translate(key, params);
	const container = document.createElement("div");
	renderStatusPropertyCard(container, plugin, jest.fn(), translate);
	return { container, status };
}

function categorySelect(container: HTMLElement): HTMLSelectElement {
	const select = Array.from(container.querySelectorAll("select")).find((s) =>
		Array.from(s.options).some((o) => o.value === "planned")
	);
	if (!select) throw new Error("category dropdown not found");
	return select as HTMLSelectElement;
}

function choose(select: HTMLSelectElement, value: string): void {
	select.value = value;
	select.dispatchEvent(new Event("change"));
}

function badge(container: HTMLElement): HTMLElement | null {
	return container.querySelector(".tasknotes-settings__card-status-badge");
}

describe("Status config card — category dropdown + pill (U2)", () => {
	it("selecting Completed sets category and keeps isCompleted true", () => {
		const { container, status } = renderCard(createStatus());
		choose(categorySelect(container), "completed");
		expect(status.category).toBe("completed");
		expect(status.isCompleted).toBe(true);
	});

	it("selecting Planned or In progress sets isCompleted false", () => {
		const { container, status } = renderCard(
			createStatus({ isCompleted: true, category: "completed" })
		);
		const select = categorySelect(container);
		choose(select, "in-progress");
		expect(status.category).toBe("in-progress");
		expect(status.isCompleted).toBe(false);
		choose(select, "planned");
		expect(status.category).toBe("planned");
		expect(status.isCompleted).toBe(false);
	});

	it("selecting Uncategorized clears both category and isCompleted", () => {
		const { container, status } = renderCard(
			createStatus({ isCompleted: true, category: "completed" })
		);
		choose(categorySelect(container), "");
		expect(status.category).toBeUndefined();
		expect(status.isCompleted).toBe(false);
	});

	it("updates the pill text and variant class to match the selected category", () => {
		const { container } = renderCard(createStatus());
		const select = categorySelect(container);

		choose(select, "in-progress");
		expect(badge(container)?.textContent).toBe("In progress");
		expect(
			badge(container)?.classList.contains(
				"tasknotes-settings__card-status-badge--in-progress"
			)
		).toBe(true);

		choose(select, "");
		expect(badge(container)?.textContent).toBe("Uncategorized");
		expect(
			badge(container)?.classList.contains(
				"tasknotes-settings__card-status-badge--uncategorized"
			)
		).toBe(true);
	});

	it("shows a neutral Uncategorized pill for a migrated (categoryless) status", () => {
		const { container } = renderCard(createStatus());
		expect(badge(container)?.textContent).toBe("Uncategorized");
		expect(
			badge(container)?.classList.contains(
				"tasknotes-settings__card-status-badge--uncategorized"
			)
		).toBe(true);
	});
});
