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

- (#2212) Fixed TaskNotes settings sections appearing offscreen or blank on
  Obsidian 1.13 desktop. Thanks to @RafaQNunes for reporting this, and to
  @m4to-3pe and @matthewrishii for confirming it remained in 4.12.2.
- (#2213) Runtime plugin-data updates now avoid writing when Obsidian cannot
  safely read an existing TaskNotes `data.json`, preventing calendar sync,
  Pomodoro, ICS, or auto-archive state writes from replacing saved settings.
  Thanks to @3zra47 for the follow-up details and file-history evidence.
- (#2216) Fixed updated default Kanban Bases grouping every task into the
  `None` column when grouping by status. The generated Kanban templates now use
  the real status property, and existing Kanban files using `task.status` keep
  grouping from TaskNotes task data. Thanks to @Esvorst for reporting this.
