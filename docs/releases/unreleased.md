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

- Kanban column reordering via drag and drop
  - Drag column headers to reorder columns
  - Column order is saved per grouping property
  - Visual feedback during drag operations
- Mini calendar enhancements (in progress)
  - Week numbers column
  - Heat map intensity visualization
  - Note preview tooltips on hover
  - Multi-select mode for date ranges

## Fixed

- Fixed titleInput undefined error in TaskEditModal
  - Edit modals now properly store titleInput reference for focus management
  - Prevents console errors when opening task edit modal
- Fixed double modal opening when clicking tasks in TaskListView
  - Removed duplicate task card handling from container click listener
  - Container listener now only handles group header clicks
  - Task cards properly handle their own click events
- Fixed group collapse/expand functionality in TaskListView
  - Re-registered click event listener for group headers using Component API
  - Groups can now be properly collapsed and expanded
- Fixed stuck dragover state when dragging tasks in kanban view
  - Improved dragleave detection using bounding box checks
  - Added dragend handlers for cleanup
  - Columns no longer stay highlighted after task drop
- Fixed config loading race condition in KanbanView and CalendarView
  - Config is now properly loaded in onload() lifecycle method
  - Views wait for config before rendering options
- Fixed MiniCalendarView to use direct Bases API like other views
  - Consistent use of Component lifecycle methods
  - Proper cleanup in onunload()

## Changed

- Refactored Bases views to use Component lifecycle properly
  - Views now extend Component and use onload()/onunload()
  - Automatic cleanup of event listeners via Component.registerDomEvent()
  - Improved state management and ephemeral state handling
- Simplified TaskCard interface
  - Removed unused options (showCheckbox, showArchiveButton, groupByDate)
  - Cleaner API surface
- Improved development experience
  - Converted ESLint errors to warnings for non-blocking development
  - Fixed various linting issues and unused imports

