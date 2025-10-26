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

## Added

- (#937), (#956) Added optional setting to hide identification tags in task cards
  - New "Hide identification tags in task cards" setting (only visible when using tag-based identification)
  - Hides exact matches (e.g., `#task`) and hierarchical children (e.g., `#task/project`, `#task/work/urgent`)
  - Reduces visual clutter while keeping tags in frontmatter for organizational purposes
  - Backward compatible - disabled by default
  - Thanks to @renatomen for implementing this feature and @edakimling for reporting

- (#911) Added custom field suggestion filtering
  - New `autosuggestFilter` field to `UserMappedField` interface allows filtering suggestions by current filter context
  - Added collapsible filter section in settings with visual indicator
  - Comprehensive test coverage for custom field filtering feature
  - Thanks to @renatomen for this enhancement

## Fixed

- (#969), (#967) Fixed Bases Kanban layout not displaying correctly when no groupBy is configured
  - All tasks were appearing in a single "None" column
  - Columns now appear in the order defined in TaskNotes settings (not alphabetical)
  - Detects invalid Bases grouping and falls back to status-based grouping
  - Tasks are properly distributed across status columns
  - Thanks to @mweichert for the fix and @PacoTaco2, @abuhammer for reporting

