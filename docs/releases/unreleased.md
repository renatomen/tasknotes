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

## Changed

- Refactored plugin styling to better align with Obsidian's native UI conventions
  - Replaced all `cursor: pointer` with `cursor: var(--cursor)` (100+ instances) to follow Obsidian's cursor convention
  - Removed forced `border: none; box-shadow: none` rules that were fighting against Obsidian's native button styling
  - Scoped custom `.tn-btn` button system to settings modal only (`.mod-settings`), allowing Obsidian's native button styles to work elsewhere
  - Added `background: transparent` to mini-calendar buttons to match Obsidian's native `.text-icon-button` styling
  - Removed unused deprecated classes (`.tasknotes-card`, `.task-content`, `.task-title`, `.task-metadata-line`, `.status-dot`, `.recurring-indicator`)
  - Removed unnecessary `will-change` properties for better performance
  - Consolidated duplicate color-mix patterns to use existing CSS variables
  - Cleaned up obsolete CSS comments and empty style blocks
  - Reduced CSS from 18,370 to 18,234 lines (~137 lines removed)
  - Active settings tab now uses theme's interactive accent color for better visibility
  - These changes make the plugin more cohesive with Obsidian's UI and easier to maintain

