import { FieldMapper } from "../../../src/core/FieldMapper";
import { DEFAULT_FIELD_MAPPING } from "../../../src/settings/defaults";
import { normalizeDependencyList, serializeDependencies } from "../../../src/utils/dependencyUtils";

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
