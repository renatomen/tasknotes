# Proof of Concept: Embeddable Markdown Editor in Task Edit Modal

## Overview

This proof of concept demonstrates the integration of Obsidian's native markdown editor into the TaskNotes task edit modal, specifically for the "details" section.

## What Was Implemented

### 1. EmbeddableMarkdownEditor Class
**File**: `src/editor/EmbeddableMarkdownEditor.ts`

A reusable wrapper around Obsidian's internal `ScrollableMarkdownEditor` that provides:
- Full CodeMirror editing capabilities
- Live preview markdown rendering
- Syntax highlighting
- Wikilink autocomplete
- All standard Obsidian editing features

**Based on**: Fevol's implementation (https://gist.github.com/Fevol/caa478ce303e69eabede7b12b2323838)

**Key Features**:
- Configurable placeholder text
- Event handlers for `onChange`, `onEnter`, `onEscape`, `onSubmit`, `onBlur`, `onPaste`
- Proper cleanup/destroy methods
- Fallback handling if initialization fails

### 2. TaskEditModal Integration
**File**: `src/modals/TaskEditModal.ts`

Modified the edit modal to:
- Import the `EmbeddableMarkdownEditor` class
- Override `createDetailsSection()` method to create the markdown editor instead of a plain textarea
- Add proper lifecycle management (destroy editor on modal close)
- Include fallback to textarea if editor creation fails

### 3. CSS Styling
**File**: `styles/task-modal.css`

Added styling for:
- Editor container with borders and rounded corners
- Min/max height constraints (200px - 400px)
- Scrollable content area
- Placeholder text styling
- Proper padding and font sizing

## How It Works

1. **When editing a task**: The edit modal now shows a full markdown editor for the details field
2. **Editor features**: Users can:
   - Write markdown with live preview
   - Create wikilinks with `[[` syntax
   - Use all standard Obsidian editing shortcuts
   - See syntax highlighting
   - Copy/paste rich content
3. **Data handling**: Content changes are automatically synced to the `this.details` field
4. **Cleanup**: Editor is properly destroyed when the modal closes

## Technical Details

### Internal API Usage

⚠️ **Important**: This implementation uses Obsidian's internal APIs that are not officially exported:
- `ScrollableMarkdownEditor`
- `WidgetEditorView`
- `app.embedRegistry.embedByExtension.md()`

These APIs may change in future Obsidian versions without notice.

### Compatibility

- Requires `monkey-around` package (already in dependencies)
- Tested with Obsidian 1.5.8+
- Uses `@ts-ignore` comments for internal API access

### Limitations

1. **Plugin extensions not included**: Other plugins' CodeMirror extensions won't automatically load in this editor
2. **Internal API dependency**: Future Obsidian updates may break this functionality
3. **No read mode**: The editor is always in edit mode (no toggle between reading/editing)

## Testing

To test this implementation:

1. Build the plugin: `npm run build`
2. Reload Obsidian
3. Open any task's edit modal
4. The "Details" section should now show a full markdown editor
5. Try:
   - Writing markdown text
   - Creating wikilinks with `[[`
   - Using keyboard shortcuts
   - Pasting content
   - Scrolling in the editor area

## Future Enhancements

Possible improvements:
1. Add toggle button to switch between simple textarea and rich editor
2. Make the editor height adjustable/resizable
3. Add option in settings to enable/disable rich editor
4. Include specific plugin extensions (e.g., vim mode, syntax highlighting themes)
5. Add keyboard shortcut hints/documentation

## Files Modified

- `src/editor/EmbeddableMarkdownEditor.ts` (NEW)
- `src/modals/TaskEditModal.ts` (MODIFIED)
- `styles/task-modal.css` (MODIFIED)

## Credits

Implementation based on work by:
- **Fevol** - Original embeddable markdown editor implementation
- **mgmeyers** - Original concept from Kanban plugin

## License

MIT (consistent with TaskNotes plugin license)
