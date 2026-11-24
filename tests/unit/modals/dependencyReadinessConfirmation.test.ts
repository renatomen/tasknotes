import { App } from "obsidian";
import type TaskNotesPlugin from "../../../src/main";
import { createI18nService } from "../../../src/i18n";
import { DependencyReadinessConfirmationModal } from "../../../src/modals/DependencyReadinessConfirmationModal";
import type { StatusCategory } from "../../../src/types";

function openModal(missingCategories: StatusCategory[]) {
	const plugin = { app: new App(), i18n: createI18nService() } as unknown as TaskNotesPlugin;
	const modal = new DependencyReadinessConfirmationModal(plugin, missingCategories);
	const choice = modal.show();
	return { modal, choice };
}

function buttons(modal: DependencyReadinessConfirmationModal): HTMLButtonElement[] {
	return Array.from(modal.contentEl.querySelectorAll(".modal-button-container button"));
}

function press(modal: DependencyReadinessConfirmationModal, label: string): void {
	const button = buttons(modal).find((candidate) => candidate.textContent === label);
	if (!button) throw new Error(`Missing button: ${label}`);
	button.click();
}

function bodyText(modal: DependencyReadinessConfirmationModal): string {
	return modal.contentEl.textContent ?? "";
}

describe("dependency readiness confirmation", () => {
	// The mocked Modal closes itself on a zero timer; fake timers keep it open until a test acts.
	beforeEach(() => {
		jest.useFakeTimers();
	});

	afterEach(() => {
		jest.useRealTimers();
	});

	it.each([
		["Go back", "go-back"],
		["Just enable", "enable"],
		["Enable and go to statuses...", "enable-and-open-statuses"],
	])("resolves %s as %s", async (label, expected) => {
		const { modal, choice } = openModal(["in-progress"]);

		press(modal, label);

		await expect(choice).resolves.toBe(expected);
	});

	it("resolves go-back when it is closed without a choice", async () => {
		const { modal, choice } = openModal(["in-progress"]);

		modal.close();

		await expect(choice).resolves.toBe("go-back");
	});

	it("asks whether to enable advanced dependency types", () => {
		const { modal } = openModal(["in-progress"]);

		expect(modal.titleEl.textContent).toBe("Enable advanced dependency types?");
	});

	it.each<[string, StatusCategory[], string]>([
		["Started", ["in-progress"], "No status is categorized as Started."],
		["Not started", ["planned"], "No status is categorized as Not started."],
		["both", ["planned", "in-progress"], "No status is categorized as Not started or Started."],
	])("names the missing category: %s", (_case, missing, sentence) => {
		const { modal } = openModal(missing);

		expect(bodyText(modal)).toContain(sentence);
	});

	it("says start-based dependencies wait for completion when no status is Started", () => {
		const { modal } = openModal(["in-progress"]);

		expect(bodyText(modal)).toContain(
			"release only when the predecessor completes, not when it starts"
		);
	});

	it.each<[string, StatusCategory[]]>([
		["Not started is missing", ["planned"]],
		["both are missing", ["planned", "in-progress"]],
	])("says start-based dependencies release immediately when %s", (_case, missing) => {
		const { modal } = openModal(missing);

		expect(bodyText(modal)).toContain(
			"release immediately instead of holding the task until the predecessor starts"
		);
	});

	it("points to the status categories as the remedy", () => {
		const { modal } = openModal(["in-progress"]);

		expect(bodyText(modal)).toContain(
			"assign the missing category to one of your existing statuses in the task properties settings"
		);
	});

	it("puts the primary button last and gives it focus", () => {
		const { modal } = openModal(["in-progress"]);
		const rendered = buttons(modal);
		const focus = jest.spyOn(rendered[2], "focus");

		jest.runOnlyPendingTimers();

		expect(rendered.map((button) => button.textContent)).toEqual([
			"Go back",
			"Just enable",
			"Enable and go to statuses...",
		]);
		expect(rendered.map((button) => button.classList.contains("mod-cta"))).toEqual([
			false,
			false,
			true,
		]);
		expect(focus).toHaveBeenCalled();
	});
});
