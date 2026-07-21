import { formatDependencyBadge, reltypeShortLabel } from "../../../src/utils/dependencyUtils";
import type { TaskDependency } from "../../../src/types";

function dep(reltype: TaskDependency["reltype"], gap?: string): TaskDependency {
	return gap ? { uid: "A", reltype, gap } : { uid: "A", reltype };
}

describe("reltypeShortLabel", () => {
	it("maps each reltype to its RFC code", () => {
		expect(reltypeShortLabel("FINISHTOSTART")).toBe("FS");
		expect(reltypeShortLabel("FINISHTOFINISH")).toBe("FF");
		expect(reltypeShortLabel("STARTTOSTART")).toBe("SS");
		expect(reltypeShortLabel("STARTTOFINISH")).toBe("SF");
	});
});

describe("formatDependencyBadge", () => {
	it("returns null for the plain default (Finish-to-Start, no gap) — no chrome", () => {
		expect(formatDependencyBadge(dep("FINISHTOSTART"))).toBeNull();
	});

	it("shows the gap for a Finish-to-Start edge that has one", () => {
		expect(formatDependencyBadge(dep("FINISHTOSTART", "P2D"))).toBe("FS · P2D");
	});

	it("shows the reltype code for non-default edges", () => {
		expect(formatDependencyBadge(dep("STARTTOSTART"))).toBe("SS");
		expect(formatDependencyBadge(dep("STARTTOFINISH"))).toBe("SF");
	});

	it("shows reltype and gap together", () => {
		expect(formatDependencyBadge(dep("FINISHTOFINISH", "P1D"))).toBe("FF · P1D");
		expect(formatDependencyBadge(dep("STARTTOSTART", "P1W"))).toBe("SS · P1W");
	});

	it("ignores a blank gap", () => {
		expect(formatDependencyBadge(dep("FINISHTOSTART", "   "))).toBeNull();
	});
});
