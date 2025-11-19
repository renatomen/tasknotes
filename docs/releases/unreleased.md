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

- (#1161, #1162) Fixed "unexpected scalar" YAML parsing error in generated tasks-default.base template
  - Changed nested quotes in "Not Blocked" filter from double to single quotes
  - Thanks to @benschifman and @InterstellarRaccoon for reporting, @GarrettKaupp for identifying the fix

## Changed

- Updated task modal UI to use native Obsidian patterns for better theme compatibility
  - Task creation and edit modals now use Obsidian's native `modal-button-container` class
  - Replaced custom button styling with standard Obsidian button classes (`mod-cta`, `mod-warning`)
  - Added `mod-tasknotes` modifier class to modals for scoped styling
  - Buttons now automatically follow user's theme styling including all theme plugins
  - Improved button layout using CSS flexbox instead of manual spacer elements
  - Based on feedback from Kepano (Obsidian CEO) to use existing modal constructors for native appearance

