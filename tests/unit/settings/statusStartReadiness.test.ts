import { DEFAULT_STATUSES, findMissingStartCategories } from "../../../src/settings/defaults";
import type { StatusCategory, StatusConfig } from "../../../src/types";

function status(id: string, category: StatusCategory): StatusConfig {
	return {
		id,
		value: id,
		label: id,
		color: "#000000",
		isCompleted: category === "completed",
		category,
		order: 0,
		autoArchive: false,
		autoArchiveDelay: 5,
	};
}

describe("findMissingStartCategories", () => {
	it("reports nothing missing for the stock statuses", () => {
		expect(findMissingStartCategories(DEFAULT_STATUSES)).toEqual([]);
	});

	it("reports Started when no status carries it", () => {
		expect(
			findMissingStartCategories([status("todo", "planned"), status("done", "completed")])
		).toEqual(["in-progress"]);
	});

	it("reports Not started when every status is Started or Completed", () => {
		expect(
			findMissingStartCategories([status("doing", "in-progress"), status("done", "completed")])
		).toEqual(["planned"]);
	});

	it("reports both, Not started first, when every status is Completed", () => {
		expect(findMissingStartCategories([status("done", "completed")])).toEqual([
			"planned",
			"in-progress",
		]);
	});
});
