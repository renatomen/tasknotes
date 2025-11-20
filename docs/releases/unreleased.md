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

- Bases views now anchor recurring completion and calendar navigation to the right date
  - Recurring completion from Bases Task List/Kanban uses the task's scheduled/due date instead of "today" (fixes complete_instances)
  - Bases calendar navigation and property-based events use UTC anchors to avoid previous-day jumps
  - All-day end date math is UTC-anchored to prevent off-by-one spans
  - Added regression tests for Bases completion and calendar UTC anchoring
  - Thanks to the reporter for flagging the issue

## Changed

- Refactored plugin styling to better align with Obsidian's native UI conventions
  - Replaced all `cursor: pointer` with `cursor: var(--cursor)` (100+ instances) to follow Obsidian's cursor convention
  - Removed forced `border: none; box-shadow: none` rules that were fighting against Obsidian's native button styling
  - Scoped custom `.tn-btn` button system to settings modal only (`.mod-settings`), allowing Obsidian's native button styles to work elsewhere
  - Thanks to @kepano for guidance
