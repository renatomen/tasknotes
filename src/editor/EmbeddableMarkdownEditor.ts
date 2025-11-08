import {
	App,
	Constructor,
	Keymap,
	Scope,
	TFile,
	WorkspaceLeaf,
} from "obsidian";
import { EditorSelection, Extension, Prec } from "@codemirror/state";
import { EditorView, keymap, ViewUpdate, Decoration, DecorationSet, WidgetType } from "@codemirror/view";
import { around } from "monkey-around";

/**
 * Custom multi-line animated placeholder widget with typewriter effect
 */
class PlaceholderWidget extends WidgetType {
	constructor(private text: string) {
		super();
	}

	toDOM() {
		const container = document.createElement("div");
		container.className = "cm-placeholder cm-placeholder-multiline";

		// Split into lines and create separate divs for proper line rendering
		const lines = this.text.split('\n');

		lines.forEach((line, index) => {
			const lineDiv = document.createElement("div");
			lineDiv.className = "cm-placeholder-line";

			// Add typing animation with staggered delays per line
			const delay = index * 1000; // 1 second delay between lines
			const duration = line.length * 50; // 50ms per character

			lineDiv.style.setProperty('--typing-duration', `${duration}ms`);
			lineDiv.style.setProperty('--typing-delay', `${delay}ms`);
			lineDiv.style.setProperty('--char-count', line.length.toString());

			lineDiv.textContent = line || '\u00A0'; // Use non-breaking space for empty lines
			container.appendChild(lineDiv);
		});

		return container;
	}

	eq(other: PlaceholderWidget) {
		return this.text === other.text;
	}

	ignoreEvent() {
		return true;
	}
}

// Internal Obsidian type - not exported in official API
interface ScrollableMarkdownEditor {
	app: App;
	containerEl: HTMLElement;
	editor: any;
	editorEl: HTMLElement;
	activeCM: any;
	owner: any;
	_loaded: boolean;
	set(value: string): void;
	onUpdate(update: ViewUpdate, changed: boolean): void;
	buildLocalExtensions(): Extension[];
	destroy(): void;
	unload(): void;
}

// Internal Obsidian type - not exported in official API
interface WidgetEditorView {
	editable: boolean;
	editMode: any;
	showEditor(): void;
	unload(): void;
}

/**
 * Resolves the internal ScrollableMarkdownEditor prototype from Obsidian
 * @param app - The Obsidian App instance
 * @returns The ScrollableMarkdownEditor constructor
 */
function resolveEditorPrototype(app: App): Constructor<ScrollableMarkdownEditor> {
	// @ts-ignore - Using internal API
	const widgetEditorView = app.embedRegistry.embedByExtension.md(
		{ app, containerEl: document.createElement("div") },
		null as unknown as TFile,
		""
	) as WidgetEditorView;

	widgetEditorView.editable = true;
	widgetEditorView.showEditor();

	const MarkdownEditor = Object.getPrototypeOf(
		Object.getPrototypeOf(widgetEditorView.editMode!)
	);

	widgetEditorView.unload();
	return MarkdownEditor.constructor as Constructor<ScrollableMarkdownEditor>;
}

export interface MarkdownEditorProps {
	/** Initial cursor position */
	cursorLocation?: { anchor: number; head: number };
	/** Initial text content */
	value?: string;
	/** CSS class to add to editor element */
	cls?: string;
	/** Placeholder text when empty */
	placeholder?: string;
	/** Handler for Enter key (return false to use default behavior) */
	onEnter?: (editor: EmbeddableMarkdownEditor, mod: boolean, shift: boolean) => boolean;
	/** Handler for Escape key */
	onEscape?: (editor: EmbeddableMarkdownEditor) => void;
	/** Handler for Tab key (return false to use default behavior) */
	onTab?: (editor: EmbeddableMarkdownEditor) => boolean;
	/** Handler for Ctrl/Cmd+Enter */
	onSubmit?: (editor: EmbeddableMarkdownEditor) => void;
	/** Handler for blur event */
	onBlur?: (editor: EmbeddableMarkdownEditor) => void;
	/** Handler for paste event */
	onPaste?: (e: ClipboardEvent, editor: EmbeddableMarkdownEditor) => void;
	/** Handler for content changes */
	onChange?: (value: string, update: ViewUpdate) => void;
	/** Additional CodeMirror extensions (e.g., autocomplete) */
	extensions?: Extension[];
}

const defaultProperties: Required<MarkdownEditorProps> = {
	cursorLocation: undefined as any, // Don't set cursor by default
	value: "",
	cls: "",
	placeholder: "",
	onEnter: () => false,
	onEscape: () => {},
	onTab: () => false,
	onSubmit: () => {},
	onBlur: () => {},
	onPaste: () => {},
	onChange: () => {},
	extensions: [],
};

/**
 * An embeddable markdown editor that provides full CodeMirror editing capabilities
 * within any container element. Based on Fevol's implementation.
 *
 * @example
 * ```typescript
 * const editor = new EmbeddableMarkdownEditor(app, containerEl, {
 *   value: "Initial content",
 *   placeholder: "Enter text...",
 *   onChange: (value) => console.log(value)
 * });
 *
 * // Later, clean up
 * editor.destroy();
 * ```
 */
export class EmbeddableMarkdownEditor extends resolveEditorPrototype(app) {
	options: Required<MarkdownEditorProps>;
	initial_value: string;
	scope: Scope;
	private uninstaller?: () => void;

	constructor(app: App, container: HTMLElement, options: Partial<MarkdownEditorProps> = {}) {
		// @ts-ignore - Calling internal constructor
		super(app, container, {
			app,
			onMarkdownScroll: () => {},
			getMode: () => "source",
		});

		this.options = { ...defaultProperties, ...options };
		this.initial_value = this.options.value;
		this.scope = new Scope(this.app.scope);

		// Override Mod+Enter to prevent default workspace behavior
		this.scope.register(["Mod"], "Enter", (e, ctx) => true);

		// @ts-ignore - Setting internal properties
		this.owner.editMode = this;
		// @ts-ignore
		this.owner.editor = this.editor;

		// IMPORTANT: From Obsidian 1.5.8+, must explicitly set value
		this.set(options.value || "");

		// Prevent workspace from stealing focus when editing
		this.uninstaller = around(this.app.workspace, {
			// @ts-ignore
			setActiveLeaf: (
				oldMethod: (leaf: WorkspaceLeaf, params?: { focus?: boolean }) => void
			) => {
				return function (this: any, leaf: WorkspaceLeaf, params?: { focus?: boolean }) {
					// @ts-ignore
					if (!this.activeCM?.hasFocus) {
						oldMethod.call(this, leaf, params);
					}
				};
			},
		});

		// Set up blur handler
		if (this.options.onBlur !== defaultProperties.onBlur) {
			// @ts-ignore
			this.editor.cm.contentDOM.addEventListener("blur", () => {
				this.app.keymap.popScope(this.scope);
				// @ts-ignore
				if (this._loaded) this.options.onBlur(this);
			});
		}

		// Set up focus handler
		// @ts-ignore
		this.editor.cm.contentDOM.addEventListener("focusin", (e) => {
			this.app.keymap.pushScope(this.scope);
			// @ts-ignore
			this.app.workspace.activeEditor = this.owner;
		});

		// Add custom CSS class if provided
		if (options.cls) {
			// @ts-ignore
			this.editorEl.classList.add(options.cls);
		}

		// Set initial cursor position
		if (options.cursorLocation) {
			// @ts-ignore
			this.editor.cm.dispatch({
				selection: EditorSelection.range(
					options.cursorLocation.anchor,
					options.cursorLocation.head
				),
			});
		}
	}

	/**
	 * Get the current text content of the editor
	 */
	get value(): string {
		// @ts-ignore
		return this.editor.cm.state.doc.toString();
	}

	/**
	 * Set the text content of the editor
	 */
	setValue(value: string): void {
		this.set(value);
	}

	/**
	 * Override to handle content changes
	 */
	onUpdate(update: ViewUpdate, changed: boolean): void {
		// @ts-ignore
		super.onUpdate(update, changed);
		if (changed) {
			this.options.onChange(this.value, update);
		}
	}

	/**
	 * Build CodeMirror extensions for the editor
	 * This is where we add keyboard handlers and other editor features
	 */
	buildLocalExtensions(): Extension[] {
		// @ts-ignore
		const extensions = super.buildLocalExtensions();

		// Add placeholder if specified - custom multi-line widget avoids cursor issues
		if (this.options.placeholder) {
			extensions.push(
				EditorView.decorations.compute(["doc"], (state) => {
					if (state.doc.length > 0) return Decoration.none;

					const widget = Decoration.widget({
						widget: new PlaceholderWidget(this.options.placeholder),
						side: 1,
					});

					return Decoration.set([widget.range(0)]);
				})
			);
		}

		// Add paste handler
		extensions.push(
			EditorView.domEventHandlers({
				paste: (event) => {
					this.options.onPaste(event, this);
				},
			})
		);

		// Add keyboard handlers with highest precedence
		extensions.push(
			Prec.highest(
				keymap.of([
					{
						key: "Enter",
						run: (cm) => this.options.onEnter(this, false, false),
						shift: (cm) => this.options.onEnter(this, false, true),
					},
					{
						key: "Mod-Enter",
						run: (cm) => {
							this.options.onSubmit(this);
							return true;
						},
					},
					{
						key: "Escape",
						run: (cm) => {
							this.options.onEscape(this);
							return true;
						},
					},
					{
						key: "Tab",
						run: (cm) => {
							return this.options.onTab(this);
						},
					},
				])
			)
		);

		// Add any custom extensions (e.g., autocomplete)
		if (this.options.extensions && this.options.extensions.length > 0) {
			extensions.push(...this.options.extensions);
		}

		return extensions;
	}

	/**
	 * Clean up the editor and remove all event listeners
	 */
	destroy(): void {
		// @ts-ignore
		if (this._loaded) {
			this.unload();
		}

		this.app.keymap.popScope(this.scope);
		// @ts-ignore
		this.app.workspace.activeEditor = null;

		// Call uninstaller to remove monkey-patching
		if (this.uninstaller) {
			this.uninstaller();
			this.uninstaller = undefined;
		}

		this.containerEl.empty();
		// @ts-ignore
		super.destroy();
	}

	/**
	 * Obsidian lifecycle method
	 */
	onunload(): void {
		// @ts-ignore
		super.onunload();
		this.destroy();
	}
}
