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

- **Bases "New" button integration**
  - Clicking "New" in Bases views will open TaskNotes creation modal (when API support is available)
  - Automatically extracts default values from Bases (dates, properties, etc.)
  - Supports all TaskNotes properties including user-defined custom fields
  - Respects custom field mappings via FieldMapper
  - View automatically refreshes after task creation
  - Note: Requires Obsidian API 1.10.2+ (currently in development)
- **Configurable task modal fields** (major feature)
  - New "Modal Fields" settings tab for complete control over task creation and edit modals
  - Configure which fields appear in creation vs edit modals independently
  - Drag-and-drop reordering of fields within groups (metadata, organization, dependencies, custom)
  - Enable/disable individual fields (including core fields like contexts, tags, time estimate)
  - Organize fields into collapsible groups for better UX
  - Automatic migration of existing user-defined fields
  - Title and details fields support visibility toggling (ordering fixed for consistency)
- **Rich markdown editor for NLP task creation** (major feature)
  - Replaced plain textarea with full CodeMirror markdown editor
  - Live preview, syntax highlighting, and wikilink support
  - Ctrl/Cmd+Enter keyboard shortcut to save task
  - Esc/Tab keyboard shortcuts for modal control
  - Animated typewriter placeholder effect for multi-line NLP field
- **Customizable NLP triggers with autocomplete**
  - Configure custom trigger characters/strings for each property type (tags, contexts, projects, status, priority)
  - Supports user-defined field triggers
  - CodeMirror-based autocomplete with keyboard navigation (arrow keys, Enter, Tab)
  - Obsidian-styled autocomplete UI matching native theme
  - Quote support for multi-word values in user fields
  - Native tag suggester integration when using # trigger
- **Inline task link overlay enhancements**
  - Configurable visible properties for inline task cards
  - PropertySelectorModal for selecting which properties to display
  - Improved layout: title prioritized, horizontal scrolling for metadata
  - Real-time updates when task data changes
- **New utility services**
  - `TriggerConfigService` - manages NLP trigger configurations
  - `PropertySelectorModal` - reusable multi-select property picker
  - Property helpers for consistent property handling across views
- Kanban column reordering via drag and drop
  - Drag column headers to reorder columns
  - Column order is saved per grouping property
  - Visual feedback during drag operations
- Mini calendar enhancements (in progress)
  - Week numbers column
  - Heat map intensity visualization
  - Note preview tooltips on hover
  - Multi-select mode for date ranges
- **Unified Relationships widget**
  - Consolidated project subtasks, task dependencies, and blocking relationships into a single dynamic widget
  - Four automatic tabs: Subtasks (Kanban), Projects (List), Blocked By (List), Blocking (Kanban)
  - Tabs automatically show/hide based on available relationship data
  - Bases views handle all data updates reactively - no manual refresh needed
  - Single configuration setting: show/hide and position (top/bottom)
  - Significantly reduced code complexity (430 fewer lines)

## Fixed

- **Bases Calendar view options now working correctly**
  - Fixed "Highlight today" toggle not applying - now properly adds/removes CSS class when toggled
  - Fixed calendar view type (month/week/day/etc) not being saved when changed via calendar buttons
  - View type is now persisted when users click month/week/day buttons in the calendar UI
- (#1050) Task modal no longer adds unwanted empty contexts and projects arrays
  - FieldMapper now checks if arrays are empty before writing to frontmatter
  - Prevents pollution of frontmatter with unnecessary empty fields
  - Also fixed blockedBy from writing empty arrays
  - Thanks to @nightroman for reporting
- **NLP editor placeholder and cursor issues**
  - Fixed cursor appearing across all placeholder lines in multi-line NLP editor
  - Fixed placeholder line-height to reduce visual spacing
  - Fixed placeholder line rendering and animation timing
  - Fixed placeholder animation positioning and scroll behavior
  - Fixed cursor bug with multi-line placeholder when using custom single-line placeholder
- **Inline task link overlay fixes**
  - Fixed layout prioritization: title now prioritized over metadata
  - Added horizontal scrolling for metadata to prevent overflow
  - Fixed real-time update listeners for task data changes
- **NLP autocomplete improvements**
  - Fixed native tag suggester interaction (# trigger)
  - Fixed autocomplete priority to override native suggesters when needed
  - Fixed keyboard navigation (arrow keys, Enter, Tab) in autocomplete
  - Fixed internal padding in NLP markdown editor
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

- **NLP system overhaul**
  - Replaced `StatusSuggestionService` wrapper with direct `NaturalLanguageParser` usage
  - Consolidated trigger configuration into unified `TriggerConfigService`
  - Enhanced `NaturalLanguageParser` with full trigger and user field support
  - Removed custom # tag autocomplete in favor of Obsidian's native tag suggester (when using # trigger)
- **Task card and editor improvements**
  - Simplified `TaskCard` interface - removed unused options (showCheckbox, showArchiveButton, groupByDate)
  - Refactored `TaskLinkWidget` to use unified `TaskCard` component for consistency
  - Added support for inline vs. block layout modes in task cards
  - Improved task card BEM CSS with better styling for inline mode
- **Settings UI enhancements**
  - NLP triggers now configurable through Settings > Features tab
  - Added settings for inline task card visible properties
  - Improved appearance tab with property selector integration
  - Better organization of NLP-related settings
- Refactored Bases views to use Component lifecycle properly
  - Views now extend Component and use onload()/onunload()
  - Automatic cleanup of event listeners via Component.registerDomEvent()
  - Improved state management and ephemeral state handling
- Improved development experience
  - Converted ESLint errors to warnings for non-blocking development
  - Fixed various linting issues and unused imports

## Removed

- Removed `StatusSuggestionService` (functionality consolidated into `NaturalLanguageParser`)

## Breaking Changes

- **Relationships widget settings consolidated** (automatic migration)
  - Old settings removed: `showProjectSubtasks`, `projectSubtasksPosition`, `showTaskDependencies`, `taskDependenciesPosition`
  - New unified settings: `showRelationships`, `relationshipsPosition`
  - Widget now appears on ALL notes (tasks, projects, regular notes) - Bases filtering controls which tabs are visible
  - **Migration**: Existing users will see the new unified widget automatically. If you had project subtasks enabled, relationships widget will be enabled by default
  - **Bases file change**: The command mapping changed from `'project-subtasks': 'TaskNotes/Views/project-subtasks.base'` to `'relationships': 'TaskNotes/Views/relationships.base'`
  - Run "Create Default Files" in Settings > General to create the new `relationships.base` file

