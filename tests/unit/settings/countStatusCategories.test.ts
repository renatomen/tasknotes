import { countStatusCategories } from "../../../src/settings/defaults";
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

describe("countStatusCategories", () => {
	it("counts by normalized category (completed via isCompleted; default planned)", () => {
		const counts = countStatusCategories([
			status({ id: "a", isCompleted: false }),
			status({ id: "b", category: "planned" }),
			status({ id: "c", category: "in-progress" }),
			status({ id: "d", isCompleted: true }),
			status({ id: "e", category: "completed", isCompleted: false }),
		]);
		expect(counts).toEqual({ planned: 2, "in-progress": 1, completed: 2 });
	});

	it("returns zeros for an empty list", () => {
		expect(countStatusCategories([])).toEqual({ planned: 0, "in-progress": 0, completed: 0 });
	});
});
