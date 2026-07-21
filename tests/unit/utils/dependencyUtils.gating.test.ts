import { anyDependencyGatesBlocked, reltypeGatesBlocked } from "../../../src/utils/dependencyUtils";

describe("reltypeGatesBlocked", () => {
	it("gates for Finish-anchored reltypes only", () => {
		expect(reltypeGatesBlocked("FINISHTOSTART")).toBe(true);
		expect(reltypeGatesBlocked("FINISHTOFINISH")).toBe(true);
		expect(reltypeGatesBlocked("STARTTOSTART")).toBe(false);
		expect(reltypeGatesBlocked("STARTTOFINISH")).toBe(false);
	});
});

describe("anyDependencyGatesBlocked (cache-absent fallback)", () => {
	it("returns false for empty/absent values", () => {
		expect(anyDependencyGatesBlocked(undefined)).toBe(false);
		expect(anyDependencyGatesBlocked(null)).toBe(false);
		expect(anyDependencyGatesBlocked([])).toBe(false);
	});

	it("treats a legacy bare-string entry as Finish-to-Start (gates)", () => {
		expect(anyDependencyGatesBlocked(["[[A]]"])).toBe(true);
		expect(anyDependencyGatesBlocked("[[A]]")).toBe(true);
	});

	it("excludes Start-anchored edges", () => {
		expect(anyDependencyGatesBlocked([{ uid: "[[A]]", reltype: "STARTTOSTART" }])).toBe(false);
		expect(anyDependencyGatesBlocked([{ uid: "[[A]]", reltype: "STARTTOFINISH" }])).toBe(false);
	});

	it("gates for Finish-anchored edges", () => {
		expect(anyDependencyGatesBlocked([{ uid: "[[A]]", reltype: "FINISHTOSTART" }])).toBe(true);
		expect(anyDependencyGatesBlocked([{ uid: "[[A]]", reltype: "FINISHTOFINISH" }])).toBe(true);
	});

	it("gates when any edge in a mixed list gates", () => {
		expect(
			anyDependencyGatesBlocked([
				{ uid: "[[A]]", reltype: "STARTTOSTART" },
				{ uid: "[[B]]", reltype: "FINISHTOSTART" },
			])
		).toBe(true);
	});

	it("does not throw on a single non-array object entry", () => {
		expect(anyDependencyGatesBlocked({ uid: "[[A]]", reltype: "STARTTOSTART" })).toBe(false);
	});
});
