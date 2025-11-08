# NLP Markdown Editor Refactor - Status

## Branch: `feature/nlp-markdown-editor`

## ✅ Phase 1: Complete - Basic Markdown Editor Integration

### What's Working
- ✅ **Markdown editor replaces textarea** in task creation modal NLP field
- ✅ **Ctrl+Enter saves the task** - keyboard shortcut works!
- ✅ **Live preview** updates as you type
- ✅ **Rich markdown editing** with syntax highlighting
- ✅ **Wikilinks work** - can type `[[` to create links
- ✅ **Proper cleanup** on modal close
- ✅ **Fallback to textarea** if editor fails to initialize
- ✅ **CSS styling** - proper height constraints and visual design

### How to Test
1. Build: `npm run build`
2. Reload Obsidian
3. Open task creation modal (with NLP enabled in settings)
4. Type in the NLP field - you should see:
   - Rich markdown formatting
   - Wikilinks work with `[[`
   - Ctrl+Enter saves the task
   - Preview updates below

## ⚠️ Phase 2: Pending - Autocomplete System

### What's NOT Working Yet
- ❌ **`@` context autocomplete** - old system expects textarea
- ❌ **`#` tag autocomplete** - old system expects textarea
- ❌ **`+` project autocomplete** - old system expects textarea
- ❌ **Status trigger autocomplete** - old system expects textarea

### Why Autocomplete Doesn't Work
The current `NLPSuggest` class (lines 57-542 in `TaskCreationModal.ts`):
- Extends `AbstractInputSuggest<HTMLInputElement>`
- Directly accesses `textarea.selectionStart`, `textarea.value`
- Uses Obsidian's suggestion popup system
- **Only works with standard HTML inputs/textareas**

The markdown editor uses:
- CodeMirror's state/transaction system
- Different API for cursor position and text content
- Needs CodeMirror's autocomplete extensions

### Next Steps for Phase 2

#### Option A: Disable Old Autocomplete (Quick Fix)
Simply don't initialize `NLPSuggest` for markdown editor:
```typescript
// In createNaturalLanguageInput()
// Comment out or conditionally skip:
// this.nlpSuggest = new NLPSuggest(this.app, this.nlInput, this.plugin);
```

Users still get rich markdown editing but lose @, #, + autocomplete.

#### Option B: Implement CodeMirror Autocomplete (Full Solution)
Create new autocomplete system using `@codemirror/autocomplete`:

1. **Create `NLPCodeMirrorAutocomplete.ts`**
   - Import `autocompletion`, `CompletionContext` from `@codemirror/autocomplete`
   - Detect trigger characters (`@`, `#`, `+`, status trigger)
   - Query cache manager for suggestions
   - Return formatted completion options

2. **Add to `EmbeddableMarkdownEditor`**
   - Accept autocomplete extension as optional parameter
   - Include in `buildLocalExtensions()`

3. **Wire up in `TaskCreationModal`**
   - Create NLP autocomplete instance
   - Pass to markdown editor constructor

**Estimated effort**: 4-6 hours for full implementation

## Files Modified

### Created
- `src/editor/EmbeddableMarkdownEditor.ts` (Phase 1 - POC)

### Modified
- `src/modals/TaskCreationModal.ts`
  - Added `EmbeddableMarkdownEditor` import
  - Replaced textarea with markdown editor in `createNaturalLanguageInput()`
  - Added `getNLPInputValue()` helper method
  - Added `onClose()` cleanup
- `styles/task-modal.css`
  - Added `.nl-markdown-editor` styling
  - Height: 80-200px with scrolling
  - Focus state styling

## Decisions to Make

### Should we proceed with Phase 2?

**Option 1**: Ship Phase 1 as-is
- ✅ Rich markdown editing
- ✅ Ctrl+Enter shortcut
- ❌ No @ #  + autocomplete
- **Users can manually type** @context #tag +[[project]]

**Option 2**: Complete Phase 2
- ✅ Everything from Phase 1
- ✅ @ # + autocomplete working
- ⏱️ Requires additional 4-6 hours of development
- 🐛 Higher risk of bugs (new autocomplete system)

**Option 3**: Hybrid - Add setting to toggle
- Let users choose between:
  - Old textarea with autocomplete
  - New markdown editor without autocomplete (yet)
- Ship Phase 1 now, Phase 2 later

## Testing Checklist (Phase 1)

- [ ] NLP markdown editor appears in task creation modal
- [ ] Can type markdown text with formatting
- [ ] Can create wikilinks with `[[`
- [ ] Ctrl+Enter saves the task
- [ ] Preview updates in real-time
- [ ] Modal closes cleanly without errors
- [ ] Fallback textarea works if editor fails
- [ ] Focus is set to editor on modal open

## Known Limitations

1. **Autocomplete not functional** (Phase 2 required)
2. **Plugin extensions not included** - other plugins' CM extensions won't load
3. **Internal API dependency** - may break in future Obsidian versions
4. **No read/write mode toggle** - always editable

## Credits

- **Fevol** - Original embeddable markdown editor implementation
- **mgmeyers** - Kanban plugin inspiration

## Next Action

**DECISION NEEDED**: Should we continue to Phase 2 (autocomplete), or test Phase 1 first?
