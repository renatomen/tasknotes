# TaskNotes v4 Beta

> **⚠️ Beta Release**
>
> This beta introduces the Bases view system. You may encounter issues. Report problems on [GitHub Issues](https://github.com/callumalpass/tasknotes/issues).
>
> **Backup your vault before upgrading.**

## What's New in v4

TaskNotes v4 migrates all views to the Bases system.

### Breaking Changes

- **Minimum Obsidian version: 1.10.1**
- **View commands now use Bases files** - Ribbon icons and command palette commands (Calendar, Kanban, Tasks, Agenda, Project Subtasks) now open `.base` files in your vault
- **Automatic migration** - Saved views convert to `.base` files on first launch. Original settings are preserved.

## Added

### OAuth Calendar Integration

- Google Calendar and Microsoft Outlook integration via OAuth 2.0
  - View and sync calendar events in Bases calendar
  - Events sync every 15 minutes
  - Requires creating your own OAuth application (approximately 15 minutes)
  - See [Calendar Setup Guide](https://callumalpass.github.io/tasknotes/calendar-setup)

### Time Entry Editor Modal

- Dedicated interface for managing time entries
  - Alt-drag on Bases calendar to create time entries
  - View total tracked time per task
  - Edit and delete time entries
  - Access via Task Action Palette (Alt/Opt + Enter)

### Kanban Swimlane Layout

- Horizontal swimlane grouping option for Bases Kanban
  - Group tasks by status, priority, or other fields
  - Hide empty columns
  - Configurable column widths
  - Improved drag-and-drop in swimlane mode

### View Migration

- Saved filter views convert to `.base` files on first launch
- Original settings preserved
- View files created in `TaskNotes/Views/`

## Changed

### View System Architecture

- All views now use Bases architecture
  - Calendar, Kanban, Tasks, Agenda, and Project Subtasks are `.base` files
  - Views stored in `TaskNotes/Views/`
  - Keyboard shortcuts and ribbon icons map to `.base` files
  - Configure file paths in Settings → Integrations → Bases Integration

### Calendar

- Control which calendar sources display
  - Toggle Google Calendar, Microsoft Calendar, and ICS events independently
  - Configurable list view with custom day count (2-10 days)
  - Improved timezone handling for recurring events

### Settings

- Reorganized settings tabs
  - OAuth calendar settings in Integrations tab
  - Updated help text

## Fixed

- (#843) Fixed task tag being added when "Identify tasks by" is set to "Property"
  - TaskCreationModal, TaskEditModal, and InstantTaskConvertService now respect taskIdentificationMethod setting
  - Thanks to @jack2game
- Fixed dark mode calendar borders
- Fixed Bases Kanban column ordering - Thanks to @mweichert
- Fixed state management bug in FilterSettingsComponent
- Fixed timezone handling for recurring events

## Migration Guide

### First Launch

1. Saved filter views convert to `.base` files in `TaskNotes/Views/`
2. Ribbon and command palette commands open `.base` files
3. Review Settings → Integrations → Bases Integration to customize view file paths

### Calendar Integration (Optional)

1. Go to Settings → Integrations → OAuth Calendar Integration
2. Follow the [Calendar Setup Guide](https://callumalpass.github.io/tasknotes/calendar-setup)
3. Create OAuth applications with Google and/or Microsoft (approximately 15 minutes)
4. Enter Client ID and Secret in calendar cards
5. Click Connect

## Known Limitations

- Quick OAuth setup is disabled - only advanced setup (your own credentials) is available
- Migration is one-way - downgrading to v3 may require manual reconfiguration
- OAuth setup requires creating applications with Google/Microsoft

## Feedback

Report issues on [GitHub](https://github.com/callumalpass/tasknotes/issues). Include:

- Obsidian version
- Steps to reproduce
- Console errors (Ctrl/Cmd + Shift + I)
- Whether issue occurs after migration or fresh install

