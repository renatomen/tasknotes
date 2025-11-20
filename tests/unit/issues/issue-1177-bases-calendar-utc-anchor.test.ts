process.env.TZ = "America/Los_Angeles";

import { calculateAllDayEndDate } from "../../../src/bases/calendar-core";

describe("Issue #1177: Bases calendar UTC anchor correctness", () => {
	it("highlights why date-only values must stay anchored (local formatting drifts by a day)", () => {
		const dateOnly = "2025-11-16";
		const parsed = new Date(dateOnly); // legacy pattern (UTC midnight)
		const formatter = new Intl.DateTimeFormat("en-CA", {
			timeZone: "America/Los_Angeles",
			year: "numeric",
			month: "2-digit",
			day: "2-digit",
		});
		const localFormatted = formatter.format(parsed);
		expect(localFormatted).toBe("2025-11-15");
	});

	it("calculates all-day end dates without off-by-one shifts", () => {
		const result = calculateAllDayEndDate("2025-11-16", 24 * 60);
		expect(result).toBe("2025-11-17");
	});
});
