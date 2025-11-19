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

- Added "Not Blocked" view to default task list template
  - Shows incomplete tasks that are ready to work on (not blocked by incomplete dependencies)
  - Filter dynamically uses configured completion statuses
  - Uses Bases `list.filter()` to check completion status of each blocking task

## Fixed

- (#1139, #1141) Fixed relationships widget not appearing in project notes
  - Project references are now resolved to full file paths when indexing
  - Uses Obsidian's link resolution API to handle wikilinks, markdown links, and relative paths
  - Restores v3.x behavior where subtasks appear in parent project notes
  - Thanks to @jhedlund, @n1njaznutz, and @luckb0x for reporting and testing
- Fixed dependency blocking status to be status-aware
  - "Blocked (x)" pill now only appears when tasks have **incomplete** blocking dependencies
  - Tasks with all completed blocking dependencies no longer show as blocked
  - DependencyCache now checks actual status of blocking tasks, not just existence
  - Unified blocking status computation in DependencyCache for consistency
- Fixed cache invalidation bug causing blocking/blocked pills to disappear when editing tasks
  - When a task is modified, only forward dependencies are cleared (stored in its frontmatter)
  - Reverse dependencies are preserved (stored in other tasks' frontmatter)
  - Prevents loss of blocking/blocked relationships when editing a blocking task

## Changed

- Moved default base templates documentation to `docs/views/`
  - Location: `docs/views/default-base-templates.md`
  - Added cross-references from views.md, task-list.md, and filtering-and-views.md
  - Updated code comments to reference new documentation path
