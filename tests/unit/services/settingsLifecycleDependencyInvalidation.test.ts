import { jest } from "@jest/globals";
import { SettingsLifecycleService } from "../../../src/services/SettingsLifecycleService";
import { DEFAULT_SETTINGS } from "../../../src/settings/defaults";
import type { StatusCategory } from "../../../src/types";
import type { TaskNotesSettings } from "../../../src/types/settings";

function createLifecyclePlugin() {
	return {
		settings: JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) as TaskNotesSettings,
		saveSettingsDataOnly: jest.fn().mockResolvedValue(undefined as never),
		apiService: { syncWebhookSettings: jest.fn() },
		fieldMapper: {
			updateMapping: jest.fn(),
			updateUserFields: jest.fn(),
			updateConfiguredValues: jest.fn(),
		},
		statusManager: { updateStatuses: jest.fn() },
		priorityManager: { updatePriorities: jest.fn() },
		cacheManager: { updateConfig: jest.fn() },
		dependencyCache: { updateConfig: jest.fn() },
		injectCustomStyles: jest.fn(),
		statusBarService: { updateVisibility: jest.fn() },
		mdbaseSpecService: { onSettingsChanged: jest.fn() },
		filterService: { refreshFilterOptions: jest.fn() },
		notifyDataChanged: jest.fn(),
		emitter: { trigger: jest.fn(), on: jest.fn(), offref: jest.fn() },
	};
}

function createLoadedService() {
	const plugin = createLifecyclePlugin();
	const service = new SettingsLifecycleService(plugin as never);
	service.captureCurrentSettings();
	return { plugin, service };
}

function firstStatusWithCategory(settings: TaskNotesSettings, category: StatusCategory) {
	const status = settings.customStatuses.find((candidate) => candidate.category === category);
	if (!status) throw new Error(`no default status is categorized ${category}`);
	return status;
}

describe("dependency state after a settings save", () => {
	it("is rebuilt once when a status moves from Not started to Started", async () => {
		const { plugin, service } = createLoadedService();

		firstStatusWithCategory(plugin.settings, "planned").category = "in-progress";
		await service.saveSettings();
		await service.saveSettings();

		expect(plugin.dependencyCache.updateConfig).toHaveBeenCalledTimes(1);
		expect(plugin.dependencyCache.updateConfig).toHaveBeenCalledWith(plugin.settings);
	});

	it("is rebuilt once when a status changes its completed flag", async () => {
		const { plugin, service } = createLoadedService();

		firstStatusWithCategory(plugin.settings, "in-progress").isCompleted = true;
		await service.saveSettings();
		await service.saveSettings();

		expect(plugin.dependencyCache.updateConfig).toHaveBeenCalledTimes(1);
	});

	it("is rebuilt once when two statuses change category in the same save", async () => {
		const { plugin, service } = createLoadedService();

		firstStatusWithCategory(plugin.settings, "planned").category = "in-progress";
		firstStatusWithCategory(plugin.settings, "completed").category = "planned";
		await service.saveSettings();

		expect(plugin.dependencyCache.updateConfig).toHaveBeenCalledTimes(1);
	});

	it("leaves the task cache alone when only a status category changed", async () => {
		const { plugin, service } = createLoadedService();

		firstStatusWithCategory(plugin.settings, "planned").category = "in-progress";
		await service.saveSettings();

		expect(plugin.cacheManager.updateConfig).not.toHaveBeenCalled();
	});

	it("is kept when a status only changes colour", async () => {
		const { plugin, service } = createLoadedService();

		firstStatusWithCategory(plugin.settings, "planned").color = "#123456";
		await service.saveSettings();

		expect(plugin.dependencyCache.updateConfig).not.toHaveBeenCalled();
	});

	it("is kept on the first save after load when no status changed", async () => {
		const { plugin, service } = createLoadedService();

		await service.saveSettings();

		expect(plugin.dependencyCache.updateConfig).not.toHaveBeenCalled();
	});

	it("is not rebuilt again by a save that follows recategorized settings arriving from disk", async () => {
		const { plugin, service } = createLoadedService();

		firstStatusWithCategory(plugin.settings, "planned").category = "in-progress";
		await service.onCanonicalSettingsChanged();
		plugin.dependencyCache.updateConfig.mockClear();
		await service.saveSettings();

		expect(plugin.dependencyCache.updateConfig).not.toHaveBeenCalled();
	});
});
