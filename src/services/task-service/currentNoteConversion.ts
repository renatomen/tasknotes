import type { TaskInfo } from "../../types";
import type { TaskCreationDefaults, TaskNotesSettings } from "../../types/settings";
import { getCurrentTimestamp } from "../../utils/dateUtils";
import { calculateDefaultDateTime } from "../../utils/helpers";
import { stringifyUnknownArray } from "../../utils/stringUtils";

type CurrentNoteConversionSettings = Pick<
	TaskNotesSettings,
	"defaultTaskStatus" | "defaultTaskPriority" | "taskCreationDefaults"
>;

export interface CurrentNoteConversionAdapters {
	calculateDefaultDateTime?: typeof calculateDefaultDateTime;
}

export interface CurrentNoteConversionInput {
	path: string;
	basename: string;
	content: string;
	frontmatter?: Record<string, unknown>;
	settings: CurrentNoteConversionSettings;
	now?: string;
	adapters?: CurrentNoteConversionAdapters;
}

export function buildCurrentNoteConversionTaskInfo({
	path,
	basename,
	content,
	frontmatter = {},
	settings,
	now = getCurrentTimestamp(),
	adapters = {},
}: CurrentNoteConversionInput): TaskInfo {
	const frontmatterScheduled = frontmatterString(frontmatter.scheduled);
	const scheduled =
		frontmatterScheduled ??
		resolveCurrentNoteDefaultScheduled(
			settings.taskCreationDefaults,
			adapters.calculateDefaultDateTime ?? calculateDefaultDateTime
		);

	return {
		path,
		title: frontmatterString(frontmatter.title) || basename,
		status: frontmatterString(frontmatter.status) ?? settings.defaultTaskStatus,
		priority: frontmatterString(frontmatter.priority) ?? settings.defaultTaskPriority,
		archived: false,
		due: frontmatterString(frontmatter.due),
		scheduled,
		contexts: frontmatterStringArray(frontmatter.contexts),
		projects: frontmatterStringArray(frontmatter.projects),
		tags: frontmatterStringArray(frontmatter.tags) ?? [],
		timeEstimate: frontmatterNumber(frontmatter.timeEstimate),
		recurrence: frontmatterString(frontmatter.recurrence),
		dateCreated: frontmatterString(frontmatter.dateCreated) || now,
		dateModified: now,
		details: extractMarkdownBodyAfterFrontmatter(content),
	};
}

function resolveCurrentNoteDefaultScheduled(
	defaults: TaskCreationDefaults,
	resolveDefaultDateTime: typeof calculateDefaultDateTime
): string | undefined {
	if (defaults.defaultScheduledDate === "none") {
		return undefined;
	}

	return (
		resolveDefaultDateTime(
			defaults.defaultScheduledDate,
			defaults.defaultScheduledTime
		) || undefined
	);
}

export function extractMarkdownBodyAfterFrontmatter(content: string): string {
	const frontmatterMatch = content.match(/^---\n[\s\S]*?\n---\n*/);
	if (frontmatterMatch) {
		return content.slice(frontmatterMatch[0].length).trim();
	}

	return content.trim();
}

function frontmatterString(value: unknown): string | undefined {
	if (value === null || value === undefined) return undefined;
	if (typeof value === "string") return value;
	if (typeof value === "number" || typeof value === "boolean") return String(value);
	return undefined;
}

function frontmatterStringArray(value: unknown): string[] | undefined {
	if (value === null || value === undefined) return undefined;
	return stringifyUnknownArray(value);
}

function frontmatterNumber(value: unknown): number | undefined {
	if (typeof value === "number") return value;
	if (typeof value === "string" && value.trim() !== "") {
		const parsed = Number(value);
		return Number.isNaN(parsed) ? undefined : parsed;
	}
	return undefined;
}
