import {
	buildOccurrenceFilenameVariables,
	generateOccurrenceFilename,
	FilenameContext,
} from "../../../src/utils/filenameGenerator";

const context: FilenameContext = {
	title: "Pay rent",
	priority: "normal",
	status: "open",
	date: new Date(2026, 0, 15), // creation date, distinct from occurrence date
};

describe("issue #2126 — occurrence filename variables", () => {
	it("exposes explicit granularity variables", () => {
		const vars = buildOccurrenceFilenameVariables("2026-08-01");
		expect(vars.occurrenceDate).toBe("2026-08-01");
		expect(vars.occurrenceMonth).toBe("2026-08");
		expect(vars.occurrenceYear).toBe("2026");
		expect(vars.occurrenceMonthName).toBe("August");
		expect(vars.occurrenceWeek).toBe("2026-W31");
	});

	it("occurrencePeriod picks granularity from rrule FREQ", () => {
		expect(
			buildOccurrenceFilenameVariables("2026-08-01", "FREQ=MONTHLY;INTERVAL=1").occurrencePeriod
		).toBe("2026-08");
		expect(
			buildOccurrenceFilenameVariables("2026-08-01", "FREQ=WEEKLY;BYDAY=MO").occurrencePeriod
		).toBe("2026-W31");
		expect(
			buildOccurrenceFilenameVariables("2026-08-01", "FREQ=DAILY").occurrencePeriod
		).toBe("2026-08-01");
		expect(
			buildOccurrenceFilenameVariables("2026-08-01", "FREQ=YEARLY").occurrencePeriod
		).toBe("2026");
	});

	it("occurrencePeriod falls back to full date without a clear FREQ", () => {
		expect(buildOccurrenceFilenameVariables("2026-08-01").occurrencePeriod).toBe("2026-08-01");
		expect(
			buildOccurrenceFilenameVariables("2026-08-01", "every other tuesday").occurrencePeriod
		).toBe("2026-08-01");
	});

	it("occurrencePeriod understands legacy recurrence objects", () => {
		expect(
			buildOccurrenceFilenameVariables("2026-08-01", { frequency: "monthly" }).occurrencePeriod
		).toBe("2026-08");
	});

	it("generateOccurrenceFilename renders the default template", () => {
		const name = generateOccurrenceFilename(
			context,
			"{{title}} — {{occurrencePeriod}}",
			"2026-08-01",
			"FREQ=MONTHLY"
		);
		expect(name).toBe("Pay rent — 2026-08");
	});

	it("supports regular filename variables alongside occurrence ones", () => {
		const name = generateOccurrenceFilename(
			context,
			"{{titleKebab}}-{{occurrenceMonth}}",
			"2026-08-01",
			"FREQ=MONTHLY"
		);
		expect(name).toBe("pay-rent-2026-08");
	});

	it("falls back to sanitized title when the template resolves empty", () => {
		const name = generateOccurrenceFilename(context, "{{nonexistent}}", "2026-08-01");
		expect(name).toBe("Pay rent");
	});

	it("falls back to sanitized title on invalid occurrence date", () => {
		const name = generateOccurrenceFilename(
			context,
			"{{title}} — {{occurrencePeriod}}",
			"not-a-date"
		);
		expect(name).toBe("Pay rent");
	});
});
