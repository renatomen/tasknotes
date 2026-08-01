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

## Security

- Calendar OAuth credentials and account tokens are now stored in Obsidian Secret Storage instead of TaskNotes' `data.json`, with automatic migration for existing connections. See [Calendar Integration](https://tasknotes.dev/features/calendar-integration/).
  - Thanks to @mcuste for the contribution

## Added

- (#2126, #2134) Added optional filename templates for materialized recurring
  occurrence notes, with explicit date, ISO week, month, year, and month-name
  variables plus per-parent overrides. Existing naming remains unchanged until a
  template is configured. See [Recurring Tasks](https://tasknotes.dev/features/recurring-tasks/#occurrence-filenames).
  Thanks to @raphaelfaouakhiri for reporting and implementing this.
- (#2105) Added `{{projectFolder}}` and `{{projectFolders}}` folder template
  variables for storing tasks alongside linked project notes. See
  [Template Variables](https://tasknotes.dev/features/template-variables/).
  Thanks to @carypruitt for this contribution.

## Fixed

- (#2166) Fixed Task List views configured to start collapsed so the first
  chevron click expands only the selected group instead of expanding every
  other group. Thanks to @renatomen for reporting and fixing this.
- (#2064, #2066) Recurring tasks now advance correctly after their next
  scheduled date is manually adjusted, preserving due-date offsets and times
  without jumping back to an earlier occurrence. Thanks to @chmac for reporting
  and fixing this.
- (#2081, #2103) Kept task card and relationships widgets visible in reading mode
  when Obsidian scroll or preview updates remove their DOM, and refreshed visible
  widgets promptly after metadata changes. Thanks to @mukhozhuk for reporting and
  debugging this and @martin-forge for fixing it.

## Changed

- Generated TaskNotes type contracts now include configured natural-language
  capture triggers, allowing compatible clients to offer the same field
  suggestions.
- Rebuilt the TaskNotes documentation as a v5-ready, source-generated site with
  reorganized navigation, full-text search, mobile and accessibility
  improvements, and references generated from the current commands, settings,
  compatibility metadata, HTTP routes, and default Bases. Added practical
  guides for adopting TaskNotes in an existing vault, mobile use, custom Bases,
  and backup and recovery. See the
  [TaskNotes documentation](https://tasknotes.dev/).

## Fixed

- (#2018) Fixed **Hide empty columns** in Kanban views with swimlanes so columns
  with no visible tasks are hidden while pinned columns remain. Thanks to
  @scottTomaszewski for reporting and fixing this.
- Fixed recurring all-day ICS subscription events keeping the original end date
  on later instances, which could cause calendar list views to show events under
  the wrong day. Thanks to @abbiefalls90.
- (#2033) Fixed the project folder badge on task cards so, when expandable
  subtasks are enabled, it expands or collapses inline subtasks instead of
  showing an unavailable-action notice. Thanks to @abbiefalls90.
- (#2040, #2041) Stopped newly created tasks from filling the Google Calendar
  retry queue when calendar export is disabled. Thanks to @chmac for reporting
  and fixing this.
- (#2046, #2051) The date and time picker now focuses the natural-language input
  when it is enabled, making keyboard-driven quick actions ready for immediate
  typing. Thanks to @DevOps-Toast for reporting this and @ther12k for fixing it.
- (#2125, #2129) Materialized recurring occurrence notes now record the date
  they were actually completed, while the parent recurring task continues to
  track the occurrence date. Thanks to @raphaelfaouakhiri for reporting and
  fixing this.
