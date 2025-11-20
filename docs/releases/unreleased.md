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

- (#1177) Bases views now anchor recurring completion and calendar navigation to the right date
  - Recurring completion from Bases Task List/Kanban uses the task's scheduled/due date instead of "today" (fixes complete_instances)
  - Bases calendar navigation and property-based events use UTC anchors to avoid previous-day jumps
  - Thanks to @nslee123 for flagging the issue
- Bases calendar navigation now respects UTC-anchored dates to avoid landing on the previous day
  - Corrected all-day end date calculation to prevent off-by-one spans
  - Added regression test for the UTC anchor behavior
  - Thanks to the KaCii for [flagging the issue](https://discord.com/channels/686053708261228577/1433165116702199880/1439757826380660767)

## Changed

- Refactored plugin styling to better align with Obsidian's native UI conventions
  - Replaced all `cursor: pointer` with `cursor: var(--cursor)` (100+ instances) to follow Obsidian's cursor convention
  - Removed forced `border: none; box-shadow: none` rules that were fighting against Obsidian's native button styling
  - Scoped custom `.tn-btn` button system to settings modal only (`.mod-settings`), allowing Obsidian's native button styles to work elsewhere
  - Thanks to @kepano for guidance
