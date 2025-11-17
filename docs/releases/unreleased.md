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

- (#1120) Fixed status and other properties not respecting user customization throughout the application
  - Comprehensive refactoring of property mapping system to eliminate all hardcoded field names and status values
  - Custom field mappings (e.g., `status: "task-status"`) now work correctly in all views and features
  - Kanban view drag-and-drop now works with ANY property (built-in, user-defined, or custom)
  - Status comparisons now respect user's custom status configurations and `isCompleted` flag
  - Fixed hardcoded status values ("open", "completed", "archived") - now uses user-defined statuses
  - Added type-safe helper methods to FieldMapper API (`isPropertyForField()`, `toUserFields()`)
  - Created shared constants and eliminated code duplication across 14 files
  - Thanks to @kmaustral for reporting

- (#1121) Fixed custom user fields being saved with auto-generated IDs instead of user-defined property keys
  - Modal was incorrectly using `field_<timestamp>` IDs instead of user's configured property names
  - This caused null values in create/edit windows and incorrect frontmatter property names
  - Fixed `createUserFieldByConfig()` method to use `userField.key` instead of `userField.id`
  - Custom fields now save and load correctly with user-defined property names
  - Thanks to @guncav for reporting

