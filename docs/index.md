# TaskNotes Documentation

TaskNotes is a task and note management plugin for Obsidian that follows the "one note per task" principle. Task information is stored in YAML frontmatter, keeping your data in plain text files that work with any text editor.

## How It Works

The plugin treats each task as a separate note with structured metadata in the frontmatter. Tasks have structured data for organization while the note content remains flexible.

TaskNotes uses Obsidian's metadata cache for compatibility with other plugins. Since task data lives in YAML frontmatter, you can add custom fields and modify property names to match your vault's existing structure.

The main views (Task List, Kanban, and Calendar) are built using the Bases core plugin and stored as `.base` files in the `TaskNotes/Views/` directory. Bases is an official Obsidian core plugin that must be enabled from Settings → Core Plugins. View configuration is managed through YAML, and filtering is handled directly within each view's configuration rather than through a separate FilterBar component.

The plugin does not enforce a specific task management methodology.

## Requirements

- **Obsidian**: Version 1.10.1 or later (TaskNotes v4 relies on the Bases public API introduced in 1.10.1)
- **Bases Core Plugin**: Must be enabled from Settings → Core Plugins (required for Task List, Kanban, Calendar, Agenda, and MiniCalendar views)

## Features

Each task supports properties including title, status, priority, due dates, contexts, tags, time estimates, recurrence patterns, and reminders. Custom fields extend this structure.

Time tracking records work sessions in each task's frontmatter. The Pomodoro timer logs timed work sessions to tasks.

The plugin provides multiple views. The Task List view handles filtering and organizing tasks. The Kanban board includes optional swimlane layouts for grouping. The Calendar view offers month, week, day, year, and list modes. The Agenda command opens the calendar in list mode for daily or weekly reviews. The MiniCalendar provides fuzzy search and keyboard navigation. The Task List, Kanban, Calendar, Agenda, and MiniCalendar views are implemented as Bases views. The Pomodoro timer is a standalone component.

Inline task widgets display task information in the editor. Convert existing checkbox tasks or create tasks using natural language processing that parses plain text into structured tasks. Task modal fields are configurable.

Calendar integration supports ICS feeds and OAuth authentication for Google Calendar and Microsoft Outlook. The Calendar view supports time-blocking and drag-to-reschedule.

## Why One Note Per Task?

Each task can contain meeting notes, research, brainstorming, or other content alongside the task itself.

Tasks can reference other notes, appear in graph view, and show up in backlinks.

This approach provides structured metadata for filtering and organizing while keeping note content flexible.

## Plain Text Advantages

Task data lives in standard Markdown files with YAML frontmatter. You can edit tasks with any text editor, process them with scripts, or migrate them to other systems.

YAML frontmatter is human-readable. Other Obsidian plugins can work with your task data. You can extend the structure by adding fields.

Tasks work with version control systems like Git. The plugin uses Obsidian's metadata cache.

## Getting Started

1. **Install and Enable**: Install the plugin from the Obsidian Community Plugins directory
2. **Create Your First Task**: Use the "Create Task" command or convert an existing checkbox
3. **Explore Views**: Try the different view types
4. **Configure Settings**: Customize task properties, views, and integrations

The plugin includes default settings that can be customized. Use the navigation menu to explore features, configuration options, and capabilities.
