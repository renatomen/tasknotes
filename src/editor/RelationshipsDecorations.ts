import {
	EditorView,
	PluginValue,
	ViewPlugin,
	ViewUpdate,
} from "@codemirror/view";
import {
	Component,
	EventRef,
	MarkdownView,
	TFile,
	editorInfoField,
	editorLivePreviewField,
	MarkdownRenderer,
	WorkspaceLeaf,
} from "obsidian";
import { Extension } from "@codemirror/state";

import TaskNotesPlugin from "../main";

// CSS class for identifying plugin-generated elements
const CSS_RELATIONSHIPS_WIDGET = 'tasknotes-relationships-widget';

// Interface to track component lifecycle
interface HTMLElementWithComponent extends HTMLElement {
	component?: Component;
}

/**
 * Helper function to create and render the relationships widget content
 */
async function createRelationshipsWidget(
	plugin: TaskNotesPlugin,
	notePath: string
): Promise<HTMLElementWithComponent> {
	const container = document.createElement("div") as HTMLElementWithComponent;
	container.className = `tasknotes-plugin ${CSS_RELATIONSHIPS_WIDGET}`;

	container.setAttribute("contenteditable", "false");
	container.setAttribute("spellcheck", "false");
	container.setAttribute("data-widget-type", "relationships");

	// Create container for embedded Bases view
	const basesContainer = document.createElement("div");
	basesContainer.className = "relationships__bases-container";
	container.appendChild(basesContainer);

	// Create component for lifecycle management
	const component = new Component();
	component.load();
	container.component = component;

	try {
		// Get the Bases file path from settings
		const basesFilePath = plugin.settings.commandFileMapping['relationships'];
		if (!basesFilePath) {
			const errorDiv = document.createElement("div");
			errorDiv.className = "relationships__error";
			errorDiv.textContent = "Relationships view not configured";
			basesContainer.appendChild(errorDiv);
			return container;
		}

		// Create an embed link to the Bases file
		const embedMarkdown = `![[${basesFilePath}]]`;

		await MarkdownRenderer.render(
			plugin.app,
			embedMarkdown,
			basesContainer,
			notePath, // Source path provides context for 'this' keyword
			component
		);

	} catch (error) {
		console.error("Error rendering Bases view in relationships widget:", error);
		const errorDiv = document.createElement("div");
		errorDiv.className = "relationships__error";
		errorDiv.textContent = "Failed to load relationships view";
		basesContainer.appendChild(errorDiv);
	}

	return container;
}

class RelationshipsDecorationsPlugin implements PluginValue {
	private currentFile: TFile | null = null;
	private view: EditorView;
	private currentWidget: HTMLElementWithComponent | null = null;
	private widgetContainer: HTMLElement | null = null;

	constructor(
		view: EditorView,
		private plugin: TaskNotesPlugin
	) {
		this.view = view;
		this.currentFile = this.getFileFromView(view);
		// Inject widget asynchronously to avoid blocking constructor
		this.injectWidget(view);
	}

	update(update: ViewUpdate) {
		// Store the updated view reference
		this.view = update.view;

		// Check if file changed for this specific view
		const newFile = this.getFileFromView(update.view);
		if (newFile !== this.currentFile) {
			this.currentFile = newFile;
			this.injectWidget(update.view);
		}
	}

	destroy() {
		// Clean up the widget and its component
		this.removeWidget();
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

	private removeWidget(): void {
		if (this.currentWidget) {
			// Unload the component
			this.currentWidget.component?.unload();
			// Remove from DOM
			this.currentWidget.remove();
			this.currentWidget = null;
		}
		this.widgetContainer = null;
	}

	private cleanupOrphanedWidgets(view: EditorView): void {
		// Remove any orphaned widgets that might exist from previous instances
		const container = view.dom.closest('.workspace-leaf-content');
		if (container) {
			container.querySelectorAll(`.${CSS_RELATIONSHIPS_WIDGET}`).forEach(el => {
				if (el !== this.currentWidget) {
					const holder = el as HTMLElementWithComponent;
					holder.component?.unload();
					el.remove();
				}
			});
		}
	}

	private async injectWidget(view: EditorView): Promise<void> {
		// Remove any existing widget first
		this.removeWidget();

		// Also clean up any orphaned widgets
		this.cleanupOrphanedWidgets(view);

		try {
			// Don't show widget in table cell editors
			if (this.isTableCellEditor(view)) {
				return;
			}

			// Check if relationships widget is enabled
			if (!this.plugin.settings.showRelationships) {
				return;
			}

			// Only show in live preview mode, not source mode
			if (!view.state.field(editorLivePreviewField)) {
				return;
			}

			// Get the current file
			const file = this.currentFile || this.getFileFromView(view);
			if (!file) {
				return;
			}

			// Show widget in task notes OR project notes (notes referenced by tasks)
			// Get the file's frontmatter to check if it's a task or project
			const metadata = this.plugin.app.metadataCache.getFileCache(file);
			if (!metadata?.frontmatter) {
				// No frontmatter - not a task or project note
				return;
			}

			// Check if this is a task note
			const isTaskNote = this.plugin.cacheManager.isTaskFile(metadata.frontmatter);

			// Check if this is a project note (referenced by tasks via the project property)
			const isProjectNote = this.plugin.dependencyCache?.isFileUsedAsProject(file.path) || false;

			// Only show widget if it's either a task note or a project note
			if (!isTaskNote && !isProjectNote) {
				// Not a task or project note - don't show relationships widget
				return;
			}

			const notePath = file.path;
			const position = this.plugin.settings.relationshipsPosition || "bottom";

			// Find .cm-sizer which contains the scrollable content area
			// This is safer than .cm-content which is managed by CodeMirror
			const targetContainer = view.dom.closest('.markdown-source-view')?.querySelector<HTMLElement>('.cm-sizer');

			if (!targetContainer) {
				return;
			}

			// Create the widget
			const widget = await createRelationshipsWidget(this.plugin, notePath);

			// Add styling to prevent cursor interaction and match decoration appearance
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

			// For "top" position, insert after properties/frontmatter
			// For "bottom" position, insert before backlinks or at end
			if (position === "top") {
				// Try to insert after metadata/properties container
				const metadataContainer = targetContainer.querySelector('.metadata-container');
				if (metadataContainer && metadataContainer.nextSibling) {
					// Insert after properties
					metadataContainer.parentElement?.insertBefore(widget, metadataContainer.nextSibling);
				} else {
					// No properties, insert at beginning
					targetContainer.insertBefore(widget, targetContainer.firstChild);
				}
			} else {
				// Try to insert before backlinks if they exist
				const backlinks = targetContainer.parentElement?.querySelector('.embedded-backlinks');
				if (backlinks) {
					backlinks.parentElement?.insertBefore(widget, backlinks);
				} else {
					// No backlinks, just append to sizer
					targetContainer.appendChild(widget);
				}
			}
		} catch (error) {
			console.error("Error injecting relationships widget:", error);
		}
	}
}

/**
 * Create the relationships decorations extension for live preview mode
 */
export function createRelationshipsDecorations(plugin: TaskNotesPlugin): Extension {
	return ViewPlugin.fromClass(
		class extends RelationshipsDecorationsPlugin {
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
 * Inject relationships widget into reading mode view
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

	// Check if relationships widget is enabled
	if (!plugin.settings.showRelationships) {
		return;
	}

	// Show widget in task notes OR project notes
	const metadata = plugin.app.metadataCache.getFileCache(file);
	if (!metadata?.frontmatter) {
		return;
	}

	const isTaskNote = plugin.cacheManager.isTaskFile(metadata.frontmatter);
	const isProjectNote = plugin.dependencyCache?.isFileUsedAsProject(file.path) || false;

	if (!isTaskNote && !isProjectNote) {
		return;
	}

	// Remove any existing widgets first
	const previewView = view.previewMode;
	const containerEl = previewView.containerEl;
	containerEl.querySelectorAll(`.${CSS_RELATIONSHIPS_WIDGET}`).forEach(el => {
		const holder = el as HTMLElementWithComponent;
		holder.component?.unload();
		el.remove();
	});

	const position = plugin.settings.relationshipsPosition || "bottom";
	const notePath = file.path;

	// Create the widget
	const widget = await createRelationshipsWidget(plugin, notePath);

	// Add styling
	widget.style.display = "block";
	widget.style.pointerEvents = "auto";
	widget.style.userSelect = "none";
	widget.style.border = "1px dashed var(--background-modifier-border)";
	widget.style.borderRadius = "4px";
	widget.style.padding = "8px";
	widget.style.marginTop = "8px";
	widget.style.marginBottom = "8px";

	// Find the markdown-preview-sizer or markdown-preview-section
	const sizer = containerEl.querySelector<HTMLElement>('.markdown-preview-sizer');
	if (!sizer) {
		return;
	}

	// Position the widget
	if (position === "top") {
		// Insert after properties if present, otherwise at the beginning
		const metadataContainer = sizer.querySelector('.metadata-container');
		if (metadataContainer?.nextSibling) {
			sizer.insertBefore(widget, metadataContainer.nextSibling);
		} else {
			sizer.insertBefore(widget, sizer.firstChild);
		}
	} else {
		// Insert before backlinks if present, otherwise at the end
		const backlinks = containerEl.querySelector('.embedded-backlinks');
		if (backlinks?.parentElement) {
			backlinks.parentElement.insertBefore(widget, backlinks);
		} else {
			sizer.appendChild(widget);
		}
	}
}

/**
 * Setup reading mode handlers for relationships widget
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

	// Initial injection for any already-open reading views
	const leaves = plugin.app.workspace.getLeavesOfType('markdown');
	leaves.forEach(leaf => {
		injectReadingModeWidget(leaf, plugin);
	});

	// Return cleanup function
	return () => {
		eventRefs.forEach(ref => plugin.app.workspace.offref(ref));
	};
}
