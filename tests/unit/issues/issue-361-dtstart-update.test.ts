import { updateDTSTARTInRecurrenceRule } from "../../../src/utils/helpers";

describe("Issue #361: DTSTART Update for Completion-Based Recurrence", () => {
	describe("updateDTSTARTInRecurrenceRule", () => {
		it("should add DTSTART to RRULE without DTSTART", () => {
			const recurrence = "FREQ=DAILY;INTERVAL=1";
			const dateStr = "2024-01-05";

			const updated = updateDTSTARTInRecurrenceRule(recurrence, dateStr);

			expect(updated).toBe("DTSTART:20240105;FREQ=DAILY;INTERVAL=1");
		});

		it("should update existing DTSTART in RRULE", () => {
			const recurrence = "DTSTART:20240101;FREQ=DAILY;INTERVAL=1";
			const dateStr = "2024-01-05";

			const updated = updateDTSTARTInRecurrenceRule(recurrence, dateStr);

			expect(updated).toBe("DTSTART:20240105;FREQ=DAILY;INTERVAL=1");
		});

		it("should handle RRULE with time component", () => {
			const recurrence = "DTSTART:20240101T100000Z;FREQ=DAILY;INTERVAL=1";
			const dateStr = "2024-01-05T14:30:00";

			const updated = updateDTSTARTInRecurrenceRule(recurrence, dateStr);

			expect(updated).toContain("DTSTART:20240105T");
			expect(updated).toContain("FREQ=DAILY;INTERVAL=1");
		});

		it("should handle RRULE with COUNT", () => {
			const recurrence = "DTSTART:20240101;FREQ=DAILY;INTERVAL=1;COUNT=10";
			const dateStr = "2024-01-05";

			const updated = updateDTSTARTInRecurrenceRule(recurrence, dateStr);

			expect(updated).toBe("DTSTART:20240105;FREQ=DAILY;INTERVAL=1;COUNT=10");
		});

		it("should handle RRULE with UNTIL", () => {
			const recurrence = "DTSTART:20240101;FREQ=DAILY;INTERVAL=1;UNTIL=20240131";
			const dateStr = "2024-01-05";

			const updated = updateDTSTARTInRecurrenceRule(recurrence, dateStr);

			expect(updated).toBe("DTSTART:20240105;FREQ=DAILY;INTERVAL=1;UNTIL=20240131");
		});

		it("should handle weekly recurrence", () => {
			const recurrence = "DTSTART:20240101;FREQ=WEEKLY;INTERVAL=1";
			const dateStr = "2024-01-15";

			const updated = updateDTSTARTInRecurrenceRule(recurrence, dateStr);

			expect(updated).toBe("DTSTART:20240115;FREQ=WEEKLY;INTERVAL=1");
		});

		it("should handle monthly recurrence", () => {
			const recurrence = "DTSTART:20240115;FREQ=MONTHLY;INTERVAL=1";
			const dateStr = "2024-02-20";

			const updated = updateDTSTARTInRecurrenceRule(recurrence, dateStr);

			expect(updated).toBe("DTSTART:20240220;FREQ=MONTHLY;INTERVAL=1");
		});

		it("should return null for invalid recurrence", () => {
			const updated = updateDTSTARTInRecurrenceRule("", "2024-01-05");

			expect(updated).toBeNull();
		});

		it("should return null for null recurrence", () => {
			const updated = updateDTSTARTInRecurrenceRule(null as any, "2024-01-05");

			expect(updated).toBeNull();
		});
	});
});
