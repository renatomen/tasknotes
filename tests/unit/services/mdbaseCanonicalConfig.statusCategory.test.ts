import { buildTaskNotesMdbaseResources } from "@tasknotes/model/mdbase";

import { DEFAULT_SETTINGS } from "../../../src/settings/defaults";
import {
	applyCanonicalTaskTypeToSettings,
	buildTaskNotesModelConfig,
	portableSettingsFingerprint,
} from "../../../src/services/mdbaseCanonicalConfig";
import type { StatusConfig } from "../../../src/types";
import type { TaskNotesSettings } from "../../../src/types/settings";

type ModelStatus = ReturnType<typeof buildTaskNotesModelConfig>["statuses"][number];

describe("status categories under the canonical task type", () => {
	it("keeps a Started status in its category", () => {
		const settings = clone(DEFAULT_SETTINGS);
		applyCanonicalStatuses(settings, (statuses) => statuses);

		expect(categories(settings)).toEqual({
			none: "planned",
			open: "planned",
			"in-progress": "in-progress",
			done: "completed",
		});
	});

	it("does not bring back a status the canonical task type removed", () => {
		const settings = clone(DEFAULT_SETTINGS);
		applyCanonicalStatuses(settings, (statuses) =>
			statuses.filter((status) => status.value !== "in-progress")
		);

		expect(categories(settings)).toEqual({
			none: "planned",
			open: "planned",
			done: "completed",
		});
	});

	it("follows the canonical completed flag when it disagrees with the captured category", () => {
		const settings = clone(DEFAULT_SETTINGS);
		applyCanonicalStatuses(settings, (statuses) =>
			statuses.map((status) =>
				status.value === "in-progress"
					? { ...status, isCompleted: true }
					: status.value === "done"
						? { ...status, isCompleted: false }
						: status
			)
		);

		expect(status(settings, "in-progress")).toMatchObject({
			isCompleted: true,
			category: "completed",
		});
		expect(status(settings, "done")).toMatchObject({ isCompleted: false, category: "planned" });
	});

	it("does not count a category change as a change to the canonical task type", () => {
		const settings = clone(DEFAULT_SETTINGS);
		const fingerprint = portableSettingsFingerprint(settings);
		settings.customStatuses[1].category = "in-progress";

		expect(portableSettingsFingerprint(settings)).toBe(fingerprint);
	});
});

// The canonical type is built without categories, as a type written by another client is.
function applyCanonicalStatuses(
	settings: TaskNotesSettings,
	edit: (statuses: ModelStatus[]) => ModelStatus[]
): void {
	const config = buildTaskNotesModelConfig(settings);
	config.statuses = edit(config.statuses.map(({ category: _category, ...rest }) => rest));
	applyCanonicalTaskTypeToSettings(
		settings,
		buildTaskNotesMdbaseResources({ modelConfig: config }).type
	);
}

function status(settings: TaskNotesSettings, value: string): StatusConfig | undefined {
	return settings.customStatuses.find((entry) => entry.value === value);
}

function categories(settings: TaskNotesSettings): Record<string, unknown> {
	return Object.fromEntries(
		settings.customStatuses.map(({ value, category }) => [value, category])
	);
}

function clone<T>(value: T): T {
	return JSON.parse(JSON.stringify(value)) as T;
}
