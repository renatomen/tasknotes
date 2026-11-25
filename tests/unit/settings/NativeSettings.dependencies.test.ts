import { control, page, settingsFixture } from "../../helpers/native-settings";

describe("native dependency settings", () => {
	test("the advanced dependency types toggle sits in a Dependencies group under Properties", () => {
		const { tab } = settingsFixture();
		const properties = page(tab.getSettingDefinitions(), "Properties");
		const group = properties.items?.find(
			(item) => "heading" in item && item.heading === "Dependencies"
		);

		expect(group).toMatchObject({ type: "group" });
		expect(
			control(group && "items" in group ? (group.items ?? []) : [], "enableAdvancedDependencyTypes")
		).toMatchObject({ name: "Advanced dependency types", control: { type: "toggle" } });
		expect(tab.getControlValue("enableAdvancedDependencyTypes")).toBe(false);
	});

	test("turning the toggle on sets the opt-in and saves", async () => {
		const { plugin, tab } = settingsFixture();
		tab.getSettingDefinitions();

		await tab.setControlValue("enableAdvancedDependencyTypes", true);

		expect(plugin.settings.enableAdvancedDependencyTypes).toBe(true);
		expect(tab.getControlValue("enableAdvancedDependencyTypes")).toBe(true);
		expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
	});
});
