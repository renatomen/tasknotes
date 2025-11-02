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
  - Added runtime sanitization in calendar with safe defaults (00:00:00, 24:00:00, 08:00:00)
  - Prevents "Cannot read properties of null (reading 'years')" error from FullCalendar
  - Thanks to @userhandle for reporting and help debugging
```

-->

## Fixed

- (#1022) Fixed tasks randomly disappearing from views and not being recognized
  - Tasks would appear initially but disappear after a few seconds, especially during long sessions
  - Restarting Obsidian or using "Refresh Cache" would only temporarily fix the issue
  - Thanks to @seepage87 for reporting and @alejandrospoz for help debugging

- (#953) Fixed non-task notes incorrectly appearing as subtasks in views
  - Notes with Parent or project properties but no task tag/property no longer show up as tasks
  - Views now update correctly when task tags are removed from files
  - Improved performance for large vaults by optimizing cache invalidation
  - Thanks to @renatomen for reporting and submitting PR #955
