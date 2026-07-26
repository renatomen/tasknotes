import TaskNotesPlugin from "../../../src/main";
import { createI18nService } from "../../../src/i18n";
import { DependencyReadinessConfirmationModal } from "../../../src/modals/DependencyReadinessConfirmationModal";
import { StatusCategory } from "../../../src/types";

function createPlugin(): TaskNotesPlugin {
	return { app: {}, i18n: createI18nService() } as unknown as TaskNotesPlugin;
}

function openModal(missingCategories: StatusCategory[]) {
	const modal = new DependencyReadinessConfirmationModal(createPlugin(), missingCategories);
	const choice = modal.show();
	return { modal, choice };
}

function buttons(modal: DependencyReadinessConfirmationModal): HTMLButtonElement[] {
	return Array.from(modal.contentEl.querySelectorAll(".modal-button-container button"));
}

function bodyText(modal: DependencyReadinessConfirmationModal): string {
	return modal.contentEl.textContent ?? "";
}

describe("Dependency readiness confirmation modal", () => {
	beforeEach(() => {
		jest.useFakeTimers();
	});

	afterEach(() => {
		jest.useRealTimers();
	});

	it("resolves go-back when the first button is pressed", async () => {
		const { modal, choice } = openModal(["in-progress"]);
		buttons(modal)[0].click();
		await expect(choice).resolves.toBe("go-back");
	});

	it("resolves enable when the second button is pressed", async () => {
		const { modal, choice } = openModal(["in-progress"]);
		buttons(modal)[1].click();
		await expect(choice).resolves.toBe("enable");
	});

	it("resolves enable-and-open-statuses when the third button is pressed", async () => {
		const { modal, choice } = openModal(["in-progress"]);
		buttons(modal)[2].click();
		await expect(choice).resolves.toBe("enable-and-open-statuses");
	});

	it("resolves go-back when the modal closes without a button press", async () => {
		const { modal, choice } = openModal(["in-progress"]);
		modal.onClose();
		await expect(choice).resolves.toBe("go-back");
	});

	it("keeps the pressed outcome when the modal closes afterwards", async () => {
		const { modal, choice } = openModal(["in-progress"]);
		buttons(modal)[1].click();
		modal.onClose();
		await expect(choice).resolves.toBe("enable");
	});

	it("names Started when only Started is missing", () => {
		const { modal } = openModal(["in-progress"]);
		expect(bodyText(modal)).toContain("No status is categorized as Started.");
	});

	it("names Not started when only Not started is missing", () => {
		const { modal } = openModal(["planned"]);
		expect(bodyText(modal)).toContain("No status is categorized as Not started.");
	});

	it("names both categories when both are missing", () => {
		const { modal } = openModal(["planned", "in-progress"]);
		expect(bodyText(modal)).toContain("No status is categorized as Not started or Started.");
	});

	it("states that start-based dependencies wait for completion when no status is Started", () => {
		const { modal } = openModal(["in-progress"]);
		expect(bodyText(modal)).toContain(
			"release only when the predecessor completes, not when it starts"
		);
	});

	it("states that start-based dependencies stop gating when no status is Not started", () => {
		const { modal } = openModal(["planned"]);
		expect(bodyText(modal)).toContain(
			"release immediately instead of holding the task until the predecessor starts"
		);
	});

	it("states that start-based dependencies stop gating when both categories are missing", () => {
		const { modal } = openModal(["planned", "in-progress"]);
		expect(bodyText(modal)).toContain(
			"release immediately instead of holding the task until the predecessor starts"
		);
	});

	it("states the remedy of assigning the category in task properties", () => {
		const { modal } = openModal(["in-progress"]);
		expect(bodyText(modal)).toContain(
			"assign the missing category to one of your existing statuses in the task properties settings"
		);
	});

	it("puts the primary button last and gives it focus", () => {
		const { modal } = openModal(["in-progress"]);
		const rendered = buttons(modal);

		expect(rendered.map((button) => button.textContent)).toEqual([
			"Go back",
			"Just enable",
			"Enable and go to statuses...",
		]);
		expect(rendered[2].classList.contains("mod-cta")).toBe(true);
		expect(rendered.slice(0, 2).some((button) => button.classList.contains("mod-cta"))).toBe(
			false
		);

		const focusSpy = jest.spyOn(rendered[2], "focus");
		jest.advanceTimersByTime(50);
		expect(focusSpy).toHaveBeenCalled();
	});
});
