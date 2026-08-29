import { DEFAULT_STATUSES, findMissingStartCategories } from "../../../src/settings/defaults";
import type { StatusConfig } from "../../../src/types";

function status(overrides: Partial<StatusConfig>): StatusConfig {
	return {
		id: "x",
		value: "x",
		label: "x",
		color: "#000000",
		isCompleted: false,
		order: 0,
		...overrides,
	};
}

describe("findMissingStartCategories", () => {
	it("returns nothing missing for the stock statuses", () => {
		expect(findMissingStartCategories(DEFAULT_STATUSES)).toEqual([]);
	});

	it("returns Started when no status carries it", () => {
		expect(
			findMissingStartCategories([
				status({ id: "a", category: "planned" }),
				status({ id: "b", category: "completed", isCompleted: true }),
			])
		).toEqual(["in-progress"]);
	});

	it("returns Not started when every status is Started or Completed", () => {
		expect(
			findMissingStartCategories([
				status({ id: "a", category: "in-progress" }),
				status({ id: "b", category: "completed", isCompleted: true }),
			])
		).toEqual(["planned"]);
	});

	it("returns both for an empty list", () => {
		expect(findMissingStartCategories([])).toEqual(["planned", "in-progress"]);
	});

	it("returns both for an undefined list", () => {
		expect(findMissingStartCategories(undefined)).toEqual(["planned", "in-progress"]);
	});

	it("counts an isCompleted-only status as Completed", () => {
		expect(
			findMissingStartCategories([
				status({ id: "a", isCompleted: true }),
				status({ id: "b", category: "in-progress" }),
			])
		).toEqual(["planned"]);
	});

	it("counts a status without a category as Not started", () => {
		expect(
			findMissingStartCategories([
				status({ id: "a" }),
				status({ id: "b", category: "in-progress" }),
			])
		).toEqual([]);
	});
});
