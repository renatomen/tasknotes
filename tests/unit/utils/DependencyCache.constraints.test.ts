import { FieldMapper } from "../../../src/services/FieldMapper";
import { StatusManager } from "../../../src/services/StatusManager";
import { DEFAULT_FIELD_MAPPING, DEFAULT_STATUSES } from "../../../src/settings/defaults";
import { DependencyCache } from "../../../src/utils/DependencyCache";
import { MockObsidian } from "../../helpers/obsidian-runtime";

type Edge = { uid: string; reltype: string; gap?: string };
type NoteSpec = { name: string; status?: string; blockedBy?: Edge[]; isTask?: boolean };

const NOT_STARTED = "open";
const STARTED = "in-progress";
const COMPLETED = "done";

const p = (name: string) => `Tasks/${name}.md`;
const edge =
	(reltype: string) =>
	(name: string): Edge => ({ uid: `[[${name}]]`, reltype });
const fs = edge("FINISHTOSTART");
const ss = edge("STARTTOSTART");
const ff = edge("FINISHTOFINISH");
const sf = edge("STARTTOFINISH");

function createVault(notes: NoteSpec[]) {
	const app = MockObsidian.createMockApp();
	const fileByName = new Map<string, unknown>();
	for (const note of notes) {
		const path = p(note.name);
		const frontmatter: Record<string, unknown> = { title: note.name };
		if (note.isTask !== false) {
			frontmatter.tags = ["task"];
		}
		if (note.status !== undefined) {
			frontmatter.status = note.status;
		}
		if (note.blockedBy) {
			frontmatter.blockedBy = note.blockedBy;
		}
		MockObsidian.createTestFile(path, `---\ntitle: ${note.name}\n---\n`);
		app.metadataCache.setCache(path, { frontmatter });
		fileByName.set(note.name, app.vault.getAbstractFileByPath(path));
	}
	app.metadataCache.getFirstLinkpathDest = jest.fn(
		(linkpath: string) => fileByName.get(linkpath) ?? null
	);

	const cache = new DependencyCache(
		app,
		{} as never,
		new FieldMapper(DEFAULT_FIELD_MAPPING),
		new StatusManager(DEFAULT_STATUSES),
		(frontmatter) => Array.isArray((frontmatter as { tags?: unknown }).tags)
	);
	return { app, cache };
}

async function buildCache(notes: NoteSpec[]): Promise<DependencyCache> {
	const { cache } = createVault(notes);
	await cache.buildIndexes();
	return cache;
}

function successorOf(
	predecessorStatus: string | undefined,
	blockedBy: Edge
): Promise<DependencyCache> {
	return buildCache([
		{ name: "pred", status: predecessorStatus },
		{ name: "dep", status: NOT_STARTED, blockedBy: [blockedBy] },
	]);
}

describe("DependencyCache per-endpoint blocking", () => {
	beforeEach(() => MockObsidian.reset());

	it("finish-to-start: start-blocks until the predecessor is completed", async () => {
		for (const status of [NOT_STARTED, STARTED]) {
			const blocked = await successorOf(status, fs("pred"));
			expect(blocked.isTaskStartBlocked(p("dep"))).toBe(true);
			expect(blocked.isTaskFinishBlocked(p("dep"))).toBe(false);
			expect(blocked.isTaskBlocked(p("dep"))).toBe(true);
		}

		const released = await successorOf(COMPLETED, fs("pred"));
		expect(released.isTaskStartBlocked(p("dep"))).toBe(false);
		expect(released.isTaskBlocked(p("dep"))).toBe(false);
	});

	it("start-to-start: start-blocks only while the predecessor is not started", async () => {
		const blocked = await successorOf(NOT_STARTED, ss("pred"));
		expect(blocked.isTaskStartBlocked(p("dep"))).toBe(true);
		expect(blocked.isTaskFinishBlocked(p("dep"))).toBe(false);

		for (const status of [STARTED, COMPLETED]) {
			const released = await successorOf(status, ss("pred"));
			expect(released.isTaskStartBlocked(p("dep"))).toBe(false);
			expect(released.isTaskBlocked(p("dep"))).toBe(false);
		}
	});

	it("finish-to-finish: finish-blocks, and does not start-block, while the predecessor is unfinished", async () => {
		for (const status of [NOT_STARTED, STARTED]) {
			const blocked = await successorOf(status, ff("pred"));
			expect(blocked.isTaskStartBlocked(p("dep"))).toBe(false);
			expect(blocked.isTaskFinishBlocked(p("dep"))).toBe(true);
			expect(blocked.isTaskBlocked(p("dep"))).toBe(true);
		}

		const released = await successorOf(COMPLETED, ff("pred"));
		expect(released.isTaskFinishBlocked(p("dep"))).toBe(false);
	});

	it("start-to-finish: finish-blocks while the predecessor has not started", async () => {
		const blocked = await successorOf(NOT_STARTED, sf("pred"));
		expect(blocked.isTaskFinishBlocked(p("dep"))).toBe(true);
		expect(blocked.isTaskStartBlocked(p("dep"))).toBe(false);

		const released = await successorOf(STARTED, sf("pred"));
		expect(released.isTaskFinishBlocked(p("dep"))).toBe(false);
	});

	it("treats a predecessor with no status as not started", async () => {
		const startToStart = await successorOf(undefined, ss("pred"));
		expect(startToStart.isTaskStartBlocked(p("dep"))).toBe(true);

		const startToFinish = await successorOf(undefined, sf("pred"));
		expect(startToFinish.isTaskFinishBlocked(p("dep"))).toBe(true);
	});

	it("computes start and finish independently for mixed edges", async () => {
		const cache = await buildCache([
			{ name: "a", status: NOT_STARTED },
			{ name: "b", status: STARTED },
			{ name: "dep", status: NOT_STARTED, blockedBy: [fs("a"), ff("b")] },
		]);
		expect(cache.isTaskStartBlocked(p("dep"))).toBe(true);
		expect(cache.isTaskFinishBlocked(p("dep"))).toBe(true);
		expect(cache.getStartBlockingPredecessorPaths(p("dep"))).toEqual([p("a")]);
		expect(cache.getFinishBlockingPredecessorPaths(p("dep"))).toEqual([p("b")]);
	});

	it("splits what a predecessor blocks by endpoint", async () => {
		const cache = await buildCache([
			{ name: "pred", status: NOT_STARTED },
			{ name: "s", status: NOT_STARTED, blockedBy: [ss("pred")] },
			{ name: "f", status: NOT_STARTED, blockedBy: [sf("pred")] },
		]);
		expect(cache.getStartBlockedDependentPaths(p("pred"))).toEqual([p("s")]);
		expect(cache.getFinishBlockedDependentPaths(p("pred"))).toEqual([p("f")]);
		expect(cache.getBlockedTaskPaths(p("pred")).sort()).toEqual([p("f"), p("s")]);
	});

	it("stops reporting a successor once its edge releases", async () => {
		const cache = await buildCache([
			{ name: "pred", status: STARTED },
			{ name: "s", status: NOT_STARTED, blockedBy: [ss("pred")] },
			{ name: "f", status: NOT_STARTED, blockedBy: [ff("pred")] },
		]);
		expect(cache.getStartBlockedDependentPaths(p("pred"))).toEqual([]);
		expect(cache.getFinishBlockedDependentPaths(p("pred"))).toEqual([p("f")]);
		expect(cache.getBlockedTaskPaths(p("pred"))).toEqual([p("f")]);
	});

	it("with only finish-to-start edges, blocks exactly the tasks with an incomplete predecessor", async () => {
		const cache = await buildCache([
			{ name: "open", status: NOT_STARTED },
			{ name: "started", status: STARTED },
			{ name: "done", status: COMPLETED },
			{ name: "d1", status: NOT_STARTED, blockedBy: [fs("open")] },
			{ name: "d2", status: NOT_STARTED, blockedBy: [fs("done")] },
			{ name: "d3", status: NOT_STARTED, blockedBy: [fs("started")] },
			{ name: "d4", status: NOT_STARTED, blockedBy: [fs("done"), fs("open")] },
		]);

		const dependents = ["d1", "d2", "d3", "d4"];
		expect(dependents.filter((name) => cache.isTaskBlocked(p(name)))).toEqual([
			"d1",
			"d3",
			"d4",
		]);
		for (const name of dependents) {
			expect(cache.isTaskStartBlocked(p(name))).toBe(cache.isTaskBlocked(p(name)));
			expect(cache.isTaskFinishBlocked(p(name))).toBe(false);
		}
		expect(cache.getBlockedTaskPaths(p("open")).sort()).toEqual([p("d1"), p("d4")]);
		expect(cache.getBlockedTaskPaths(p("started"))).toEqual([p("d3")]);
		expect(cache.getBlockedTaskPaths(p("done"))).toEqual([]);
	});

	it("releases a finish-to-start edge whose completed predecessor is not a task note", async () => {
		const cache = await buildCache([
			{ name: "note", status: COMPLETED, isTask: false },
			{ name: "dep", status: NOT_STARTED, blockedBy: [fs("note")] },
		]);
		expect(cache.isTaskBlocked(p("dep"))).toBe(false);
		expect(cache.getBlockedTaskPaths(p("note"))).toEqual([]);
	});

	it("adds no edge for a dependency on a note that does not exist", async () => {
		const cache = await buildCache([
			{ name: "dep", status: NOT_STARTED, blockedBy: [fs("missing"), sf("missing")] },
		]);
		expect(cache.getBlockingTaskPaths(p("dep"))).toEqual([]);
		expect(cache.isTaskStartBlocked(p("dep"))).toBe(false);
		expect(cache.isTaskFinishBlocked(p("dep"))).toBe(false);
	});

	it("drops the edge when the predecessor note is deleted", async () => {
		const { app, cache } = createVault([
			{ name: "pred", status: NOT_STARTED },
			{ name: "dep", status: NOT_STARTED, blockedBy: [ff("pred")] },
		]);
		cache.initialize();
		await cache.buildIndexes();
		expect(cache.isTaskFinishBlocked(p("dep"))).toBe(true);

		app.metadataCache.trigger("deleted", app.vault.getAbstractFileByPath(p("pred")), null);

		expect(cache.isTaskFinishBlocked(p("dep"))).toBe(false);
		expect(cache.getFinishBlockingPredecessorPaths(p("dep"))).toEqual([]);
	});

	it("resolves a self-reference and a cycle without traversing them", async () => {
		const cache = await buildCache([
			{ name: "self", status: NOT_STARTED, blockedBy: [fs("self")] },
			{ name: "a", status: NOT_STARTED, blockedBy: [fs("b")] },
			{ name: "b", status: NOT_STARTED, blockedBy: [ff("a")] },
		]);
		expect(cache.isTaskStartBlocked(p("self"))).toBe(true);
		expect(cache.getStartBlockedDependentPaths(p("self"))).toEqual([p("self")]);
		expect(cache.isTaskStartBlocked(p("a"))).toBe(true);
		expect(cache.isTaskFinishBlocked(p("b"))).toBe(true);
		expect(cache.getStartBlockedDependentPaths(p("b"))).toEqual([p("a")]);
		expect(cache.getFinishBlockedDependentPaths(p("a"))).toEqual([p("b")]);
	});

	it("ignores gap when deciding which endpoint an edge blocks", async () => {
		const cache = await buildCache([
			{ name: "pred", status: STARTED },
			{
				name: "dep",
				status: NOT_STARTED,
				blockedBy: [{ uid: "[[pred]]", reltype: "FINISHTOFINISH", gap: "P2D" }],
			},
		]);
		expect(cache.isTaskStartBlocked(p("dep"))).toBe(false);
		expect(cache.isTaskFinishBlocked(p("dep"))).toBe(true);
	});

	it("builds its indexes on the first per-endpoint query", () => {
		const { cache } = createVault([
			{ name: "pred", status: NOT_STARTED },
			{ name: "dep", status: NOT_STARTED, blockedBy: [fs("pred")] },
		]);
		expect(cache.getStartBlockingPredecessorPaths(p("dep"))).toEqual([p("pred")]);
		expect(cache.isTaskStartBlocked(p("dep"))).toBe(true);
	});
});
