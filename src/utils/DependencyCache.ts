/* eslint-disable @typescript-eslint/no-non-null-assertion -- Dependency graph traversal guards resolved task nodes before dereferencing. */
import { TFile, App, Events, EventRef } from "obsidian";
import { FieldMapper } from "../core/FieldMapper";
import {
	normalizeDependencyList,
	resolveDependencyEntry,
	reltypeConstrainsStart,
	reltypeReleasedByPredecessorFinish,
} from "./dependencyUtils";
import type { TaskDependencyRelType } from "../types";
import { TaskNotesSettings } from "../types/settings";
import { isPathInExcludedFolder, parseExcludedFolders } from "./pathExclusions";
import { createTaskNotesLogger } from "./tasknotesLogger";

const tasknotesLogger = createTaskNotesLogger({ tag: "Utils/DependencyCache" });

export const EVENT_DEPENDENCY_CACHE_CHANGED = "dependency-cache-changed";

interface DependencyStatusClassifier {
	isCompletedStatus(statusValue: string): boolean;
	isStarted(statusValue: string): boolean;
}

/**
 * Minimal cache for task dependencies and project references.
 * These require relationship tracking that can't be efficiently computed on-demand.
 *
 * Design Philosophy:
 * - Focused: Only tracks dependencies and project references
 * - Event-driven: Updates when files change
 * - Simple: No complex querying, just relationship lookups
 */
export class DependencyCache extends Events {
	private app: App;
	private settings: TaskNotesSettings;
	private excludedFolders: string[];
	private fieldMapper?: FieldMapper;
	private statusManager: DependencyStatusClassifier;

	// Dependency indexes
	private dependencySources: Map<string, Set<string>> = new Map(); // task path -> blocking task paths
	private dependencyTargets: Map<string, Set<string>> = new Map(); // task path -> tasks blocked by this task
	private edgeReltypes: Map<string, Map<string, TaskDependencyRelType>> = new Map(); // successor path -> (predecessor path -> reltype)

	// Project references index
	private projectReferences: Map<string, Set<string>> = new Map(); // project path -> Set<task paths that reference it>
	private projectReferenceSources: Map<string, Set<string>> = new Map(); // task path -> Set<project paths it references>
	private relationshipFingerprints: Map<string, string> = new Map(); // task path -> normalized dependency/project fields
	private completedStatusByPath: Map<string, boolean> = new Map(); // file path -> "finished" (isCompleted) per path
	private startedStatusByPath: Map<string, boolean> = new Map(); // file path -> "started" (category in-progress/completed) per path

	// Initialization state
	private initialized = false;
	private indexesBuilt = false;

	// Event listeners for cleanup
	private eventListeners: EventRef[] = [];

	// Callback to check if a file is a task
	private isTaskFileCallback: (frontmatter: unknown) => boolean;

	constructor(
		app: App,
		settings: TaskNotesSettings,
		fieldMapper: FieldMapper | undefined,
		statusManager: DependencyStatusClassifier,
		isTaskFileCallback: (frontmatter: unknown) => boolean
	) {
		super();
		this.app = app;
		this.settings = settings;
		this.excludedFolders = parseExcludedFolders(settings.excludedFolders);
		this.fieldMapper = fieldMapper;
		this.statusManager = statusManager;
		this.isTaskFileCallback = isTaskFileCallback;
	}

	/**
	 * Initialize by setting up event listeners
	 */
	initialize(): void {
		if (this.initialized) {
			return;
		}

		this.setupEventListeners();
		this.initialized = true;
	}

	/**
	 * Build indexes on demand (lazy)
	 */
	async buildIndexes(): Promise<void> {
		if (this.indexesBuilt) return;

		const files = this.app.vault.getMarkdownFiles();

		for (const file of files) {
			if (!this.isValidFile(file.path)) {
				continue;
			}

			const metadata = this.app.metadataCache.getFileCache(file);
			if (!metadata?.frontmatter || !this.isTaskFileCallback(metadata.frontmatter)) {
				continue;
			}

			this.indexTaskFile(file.path, metadata.frontmatter);
		}

		this.indexesBuilt = true;
		this.trigger(EVENT_DEPENDENCY_CACHE_CHANGED);
	}

	/**
	 * Setup event listeners
	 */
	private setupEventListeners(): void {
		// Listen for metadata changes
		const changedRef = this.app.metadataCache.on("changed", (file, data, cache) => {
			if (file instanceof TFile && file.extension === "md") {
				this.handleFileChanged(file, cache);
			}
		});
		this.eventListeners.push(changedRef);

		// Listen for file deletion
		const deletedRef = this.app.metadataCache.on("deleted", (file, prevCache) => {
			if (file instanceof TFile && file.extension === "md") {
				this.handleFileDeleted(file.path);
			}
		});
		this.eventListeners.push(deletedRef);

		// Listen for file rename
		const renameRef = this.app.vault.on("rename", (file, oldPath) => {
			if (file instanceof TFile && file.extension === "md") {
				this.handleFileRenamed(file, oldPath);
			}
		});
		this.eventListeners.push(renameRef);
	}

	/**
	 * Handle file changes
	 */
	private handleFileChanged(file: TFile, cache: unknown): void {
		const before = this.getFileRelationshipSignature(file.path);

		if (!this.isValidFile(file.path)) {
			this.clearFileFromIndexes(file.path);
			this.triggerIfFileRelationshipsChanged(file.path, before);
			return;
		}

		const frontmatter = this.getFrontmatterFromCache(cache) ?? this.getFrontmatterForFile(file);
		this.updateLifecycleState(file.path, frontmatter);

		if (!frontmatter) {
			if (this.hasForwardRelationships(file.path)) {
				this.clearForwardDependencies(file.path);
			}
			this.triggerIfFileRelationshipsChanged(file.path, before);
			return;
		}

		if (!this.isTaskFileCallback(frontmatter)) {
			if (this.hasForwardRelationships(file.path)) {
				this.clearForwardDependencies(file.path);
			}
			this.triggerIfFileRelationshipsChanged(file.path, before);
			return;
		}

		const nextFingerprint = this.buildRelationshipFingerprint(frontmatter);
		if (this.relationshipFingerprints.get(file.path) === nextFingerprint) {
			this.triggerIfFileRelationshipsChanged(file.path, before);
			return;
		}

		// Re-index this task
		// Only clear the forward dependencies (tasks this task depends on)
		// Keep reverse dependencies intact - they'll be updated when other tasks change
		this.clearForwardDependencies(file.path);
		this.indexTaskFile(file.path, frontmatter);
		this.triggerIfFileRelationshipsChanged(file.path, before);
	}

	private triggerIfFileRelationshipsChanged(path: string, before: string): void {
		if (this.getFileRelationshipSignature(path) !== before) {
			this.trigger(EVENT_DEPENDENCY_CACHE_CHANGED);
		}
	}

	private getFileRelationshipSignature(path: string): string {
		const blockingTasks = this.sortedSetValues(this.dependencySources.get(path));
		const { start, finish } = this.computeBlockedDependents(path);
		const referencedProjects = this.sortedSetValues(this.projectReferenceSources.get(path));
		const projectTasks = this.sortedSetValues(this.projectReferences.get(path));

		return JSON.stringify({
			blockedStart: this.sortedSetValues(start),
			blockedFinish: this.sortedSetValues(finish),
			blockingTasks,
			projectTasks,
			referencedProjects,
		});
	}

	private sortedSetValues(values: Set<string> | undefined): string[] {
		return values ? Array.from(values).sort() : [];
	}

	/**
	 * Handle file deletion
	 */
	private handleFileDeleted(path: string): void {
		this.clearFileFromIndexes(path);
		this.trigger(EVENT_DEPENDENCY_CACHE_CHANGED);
	}

	/**
	 * Handle file rename
	 */
	private handleFileRenamed(file: TFile, oldPath: string): void {
		// Get metadata for new path
		const frontmatter = this.getFrontmatterForFile(file);

		// Clear old path
		this.clearFileFromIndexes(oldPath);

		// Index new path if it's a task
		if (this.isValidFile(file.path) && frontmatter && this.isTaskFileCallback(frontmatter)) {
			this.indexTaskFile(file.path, frontmatter);
		}
		this.trigger(EVENT_DEPENDENCY_CACHE_CHANGED);
	}

	private getFrontmatterForFile(file: TFile): Record<string, unknown> | null {
		const metadata = this.app.metadataCache.getFileCache(file);
		return this.getFrontmatterFromCache(metadata);
	}

	private getFrontmatterFromCache(cache: unknown): Record<string, unknown> | null {
		if (!cache || typeof cache !== "object" || !("frontmatter" in cache)) {
			return null;
		}

		const frontmatter = (cache as { frontmatter?: unknown }).frontmatter;
		if (!frontmatter || typeof frontmatter !== "object" || Array.isArray(frontmatter)) {
			return null;
		}

		return frontmatter as Record<string, unknown>;
	}

	/**
	 * Resolve a project reference string to a file path
	 */
	private resolveProjectReference(sourcePath: string, projectRef: string): string | null {
		if (!projectRef || typeof projectRef !== "string") {
			return null;
		}

		const trimmed = projectRef.trim();
		if (!trimmed) {
			return null;
		}

		// Use resolveDependencyEntry to handle wikilinks, markdown links, and plain text
		const resolved = resolveDependencyEntry(this.app, sourcePath, trimmed);
		return resolved?.path || null;
	}

	/**
	 * Index a task file's dependencies and project references
	 */
	private indexTaskFile(path: string, frontmatter: Record<string, unknown>): void {
		if (!this.isValidFile(path)) {
			return;
		}

		this.relationshipFingerprints.set(path, this.buildRelationshipFingerprint(frontmatter));
		this.completedStatusByPath.set(path, this.isCompletedFrontmatter(frontmatter));
		this.startedStatusByPath.set(path, this.isStartedFrontmatter(frontmatter));

		const dependenciesField = this.fieldMapper?.toUserField("blockedBy") || "blockedBy";
		const projectField = this.fieldMapper?.toUserField("projects") || "project";

		// Index dependencies
		const dependencies = frontmatter[dependenciesField];
		if (dependencies) {
			const normalized = normalizeDependencyList(dependencies);
			if (normalized) {
				const blockingTasks = new Set<string>();

				for (const dep of normalized) {
					const resolved = resolveDependencyEntry(this.app, path, dep);
					if (resolved?.path && this.isValidFile(resolved.path)) {
						this.addDependencyLink(path, resolved.path, dep.reltype, blockingTasks);
					}
				}

				if (blockingTasks.size > 0) {
					this.dependencySources.set(path, blockingTasks);
				}
			}
		}

		// Index project references
		const project = frontmatter[projectField];
		if (project) {
			const projects = Array.isArray(project) ? project : [project];

			for (const proj of projects) {
				if (typeof proj === "string") {
					// Resolve the project reference to a full file path
					const resolvedPath = this.resolveProjectReference(path, proj);
					if (resolvedPath && this.isValidFile(resolvedPath)) {
						if (!this.projectReferences.has(resolvedPath)) {
							this.projectReferences.set(resolvedPath, new Set());
						}
						this.projectReferences.get(resolvedPath)!.add(path);

						if (!this.projectReferenceSources.has(path)) {
							this.projectReferenceSources.set(path, new Set());
						}
						this.projectReferenceSources.get(path)!.add(resolvedPath);
					}
				}
			}
		}
	}

	private addDependencyLink(
		dependentPath: string,
		blockingPath: string,
		reltype: TaskDependencyRelType,
		blockingTasks: Set<string>
	): void {
		blockingTasks.add(blockingPath);

		if (!this.dependencyTargets.has(blockingPath)) {
			this.dependencyTargets.set(blockingPath, new Set());
		}
		this.dependencyTargets.get(blockingPath)!.add(dependentPath);

		let edges = this.edgeReltypes.get(dependentPath);
		if (!edges) {
			edges = new Map();
			this.edgeReltypes.set(dependentPath, edges);
		}
		edges.set(blockingPath, reltype);
	}

	// An edge releases when its predecessor reaches the edge's predecessor endpoint:
	// FINISH* on the predecessor's completion, START* once the predecessor is started.
	private isEdgeReleased(predecessorPath: string, reltype: TaskDependencyRelType): boolean {
		return reltypeReleasedByPredecessorFinish(reltype)
			? (this.completedStatusByPath.get(predecessorPath) ?? false)
			: (this.startedStatusByPath.get(predecessorPath) ?? false);
	}

	private computeBlockedState(taskPath: string): {
		startBlocked: boolean;
		finishBlocked: boolean;
	} {
		let startBlocked = false;
		let finishBlocked = false;
		const edges = this.edgeReltypes.get(taskPath);
		if (edges) {
			for (const [predecessorPath, reltype] of edges) {
				if (this.isEdgeReleased(predecessorPath, reltype)) {
					continue;
				}
				if (reltypeConstrainsStart(reltype)) {
					startBlocked = true;
				} else {
					finishBlocked = true;
				}
			}
		}
		return { startBlocked, finishBlocked };
	}

	// Reverse view: the successors this task currently blocks, split by the endpoint it gates.
	private computeBlockedDependents(predecessorPath: string): {
		start: Set<string>;
		finish: Set<string>;
	} {
		const start = new Set<string>();
		const finish = new Set<string>();
		const successors = this.dependencyTargets.get(predecessorPath);
		if (successors) {
			for (const successorPath of successors) {
				const reltype = this.edgeReltypes.get(successorPath)?.get(predecessorPath);
				if (!reltype || this.isEdgeReleased(predecessorPath, reltype)) {
					continue;
				}
				if (reltypeConstrainsStart(reltype)) {
					start.add(successorPath);
				} else {
					finish.add(successorPath);
				}
			}
		}
		return { start, finish };
	}

	private buildRelationshipFingerprint(frontmatter: Record<string, unknown>): string {
		const dependenciesField = this.fieldMapper?.toUserField("blockedBy") || "blockedBy";
		const projectField = this.fieldMapper?.toUserField("projects") || "project";

		const dependencies = (normalizeDependencyList(frontmatter[dependenciesField]) ?? [])
			.filter((dependency) => dependency.uid.length > 0)
			.map((dependency) => `${dependency.uid}|${dependency.reltype}|${dependency.gap ?? ""}`)
			.sort();
		const projects = this.normalizeProjectFingerprintValues(frontmatter[projectField]);

		return JSON.stringify({ dependencies, projects });
	}

	private normalizeProjectFingerprintValues(value: unknown): string[] {
		const projects = Array.isArray(value) ? value : value ? [value] : [];
		const normalized = new Set<string>();

		for (const project of projects) {
			if (typeof project !== "string") {
				continue;
			}

			const trimmed = project.trim();
			if (trimmed) {
				normalized.add(trimmed);
			}
		}

		return Array.from(normalized).sort();
	}

	private hasForwardRelationships(path: string): boolean {
		return (
			this.relationshipFingerprints.has(path) ||
			this.dependencySources.has(path) ||
			this.projectReferenceSources.has(path)
		);
	}

	private updateLifecycleState(path: string, frontmatter: Record<string, unknown> | null): void {
		this.completedStatusByPath.set(
			path,
			frontmatter ? this.isCompletedFrontmatter(frontmatter) : false
		);
		this.startedStatusByPath.set(
			path,
			frontmatter ? this.isStartedFrontmatter(frontmatter) : false
		);
	}

	private isCompletedFrontmatter(frontmatter: Record<string, unknown>): boolean {
		const statusText = this.readStatusText(frontmatter);
		return Boolean(statusText && this.statusManager.isCompletedStatus(statusText));
	}

	private isStartedFrontmatter(frontmatter: Record<string, unknown>): boolean {
		const statusText = this.readStatusText(frontmatter);
		return Boolean(statusText && this.statusManager.isStarted(statusText));
	}

	private readStatusText(frontmatter: Record<string, unknown>): string | null {
		const statusField = this.fieldMapper?.toUserField("status") || "status";
		return this.stringifyStatusValue(frontmatter[statusField]);
	}

	private stringifyStatusValue(status: unknown): string | null {
		if (
			typeof status === "string" ||
			typeof status === "number" ||
			typeof status === "boolean"
		) {
			return String(status);
		}

		return null;
	}

	/**
	 * Clear only forward dependencies (tasks this task depends on)
	 * Used when a task is modified - we rebuild forward deps from frontmatter
	 * but keep reverse deps intact (they're stored in other tasks' frontmatter)
	 */
	private clearForwardDependencies(path: string): void {
		// Clear from dependency sources (tasks this task depends on)
		const blockingTasks = this.dependencySources.get(path);
		if (blockingTasks) {
			// Remove from targets (reverse mapping)
			for (const blockingTask of blockingTasks) {
				const targets = this.dependencyTargets.get(blockingTask);
				if (targets) {
					targets.delete(path);
					if (targets.size === 0) {
						this.dependencyTargets.delete(blockingTask);
					}
				}
			}
			this.dependencySources.delete(path);
		}
		this.edgeReltypes.delete(path);

		// Also clear project references since those are stored in this task's frontmatter
		const referencedProjects = this.projectReferenceSources.get(path);
		if (referencedProjects) {
			for (const project of referencedProjects) {
				const taskSet = this.projectReferences.get(project);
				if (taskSet) {
					taskSet.delete(path);
					if (taskSet.size === 0) {
						this.projectReferences.delete(project);
					}
				}
			}
			this.projectReferenceSources.delete(path);
		}
		this.relationshipFingerprints.delete(path);
	}

	/**
	 * Clear a file from all indexes (both forward and reverse dependencies)
	 * Used when a file is deleted or becomes a non-task
	 */
	private clearFileFromIndexes(path: string): void {
		// Clear from dependency sources
		const blockingTasks = this.dependencySources.get(path);
		if (blockingTasks) {
			// Remove from targets
			for (const blockingTask of blockingTasks) {
				const targets = this.dependencyTargets.get(blockingTask);
				if (targets) {
					targets.delete(path);
					if (targets.size === 0) {
						this.dependencyTargets.delete(blockingTask);
					}
				}
			}
			this.dependencySources.delete(path);
		}
		this.edgeReltypes.delete(path);

		// Clear from dependency targets
		const blockedTasks = this.dependencyTargets.get(path);
		if (blockedTasks) {
			// Remove from sources
			for (const blockedTask of blockedTasks) {
				const sources = this.dependencySources.get(blockedTask);
				if (sources) {
					sources.delete(path);
					if (sources.size === 0) {
						this.dependencySources.delete(blockedTask);
					}
				}
				this.edgeReltypes.get(blockedTask)?.delete(path);
			}
			this.dependencyTargets.delete(path);
		}

		// Clear project references declared by this file
		const referencedProjects = this.projectReferenceSources.get(path);
		if (referencedProjects) {
			for (const project of referencedProjects) {
				const taskSet = this.projectReferences.get(project);
				if (taskSet) {
					taskSet.delete(path);
					if (taskSet.size === 0) {
						this.projectReferences.delete(project);
					}
				}
			}
			this.projectReferenceSources.delete(path);
		}

		// Clear this file as a project target
		const referencingTasks = this.projectReferences.get(path);
		if (referencingTasks) {
			for (const taskPath of referencingTasks) {
				const taskProjects = this.projectReferenceSources.get(taskPath);
				if (taskProjects) {
					taskProjects.delete(path);
					if (taskProjects.size === 0) {
						this.projectReferenceSources.delete(taskPath);
					}
				}
			}
			this.projectReferences.delete(path);
		}
		this.relationshipFingerprints.delete(path);
		this.completedStatusByPath.delete(path);
		this.startedStatusByPath.delete(path);
	}

	/**
	 * Get blocking task paths (tasks this task depends on)
	 */
	getBlockingTaskPaths(taskPath: string): string[] {
		if (!this.indexesBuilt) {
			tasknotesLogger.warn(
				"DependencyCache: getBlockingTaskPaths called before indexes built, building now...",
				{
					category: "stale-data",
					operation:
						"dependencycache-getblockingtaskpaths-called-indexes-built-building-now",
				}
			);
			// Build synchronously by reading current state
			this.buildIndexesSync();
		}
		const blocking = this.dependencySources.get(taskPath);
		return blocking ? Array.from(blocking) : [];
	}

	/**
	 * Get blocked task paths (tasks that depend on this task)
	 */
	getBlockedTaskPaths(taskPath: string): string[] {
		if (!this.indexesBuilt) {
			tasknotesLogger.warn(
				"DependencyCache: getBlockedTaskPaths called before indexes built, building now...",
				{
					category: "stale-data",
					operation:
						"dependencycache-getblockedtaskpaths-called-indexes-built-building-now",
				}
			);
			this.buildIndexesSync();
		}

		const { start, finish } = this.computeBlockedDependents(taskPath);
		return Array.from(new Set([...start, ...finish]));
	}

	/**
	 * Check if a task is blocked by dependencies (status-aware)
	 * Only returns true if the task has blocking dependencies that are NOT completed
	 */
	isTaskBlocked(taskPath: string): boolean {
		if (!this.indexesBuilt) {
			this.buildIndexesSync();
		}
		const { startBlocked, finishBlocked } = this.computeBlockedState(taskPath);
		return startBlocked || finishBlocked;
	}

	/**
	 * Cannot start yet: an FS predecessor unfinished, or an SS predecessor unstarted.
	 */
	isTaskStartBlocked(taskPath: string): boolean {
		if (!this.indexesBuilt) {
			this.buildIndexesSync();
		}
		return this.computeBlockedState(taskPath).startBlocked;
	}

	/**
	 * Cannot finish yet: an FF predecessor unfinished, or an SF predecessor unstarted.
	 */
	isTaskFinishBlocked(taskPath: string): boolean {
		if (!this.indexesBuilt) {
			this.buildIndexesSync();
		}
		return this.computeBlockedState(taskPath).finishBlocked;
	}

	// Reverse: the successors this task currently blocks from starting.
	getStartBlockedDependentPaths(taskPath: string): string[] {
		if (!this.indexesBuilt) {
			this.buildIndexesSync();
		}
		return Array.from(this.computeBlockedDependents(taskPath).start);
	}

	// Reverse: the successors this task currently blocks from finishing.
	getFinishBlockedDependentPaths(taskPath: string): string[] {
		if (!this.indexesBuilt) {
			this.buildIndexesSync();
		}
		return Array.from(this.computeBlockedDependents(taskPath).finish);
	}

	/**
	 * Get tasks referencing a project
	 */
	getTasksReferencingProject(projectPath: string): string[] {
		if (!this.indexesBuilt) {
			tasknotesLogger.warn(
				"DependencyCache: getTasksReferencingProject called before indexes built, building now...",
				{
					category: "stale-data",
					operation:
						"dependencycache-gettasksreferencingproject-called-indexes-built-building-now",
				}
			);
			this.buildIndexesSync();
		}
		const tasks = this.projectReferences.get(projectPath);
		return tasks ? Array.from(tasks) : [];
	}

	/**
	 * Check if a file is used as a project
	 */
	isFileUsedAsProject(filePath: string): boolean {
		if (!this.indexesBuilt) {
			tasknotesLogger.warn(
				"DependencyCache: isFileUsedAsProject called before indexes built, building now...",
				{
					category: "stale-data",
					operation:
						"dependencycache-isfileusedasproject-called-indexes-built-building-now",
				}
			);
			this.buildIndexesSync();
		}
		return this.projectReferences.has(filePath);
	}

	/**
	 * Build indexes synchronously (for lazy initialization)
	 */
	private buildIndexesSync(): void {
		if (this.indexesBuilt) return;

		const files = this.app.vault.getMarkdownFiles();

		for (const file of files) {
			if (!this.isValidFile(file.path)) {
				continue;
			}

			const metadata = this.app.metadataCache.getFileCache(file);
			if (!metadata?.frontmatter || !this.isTaskFileCallback(metadata.frontmatter)) {
				continue;
			}

			this.indexTaskFile(file.path, metadata.frontmatter);
		}

		this.indexesBuilt = true;
		this.trigger(EVENT_DEPENDENCY_CACHE_CHANGED);
	}

	updateConfig(settings: TaskNotesSettings): void {
		this.settings = settings;
		this.excludedFolders = parseExcludedFolders(settings.excludedFolders);
		this.clearIndexes();
		this.indexesBuilt = false;
	}

	private isValidFile(path: string): boolean {
		return !isPathInExcludedFolder(path, this.excludedFolders);
	}

	private clearIndexes(): void {
		this.dependencySources.clear();
		this.dependencyTargets.clear();
		this.edgeReltypes.clear();
		this.projectReferences.clear();
		this.projectReferenceSources.clear();
		this.relationshipFingerprints.clear();
		this.completedStatusByPath.clear();
		this.startedStatusByPath.clear();
	}

	/**
	 * Cleanup
	 */
	destroy(): void {
		// Unregister all event listeners
		this.eventListeners.forEach((ref) => {
			this.app.metadataCache.offref(ref);
		});
		this.eventListeners = [];

		// Clear indexes
		this.clearIndexes();

		this.initialized = false;
		this.indexesBuilt = false;
	}
}

/* eslint-enable @typescript-eslint/no-non-null-assertion -- Re-enable after the dependency cache implementation. */
