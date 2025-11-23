# TaskNotes - Unreleased

<!--

**Added** for new features.
**Changed** for changes in existing functionality.
**Deprecated** for soon-to-be removed features.
**Removed** for now removed features.
**Fixed** for any bug fixes.
**Security** in case of vulnerabilities.

Always acknowledge contributors and those who report issues.

Example:

```
## Fixed

- (#768) Fixed calendar view appearing empty in week and day views due to invalid time configuration values
  - Added time validation in settings UI with proper error messages and debouncing
  - Prevents "Cannot read properties of null (reading 'years')" error from FullCalendar
  - Thanks to @userhandle for reporting and help debugging
```

-->

## Fixed

- (#1200) Fixed kanban drag & drop not updating task properties correctly
	- Dragging tasks to different columns now properly triggers business logic (completedDate, auto-archive, webhooks)
	- Previously, kanban updates bypassed `updateProperty` and directly modified frontmatter
	- Thanks to @tvoklov for the fix
- (#1203) Fixed autocomplete dropdown being clipped inside NLP field boundaries
	- Configure CodeMirror tooltips to render in document.body instead of constrained editor container
	- Prevents suggestion dropdown from being hidden when it extends beyond the NLP field height
	- Thanks to @Andrei-Ioda for reporting
- (#1172) Fixed task lists and checkboxes rendering incorrectly in task details editor
	- Remove padding-left override on `.cm-line` to allow CodeMirror decorations (checkboxes, indentation) to render properly
	- Content padding is now handled by `.cm-content` while `.cm-line` uses natural spacing
	- Thanks to @nightroman for reporting
- Fixed relationships widget not appearing on project notes without frontmatter
	- Widget now correctly shows on any note referenced as a project by tasks, regardless of whether the note has frontmatter
- Fixed task card and relationships widgets not appearing when opening notes in source mode
	- Removed live preview mode restriction to allow widgets to render in both source and live preview modes
- (#901) Fixed calendar view toolbar buttons overflowing on narrow screens
    - Added `flex-wrap: wrap` to calendar header toolbar to allow buttons to wrap to multiple lines
    - Thanks to @RumiaKitinari for reporting
- (#1193), (#1194), (#1185) Fixed new calendar views not respecting user's default calendar settings
	- Previously, new Bases calendar views used hardcoded inline defaults instead of user-configured preferences
	- Calendar view initialization now correctly uses `plugin.settings.calendarViewSettings` as the fallback
	- Thanks @ki5ck, @minchinweb and @ThamirysOlv for reporting 
