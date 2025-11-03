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
- Replaced MinimalNativeCache with just-in-time TaskManager for improved reliability
  - Removed complex index synchronization in favor of direct MetadataCache queries
  - Eliminated 7 internal indexes (tasksByDate, tasksByStatus, overdueTasks, etc.)
  - Added minimal DependencyCache for task dependencies and project references only
  - Reduced codebase by 38.5% (736 fewer lines)
  - Zero startup time (no index building required)
  - Always provides fresh, accurate task data from Obsidian's MetadataCache

## Fixed

- (#1022, #684) Fixed tasks randomly disappearing when Smart Connections plugin is enabled
  - Eliminated race condition caused by index synchronization delays
  - TaskManager now reads directly from Obsidian's MetadataCache instead of maintaining separate indexes
  - No more timing-sensitive code that could conflict with other plugins' metadata processing
  - Tasks will always be visible regardless of other plugins' processing times
- (#992) Fixed "Failed to resolve module specifier 'obsidian'" error when moving recurring task instances in calendar
  - Removed unnecessary dynamic imports that were causing module resolution failures
  - Consolidated imports at top of calendar-core.ts module
  - Thanks to @jalooc for reporting this issue

