import { FieldMapper } from "../../../src/core/FieldMapper";
import { DEFAULT_FIELD_MAPPING } from "../../../src/settings/defaults";
import {
	composeDependencyGap,
	normalizeDependencyList,
	parseDependencyGap,
	serializeDependencies,
} from "../../../src/utils/dependencyUtils";

describe("dependency gap composing and parsing", () => {
	it("composes whole-unit ISO 8601 durations", () => {
		expect(composeDependencyGap(3, "hours")).toBe("PT3H");
		expect(composeDependencyGap(2, "days")).toBe("P2D");
		expect(composeDependencyGap(1, "weeks")).toBe("P1W");
	});

	it("composes nothing for an empty, zero or negative entry", () => {
		expect(composeDependencyGap(Number(""), "days")).toBeUndefined();
		expect(composeDependencyGap(0, "days")).toBeUndefined();
		expect(composeDependencyGap(-1, "days")).toBeUndefined();
		expect(composeDependencyGap(Number.NaN, "days")).toBeUndefined();
	});

	it("composes nothing above 100000", () => {
		expect(composeDependencyGap(100000, "days")).toBe("P100000D");
		expect(composeDependencyGap(100001, "days")).toBeUndefined();
		expect(composeDependencyGap(1e21, "days")).toBeUndefined();
		expect(composeDependencyGap(Number.POSITIVE_INFINITY, "days")).toBeUndefined();
	});

	it("floors a fractional value, composing nothing below one", () => {
		expect(composeDependencyGap(2.9, "days")).toBe("P2D");
		expect(composeDependencyGap(0.5, "days")).toBeUndefined();
	});

	it("parses the forms it composes", () => {
		expect(parseDependencyGap("PT3H")).toEqual({ value: 3, unit: "hours" });
		expect(parseDependencyGap("P2D")).toEqual({ value: 2, unit: "days" });
		expect(parseDependencyGap("P1W")).toEqual({ value: 1, unit: "weeks" });
	});

	it("returns null for a missing gap or a form it cannot compose", () => {
		expect(parseDependencyGap(undefined)).toBeNull();
		expect(parseDependencyGap("")).toBeNull();
		expect(parseDependencyGap("P1DT2H")).toBeNull();
		expect(parseDependencyGap("P1M")).toBeNull();
	});
});

describe("dependency reltype and gap frontmatter", () => {
	const writtenByEarlierRelease = [
		{ uid: "[[Design]]", reltype: "FINISHTOSTART" },
		{ uid: "[[Kickoff]]", reltype: "STARTTOSTART", gap: "P2D" },
		{ uid: "[[Review]]", reltype: "FINISHTOFINISH", gap: "PT4H" },
		{ uid: "[[Handover]]", reltype: "STARTTOFINISH", gap: "P1W" },
	];

	it("parses stored reltype and gap values into the same edges", () => {
		expect(normalizeDependencyList(writtenByEarlierRelease)).toEqual([
			{ uid: "Design", reltype: "FINISHTOSTART" },
			{ uid: "Kickoff", reltype: "STARTTOSTART", gap: "P2D" },
			{ uid: "Review", reltype: "FINISHTOFINISH", gap: "PT4H" },
			{ uid: "Handover", reltype: "STARTTOFINISH", gap: "P1W" },
		]);
	});

	it("maps the blockedBy property to those edges", () => {
		const task = new FieldMapper(DEFAULT_FIELD_MAPPING).mapFromFrontmatter(
			{ title: "Dependent", blockedBy: writtenByEarlierRelease },
			"Tasks/Dependent.md"
		);

		expect(task.blockedBy).toEqual(normalizeDependencyList(writtenByEarlierRelease));
	});

	it("writes parsed edges back unchanged", () => {
		const parsed = normalizeDependencyList(writtenByEarlierRelease) ?? [];

		expect(serializeDependencies(parsed)).toEqual(writtenByEarlierRelease);
	});

	it("reads a bare link as a finish-to-start edge without a gap", () => {
		expect(normalizeDependencyList(["[[Design]]"])).toEqual([
			{ uid: "Design", reltype: "FINISHTOSTART" },
		]);
	});
});
