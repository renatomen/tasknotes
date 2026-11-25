import { TFile } from "obsidian";
import { serialize, deserialize } from "node:v8";
import { FieldMapper } from "../../../src/core/FieldMapper";
import { DEFAULT_FIELD_MAPPING } from "../../../src/settings/defaults";
import { computeBlockedByUpdate } from "../../../src/services/task-service/taskBlockingRelationships";
import { readCompletionContent } from "../../../src/services/task-service/recurringCompletionUndo";
import type { TaskInfo } from "../../../src/types";
import { captureTaskUndo } from "../../../src/ui/taskMutationUndo";
import { serializeDependencies } from "../../../src/utils/dependencyUtils";

beforeAll(() => {
	globalThis.structuredClone = (value) => deserialize(serialize(value));
});

it("restores a blocked task's rewritten reltype and gap through the captured undo", async () => {
	const file = new TFile("Tasks/Publish.md");
	const original =
		'---\ntitle: Publish\nblockedBy:\n  - uid: "[[Write report]]"\n    reltype: FINISHTOSTART\n    gap: P2D\n---\nBody\n';
	let content = original;
	const fieldMapper = new FieldMapper(DEFAULT_FIELD_MAPPING);
	const read = (): TaskInfo =>
		({
			...fieldMapper.mapFromFrontmatter(readCompletionContent(content).frontmatter, file.path, false),
			path: file.path,
		}) as TaskInfo;
	let cached = read();
	const app = {
		vault: {
			getAbstractFileByPath: () => file,
			read: async () => content,
			process: async (_file: TFile, update: (text: string) => string) => {
				content = update(content);
				return content;
			},
		},
	};
	const plugin = {
		app,
		settings: { storeTitleInFilename: false },
		fieldMapper,
		cacheManager: {
			getTaskInfo: async () => cached,
			updateTaskInfoInCache: (_path: string, task: TaskInfo) => {
				cached = task;
			},
		},
		emitter: { trigger: jest.fn() },
		taskService: { applyPropertyChangeSideEffects: jest.fn() },
	};

	const receipt = await captureTaskUndo(plugin as never, cached, async () => {
		const blockedBy = computeBlockedByUpdate({
			blockedTask: cached,
			blockingTaskPath: "Tasks/Write report.md",
			action: "modify",
			rawEntry: { uid: "[[Publish]]", reltype: "STARTTOFINISH" },
			resolveDependencyPath: () => "Tasks/Write report.md",
			formatDependencyLink: () => "",
		});
		const written = serializeDependencies(blockedBy ?? []) as Array<Record<string, string>>;
		content = `---\ntitle: Publish\nblockedBy:\n${written
			.map((entry) => `  - uid: "${entry.uid}"\n    reltype: ${entry.reltype}\n`)
			.join("")}---\nBody\n`;
		cached = { ...cached, blockedBy: blockedBy ?? undefined };
		return cached;
	});

	expect(readCompletionContent(content).frontmatter.blockedBy).toEqual([
		{ uid: "[[Write report]]", reltype: "STARTTOFINISH" },
	]);
	expect(receipt.undo).toBeDefined();
	await receipt.undo?.();

	expect(readCompletionContent(content).frontmatter.blockedBy).toEqual([
		{ uid: "[[Write report]]", reltype: "FINISHTOSTART", gap: "P2D" },
	]);
	expect(cached.blockedBy).toEqual([{ uid: "Write report", reltype: "FINISHTOSTART", gap: "P2D" }]);
});
