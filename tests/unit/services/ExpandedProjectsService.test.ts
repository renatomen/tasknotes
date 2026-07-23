import { ExpandedProjectsService } from "../../../src/services/ExpandedProjectsService";
import type TaskNotesPlugin from "../../../src/main";

function createService(): ExpandedProjectsService {
	return new ExpandedProjectsService({} as TaskNotesPlugin);
}

describe("ExpandedProjectsService relationship expansion state", () => {
	it("tracks blocked-by expansion independently of blocking and subtasks", () => {
		const svc = createService();
		expect(svc.isBlockedByExpanded("a.md")).toBe(false);

		svc.setBlockedByExpanded("a.md", true);
		expect(svc.isBlockedByExpanded("a.md")).toBe(true);
		expect(svc.isBlockingExpanded("a.md")).toBe(false);
		expect(svc.isExpanded("a.md")).toBe(false);

		svc.setBlockedByExpanded("a.md", false);
		expect(svc.isBlockedByExpanded("a.md")).toBe(false);
	});

	it("tracks blocking expansion independently of blocked-by", () => {
		const svc = createService();
		svc.setBlockingExpanded("b.md", true);
		expect(svc.isBlockingExpanded("b.md")).toBe(true);
		expect(svc.isBlockedByExpanded("b.md")).toBe(false);
	});

	it("preserves relationship expansion across a rename", () => {
		const svc = createService();
		svc.setBlockedByExpanded("old.md", true);
		svc.setBlockingExpanded("old.md", true);

		svc.renamePath("old.md", "new.md");

		expect(svc.isBlockedByExpanded("new.md")).toBe(true);
		expect(svc.isBlockingExpanded("new.md")).toBe(true);
		expect(svc.isBlockedByExpanded("old.md")).toBe(false);
	});

	it("clearAll resets relationship expansion", () => {
		const svc = createService();
		svc.setBlockedByExpanded("a.md", true);
		svc.setBlockingExpanded("a.md", true);

		svc.clearAll();

		expect(svc.isBlockedByExpanded("a.md")).toBe(false);
		expect(svc.isBlockingExpanded("a.md")).toBe(false);
	});
});
