import {
	Decoration,
	DecorationSet,
	EditorView,
	PluginSpec,
	PluginValue,
	ViewPlugin,
	ViewUpdate,
	WidgetType,
} from "@codemirror/view";
import {
	EVENT_DATA_CHANGED,
	EVENT_TASK_DELETED,
	EVENT_TASK_UPDATED,
	EVENT_DATE_CHANGED,
	FilterQuery,
	SUBTASK_WIDGET_VIEW_TYPE,
	TaskInfo,
} from "../types";
import {
	EventRef,
	TFile,
	editorInfoField,
	editorLivePreviewField,
	MarkdownRenderer,
} from "obsidian";
import { Extension, RangeSetBuilder, StateEffect } from "@codemirror/state";

import { ProjectSubtasksService } from "../services/ProjectSubtasksService";
import TaskNotesPlugin from "../main";

// Define a state effect for project subtasks updates
const projectSubtasksUpdateEffect = StateEffect.define<{ forceUpdate?: boolean }>();

export class ProjectSubtasksWidget extends WidgetType {
	constructor(
		private plugin: TaskNotesPlugin,
		private tasks: TaskInfo[],
		private notePath: string,
		private version: number = 0
	) {
		super();
	}

	// Override eq to ensure widget updates when task count changes
	eq(other: ProjectSubtasksWidget): boolean {
		return (
			this.version === other.version &&
			this.tasks.length === other.tasks.length &&
			this.notePath === other.notePath
		);
	}

	toDOM(view: EditorView): HTMLElement {
		const container = document.createElement("div");
		container.className = "tasknotes-plugin project-note-subtasks project-subtasks-widget cm-widget-cursor-fix";

		container.setAttribute("contenteditable", "false");
		container.setAttribute("spellcheck", "false");
		container.setAttribute("data-widget-type", "project-subtasks");

		// Create container for embedded Bases view
		const basesContainer = container.createEl("div", {
			cls: "project-note-subtasks__bases-container",
		});

		// Asynchronously load and render the Bases view
		this.renderBasesView(basesContainer);

		return container;
	}

	private async renderBasesView(container: HTMLElement): Promise<void> {
		try {
			// Get the Bases file path from settings
			const basesFilePath = this.plugin.settings.commandFileMapping['project-subtasks'];
			if (!basesFilePath) {
				container.createEl("div", {
					text: "Project subtasks view not configured",
					cls: "project-note-subtasks__error",
				});
				return;
			}

			// Create an embed link to the Bases file
			// This will use Obsidian's standard embed rendering, which should handle .base files
			const embedMarkdown = `![[${basesFilePath}]]`;

			await MarkdownRenderer.render(
				this.plugin.app,
				embedMarkdown,
				container,
				this.notePath, // Source path provides context for 'this' keyword
				this.plugin as any
			);

		} catch (error) {
			console.error("Error rendering Bases view in subtasks widget:", error);
			container.createEl("div", {
				text: "Failed to load subtasks view",
				cls: "project-note-subtasks__error",
			});
		}
	}
}

class ProjectNoteDecorationsPlugin implements PluginValue {
	decorations: DecorationSet;
	private cachedTasks: TaskInfo[] = [];
	private currentFile: TFile | null = null;
	private projectService: ProjectSubtasksService;
	private eventListeners: EventRef[] = [];
	private view: EditorView;
	private version = 0;

	constructor(
		view: EditorView,
		private plugin: TaskNotesPlugin
	) {
		this.view = view;
		this.projectService = plugin.projectSubtasksService;
		this.decorations = this.buildDecorations(view);

		// Set up event listeners for data changes
		this.setupEventListeners();

		// Load tasks for current file asynchronously
		this.loadTasksForCurrentFile(view);
	}

	update(update: ViewUpdate) {
		// Store the updated view reference
		this.view = update.view;

		// Check for project subtasks update effects
		const hasUpdateEffect = update.transactions.some((tr) =>
			tr.effects.some((effect) => effect.is(projectSubtasksUpdateEffect))
		);

		if (update.docChanged || update.viewportChanged || hasUpdateEffect) {
			// If our custom effect is present, bump version so widgets are recreated (forces a fresh DOM)
			if (hasUpdateEffect) {
				this.version++;
			}
			this.decorations = this.buildDecorations(update.view);
		}

		// Check if file changed for this specific view
		const newFile = this.getFileFromView(update.view);
		if (newFile !== this.currentFile) {
			this.currentFile = newFile;
			this.loadTasksForCurrentFile(update.view);
		}
	}

	destroy() {
		// Clean up event listeners
		this.eventListeners.forEach((listener) => {
			this.plugin.emitter.offref(listener);
		});
		this.eventListeners = [];
	}

	private setupEventListeners() {
		// Listen for data changes that might affect project subtasks
		const dataChangeListener = this.plugin.emitter.on(EVENT_DATA_CHANGED, () => {
			// Refresh tasks for current file when data changes
			this.loadTasksForCurrentFile(this.view);
		});

		const taskUpdateListener = this.plugin.emitter.on(EVENT_TASK_UPDATED, () => {
			// Refresh tasks for current file when tasks are updated
			this.loadTasksForCurrentFile(this.view);
		});

		const taskDeleteListener = this.plugin.emitter.on(EVENT_TASK_DELETED, () => {
			// Refresh tasks for current file when tasks are deleted
			this.loadTasksForCurrentFile(this.view);
		});

		const dateChangeListener = this.plugin.emitter.on(EVENT_DATE_CHANGED, () => {
			// Refresh tasks for current file when date changes (for recurring task states)
			this.loadTasksForCurrentFile(this.view);
		});

		// Listen for settings changes that might affect project subtasks
		const settingsChangeListener = this.plugin.emitter.on("settings-changed", () => {
			// Refresh tasks when settings change (e.g., custom fields, statuses)
			this.loadTasksForCurrentFile(this.view);
		});

		// Listen for cache events that might affect project subtasks
		const fileUpdateListener = this.plugin.emitter.on(
			"file-updated",
			(data: { path: string }) => {
				// Refresh if the updated file might contain project references
				this.loadTasksForCurrentFile(this.view);
			}
		);

		const fileDeleteListener = this.plugin.emitter.on(
			"file-deleted",
			(data: { path: string }) => {
				// Refresh if a file was deleted that might have affected project references
				this.loadTasksForCurrentFile(this.view);
			}
		);

		const fileRenameListener = this.plugin.emitter.on(
			"file-renamed",
			(data: { oldPath: string; newPath: string }) => {
				// Refresh if a file was renamed that might have affected project references
				this.loadTasksForCurrentFile(this.view);
			}
		);

		this.eventListeners.push(
			dataChangeListener,
			taskUpdateListener,
			taskDeleteListener,
			dateChangeListener,
			settingsChangeListener,
			fileUpdateListener,
			fileDeleteListener,
			fileRenameListener
		);
	}

	private dispatchUpdate() {
		// Increment version and dispatch update effect
		this.version++;
		if (this.view && typeof this.view.dispatch === "function") {
			try {
				this.view.dispatch({
					effects: [projectSubtasksUpdateEffect.of({ forceUpdate: true })],
				});
			} catch (error) {
				console.error("Error dispatching project subtasks update:", error);
			}
		}
	}

	private async loadTasksForCurrentFile(view: EditorView) {
		const file = this.getFileFromView(view);

		if (file instanceof TFile) {
			try {
				const newTasks = await this.projectService.getTasksLinkedToProject(file);

				// Helper to check if task has active time tracking session
				const hasActiveSession = (task: TaskInfo): boolean => {
					if (!task.timeEntries || task.timeEntries.length === 0) return false;
					const lastEntry = task.timeEntries[task.timeEntries.length - 1];
					return !lastEntry.endTime;
				};

				// Check if tasks actually changed - must check all properties that affect widget display
				const tasksChanged =
					newTasks.length !== this.cachedTasks.length ||
					newTasks.some((newTask, index) => {
						const oldTask = this.cachedTasks[index];
						return (
							!oldTask ||
							newTask.title !== oldTask.title ||
							newTask.status !== oldTask.status ||
							newTask.priority !== oldTask.priority ||
							newTask.due !== oldTask.due ||
							newTask.scheduled !== oldTask.scheduled ||
							newTask.path !== oldTask.path ||
							newTask.archived !== oldTask.archived ||
							newTask.timeEstimate !== oldTask.timeEstimate ||
							newTask.recurrence !== oldTask.recurrence ||
							hasActiveSession(newTask) !== hasActiveSession(oldTask) ||
							JSON.stringify(newTask.tags || []) !==
								JSON.stringify(oldTask.tags || []) ||
							JSON.stringify(newTask.contexts || []) !==
								JSON.stringify(oldTask.contexts || []) ||
							JSON.stringify(newTask.projects || []) !==
								JSON.stringify(oldTask.projects || []) ||
							JSON.stringify(newTask.complete_instances || []) !==
								JSON.stringify(oldTask.complete_instances || [])
						);
					});

				if (tasksChanged) {
					this.cachedTasks = newTasks;
					this.dispatchUpdate();
				}
			} catch (error) {
				console.error("Error loading tasks for project note:", error);
			}
		} else {
			if (this.cachedTasks.length > 0) {
				this.cachedTasks = [];
				this.dispatchUpdate();
			}
		}
	}

	private getFileFromView(view: EditorView): TFile | null {
		// Get the file associated with this specific editor view
		const editorInfo = view.state.field(editorInfoField, false);
		return editorInfo?.file || null;
	}

	private isTableCellEditor(view: EditorView): boolean {
		try {
			// Check if the editor is inside a table cell using DOM inspection
			const editorElement = view.dom;
			const tableCell = editorElement.closest("td, th");

			if (tableCell) {
				return true;
			}

			// Also check for Obsidian-specific table widget classes
			const obsidianTableWidget = editorElement.closest(".cm-table-widget");
			if (obsidianTableWidget) {
				return true;
			}

			// Additional check: inline editors without file association
			const editorInfo = view.state.field(editorInfoField, false);
			if (!editorInfo?.file) {
				// This might be an inline editor - check if parent is table-related
				let parent = editorElement.parentElement;
				while (parent && parent !== document.body) {
					if (
						parent.tagName === "TABLE" ||
						parent.tagName === "TD" ||
						parent.tagName === "TH" ||
						parent.classList.contains("markdown-rendered")
					) {
						return true;
					}
					parent = parent.parentElement;
				}
			}

			return false;
		} catch (error) {
			console.debug("Error detecting table cell editor:", error);
			return false;
		}
	}

	private buildDecorations(view: EditorView): DecorationSet {
		const builder = new RangeSetBuilder<Decoration>();

		try {
			// Don't show widget in table cell editors
			if (this.isTableCellEditor(view)) {
				return builder.finish();
			}

			// Check if project subtasks widget is enabled
			if (!this.plugin.settings.showProjectSubtasks) {
				return builder.finish();
			}

			// Only show in live preview mode, not source mode
			if (!view.state.field(editorLivePreviewField)) {
				return builder.finish();
			}

			// Only build decorations if we have cached tasks
			if (this.cachedTasks.length === 0) {
				return builder.finish();
			}

			const doc = view.state.doc;

			// Ensure document has content
			if (doc.length === 0) {
				return builder.finish();
			}

			// Find insertion position after frontmatter/properties
			let insertPos = this.findInsertionPosition(view, doc);

			// Ensure position is valid
			if (insertPos < 0 || insertPos > doc.length) {
				insertPos = 0;
			}

			// Get the current file path for note-specific filter state
			// Try multiple methods to get the file path to avoid "unknown"
			let notePath = this.currentFile?.path;
			if (!notePath) {
				// Fallback: try to get file from the view
				const viewFile = this.getFileFromView(view);
				notePath = viewFile?.path;
			}
			if (!notePath) {
				// Last resort: return early - don't create widget without proper file context
				console.warn("ProjectNoteDecorations: Cannot create widget without file context");
				return builder.finish();
			}

			const widget = Decoration.widget({
				widget: new ProjectSubtasksWidget(
					this.plugin,
					this.cachedTasks,
					notePath,
					this.version
				),
				side: 1,
			});

			builder.add(insertPos, insertPos, widget);
		} catch (error) {
			console.error("Error building project note decorations:", error);
		}

		return builder.finish();
	}

	private findInsertionPosition(view: EditorView, doc: any): number {
		if (doc.lines === 0) return 0;

		const position = this.plugin.settings.projectSubtasksPosition || "bottom";

		if (position === "top") {
			// Find position after frontmatter if present
			const docText = doc.toString();
			const frontmatterRegex = /^---\n[\s\S]*?\n---\n/;
			const match = frontmatterRegex.exec(docText);

			if (match) {
				// Place after frontmatter
				return match[0].length;
			} else {
				// No frontmatter, place at beginning
				return 0;
			}
		} else {
			// Default: insert at the very end of the document
			return doc.length;
		}
	}
}

const projectNoteDecorationsSpec: PluginSpec<ProjectNoteDecorationsPlugin> = {
	decorations: (plugin: ProjectNoteDecorationsPlugin) => plugin.decorations,
};

/**
 * Create the project note decorations extension
 */
export function createProjectNoteDecorations(plugin: TaskNotesPlugin): Extension {
	return ViewPlugin.fromClass(
		class extends ProjectNoteDecorationsPlugin {
			constructor(view: EditorView) {
				super(view, plugin);
			}

			destroy() {
				super.destroy();
			}
		},
		projectNoteDecorationsSpec
	);
}

/**
 * Helper function to dispatch project subtasks update effects to an editor view
 */
export function dispatchProjectSubtasksUpdate(view: EditorView): void {
	// Validate that view is a proper EditorView with dispatch method
	if (!view || typeof view.dispatch !== "function") {
		console.warn("Invalid EditorView passed to dispatchProjectSubtasksUpdate:", view);
		return;
	}

	try {
		view.dispatch({
			effects: [projectSubtasksUpdateEffect.of({ forceUpdate: true })],
		});
	} catch (error) {
		console.error("Error dispatching project subtasks update:", error);
	}
}
