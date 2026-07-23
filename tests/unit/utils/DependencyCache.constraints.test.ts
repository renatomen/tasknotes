import { FieldMapper } from "../../../src/services/FieldMapper";
import { DEFAULT_FIELD_MAPPING } from "../../../src/settings/defaults";
import { DependencyCache } from "../../../src/utils/DependencyCache";
import { MockObsidian } from "../../helpers/obsidian-runtime";

// Mock lifecycle mirroring StatusManager: "done" is finished (=> started), "in-progress" is
// started but not finished, "open" is neither — without pulling in the settings stack.
type Edge = { uid: string; reltype: string };
type TaskSpec = { name: string; status: string; blockedBy?: Edge[] };

const p = (name: string) => `Tasks/${name}.md`;
const edge = (reltype: string) => (name: string): Edge => ({ uid: `[[${name}]]`, reltype });
const fs = edge("FINISHTOSTART");
const ss = edge("STARTTOSTART");
const ff = edge("FINISHTOFINISH");
const sf = edge("STARTTOFINISH");

async function buildCache(tasks: TaskSpec[]): Promise<DependencyCache> {
	const app = MockObsidian.createMockApp();
	const fileByName = new Map<string, unknown>();
	for (const task of tasks) {
		const path = p(task.name);
		const frontmatter: Record<string, unknown> = {
			title: task.name,
			status: task.status,
			tags: ["task"],
		};
		if (task.blockedBy) {
			frontmatter.blockedBy = task.blockedBy;
		}
		MockObsidian.createTestFile(path, `---\ntitle: ${task.name}\n---\n`);
		app.metadataCache.setCache(path, { frontmatter });
		fileByName.set(task.name, app.vault.getAbstractFileByPath(path));
	}
	app.metadataCache.getFirstLinkpathDest = jest.fn(
		(linkpath: string) => fileByName.get(linkpath) ?? null
	);

	const cache = new DependencyCache(
		app,
		{} as never,
		new FieldMapper(DEFAULT_FIELD_MAPPING),
		{
			isCompletedStatus: jest.fn((status: string) => status === "done"),
			isStarted: jest.fn((status: string) => status === "done" || status === "in-progress"),
		} as never,
		(frontmatter) => Array.isArray((frontmatter as { tags?: unknown }).tags)
	);
	await cache.buildIndexes();
	return cache;
}

describe("DependencyCache per-endpoint constraints (U3)", () => {
	beforeEach(() => MockObsidian.reset());

	it("FINISHTOSTART: unfinished predecessor start-blocks; completion releases", async () => {
		const blocked = await buildCache([
			{ name: "pred", status: "open" },
			{ name: "dep", status: "open", blockedBy: [fs("pred")] },
		]);
		expect(blocked.isTaskStartBlocked(p("dep"))).toBe(true);
		expect(blocked.isTaskFinishBlocked(p("dep"))).toBe(false);
		expect(blocked.isTaskBlocked(p("dep"))).toBe(true);

		const released = await buildCache([
			{ name: "pred", status: "done" },
			{ name: "dep", status: "open", blockedBy: [fs("pred")] },
		]);
		expect(released.isTaskStartBlocked(p("dep"))).toBe(false);
		expect(released.isTaskBlocked(p("dep"))).toBe(false);
	});

	it("STARTTOSTART: unstarted predecessor start-blocks; started or completed releases", async () => {
		const blocked = await buildCache([
			{ name: "pred", status: "open" },
			{ name: "dep", status: "open", blockedBy: [ss("pred")] },
		]);
		expect(blocked.isTaskStartBlocked(p("dep"))).toBe(true);

		const started = await buildCache([
			{ name: "pred", status: "in-progress" },
			{ name: "dep", status: "open", blockedBy: [ss("pred")] },
		]);
		expect(started.isTaskStartBlocked(p("dep"))).toBe(false);

		const completed = await buildCache([
			{ name: "pred", status: "done" },
			{ name: "dep", status: "open", blockedBy: [ss("pred")] },
		]);
		expect(completed.isTaskStartBlocked(p("dep"))).toBe(false);
	});

	it("FINISHTOFINISH: unfinished predecessor finish-blocks, not start-blocks", async () => {
		const blocked = await buildCache([
			{ name: "pred", status: "in-progress" },
			{ name: "dep", status: "open", blockedBy: [ff("pred")] },
		]);
		expect(blocked.isTaskStartBlocked(p("dep"))).toBe(false);
		expect(blocked.isTaskFinishBlocked(p("dep"))).toBe(true);
		expect(blocked.isTaskBlocked(p("dep"))).toBe(true);

		const released = await buildCache([
			{ name: "pred", status: "done" },
			{ name: "dep", status: "open", blockedBy: [ff("pred")] },
		]);
		expect(released.isTaskFinishBlocked(p("dep"))).toBe(false);
	});

	it("STARTTOFINISH: unstarted predecessor finish-blocks; started releases", async () => {
		const blocked = await buildCache([
			{ name: "pred", status: "open" },
			{ name: "dep", status: "open", blockedBy: [sf("pred")] },
		]);
		expect(blocked.isTaskFinishBlocked(p("dep"))).toBe(true);
		expect(blocked.isTaskStartBlocked(p("dep"))).toBe(false);

		const released = await buildCache([
			{ name: "pred", status: "in-progress" },
			{ name: "dep", status: "open", blockedBy: [sf("pred")] },
		]);
		expect(released.isTaskFinishBlocked(p("dep"))).toBe(false);
	});

	it("computes start and finish independently for mixed edges", async () => {
		const cache = await buildCache([
			{ name: "a", status: "open" },
			{ name: "b", status: "in-progress" },
			{ name: "dep", status: "open", blockedBy: [fs("a"), ff("b")] },
		]);
		expect(cache.isTaskStartBlocked(p("dep"))).toBe(true);
		expect(cache.isTaskFinishBlocked(p("dep"))).toBe(true);
	});

	it("reverse accessors split what a predecessor blocks by endpoint", async () => {
		const cache = await buildCache([
			{ name: "pred", status: "open" },
			{ name: "s", status: "open", blockedBy: [ss("pred")] },
			{ name: "f", status: "open", blockedBy: [sf("pred")] },
		]);
		expect(cache.getStartBlockedDependentPaths(p("pred"))).toEqual([p("s")]);
		expect(cache.getFinishBlockedDependentPaths(p("pred"))).toEqual([p("f")]);
	});

	it("reverse accessors drop a successor once its edge releases", async () => {
		// pred started (not completed): the SS edge releases the successor's start, but the FF
		// edge still gates the other successor's finish (that one needs completion).
		const cache = await buildCache([
			{ name: "pred", status: "in-progress" },
			{ name: "s", status: "open", blockedBy: [ss("pred")] },
			{ name: "f", status: "open", blockedBy: [ff("pred")] },
		]);
		expect(cache.getStartBlockedDependentPaths(p("pred"))).toEqual([]);
		expect(cache.getFinishBlockedDependentPaths(p("pred"))).toEqual([p("f")]);
	});

	it("FS-only vault: isTaskBlocked matches the today's-blocked set (regression parity)", async () => {
		const cache = await buildCache([
			{ name: "p1", status: "open" },
			{ name: "p2", status: "done" },
			{ name: "d1", status: "open", blockedBy: [fs("p1")] },
			{ name: "d2", status: "open", blockedBy: [fs("p2")] },
		]);
		expect(cache.isTaskBlocked(p("d1"))).toBe(true);
		expect(cache.isTaskStartBlocked(p("d1"))).toBe(true);
		expect(cache.isTaskBlocked(p("d2"))).toBe(false);
	});
});
