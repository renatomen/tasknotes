import { TFile, type App } from "obsidian";
import { FieldMapper } from "../../../src/services/FieldMapper";
import { DEFAULT_FIELD_MAPPING, DEFAULT_SETTINGS } from "../../../src/settings/defaults";
import {
	DependencyCache,
	EVENT_DEPENDENCY_CACHE_CHANGED,
} from "../../../src/utils/DependencyCache";

type MetadataChangedHandler = (file: TFile, data: unknown, cache: unknown) => void;

type MetadataDeletedHandler = (file: TFile, prevCache: unknown) => void;

type MockApp = App & {
	__files: Map<string, TFile>;
	__metadata: Map<string, { frontmatter: Record<string, unknown> }>;
	__metadataChangedHandlers: MetadataChangedHandler[];
	__metadataDeletedHandlers: MetadataDeletedHandler[];
};

function createMockApp(): MockApp {
	const files = new Map<string, TFile>();
	const metadata = new Map<string, { frontmatter: Record<string, unknown> }>();
	const metadataChangedHandlers: MetadataChangedHandler[] = [];
	const metadataDeletedHandlers: MetadataDeletedHandler[] = [];

	const app = {
		__files: files,
		__metadata: metadata,
		__metadataChangedHandlers: metadataChangedHandlers,
		__metadataDeletedHandlers: metadataDeletedHandlers,
		vault: {
			getMarkdownFiles: jest.fn(() => Array.from(files.values())),
			getAbstractFileByPath: jest.fn((path: string) => files.get(path) ?? null),
			on: jest.fn(() => ({})),
		},
		metadataCache: {
			getFileCache: jest.fn((file: TFile) => metadata.get(file.path) ?? null),
			getFirstLinkpathDest: jest.fn(
				(linkpath: string) => files.get(linkpath) ?? files.get(`${linkpath}.md`) ?? null
			),
			on: jest.fn((eventName: string, handler: MetadataChangedHandler | MetadataDeletedHandler) => {
				if (eventName === "changed") {
					metadataChangedHandlers.push(handler as MetadataChangedHandler);
				} else if (eventName === "deleted") {
					metadataDeletedHandlers.push(handler as MetadataDeletedHandler);
				}
				return {};
			}),
			offref: jest.fn(),
		},
	} as unknown as MockApp;

	return app;
}

function createFile(app: MockApp, path: string, frontmatter: Record<string, unknown>): TFile {
	const file = new TFile(path);
	app.__files.set(path, file);
	app.__metadata.set(path, { frontmatter });
	return file;
}

function createDependencyCache(app: MockApp): DependencyCache {
	return new DependencyCache(
		app,
		{ ...DEFAULT_SETTINGS, taskIdentificationMethod: "tag", taskTag: "task" },
		new FieldMapper(DEFAULT_FIELD_MAPPING),
		{ isCompletedStatus: jest.fn((status: string) => status === "done") } as never,
		(frontmatter) => Array.isArray((frontmatter as { tags?: unknown }).tags)
	);
}

function invokeMetadataChanged(app: MockApp, path: string): void {
	const file = app.__files.get(path);
	if (!file) {
		throw new Error(`Missing file ${path}`);
	}
	const cache = app.__metadata.get(path) ?? null;
	for (const handler of app.__metadataChangedHandlers) {
		handler(file, null, cache);
	}
}

function invokeMetadataDeleted(app: MockApp, path: string): void {
	const file = app.__files.get(path);
	if (!file) {
		throw new Error(`Missing file ${path}`);
	}
	app.__files.delete(path);
	app.__metadata.delete(path);
	for (const handler of app.__metadataDeletedHandlers) {
		handler(file, null);
	}
}

function setStatus(app: MockApp, path: string, status: string): void {
	const current = app.__metadata.get(path)?.frontmatter ?? {};
	app.__metadata.set(path, { frontmatter: { ...current, status } });
	invokeMetadataChanged(app, path);
}

function blocker(app: MockApp, status = "open"): void {
	createFile(app, "Tasks/A.md", { title: "A", status, tags: ["task"] });
}

function dependentWith(app: MockApp, reltype: string, extra: Record<string, unknown>[] = []): void {
	createFile(app, "Tasks/B.md", {
		title: "B",
		status: "open",
		tags: ["task"],
		blockedBy: [{ uid: "[[Tasks/A.md]]", reltype }, ...extra],
	});
}

describe("DependencyCache reltype-aware blocked-state (RFC 9253)", () => {
	it("STARTTOSTART does not block (AE7)", async () => {
		const app = createMockApp();
		blocker(app);
		dependentWith(app, "STARTTOSTART");
		const cache = createDependencyCache(app);
		cache.initialize();
		await cache.buildIndexes();

		expect(cache.isTaskBlocked("Tasks/B.md")).toBe(false);
		// gating reverse excludes B; display reverse still lists B (existence)
		expect(cache.getBlockedTaskPaths("Tasks/A.md")).toEqual([]);
		expect(cache.getAllBlockedTaskPaths("Tasks/A.md")).toEqual(["Tasks/B.md"]);
	});

	it("STARTTOFINISH does not block", async () => {
		const app = createMockApp();
		blocker(app);
		dependentWith(app, "STARTTOFINISH");
		const cache = createDependencyCache(app);
		cache.initialize();
		await cache.buildIndexes();
		expect(cache.isTaskBlocked("Tasks/B.md")).toBe(false);
	});

	it("FINISHTOSTART blocks while predecessor incomplete (regression)", async () => {
		const app = createMockApp();
		blocker(app);
		dependentWith(app, "FINISHTOSTART");
		const cache = createDependencyCache(app);
		cache.initialize();
		await cache.buildIndexes();
		expect(cache.isTaskBlocked("Tasks/B.md")).toBe(true);
		expect(cache.getBlockedTaskPaths("Tasks/A.md")).toEqual(["Tasks/B.md"]);
	});

	it("FINISHTOFINISH blocks until predecessor completes", async () => {
		const app = createMockApp();
		blocker(app, "open");
		dependentWith(app, "FINISHTOFINISH");
		const cache = createDependencyCache(app);
		cache.initialize();
		await cache.buildIndexes();
		expect(cache.isTaskBlocked("Tasks/B.md")).toBe(true);

		app.__metadata.set("Tasks/A.md", {
			frontmatter: { title: "A", status: "done", tags: ["task"] },
		});
		invokeMetadataChanged(app, "Tasks/A.md");
		expect(cache.isTaskBlocked("Tasks/B.md")).toBe(false);
	});

	it("parallel SS + FS edges to the same predecessor block (any-gates)", async () => {
		const app = createMockApp();
		blocker(app);
		// Two edges B -> A: STARTTOSTART and FINISHTOSTART. The FS edge must gate.
		dependentWith(app, "STARTTOSTART", [{ uid: "[[Tasks/A.md]]", reltype: "FINISHTOSTART" }]);
		const cache = createDependencyCache(app);
		cache.initialize();
		await cache.buildIndexes();
		expect(cache.isTaskBlocked("Tasks/B.md")).toBe(true);
	});

	it("completed predecessor never gates, for any reltype", async () => {
		for (const reltype of ["FINISHTOSTART", "FINISHTOFINISH", "STARTTOSTART", "STARTTOFINISH"]) {
			const app = createMockApp();
			blocker(app, "done");
			dependentWith(app, reltype);
			const cache = createDependencyCache(app);
			cache.initialize();
			await cache.buildIndexes();
			expect(cache.isTaskBlocked("Tasks/B.md")).toBe(false);
		}
	});

	it("reltype-only edit FS->SS flips blocked-state AND fires the change event", async () => {
		const app = createMockApp();
		blocker(app);
		dependentWith(app, "FINISHTOSTART");
		const cache = createDependencyCache(app);
		const changeHandler = jest.fn();
		cache.on(EVENT_DEPENDENCY_CACHE_CHANGED, changeHandler);
		cache.initialize();
		await cache.buildIndexes();
		changeHandler.mockClear();
		expect(cache.isTaskBlocked("Tasks/B.md")).toBe(true);

		// Drive the real metadata-change path (not a direct indexTaskFile call).
		app.__metadata.set("Tasks/B.md", {
			frontmatter: {
				title: "B",
				status: "open",
				tags: ["task"],
				blockedBy: [{ uid: "[[Tasks/A.md]]", reltype: "STARTTOSTART" }],
			},
		});
		invokeMetadataChanged(app, "Tasks/B.md");

		expect(cache.isTaskBlocked("Tasks/B.md")).toBe(false);
		expect(changeHandler).toHaveBeenCalled();
	});

	it("display split: SS-only predecessor is not gating-blocking but still lists its dependent", async () => {
		const app = createMockApp();
		blocker(app);
		dependentWith(app, "STARTTOSTART");
		const cache = createDependencyCache(app);
		cache.initialize();
		await cache.buildIndexes();

		expect(cache.getBlockedTaskPaths("Tasks/A.md")).toEqual([]); // gating (narrow)
		expect(cache.getAllBlockedTaskPaths("Tasks/A.md")).toEqual(["Tasks/B.md"]); // display (complete)
	});

	it("FS-only vault: display reverse matches gating reverse and clears on completion", async () => {
		const app = createMockApp();
		blocker(app);
		dependentWith(app, "FINISHTOSTART");
		const cache = createDependencyCache(app);
		cache.initialize();
		await cache.buildIndexes();

		expect(cache.getAllBlockedTaskPaths("Tasks/A.md")).toEqual(["Tasks/B.md"]);

		app.__metadata.set("Tasks/A.md", {
			frontmatter: { title: "A", status: "done", tags: ["task"] },
		});
		invokeMetadataChanged(app, "Tasks/A.md");
		// A completed -> display reverse clears too (byte-identical to legacy active reverse)
		expect(cache.getAllBlockedTaskPaths("Tasks/A.md")).toEqual([]);
	});

	it("un-completion (done->open) re-gates by reltype: SS stays unblocked, FS/FF re-block", async () => {
		// The rebuild re-add branch only runs on done->open; it must consult reltype.
		const ss = createMockApp();
		blocker(ss, "done");
		dependentWith(ss, "STARTTOSTART");
		const ssCache = createDependencyCache(ss);
		ssCache.initialize();
		await ssCache.buildIndexes();
		expect(ssCache.isTaskBlocked("Tasks/B.md")).toBe(false);
		setStatus(ss, "Tasks/A.md", "open");
		expect(ssCache.isTaskBlocked("Tasks/B.md")).toBe(false);

		for (const reltype of ["FINISHTOSTART", "FINISHTOFINISH"]) {
			const app = createMockApp();
			blocker(app, "done");
			dependentWith(app, reltype);
			const cache = createDependencyCache(app);
			cache.initialize();
			await cache.buildIndexes();
			expect(cache.isTaskBlocked("Tasks/B.md")).toBe(false);
			setStatus(app, "Tasks/A.md", "open");
			expect(cache.isTaskBlocked("Tasks/B.md")).toBe(true);
		}
	});

	it("edges to different predecessors gate independently", async () => {
		const app = createMockApp();
		createFile(app, "Tasks/A.md", { title: "A", status: "open", tags: ["task"] });
		createFile(app, "Tasks/C.md", { title: "C", status: "open", tags: ["task"] });
		createFile(app, "Tasks/B.md", {
			title: "B",
			status: "open",
			tags: ["task"],
			blockedBy: [
				{ uid: "[[Tasks/A.md]]", reltype: "STARTTOSTART" },
				{ uid: "[[Tasks/C.md]]", reltype: "FINISHTOSTART" },
			],
		});
		const cache = createDependencyCache(app);
		cache.initialize();
		await cache.buildIndexes();

		expect(cache.isTaskBlocked("Tasks/B.md")).toBe(true); // C (FS) gates
		expect(cache.getBlockedTaskPaths("Tasks/A.md")).toEqual([]); // SS never gates
		expect(cache.getBlockedTaskPaths("Tasks/C.md")).toEqual(["Tasks/B.md"]);
		expect(cache.getAllBlockedTaskPaths("Tasks/A.md")).toEqual(["Tasks/B.md"]); // display

		setStatus(app, "Tasks/C.md", "done");
		expect(cache.isTaskBlocked("Tasks/B.md")).toBe(false); // A's SS edge never gated
	});

	it("deleting a blocker clears its gate and reltype entry", async () => {
		const app = createMockApp();
		blocker(app);
		dependentWith(app, "STARTTOSTART", [{ uid: "[[Tasks/A.md]]", reltype: "FINISHTOSTART" }]);
		const cache = createDependencyCache(app);
		cache.initialize();
		await cache.buildIndexes();
		expect(cache.isTaskBlocked("Tasks/B.md")).toBe(true);

		invokeMetadataDeleted(app, "Tasks/A.md");
		expect(cache.isTaskBlocked("Tasks/B.md")).toBe(false);
		expect(cache.getAllBlockedTaskPaths("Tasks/A.md")).toEqual([]);
	});
});
