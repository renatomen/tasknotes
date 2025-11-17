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

- (#1120) Fixed custom field mappings not being respected throughout the application
  - Property customizations (e.g., `status: "task-status"`) now work correctly in all views
  - Kanban drag-and-drop now works with any property type (built-in, user-defined, or custom)
  - Thanks to @kmaustral for reporting

- (#1121) Fixed custom user fields being saved with auto-generated IDs instead of user-defined property keys
  - Custom fields now save and load correctly with their configured property names
  - Thanks to @guncav for reporting

