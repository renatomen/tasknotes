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

## Added

- (#361) Added completion-based recurrence support with `recurrence_anchor` field
  - Tasks can now recur based on completion date instead of scheduled date
  - Set `recurrence_anchor: completion` in task frontmatter to enable this behavior
  - When completing a recurring task, the next occurrence will be scheduled relative to the completion date
  - Defaults to `scheduled` (original behavior) if not specified
  - Useful for tasks like "Exercise weekly" where you want the next occurrence 7 days after you actually complete it, not 7 days after it was scheduled
  - Thanks to @luciolebrillante for the original feature request, and @jhedlund, @nschenone, @BryanWall, @realJohnDoe, and @kazerniel for additional input and interest

## Fixed

- (#1097) Fixed custom properties and formulas not displaying in Bases views
  - Updated TaskCard to use Bases API's getValue() method for formulas and custom note properties
  - Formulas now work correctly using `formula.NAME` syntax
  - Custom note properties now work correctly using `note.PROPERTY` syntax
  - Thanks to @cathywu for reporting

- (#1099) Fixed issues with default Bases file creation
  - Fixed double-prefix bug in relationships template that generated invalid filter expressions like `note.note.projects`
  - Fixed race condition where files created during plugin load wouldn't appear in file explorer
  - Default Bases files now generate with correct property paths and appear reliably in the file explorer
  - Thanks to @kmaustral for reporting

- (#1110) Fixed open recurring tasks appearing crossed out in Tasks view
  - Removed stale `selectedDate` property that was never updated in v4
  - Tasks view now uses fresh UTC-anchored "today" for correct recurring task completion status
  - Fixes issue where tasks completed yesterday would appear crossed out today for users in positive UTC offset timezones
  - Also fixed KanbanView to use UTC-anchored dates for consistency
  - Thanks to @kmaustral for reporting

