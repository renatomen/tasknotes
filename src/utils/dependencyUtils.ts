import { uiData } from "../i18n/dataText";
import { App, TFile, parseLinktext } from "obsidian";
import type { TaskDependency, TaskDependencyRelType } from "../types";
import { splitListPreservingLinksAndQuotes } from "./stringSplit";
import { generateLink, parseLinkToPath } from "./linkUtils";

export const DEFAULT_DEPENDENCY_RELTYPE: TaskDependencyRelType = uiData("FINISHTOSTART", "RFC 5545 dependency relationship wire identifier, also displayed verbatim as metadata");

const VALID_RELATIONSHIP_TYPES: TaskDependencyRelType[] = [
	"FINISHTOSTART",
	"FINISHTOFINISH",
	"STARTTOSTART",
	"STARTTOFINISH",
];

export function isValidDependencyRelType(value: string): value is TaskDependencyRelType {
	return VALID_RELATIONSHIP_TYPES.includes(value as TaskDependencyRelType);
}

export function reltypeConstrainsStart(reltype: TaskDependencyRelType): boolean {
	return reltype === "FINISHTOSTART" || reltype === "STARTTOSTART";
}

export function reltypeConstrainsFinish(reltype: TaskDependencyRelType): boolean {
	return reltype === "FINISHTOFINISH" || reltype === "STARTTOFINISH";
}

export function reltypeReleasedByPredecessorFinish(reltype: TaskDependencyRelType): boolean {
	return reltype === "FINISHTOSTART" || reltype === "FINISHTOFINISH";
}

export interface BlockingStateSource {
	isTaskStartBlocked(taskPath: string): boolean;
	isTaskFinishBlocked(taskPath: string): boolean;
	getBlockedTaskPaths(taskPath: string): string[];
	getStartBlockedDependentPaths(taskPath: string): string[];
	getFinishBlockedDependentPaths(taskPath: string): string[];
}

export interface DerivedBlockingState {
	startBlocked: boolean;
	finishBlocked: boolean;
	blockingTasks: string[];
	isBlockingStart: boolean;
	isBlockingFinish: boolean;
}

/**
 * Without a cache or a path there is no status to consult: every listed dependency
 * counts as unreleased and the task is reported as blocking nothing.
 */
export function deriveBlockingState(
	cache: BlockingStateSource | undefined,
	taskPath: string,
	blockedByEntries: readonly TaskDependency[]
): DerivedBlockingState {
	if (cache && taskPath) {
		return {
			startBlocked: cache.isTaskStartBlocked(taskPath),
			finishBlocked: cache.isTaskFinishBlocked(taskPath),
			blockingTasks: cache.getBlockedTaskPaths(taskPath),
			isBlockingStart: cache.getStartBlockedDependentPaths(taskPath).length > 0,
			isBlockingFinish: cache.getFinishBlockedDependentPaths(taskPath).length > 0,
		};
	}
	return {
		startBlocked: blockedByEntries.some((edge) => reltypeConstrainsStart(edge.reltype)),
		finishBlocked: blockedByEntries.some((edge) => reltypeConstrainsFinish(edge.reltype)),
		blockingTasks: [],
		isBlockingStart: false,
		isBlockingFinish: false,
	};
}

export type DependencyGapUnit = "hours" | "days" | "weeks";

export interface StructuredGap {
	value: number;
	unit: DependencyGapUnit;
}

/** ISO 8601 duration of whole units; undefined unless the floored value is within 1 to 100000. */
export function composeDependencyGap(value: number, unit: DependencyGapUnit): string | undefined {
	const whole = Math.floor(value);
	if (!Number.isFinite(value) || whole <= 0 || whole > 100000) {
		return undefined;
	}
	if (unit === "hours") {
		return `PT${whole}H`;
	}
	return unit === "weeks" ? `P${whole}W` : `P${whole}D`;
}

/** Null for a missing gap and for any form `composeDependencyGap` does not produce, such as `P1DT2H`. */
export function parseDependencyGap(gap: string | undefined): StructuredGap | null {
	if (!gap) {
		return null;
	}
	const match = /^P(?:T(\d+)H|(\d+)([DW]))$/.exec(gap.trim().toUpperCase());
	if (!match) {
		return null;
	}
	if (match[1]) {
		return { value: Number(match[1]), unit: "hours" };
	}
	return { value: Number(match[2]), unit: match[3] === "W" ? "weeks" : "days" };
}

export function extractDependencyUid(entry: unknown): string {
	if (typeof entry === "string") {
		return entry;
	}

	if (typeof entry === "object" && entry !== null) {
		const uid = (entry as Record<string, unknown>).uid;
		return typeof uid === "string" ? uid : "";
	}

	return "";
}

export function normalizeDependencyEntry(value: unknown): TaskDependency | null {
	if (typeof value === "string") {
		const trimmed = value.trim();
		if (!trimmed) return null;
		return { uid: parseLinkToPath(trimmed), reltype: DEFAULT_DEPENDENCY_RELTYPE };
	}

	if (typeof value === "object" && value !== null) {
		const raw = value as Record<string, unknown>;
		const rawUid = typeof raw.uid === "string" ? raw.uid.trim() : "";
		if (!rawUid) {
			return null;
		}
		const normalizedUid = parseLinkToPath(rawUid);
		const reltypeRaw = typeof raw.reltype === "string" ? raw.reltype.trim().toUpperCase() : "";
		const reltype = isValidDependencyRelType(reltypeRaw)
			? (reltypeRaw)
			: DEFAULT_DEPENDENCY_RELTYPE;
		const gap = typeof raw.gap === "string" && raw.gap.trim().length > 0 ? raw.gap.trim() : undefined;
		return gap ? { uid: normalizedUid, reltype, gap } : { uid: normalizedUid, reltype };
	}

	return null;
}

export function normalizeDependencyList(value: unknown): TaskDependency[] | undefined {
	if (value === null || value === undefined) {
		return undefined;
	}

	const arrayValue = Array.isArray(value) ? value : [value];
	const normalized: TaskDependency[] = [];
	for (const entry of arrayValue) {
		const normalizedEntry = normalizeDependencyEntry(entry);
		if (normalizedEntry) {
			normalized.push(normalizedEntry);
		}
	}

	return normalized.length > 0 ? normalized : undefined;
}

export function serializeDependencies(dependencies: TaskDependency[]): unknown[] {
	return dependencies.map((dependency) => {
		// Wrap uid in wikilink brackets if not already wrapped.
		// normalizeDependencyEntry() strips link formatting from uids,
		// so we must re-add it here to preserve wikilinks in frontmatter.
		const uid = dependency.uid.startsWith("[[") ? dependency.uid : `[[${dependency.uid}]]`;
		const serialized: Record<string, string> = {
			uid,
			reltype: dependency.reltype,
		};
		if (dependency.gap && dependency.gap.trim().length > 0) {
			serialized.gap = dependency.gap;
		}
		return serialized;
	});
}

export interface DependencyResolution {
	path: string;
	file: TFile;
}

export function parseDependencyInput(value: string): string[] {
	if (!value) {
		return [];
	}

	const entries: string[] = [];
	const lines = value.split(/\r?\n/);
	for (const line of lines) {
		const trimmedLine = line.trim();
		if (!trimmedLine) {
			continue;
		}

		const parts = splitListPreservingLinksAndQuotes(trimmedLine);
		for (const part of parts) {
			const token = part.trim();
			if (token.length === 0) {
				continue;
			}
			entries.push(token);
		}
	}

	const seen = new Set<string>();
	const result: string[] = [];
	for (const entry of entries) {
		if (!seen.has(entry)) {
			seen.add(entry);
			result.push(entry);
		}
	}
	return result;
}

export function resolveDependencyEntry(
	app: App,
	sourcePath: string,
	entry: TaskDependency | string
): DependencyResolution | null {
	const rawUid = extractDependencyUid(entry);
	if (!rawUid) {
		return null;
	}

	const target = parseLinkToPath(rawUid);

	if (!target) {
		return null;
	}

	// Try multiple candidate targets to tolerate .md suffix and parsed linktext variants
	const candidates = new Set<string>();
	candidates.add(target);
	if (target.endsWith(".md")) {
		candidates.add(target.replace(/\.md$/i, ""));
	}
	const parsed = parseLinktext(target);
	if (parsed.path && parsed.path !== target) {
		candidates.add(parsed.path);
	}

	for (const candidate of candidates) {
		const resolved = app.metadataCache.getFirstLinkpathDest(candidate, sourcePath);
		if (resolved instanceof TFile) {
			return { path: resolved.path, file: resolved };
		}
		const fallback = app.vault.getAbstractFileByPath(candidate);
		if (fallback instanceof TFile) {
			return { path: fallback.path, file: fallback };
		}
	}

	return null;
}

export function formatDependencyLink(app: App, sourcePath: string, targetPath: string, useMarkdownLinks?: boolean): string {
	const target = app.vault.getAbstractFileByPath(targetPath);
	if (target instanceof TFile) {
		return generateLink(app, target, sourcePath, "", "", useMarkdownLinks);
	}

	// For unresolved files, create a simple wikilink with the basename
	const basename = targetPath.split("/").pop() || targetPath;
	return `[[${basename.replace(/\.md$/i, "")}]]`;
}
