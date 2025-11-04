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
- (#new) Added MiniCalendar view for Bases integration
  - Monthly calendar grid with dot indicators on days with notes
  - Configurable date property (file.ctime, note.dateCreated, etc.)
  - Fuzzy selector modal for selecting notes on clicked days
  - UTC anchor compliance for timezone-independent date handling
  - Ctrl+click (or Cmd+click on Mac) on any day opens/creates daily note
  - Ctrl+Enter keyboard shortcut for accessibility

## Changed

- Refactored Bases integration to use public API and trust pre-sorted data
  - Migrated all three views (Task List, Kanban, Calendar) to clean class-based architecture
  - Removed legacy view files and ~500 lines of redundant sorting/grouping logic
  - Introduced BasesDataAdapter, PropertyMappingService, and BasesViewBase abstractions
  - Trusts Bases plugin to provide pre-sorted and pre-grouped data via public API
  - Reduced code duplication by 40% while maintaining full feature parity
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
- Completed internationalization with 100% translation coverage across all supported languages
  - Added 90 missing translation keys to English base
  - Completed 829 translations across 6 languages (German, Spanish, French, Japanese, Russian, Chinese)
  - All locales now have complete coverage (1745/1745 keys)
  - Improved translation quality for migration system, calendar settings, statistics, ICS events, and filter components
- Migrated to i18n-state-manager CLI tool for translation management
  - Replaced custom scripts with more robust i18n-state-manager package
  - Added i18n-state.config.json for project-specific patterns
  - New features: find-unused, check-duplicates, improved stale detection
  - Hash-based state tracking and ripgrep-based scanning for performance
- Bases view templates now generate dynamically based on user settings
  - Task filters adapt to user's task identification method (tag or property)
  - Property ordering reflects defaultVisibleProperties setting
  - Uses correct YAML object notation for Bases filters
  - Maintains backward compatibility with legacy static templates
- Updated Bases CalendarView to show TaskNotes in property-based events
  - Tasks can now be visualized on calendar via any date property (dateCreated, scheduled, due, etc.)
  - Previously all TaskNotes were filtered out from property-based events

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
- Fixed task dependencies not displaying on task cards
  - TaskManager now properly calculates isBlocked and isBlocking flags from dependency data
  - Added missing property extractors and renderers in TaskCard for all dependency-related fields
  - Dependency information now shows correctly in Bases views, task note widgets, and other views
  - Shows "Blocked (n)" and "Blocking (n)" pills, plus detailed task links
- Fixed Bases property mapping for user-configured field names
  - PropertyMappingService now correctly strips prefixes and applies FieldMapper transformations
  - Example: User configures "state" → "status", Bases provides "note.state", now correctly maps to "status"
  - Ensures TaskCard properly recognizes and renders user-configured properties
- Fixed Bases views not respecting user-configured visible properties
  - Now prioritizes Bases 1.10.0+ public API config.getOrder() method
  - Removed reliance on internal API paths that no longer work
  - Filters out blocked/blocking properties when using defaults (only shown when explicitly requested via blockedBy)
- Fixed MiniCalendar UTC anchoring for consistent timezone-independent date handling
- Fixed DateValue conversion in BasesDataAdapter
  - DateValue objects have {date: Date, time: boolean} structure
  - Now properly checks for value.date instanceof Date before legacy conversion methods
  - Fixes property-based events in CalendarView

