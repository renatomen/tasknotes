/* eslint-disable no-console, @typescript-eslint/no-non-null-assertion */
import { TFile, App, Events, EventRef } from "obsidian";
import { FieldMapper } from "../services/FieldMapper";
import { normalizeDependencyList, resolveDependencyEntry } from "./dependencyUtils";
import { TaskNotesSettings } from "../types/settings";

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
	private fieldMapper?: FieldMapper;

	// Dependency indexes
	private dependencySources: Map<string, Set<string>> = new Map(); // task path -> blocking task paths
	private dependencyTargets: Map<string, Set<string>> = new Map(); // task path -> tasks blocked by this task

	// Project references index
	private projectReferences: Map<string, Set<string>> = new Map(); // project path -> Set<task paths that reference it>

	// Initialization state
	private initialized = false;
	private indexesBuilt = false;

	// Event listeners for cleanup
	private eventListeners: EventRef[] = [];

	// Callback to check if a file is a task
	private isTaskFileCallback: (frontmatter: any) => boolean;

	constructor(
		app: App,
		settings: TaskNotesSettings,
		fieldMapper: FieldMapper | undefined,
		isTaskFileCallback: (frontmatter: any) => boolean
	) {
		super();
		this.app = app;
		this.settings = settings;
		this.fieldMapper = fieldMapper;
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
			const metadata = this.app.metadataCache.getFileCache(file);
			if (!metadata?.frontmatter || !this.isTaskFileCallback(metadata.frontmatter)) {
				continue;
			}

			this.indexTaskFile(file.path, metadata.frontmatter);
		}

		this.indexesBuilt = true;
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
	private handleFileChanged(file: TFile, cache: any): void {
		const metadata = this.app.metadataCache.getFileCache(file);
		if (!metadata?.frontmatter) {
			this.clearFileFromIndexes(file.path);
			return;
		}

		if (!this.isTaskFileCallback(metadata.frontmatter)) {
			this.clearFileFromIndexes(file.path);
			return;
		}

		// Re-index this task
		this.clearFileFromIndexes(file.path);
		this.indexTaskFile(file.path, metadata.frontmatter);
	}

	/**
	 * Handle file deletion
	 */
	private handleFileDeleted(path: string): void {
		this.clearFileFromIndexes(path);
	}

	/**
	 * Handle file rename
	 */
	private handleFileRenamed(file: TFile, oldPath: string): void {
		// Get metadata for new path
		const metadata = this.app.metadataCache.getFileCache(file);

		// Clear old path
		this.clearFileFromIndexes(oldPath);

		// Index new path if it's a task
		if (metadata?.frontmatter && this.isTaskFileCallback(metadata.frontmatter)) {
			this.indexTaskFile(file.path, metadata.frontmatter);
		}
	}

	/**
	 * Index a task file's dependencies and project references
	 */
	private indexTaskFile(path: string, frontmatter: any): void {
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
					if (resolved?.path) {
						blockingTasks.add(resolved.path);

						// Add to targets (reverse mapping)
						if (!this.dependencyTargets.has(resolved.path)) {
							this.dependencyTargets.set(resolved.path, new Set());
						}
						this.dependencyTargets.get(resolved.path)!.add(path);
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
				if (typeof proj === 'string') {
					if (!this.projectReferences.has(proj)) {
						this.projectReferences.set(proj, new Set());
					}
					this.projectReferences.get(proj)!.add(path);
				}
			}
		}
	}

	/**
	 * Clear a file from all indexes
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
			}
			this.dependencyTargets.delete(path);
		}

		// Clear from project references
		for (const [project, taskSet] of this.projectReferences.entries()) {
			taskSet.delete(path);
			if (taskSet.size === 0) {
				this.projectReferences.delete(project);
			}
		}
	}

	/**
	 * Get blocking task paths (tasks this task depends on)
	 */
	getBlockingTaskPaths(taskPath: string): string[] {
		if (!this.indexesBuilt) {
			console.warn("DependencyCache: getBlockingTaskPaths called before indexes built, building now...");
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
			console.warn("DependencyCache: getBlockedTaskPaths called before indexes built, building now...");
			this.buildIndexesSync();
		}
		const blocked = this.dependencyTargets.get(taskPath);
		return blocked ? Array.from(blocked) : [];
	}

	/**
	 * Check if a task is blocked by dependencies
	 */
	isTaskBlocked(taskPath: string): boolean {
		const blocking = this.getBlockingTaskPaths(taskPath);
		return blocking.length > 0;
	}

	/**
	 * Get tasks referencing a project
	 */
	getTasksReferencingProject(projectPath: string): string[] {
		if (!this.indexesBuilt) {
			console.warn("DependencyCache: getTasksReferencingProject called before indexes built, building now...");
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
			console.warn("DependencyCache: isFileUsedAsProject called before indexes built, building now...");
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
			const metadata = this.app.metadataCache.getFileCache(file);
			if (!metadata?.frontmatter || !this.isTaskFileCallback(metadata.frontmatter)) {
				continue;
			}

			this.indexTaskFile(file.path, metadata.frontmatter);
		}

		this.indexesBuilt = true;
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
		this.dependencySources.clear();
		this.dependencyTargets.clear();
		this.projectReferences.clear();

		this.initialized = false;
		this.indexesBuilt = false;
	}
}
