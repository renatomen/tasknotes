# Views

TaskNotes provides multiple views for managing tasks and tracking productivity. All task-focused views operate as `.base` files located in the `TaskNotes/Views/` directory and require Obsidian's Bases core plugin to be enabled.

[← Back to Documentation](index.md)

## Bases Plugin Requirement

All task-focused views in TaskNotes v4 use Obsidian's **Bases core plugin**. This is an official Obsidian plugin built directly into the application, not a community plugin.

**To enable Bases:**
1. Open Settings → Core Plugins
2. Enable "Bases"
3. TaskNotes view commands and ribbon icons will open `.base` files from `TaskNotes/Views/`

Bases views use YAML configuration in `.base` files to define filtering, sorting, and grouping behavior. View configurations from TaskNotes v3 must be manually converted to `.base` file format.

## Task-Focused Views

All task-focused views are implemented as Bases views using `.base` files.

- **[Task List View](views/task-list.md)**: Displays tasks in a list format. Supports filtering, sorting, and grouping via YAML configuration in the `.base` file.
- **[Kanban View](views/kanban-view.md)**: Displays tasks as cards organized by status. Supports optional swimlane layout for additional organization.
- **[Calendar Views](views/calendar-views.md)**: Calendar-based task visualization with multiple view modes (month, week, day, year, list). Supports drag-and-drop scheduling, time-blocking, and OAuth calendars.
- **[Agenda View](views/agenda-view.md)**: A preconfigured calendar list view opened via its own command. It uses the same `.base` infrastructure as the calendar but defaults to `listWeek` mode for fast daily and weekly reviews.
- **[MiniCalendar View](views/calendar-views.md#mini-calendar-view)**: Month-based calendar showing which days have tasks. Includes fuzzy search and keyboard navigation for quick date navigation.

## Productivity-Focused Views

These views support time management and work tracking.

- **[Pomodoro View](views/pomodoro-view.md)**: Pomodoro timer for focused work sessions.
- **[Pomodoro Stats View](views/pomodoro-view.md#pomodoro-stats-view)**: Displays analytics and visualizations of completed Pomodoro sessions and work patterns.
