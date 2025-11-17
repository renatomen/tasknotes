import {
	EditorView,
	PluginValue,
	ViewPlugin,
	ViewUpdate,
} from "@codemirror/view";
import {
	EVENT_DATA_CHANGED,
	EVENT_TASK_DELETED,
	EVENT_TASK_UPDATED,
	EVENT_DATE_CHANGED,
	TaskInfo,
} from "../types";
import {
	EventRef,
	TFile,
	editorInfoField,
	editorLivePreviewField,
	MarkdownView,
	WorkspaceLeaf,
} from "obsidian";
import { Extension } from "@codemirror/state";

import TaskNotesPlugin from "../main";
import { createTaskCard } from "../ui/TaskCard";
import { convertInternalToUserProperties } from "../utils/propertyMapping";

// CSS class for identifying plugin-generated elements
const CSS_TASK_CARD_WIDGET = 'tasknotes-task-card-note-widget';

/**
 * Helper function to create the task card widget
 */
function createTaskCardWidget(
	plugin: TaskNotesPlugin,
	task: TaskInfo
): HTMLElement {
	const container = document.createElement("div");
	container.className = `tasknotes-plugin task-card-note-widget ${CSS_TASK_CARD_WIDGET}`;

	container.setAttribute("contenteditable", "false");
	container.setAttribute("spellcheck", "false");
	container.setAttribute("data-widget-type", "task-card");

	// Get the visible properties from settings and convert internal names to user-configured names
	const visibleProperties = plugin.settings.defaultVisibleProperties
		? convertInternalToUserProperties(plugin.settings.defaultVisibleProperties, plugin)
		: undefined;

	// Create the task card
	const taskCard = createTaskCard(task, plugin, visibleProperties);

	// Add specific styling for the note widget
	taskCard.classList.add("task-card-note-widget__card");

	container.appendChild(taskCard);

	return container;
}

export class TaskCardNoteDecorationsPlugin implements PluginValue {
	private cachedTask: TaskInfo | null = null;
	private currentFile: TFile | null = null;
	private eventListeners: EventRef[] = [];
	private view: EditorView;
	private currentWidget: HTMLElement | null = null;
	private widgetContainer: HTMLElement | null = null;

	constructor(
		view: EditorView,
		private plugin: TaskNotesPlugin
	) {
		this.view = view;
		this.currentFile = this.getFileFromView(view);

		// Set up event listeners for data changes
		this.setupEventListeners();

		// Load task for current file and inject widget
		this.loadTaskForCurrentFile(view);
	}

	update(update: ViewUpdate) {
		// Store the updated view reference
		this.view = update.view;

		// Check if file changed for this specific view
		const newFile = this.getFileFromView(update.view);
		if (newFile !== this.currentFile) {
			this.currentFile = newFile;
			this.loadTaskForCurrentFile(update.view);
		}
	}

	destroy() {
		// Clean up widget
		this.removeWidget();

		// Clean up event listeners
		this.eventListeners.forEach((listener) => {
			this.plugin.emitter.offref(listener);
		});
		this.eventListeners = [];
	}

	private setupEventListeners() {
		// Listen for data changes that might affect the task card
		const dataChangeListener = this.plugin.emitter.on(EVENT_DATA_CHANGED, () => {
			this.loadTaskForCurrentFile(this.view);
		});

		const taskUpdateListener = this.plugin.emitter.on(EVENT_TASK_UPDATED, () => {
			this.loadTaskForCurrentFile(this.view);
		});

		const taskDeleteListener = this.plugin.emitter.on(EVENT_TASK_DELETED, () => {
			this.loadTaskForCurrentFile(this.view);
		});

		const dateChangeListener = this.plugin.emitter.on(EVENT_DATE_CHANGED, () => {
			this.loadTaskForCurrentFile(this.view);
		});

		// Listen for settings changes
		const settingsChangeListener = this.plugin.emitter.on("settings-changed", () => {
			this.loadTaskForCurrentFile(this.view);
		});

		this.eventListeners.push(
			dataChangeListener,
			taskUpdateListener,
			taskDeleteListener,
			dateChangeListener,
			settingsChangeListener
		);
	}

	private removeWidget(): void {
		if (this.currentWidget) {
			this.currentWidget.remove();
			this.currentWidget = null;
		}
		this.widgetContainer = null;
	}

	private cleanupOrphanedWidgets(view: EditorView): void {
		// Remove any orphaned widgets that might exist from previous instances
		const container = view.dom.closest('.workspace-leaf-content');
		if (container) {
			container.querySelectorAll(`.${CSS_TASK_CARD_WIDGET}`).forEach(el => {
				if (el !== this.currentWidget) {
					el.remove();
				}
			});
		}
	}

	private loadTaskForCurrentFile(view: EditorView) {
		const file = this.getFileFromView(view);

		if (file instanceof TFile) {
			try {
				// Use getCachedTaskInfoSync which includes the isTaskFile check
				// This will return null if the file is not a task note
				const newTask = this.plugin.cacheManager.getCachedTaskInfoSync(file.path);

				// Helper to check if task has active time tracking session
				const hasActiveSession = (task: TaskInfo | null): boolean => {
					if (!task?.timeEntries || task.timeEntries.length === 0) return false;
					const lastEntry = task.timeEntries[task.timeEntries.length - 1];
					return !lastEntry.endTime;
				};

				// Check if task actually changed - must check all properties that affect widget display
				const taskChanged =
					this.cachedTask?.title !== newTask?.title ||
					this.cachedTask?.status !== newTask?.status ||
					this.cachedTask?.priority !== newTask?.priority ||
					this.cachedTask?.due !== newTask?.due ||
					this.cachedTask?.scheduled !== newTask?.scheduled ||
					this.cachedTask?.path !== newTask?.path ||
					this.cachedTask?.archived !== newTask?.archived ||
					this.cachedTask?.timeEstimate !== newTask?.timeEstimate ||
					this.cachedTask?.recurrence !== newTask?.recurrence ||
					hasActiveSession(this.cachedTask) !== hasActiveSession(newTask) ||
					JSON.stringify(this.cachedTask?.tags || []) !==
						JSON.stringify(newTask?.tags || []) ||
					JSON.stringify(this.cachedTask?.contexts || []) !==
						JSON.stringify(newTask?.contexts || []) ||
					JSON.stringify(this.cachedTask?.projects || []) !==
						JSON.stringify(newTask?.projects || []) ||
					JSON.stringify(this.cachedTask?.complete_instances || []) !==
						JSON.stringify(newTask?.complete_instances || []);

				if (taskChanged) {
					this.cachedTask = newTask;
					this.injectWidget(view);
				}
			} catch (error) {
				console.error("Error loading task for task note:", error);
			}
		} else {
			if (this.cachedTask !== null) {
				this.cachedTask = null;
				this.injectWidget(view);
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

			// Check for footnote editors - look for popover or markdown-embed with footnote type
			const popover = editorElement.closest(".popover.hover-popover");
			if (popover) {
				return true;
			}

			// Check for markdown embed with data-type="footnote"
			const footnoteEmbed = editorElement.closest(".markdown-embed[data-type='footnote']");
			if (footnoteEmbed) {
				return true;
			}

			// Additional check: inline editors without file association
			const editorInfo = view.state.field(editorInfoField, false);
			if (!editorInfo?.file) {
				// This might be an inline editor - check if parent is table-related or in a popover
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
					// Check for popover (footnotes, hovers, etc.)
					if (parent.classList.contains("popover") || parent.classList.contains("hover-popover")) {
						return true;
					}
					// Check for markdown-embed with footnote data-type
					if (parent.classList.contains("markdown-embed") &&
					    parent.getAttribute("data-type") === "footnote") {
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

	private injectWidget(view: EditorView): void {
		// Remove any existing widget first
		this.removeWidget();

		// Also clean up any orphaned widgets
		this.cleanupOrphanedWidgets(view);

		try {
			// Don't show widget in table cell editors
			if (this.isTableCellEditor(view)) {
				return;
			}

			// Check if task card widget is enabled
			if (!this.plugin.settings.showTaskCardInNote) {
				return;
			}

			// Only show in live preview mode, not source mode
			if (!view.state.field(editorLivePreviewField)) {
				return;
			}

			// Only inject if we have a cached task
			if (!this.cachedTask) {
				return;
			}

			// Find .cm-sizer which contains the scrollable content area
			const targetContainer = view.dom.closest('.markdown-source-view')?.querySelector<HTMLElement>('.cm-sizer');
			if (!targetContainer) {
				return;
			}

			// Create the widget
			const widget = createTaskCardWidget(this.plugin, this.cachedTask);

			// Add styling to match decoration appearance and prevent cursor interaction
			widget.style.display = "block";
			widget.style.pointerEvents = "auto";
			widget.style.userSelect = "none";
			widget.style.border = "1px dashed var(--background-modifier-border)";
			widget.style.borderRadius = "4px";
			widget.style.padding = "8px";
			widget.style.marginTop = "8px";
			widget.style.marginBottom = "8px";

			// Store references
			this.currentWidget = widget;
			this.widgetContainer = targetContainer;

			// Insert after properties/frontmatter if present, otherwise at the beginning
			const metadataContainer = targetContainer.querySelector('.metadata-container');
			if (metadataContainer?.nextSibling) {
				metadataContainer.parentElement?.insertBefore(widget, metadataContainer.nextSibling);
			} else {
				targetContainer.insertBefore(widget, targetContainer.firstChild);
			}

		} catch (error) {
			console.error("Error injecting task card widget:", error);
		}
	}
}

/**
 * Create the task card note decorations extension
 */
export function createTaskCardNoteDecorations(plugin: TaskNotesPlugin): Extension {
	return ViewPlugin.fromClass(
		class extends TaskCardNoteDecorationsPlugin {
			constructor(view: EditorView) {
				super(view, plugin);
			}

			destroy() {
				super.destroy();
			}
		}
	);
}

/**
 * Inject task card widget into reading mode view
 */
async function injectReadingModeWidget(
	leaf: WorkspaceLeaf,
	plugin: TaskNotesPlugin
): Promise<void> {
	const view = leaf.view;
	if (!(view instanceof MarkdownView) || view.getMode() !== 'preview') {
		return;
	}

	const file = view.file;
	if (!file) {
		return;
	}

	// Check if task card widget is enabled
	if (!plugin.settings.showTaskCardInNote) {
		return;
	}

	// Get task info for this file
	const task = plugin.cacheManager.getCachedTaskInfoSync(file.path);
	if (!task) {
		// Not a task note
		return;
	}

	// Remove any existing widgets first
	const previewView = view.previewMode;
	const containerEl = previewView.containerEl;
	containerEl.querySelectorAll(`.${CSS_TASK_CARD_WIDGET}`).forEach(el => {
		el.remove();
	});

	// Create the widget
	const widget = createTaskCardWidget(plugin, task);

	// Add styling
	widget.style.display = "block";
	widget.style.pointerEvents = "auto";
	widget.style.userSelect = "none";
	widget.style.border = "1px dashed var(--background-modifier-border)";
	widget.style.borderRadius = "4px";
	widget.style.padding = "8px";
	widget.style.marginTop = "8px";
	widget.style.marginBottom = "8px";

	// Find the markdown-preview-sizer
	const sizer = containerEl.querySelector<HTMLElement>('.markdown-preview-sizer');
	if (!sizer) {
		return;
	}

	// Insert after properties/frontmatter if present, otherwise at the beginning
	const metadataContainer = sizer.querySelector('.metadata-container');
	if (metadataContainer?.nextSibling) {
		sizer.insertBefore(widget, metadataContainer.nextSibling);
	} else {
		sizer.insertBefore(widget, sizer.firstChild);
	}
}

/**
 * Setup reading mode handlers for task card widget
 * Returns cleanup function to remove handlers
 */
export function setupReadingModeHandlers(plugin: TaskNotesPlugin): () => void {
	const eventRefs: EventRef[] = [];

	// Inject widget when layout changes (file opened, switched, etc.)
	const layoutChangeRef = plugin.app.workspace.on('layout-change', () => {
		const leaves = plugin.app.workspace.getLeavesOfType('markdown');
		leaves.forEach(leaf => {
			injectReadingModeWidget(leaf, plugin);
		});
	});
	eventRefs.push(layoutChangeRef);

	// Inject widget when active leaf changes
	const activeLeafChangeRef = plugin.app.workspace.on('active-leaf-change', (leaf) => {
		if (leaf) {
			injectReadingModeWidget(leaf, plugin);
		}
	});
	eventRefs.push(activeLeafChangeRef);

	// Inject widget when file is modified (metadata changes)
	const metadataChangeRef = plugin.app.metadataCache.on('changed', (file) => {
		const leaves = plugin.app.workspace.getLeavesOfType('markdown');
		leaves.forEach(leaf => {
			const view = leaf.view;
			if (view instanceof MarkdownView && view.file === file) {
				injectReadingModeWidget(leaf, plugin);
			}
		});
	});
	eventRefs.push(metadataChangeRef);

	// Listen for task updates to refresh the widget
	const taskUpdateListener = plugin.emitter.on(EVENT_TASK_UPDATED, () => {
		const leaves = plugin.app.workspace.getLeavesOfType('markdown');
		leaves.forEach(leaf => {
			injectReadingModeWidget(leaf, plugin);
		});
	});
	eventRefs.push(taskUpdateListener);

	const dataChangeListener = plugin.emitter.on(EVENT_DATA_CHANGED, () => {
		const leaves = plugin.app.workspace.getLeavesOfType('markdown');
		leaves.forEach(leaf => {
			injectReadingModeWidget(leaf, plugin);
		});
	});
	eventRefs.push(dataChangeListener);

	// Initial injection for any already-open reading views
	const leaves = plugin.app.workspace.getLeavesOfType('markdown');
	leaves.forEach(leaf => {
		injectReadingModeWidget(leaf, plugin);
	});

	// Return cleanup function
	return () => {
		eventRefs.forEach(ref => {
			if ('name' in ref && typeof (ref as any).name === 'string') {
				// It's a workspace event ref
				plugin.app.workspace.offref(ref);
			} else {
				// It's a plugin emitter event ref
				plugin.emitter.offref(ref);
			}
		});
	};
}
