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

- (#1168) Fixed mini calendar stealing focus every few seconds when pinned to sidebar
  - Calendar now only auto-focuses on initial render, not on every data update
  - Keyboard navigation still works correctly through click interactions and tab focus
  - Thanks to @DearHaruHaru for reporting
- (#1161, #1162) Fixed "unexpected scalar" YAML parsing error in generated tasks-default.base template
  - Changed nested quotes in "Not Blocked" filter from double to single quotes
  - Thanks to @benschifman and @InterstellarRaccoon for reporting, @GarrettKaupp for identifying the fix

## Changed

- Updated task modal UI to use native Obsidian patterns for better theme compatibility
  - Thanks to feedback from @kepano

