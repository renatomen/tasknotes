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
	TFile,
	editorInfoField,
	editorLivePreviewField,
	MarkdownRenderer,
} from "obsidian";
import { Extension, RangeSetBuilder } from "@codemirror/state";

import TaskNotesPlugin from "../main";

export class RelationshipsWidget extends WidgetType {
	constructor(
		private plugin: TaskNotesPlugin,
		private notePath: string
	) {
		super();
	}

	// Override eq to ensure widget updates when note path changes
	eq(other: RelationshipsWidget): boolean {
		return this.notePath === other.notePath;
	}

	toDOM(view: EditorView): HTMLElement {
		const container = document.createElement("div");
		container.className = "tasknotes-plugin relationships-widget cm-widget-cursor-fix";

		container.setAttribute("contenteditable", "false");
		container.setAttribute("spellcheck", "false");
		container.setAttribute("data-widget-type", "relationships");

		// Create container for embedded Bases view
		const basesContainer = container.createEl("div", {
			cls: "relationships__bases-container",
		});

		// Asynchronously load and render the Bases view
		this.renderBasesView(basesContainer);

		return container;
	}

	private async renderBasesView(container: HTMLElement): Promise<void> {
		try {
			// Get the Bases file path from settings
			const basesFilePath = this.plugin.settings.commandFileMapping['relationships'];
			if (!basesFilePath) {
				container.createEl("div", {
					text: "Relationships view not configured",
					cls: "relationships__error",
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
			console.error("Error rendering Bases view in relationships widget:", error);
			container.createEl("div", {
				text: "Failed to load relationships view",
				cls: "relationships__error",
			});
		}
	}
}

class RelationshipsDecorationsPlugin implements PluginValue {
	decorations: DecorationSet;
	private currentFile: TFile | null = null;
	private view: EditorView;

	constructor(
		view: EditorView,
		private plugin: TaskNotesPlugin
	) {
		this.view = view;
		this.decorations = this.buildDecorations(view);
	}

	update(update: ViewUpdate) {
		// Store the updated view reference
		this.view = update.view;

		// Rebuild decorations on document changes or viewport changes
		if (update.docChanged || update.viewportChanged) {
			this.decorations = this.buildDecorations(update.view);
		}

		// Check if file changed for this specific view
		const newFile = this.getFileFromView(update.view);
		if (newFile !== this.currentFile) {
			this.currentFile = newFile;
			this.decorations = this.buildDecorations(update.view);
		}
	}

	destroy() {
		// Nothing to clean up - Bases handles all data updates
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

			// Check if relationships widget is enabled
			if (!this.plugin.settings.showRelationships) {
				return builder.finish();
			}

			// Only show in live preview mode, not source mode
			if (!view.state.field(editorLivePreviewField)) {
				return builder.finish();
			}

			const doc = view.state.doc;

			// Ensure document has content
			if (doc.length === 0) {
				return builder.finish();
			}

			// Get the current file
			const file = this.currentFile || this.getFileFromView(view);
			if (!file) {
				console.warn("RelationshipsDecorations: Cannot create widget without file context");
				return builder.finish();
			}

			// Only show widget in task notes
			// Get the file's frontmatter to check if it's a task
			const metadata = this.plugin.app.metadataCache.getFileCache(file);
			if (!metadata?.frontmatter) {
				// No frontmatter - not a task note
				return builder.finish();
			}

			// Use the TaskManager's isTaskFile method to check if this is a task
			if (!this.plugin.cacheManager.isTaskFile(metadata.frontmatter)) {
				// Not a task note - don't show relationships widget
				return builder.finish();
			}

			// Find insertion position after frontmatter/properties
			let insertPos = this.findInsertionPosition(view, doc);

			// Ensure position is valid
			if (insertPos < 0 || insertPos > doc.length) {
				insertPos = 0;
			}

			const notePath = file.path;

			const widget = Decoration.widget({
				widget: new RelationshipsWidget(
					this.plugin,
					notePath
				),
				side: 1,
			});

			builder.add(insertPos, insertPos, widget);
		} catch (error) {
			console.error("Error building relationships decorations:", error);
		}

		return builder.finish();
	}

	private findInsertionPosition(view: EditorView, doc: any): number {
		if (doc.lines === 0) return 0;

		const position = this.plugin.settings.relationshipsPosition || "bottom";

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

const relationshipsDecorationsSpec: PluginSpec<RelationshipsDecorationsPlugin> = {
	decorations: (plugin: RelationshipsDecorationsPlugin) => plugin.decorations,
};

/**
 * Create the relationships decorations extension
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
		},
		relationshipsDecorationsSpec
	);
}
