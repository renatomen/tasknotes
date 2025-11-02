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

- Added context menus for time entries and ICS events in calendar
  - Time entries: Right-click shows task context menu, left-click opens time entry editor modal
  - ICS/Google/Microsoft Calendar events: Right-click shows ICS event context menu with options to show details, create task/note, link note, and copy info
- Added calendar icon to ICS event titles for better visual distinction
- Added hover tooltips for timeblocks in calendar views

## Changed

- Refactored calendar modules to use ES6 imports instead of lazy require() calls
  - Removed all dynamic require() calls from calendar-core.ts and calendar-view.ts
  - Consolidated all imports at module top level
  - Improves code maintainability, makes dependencies explicit, and follows modern TypeScript best practices
- Time entry events now show task context menu on right-click (previously had no context menu)

## Fixed

- (#992) Fixed "Failed to resolve module specifier 'obsidian'" error when moving recurring task instances in calendar
  - Removed unnecessary dynamic imports that were causing module resolution failures
  - Consolidated imports at top of calendar-core.ts module
  - Thanks to @jalooc for reporting this issue

