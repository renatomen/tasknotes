import { jest } from "@jest/globals";
import { SettingsLifecycleService } from "../../../src/services/SettingsLifecycleService";
import { DEFAULT_SETTINGS } from "../../../src/settings/defaults";
import type { TaskNotesSettings } from "../../../src/types/settings";

function cloneSettings(): TaskNotesSettings {
	return JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) as TaskNotesSettings;
}

function createLifecyclePlugin(): any {
	return {
		settings: cloneSettings(),
		saveSettingsDataOnly: jest.fn().mockResolvedValue(undefined),
		apiService: { syncWebhookSettings: jest.fn() },
		fieldMapper: {
			updateMapping: jest.fn(),
			updateUserFields: jest.fn(),
			updateConfiguredValues: jest.fn(),
		},
		statusManager: {
			updateStatuses: jest.fn(),
			isCompletedStatus: jest.fn(),
		},
		priorityManager: {
			updatePriorities: jest.fn(),
		},
		cacheManager: { updateConfig: jest.fn() },
		dependencyCache: { updateConfig: jest.fn() },
		injectCustomStyles: jest.fn(),
		statusBarService: { updateVisibility: jest.fn() },
		mdbaseSpecService: { onSettingsChanged: jest.fn() },
		filterService: { refreshFilterOptions: jest.fn() },
		notifyDataChanged: jest.fn(),
		emitter: {
			trigger: jest.fn(),
			on: jest.fn(),
			offref: jest.fn(),
		},
	};
}

function createSettledService(): {
	plugin: any;
	service: SettingsLifecycleService;
} {
	const plugin = createLifecyclePlugin();
	const service = new SettingsLifecycleService(plugin);
	service.captureCurrentSettings();
	return { plugin, service };
}

function firstStatusWithCategory(settings: TaskNotesSettings, category: string) {
	const status = settings.customStatuses.find((candidate) => candidate.category === category);
	if (!status) {
		throw new Error(`no stock status is categorized ${category}`);
	}
	return status;
}

describe("settings lifecycle dependency-cache invalidation", () => {
	afterEach(() => {
		jest.restoreAllMocks();
	});

	it("rebuilds dependency state when a status changes category", async () => {
		const { plugin, service } = createSettledService();

		firstStatusWithCategory(plugin.settings, "planned").category = "in-progress";
		await service.saveSettings();

		expect(plugin.dependencyCache.updateConfig).toHaveBeenCalledWith(plugin.settings);
	});

	it("rebuilds dependency state when a status changes its completed flag", async () => {
		const { plugin, service } = createSettledService();

		firstStatusWithCategory(plugin.settings, "in-progress").isCompleted = true;
		await service.saveSettings();

		expect(plugin.dependencyCache.updateConfig).toHaveBeenCalledWith(plugin.settings);
	});

	it("rebuilds dependency state when a status the cache classifies is removed", async () => {
		const { plugin, service } = createSettledService();

		plugin.settings.customStatuses = plugin.settings.customStatuses.filter(
			(status: { category?: string }) => status.category !== "in-progress"
		);
		await service.saveSettings();

		expect(plugin.dependencyCache.updateConfig).toHaveBeenCalledWith(plugin.settings);
	});

	it("leaves the task cache alone when only a status category changed", async () => {
		const { plugin, service } = createSettledService();

		firstStatusWithCategory(plugin.settings, "planned").category = "in-progress";
		await service.saveSettings();

		expect(plugin.cacheManager.updateConfig).not.toHaveBeenCalled();
	});

	it("does not rebuild dependency state when no classification input changed", async () => {
		const { plugin, service } = createSettledService();

		plugin.settings.showTrackedTasksInStatusBar = !plugin.settings.showTrackedTasksInStatusBar;
		await service.saveSettings();

		expect(plugin.dependencyCache.updateConfig).not.toHaveBeenCalled();
	});

	it("does not rebuild dependency state when a status changes something the cache never reads", async () => {
		const { plugin, service } = createSettledService();

		firstStatusWithCategory(plugin.settings, "planned").color = "#123456";
		await service.saveSettings();

		expect(plugin.dependencyCache.updateConfig).not.toHaveBeenCalled();
	});

	it("rebuilds dependency state once per status change rather than on every later save", async () => {
		const { plugin, service } = createSettledService();

		firstStatusWithCategory(plugin.settings, "planned").category = "in-progress";
		await service.saveSettings();
		plugin.dependencyCache.updateConfig.mockClear();

		await service.saveSettings();

		expect(plugin.dependencyCache.updateConfig).not.toHaveBeenCalled();
	});

	it("still rebuilds both caches when a cache-scoped setting changes", async () => {
		const { plugin, service } = createSettledService();

		plugin.settings.excludedFolders = "archive";
		await service.saveSettings();

		expect(plugin.cacheManager.updateConfig).toHaveBeenCalledWith(plugin.settings);
		expect(plugin.dependencyCache.updateConfig).toHaveBeenCalledWith(plugin.settings);
	});
});
