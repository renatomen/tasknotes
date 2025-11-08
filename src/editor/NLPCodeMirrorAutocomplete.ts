import {
	autocompletion,
	CompletionContext,
	CompletionResult,
	Completion,
	completionKeymap,
	acceptCompletion,
	moveCompletionSelection,
	startCompletion,
	closeCompletion
} from "@codemirror/autocomplete";
import { Extension, Prec } from "@codemirror/state";
import { keymap } from "@codemirror/view";
import TaskNotesPlugin from "../main";
import { StatusSuggestionService } from "../services/StatusSuggestionService";

/**
 * CodeMirror autocomplete extension for NLP triggers (@, +, status)
 *
 * Note: # tag autocomplete uses Obsidian's native suggester
 * Note: [[ wikilink autocomplete uses Obsidian's native suggester
 *
 * Replaces the old NLPSuggest system for use with EmbeddableMarkdownEditor
 */
export function createNLPAutocomplete(plugin: TaskNotesPlugin): Extension[] {
	const autocomplete = autocompletion({
		override: [
			async (context: CompletionContext): Promise<CompletionResult | null> => {
				const statusTrigger = (plugin.settings.statusSuggestionTrigger || "").trim();

				// Get text before cursor
				const line = context.state.doc.lineAt(context.pos);
				const textBeforeCursor = line.text.slice(0, context.pos - line.from);

				// Helper: check if index is at a word boundary
				const isBoundary = (index: number, text: string) => {
					if (index === -1) return false;
					if (index === 0) return true;
					const prev = text[index - 1];
					return !/\w/.test(prev);
				};

				// Find trigger positions
				const lastAtIndex = textBeforeCursor.lastIndexOf("@");
				const lastPlusIndex = textBeforeCursor.lastIndexOf("+");
				const lastStatusIndex = statusTrigger ? textBeforeCursor.lastIndexOf(statusTrigger) : -1;

				// Determine which trigger is active (most recent valid one)
				// Note: We don't handle # - Obsidian's native tag suggester handles that
				const candidates: Array<{ type: string; index: number; triggerLength: number }> = [
					{ type: "@", index: lastAtIndex, triggerLength: 1 },
					{ type: "+", index: lastPlusIndex, triggerLength: 1 },
					{ type: "status", index: lastStatusIndex, triggerLength: statusTrigger.length },
				].filter((c) => isBoundary(c.index, textBeforeCursor));

				if (candidates.length === 0) return null;

				// Sort by position (most recent first)
				candidates.sort((a, b) => b.index - a.index);
				const active = candidates[0];

				// Extract query after trigger
				const queryStart = active.index + active.triggerLength;
				const query = textBeforeCursor.slice(queryStart);

				// Don't suggest if there's already a completed wikilink for '+'
				if (active.type === "+" && /^\[\[[^\]]*\]\]/.test(query)) {
					return null;
				}

				// Don't suggest if there's a space (except for '+' which allows multi-word)
				if (
					(active.type === "@" || active.type === "status") &&
					(query.includes(" ") || query.includes("\n"))
				) {
					return null;
				}

				// Get suggestions based on trigger type
				let options: Completion[] = [];
				const from = line.from + active.index + active.triggerLength;
				const to = context.pos;

				if (active.type === "@") {
					// Context suggestions
					const contexts = plugin.cacheManager.getAllContexts();
					options = contexts
						.filter((ctx) => ctx && typeof ctx === "string")
						.filter((ctx) => ctx.toLowerCase().includes(query.toLowerCase()))
						.slice(0, 10)
						.map((ctx) => ({
							label: ctx,
							apply: ctx + " ",
							type: "text",
							info: "Context",
						}));
				} else if (active.type === "status") {
					// Status suggestions
					const statusService = new StatusSuggestionService(
						plugin.settings.customStatuses,
						plugin.settings.customPriorities,
						plugin.settings.nlpDefaultToScheduled,
						plugin.settings.nlpLanguage
					);
					const statusSuggestions = statusService.getStatusSuggestions(
						query,
						plugin.settings.customStatuses || [],
						10
					);
					options = statusSuggestions.map((s) => ({
						label: s.display,
						apply: s.value + " ",
						type: "text",
						info: "Status",
					}));
				} else if (active.type === "+") {
					// Project suggestions - use FileSuggestHelper for advanced matching
					try {
						const { FileSuggestHelper } = await import("../suggest/FileSuggestHelper");

						const excluded = (plugin.settings.excludedFolders || "")
							.split(",")
							.map((s) => s.trim())
							.filter(Boolean);

						const list = await FileSuggestHelper.suggest(
							plugin,
							query,
							20,
							plugin.settings.projectAutosuggest
						);

						// Filter out excluded folders
						const filteredList = list.filter((item) => {
							const file = plugin.app.vault
								.getMarkdownFiles()
								.find((f) => f.basename === item.insertText);
							if (!file) return true;
							return !excluded.some((ex) => file.path.startsWith(ex));
						});

						options = filteredList.map((item) => {
							// Get display name from item
							const displayText = item.displayText || item.insertText;
							const insertText = item.insertText;

							return {
								label: displayText,
								apply: `[[${insertText}]] `,
								type: "text",
								info: "Project",
							};
						});
					} catch (error) {
						console.error("Error getting project suggestions:", error);
						return null;
					}
				}

				// Return null if no options (let native suggesters handle their triggers)
				if (options.length === 0) {
					return null;
				}

				return {
					from,
					to,
					options,
					validFor: /^[\w\s-]*$/,
				};
			},
		],
		// Show autocomplete immediately when typing after trigger
		activateOnTyping: true,
		// Close on blur
		closeOnBlur: true,
		// Max options to show
		maxRenderedOptions: 10,
	});

	// Add explicit keyboard navigation for autocomplete with high priority
	// This ensures our autocomplete takes precedence over Obsidian's native ones
	const autocompleteKeymap = Prec.high(keymap.of([
		{ key: "ArrowDown", run: moveCompletionSelection(true) },
		{ key: "ArrowUp", run: moveCompletionSelection(false) },
		{ key: "Enter", run: acceptCompletion },
		{ key: "Tab", run: acceptCompletion },
		{ key: "Escape", run: closeCompletion },
	]));

	return [Prec.high(autocomplete), autocompleteKeymap];
}
