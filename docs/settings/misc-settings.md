# Misc Settings

These settings control various plugin features and display options that don't fit into other categories.

## Saved Views button position

Choose where the Saved Views button appears in the view header for Task List, Agenda, Kanban, and Calendar Bases views:

- **Right (default)**: Saved Views sits after the other header controls
- **Left**: Saved Views is placed before the other controls

This setting only changes alignment—the button still opens the same Saved Views picker.


## Status Bar

**Show tracked tasks in status bar** - Display currently tracked tasks (with active time tracking) in the status bar at the bottom of the app. This provides a quick visual indicator of which tasks are currently being tracked without needing to open the TaskNotes views.

## Relationships Widget

**Show relationships widget** - Display the unified widget that surfaces subtasks, parent projects, and blocking relationships in the editor. Disable this if you prefer to open the `relationships.base` file in a separate pane instead of embedding it in notes.

## Task Display

**Hide completed tasks from overdue** - Control whether completed tasks appear as overdue in the agenda view. When enabled (default), completed tasks will not appear in the "Overdue" section of the agenda view, even if their due or scheduled date has passed. This setting affects task grouping and overdue detection throughout the plugin, helping keep overdue lists focused on actionable items.


## Subtask Chevron Position

Configure where the expand/collapse chevron appears on project task cards and inside the Relationships widget.

- Right (default): The chevron appears on the right-hand side and shows on hover.
- Left (match group chevrons): The chevron appears on the left-hand side, always visible, matching group chevrons.

Demo:

![Left subtask chevron](../assets/left-task-subtask-chevron.gif)

## Performance Settings

**Disable note indexing** - Disable indexing and caching of non-task notes to improve performance in large vaults. Note: This will disable the Notes view and notes display in the Agenda view. Requires plugin restart to take effect.

This setting is useful for large vaults where performance may be impacted by indexing many notes. When enabled, TaskNotes will only index and track task files, which can significantly improve performance but will disable some features that depend on note content.
