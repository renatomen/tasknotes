import { composeDependencyGap, parseDependencyGap } from "../../../src/utils/dependencyUtils";

describe("dependency gap compose/parse (U6)", () => {
	it("composes whole-unit ISO-8601 durations", () => {
		expect(composeDependencyGap(3, "hours")).toBe("PT3H");
		expect(composeDependencyGap(2, "days")).toBe("P2D");
		expect(composeDependencyGap(1, "weeks")).toBe("P1W");
	});

	it("omits a non-positive or non-finite value", () => {
		expect(composeDependencyGap(0, "days")).toBeUndefined();
		expect(composeDependencyGap(-1, "days")).toBeUndefined();
		expect(composeDependencyGap(Number.NaN, "days")).toBeUndefined();
		expect(composeDependencyGap(Number.POSITIVE_INFINITY, "days")).toBeUndefined();
	});

	it("omits a sub-1 value instead of composing a zero-duration no-op", () => {
		expect(composeDependencyGap(0.5, "days")).toBeUndefined();
	});

	it("omits an absurd value that would serialize in scientific notation", () => {
		expect(composeDependencyGap(1e21, "days")).toBeUndefined();
	});

	it("floors a fractional value at or above 1", () => {
		expect(composeDependencyGap(2.9, "days")).toBe("P2D");
	});

	it("round-trips the forms it composes", () => {
		expect(parseDependencyGap("PT3H")).toEqual({ value: 3, unit: "hours" });
		expect(parseDependencyGap("P2D")).toEqual({ value: 2, unit: "days" });
		expect(parseDependencyGap("P1W")).toEqual({ value: 1, unit: "weeks" });
	});

	it("returns null for an exotic, mixed, or empty gap so the UI leaves it read-only", () => {
		expect(parseDependencyGap(undefined)).toBeNull();
		expect(parseDependencyGap("")).toBeNull();
		expect(parseDependencyGap("P1DT2H")).toBeNull();
		expect(parseDependencyGap("P1M")).toBeNull();
	});
});
