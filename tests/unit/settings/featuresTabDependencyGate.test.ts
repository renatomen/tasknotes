import TaskNotesPlugin from "../../../src/main";
import { DEFAULT_SETTINGS, DEFAULT_STATUSES } from "../../../src/settings/defaults";
import { createI18nService } from "../../../src/i18n";
import { applyAdvancedDependencyTypesToggle } from "../../../src/settings/tabs/featuresTab";
import {
	DependencyReadinessConfirmationModal,
	DependencyReadinessChoice,
} from "../../../src/modals/DependencyReadinessConfirmationModal";
import { StatusConfig } from "../../../src/types";

jest.mock("../../../src/modals/DependencyReadinessConfirmationModal", () => ({
	DependencyReadinessConfirmationModal: jest.fn(),
}));

(HTMLElement.prototype as any).appendText ??= function (text: string) {
	this.appendChild(document.createTextNode(text));
};
(HTMLElement.prototype as any).setAttr ??= function (name: string, value: string) {
	this.setAttribute(name, value);
};

const ModalMock = DependencyReadinessConfirmationModal as unknown as jest.Mock;

function answers(choice: DependencyReadinessChoice): void {
	ModalMock.mockImplementation(() => ({ show: () => Promise.resolve(choice) }));
}

function rejects(error: Error): void {
	ModalMock.mockImplementation(() => ({ show: () => Promise.reject(error) }));
}

function statusesWithout(category: string): StatusConfig[] {
	return (JSON.parse(JSON.stringify(DEFAULT_STATUSES)) as StatusConfig[]).filter(
		(status) => status.category !== category
	);
}

function createHarness(customStatuses: StatusConfig[]) {
	(global as any).Platform = { isMobile: false };
	const app: any = {
		workspace: { onLayoutReady: (fn: any) => fn() },
		metadataCache: {},
		vault: { getConfig: jest.fn().mockReturnValue(false) },
	};
	const plugin = new TaskNotesPlugin(app);
	const settings = { ...DEFAULT_SETTINGS, customStatuses, enableAdvancedDependencyTypes: false };
	(plugin as any).settings = settings;
	(plugin as any).i18n = createI18nService();
	(plugin as any).registerEvent = jest.fn();
	(plugin as any).manifest = { version: "0.0.0" };
	(plugin as any).fieldMapper = {
		isPropertyForField: jest.fn(() => false),
		toUserField: jest.fn((field: any) => field),
		toInternalField: jest.fn((field: any) => field),
	};
	const navigateToTab = jest.fn().mockReturnValue(true);
	const invalidateTab = jest.fn();
	(plugin as any).settingTab = { navigateToTab, invalidateTab };

	const container = document.createElement("div");
	const save = jest.fn();

	return {
		settings,
		container,
		save,
		navigateToTab,
		toggle: (value: boolean) =>
			applyAdvancedDependencyTypesToggle(value, plugin, container, save),
	};
}

describe("Advanced dependency types toggle — readiness gate", () => {
	it("opens the modal with the missing categories when Started has no status", async () => {
		const harness = createHarness(statusesWithout("in-progress"));
		answers("go-back");

		await harness.toggle(true);

		expect(ModalMock).toHaveBeenCalledTimes(1);
		expect(ModalMock.mock.calls[0][1]).toEqual(["in-progress"]);
	});

	it("leaves the setting off when the user goes back", async () => {
		const harness = createHarness(statusesWithout("in-progress"));
		answers("go-back");

		await harness.toggle(true);

		expect(harness.settings.enableAdvancedDependencyTypes).toBe(false);
		expect(harness.container.childElementCount).toBeGreaterThan(0);
	});

	it("turns the setting on without navigating when the user just enables", async () => {
		const harness = createHarness(statusesWithout("in-progress"));
		answers("enable");

		await harness.toggle(true);

		expect(harness.settings.enableAdvancedDependencyTypes).toBe(true);
		expect(harness.save).toHaveBeenCalled();
		expect(harness.navigateToTab).not.toHaveBeenCalled();
		expect(harness.container.childElementCount).toBeGreaterThan(0);
	});

	it("turns the setting on, empties the tab and opens task properties on enable and go", async () => {
		const harness = createHarness(statusesWithout("in-progress"));
		answers("enable-and-open-statuses");

		await harness.toggle(true);

		expect(harness.settings.enableAdvancedDependencyTypes).toBe(true);
		expect(harness.container.childElementCount).toBe(0);
		expect(harness.navigateToTab).toHaveBeenCalledWith("task-properties");
	});

	it("enables without a modal when both start categories are present", async () => {
		const harness = createHarness(JSON.parse(JSON.stringify(DEFAULT_STATUSES)));

		await harness.toggle(true);

		expect(ModalMock).not.toHaveBeenCalled();
		expect(harness.settings.enableAdvancedDependencyTypes).toBe(true);
		expect(harness.navigateToTab).not.toHaveBeenCalled();
	});

	it("never opens the modal when the setting is turned off", async () => {
		const harness = createHarness(statusesWithout("in-progress"));
		harness.settings.enableAdvancedDependencyTypes = true;

		await harness.toggle(false);

		expect(ModalMock).not.toHaveBeenCalled();
		expect(harness.settings.enableAdvancedDependencyTypes).toBe(false);
	});

	it("asks again on the next enable attempt, remembering no acknowledgement", async () => {
		const harness = createHarness(statusesWithout("in-progress"));
		answers("enable");

		await harness.toggle(true);
		await harness.toggle(false);
		await harness.toggle(true);

		expect(ModalMock).toHaveBeenCalledTimes(2);
		expect(harness.settings.enableAdvancedDependencyTypes).toBe(true);
	});

	it("leaves the setting off and still resyncs the tab when the modal rejects", async () => {
		const harness = createHarness(statusesWithout("in-progress"));
		rejects(new Error("modal failed"));

		await expect(harness.toggle(true)).rejects.toThrow("modal failed");

		expect(harness.settings.enableAdvancedDependencyTypes).toBe(false);
		expect(harness.container.childElementCount).toBeGreaterThan(0);
	});

	it("re-reads the status set on each attempt, so repairing statuses changes the outcome", async () => {
		const harness = createHarness(statusesWithout("in-progress"));
		answers("go-back");

		await harness.toggle(true);
		expect(ModalMock).toHaveBeenCalledTimes(1);

		harness.settings.customStatuses = JSON.parse(
			JSON.stringify(DEFAULT_STATUSES)
		) as StatusConfig[];
		await harness.toggle(true);

		expect(ModalMock).toHaveBeenCalledTimes(1);
		expect(harness.settings.enableAdvancedDependencyTypes).toBe(true);
	});
});
