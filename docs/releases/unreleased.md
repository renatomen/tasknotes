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

- (#1123) Fixed relationships widget only displaying on task notes, not project notes
  - Widget now appears on both task notes and project notes (notes referenced via the project property)
  - Project notes now show all tasks that reference them in the relationships view
  - Thanks to @dblinnikov for reporting

- Fixed time entries not showing in calendar view for tasks without scheduled or due dates
  - Time entries now display for all tasks in the Bases calendar view (as long as the task passes the view's filters)
  - Previously, time entries were hidden if their parent task had no scheduled or due date

- (#1091) Fixed task card and relationships widgets appearing inside footnote editors
  - Widgets now properly detect and exclude footnote popovers and inline editors
  - Similar to the previous fix for table cell editors
  - Thanks to @3zra47 for reporting

- (#1086) Fixed calendar "+more" popover showing white text on white background in dark mode
  - Added proper dark mode styling for the FullCalendar popover
  - Popover now uses theme-appropriate colors for background, text, and borders
  - Thanks to @same774 for reporting

