import { SettingsContext } from "../../../src/settings/native/SettingsContext";
import { propertyDefinitions } from "../../../src/settings/native/properties";
import { list, settingsFixture } from "../../helpers/native-settings";

it("updates native status workflow references and retains the next label binding", async () => {
	const { plugin } = settingsFixture();
	const [first, second] = plugin.settings.customStatuses;
	second.nextStatus = first.value;
	plugin.settings.defaultTaskStatus = first.value;
	const rebuild = jest.fn();
	const ctx = new SettingsContext(plugin, jest.fn(), rebuild);
	propertyDefinitions(ctx);
	jest.useFakeTimers();
	try {
		await ctx.write("status." + first.id + ".value", "renamed-status");
		expect(second.nextStatus).toBe("renamed-status");
		expect(plugin.settings.defaultTaskStatus).toBe("renamed-status");
		await ctx.write("status." + first.id + ".label", "Saved label");
		expect(first.label).toBe("Saved label");
		expect(rebuild).toHaveBeenCalled();
		expect(plugin.saveSettings).not.toHaveBeenCalled();
		await jest.runOnlyPendingTimersAsync();
		expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
	} finally {
		jest.useRealTimers();
	}
});

it("gives a status added in settings a category before the first save", () => {
	const { plugin, ctx } = settingsFixture();
	const savedCategories: unknown[] = [];
	(plugin.saveSettings as jest.Mock).mockImplementation(() => {
		savedCategories.push(plugin.settings.customStatuses.at(-1)?.category);
		return Promise.resolve();
	});

	list(propertyDefinitions(ctx), "Statuses").addItem!.action(document.createElement("button"));

	expect(plugin.settings.customStatuses.at(-1)).toMatchObject({
		value: "new-status",
		isCompleted: false,
		category: "planned",
	});
	expect(savedCategories).toEqual(["planned"]);
});
