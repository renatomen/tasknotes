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

When a change has user-facing documentation, include a canonical tasknotes.dev link:

```
## Added

- Added materialized occurrence notes for recurring tasks. See [Recurring Tasks](https://tasknotes.dev/features/recurring-tasks/#materialized-occurrence-notes) for setup and calendar behavior.
```

-->

## Fixed

- (#2255) Notes with an in-note task card no longer jump while scrolling in reading mode. The card is now restored only after scrolling settles instead of being re-injected every frame against Obsidian's virtualised reading view. Thanks to @logicelf for the detailed diagnosis.
- (#2256) Kanban swimlane order now follows the view's sort configuration again: with a formula or property sort applied, the swimlane holding the top-sorted task floats to the top of the board as it did before the swimlane ordering option was introduced. Thanks to @tsweezy for reporting this.
- (#2222) The TaskNotes settings tab bar now wraps to a second line instead of clipping the Integrations tab beside the documentation link on narrow settings panes. Thanks to @nextstitch and @YongcaiHuang for reporting this.