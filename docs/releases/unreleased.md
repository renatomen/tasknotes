# TaskNotes v4 Beta

> **⚠️ Beta Release Notice**
>
> This is a beta release of TaskNotes v4 introducing the Bases view system. While extensively tested, you may encounter edge cases or issues. Please report any problems on [GitHub Issues](https://github.com/callumalpass/tasknotes/issues).
>
> **Backup your vault before upgrading!**

## What's New in v4

TaskNotes v4 represents a major architectural shift, migrating all views to the new Bases system. This provides better performance, more flexibility, and a foundation for future enhancements.

### Breaking Changes

- **Minimum Obsidian version: 1.10.1** - Please update Obsidian before installing this beta
- **View commands now use Bases files** - Ribbon icons and command palette commands (Calendar, Kanban, Tasks, Agenda, Project Subtasks) now open managed `.base` files in your vault instead of the legacy view system
- **Automatic migration** - Your existing saved views will be automatically converted to `.base` files on first launch. The original settings are preserved as backup.

## Added

### OAuth Calendar Integration

- **Google Calendar and Microsoft Outlook integration** via OAuth 2.0
  - Connect your calendars directly to TaskNotes
  - View and sync calendar events in the Bases calendar view
  - Events sync automatically every 15 minutes
  - Advanced setup requires creating your own OAuth application (15-minute setup)
  - See [Calendar Setup Guide](https://callumalpass.github.io/tasknotes/calendar-setup) for detailed instructions

### Enhanced Time Tracking

- **Time Entry Editor Modal** - New dedicated interface for managing time entries
  - Alt-drag on the Bases calendar to create time entries
  - View total tracked time per task
  - Edit and delete existing time entries
  - Access via Task Action Palette (Alt/Opt + Enter on any task)

### Kanban Improvements

- **Swimlane Layout** - New horizontal swimlane grouping option for Bases Kanban
  - Group tasks by status, priority, or other fields horizontally
  - Hide empty columns to reduce clutter
  - Configurable column widths for better layout control
  - Improved drag-and-drop behavior in swimlane mode

### View Migration

- **Automatic View Converter** - Seamlessly migrate from v3 to v4
  - Saved filter views automatically convert to `.base` files
  - Original settings preserved for reference
  - View files created in `TaskNotes/Views/` folder
  - No manual intervention required

## Changed

### View System Architecture

- **Unified Bases System** - All views now use the Bases architecture
  - Calendar, Kanban, Tasks, Agenda, and Project Subtasks are now `.base` files
  - Views are stored as files in your vault (`TaskNotes/Views/`)
  - Keyboard shortcuts and ribbon icons map to specific `.base` files
  - Configure file paths in Settings → Integrations → Bases Integration

### Calendar Enhancements

- **Provider Toggles** - Control which calendar sources display in Bases calendar
  - Toggle Google Calendar, Microsoft Calendar, and ICS events independently
  - Configurable list view with custom day count (2-10 days)
  - Improved timezone handling for recurring events
  - Better visual distinction between event types

### Settings Organization

- **Reorganized Settings Tabs** for improved navigation
  - Clearer categorization of integration options
  - OAuth calendar settings consolidated in Integrations tab
  - Better help text and setup guidance

## Fixed

- (#843) Fixed task tag being added to notes even when "Identify tasks by" is set to "Property" instead of "Tag"
  - Updated TaskCreationModal and TaskEditModal to respect taskIdentificationMethod setting
  - Fixed InstantTaskConvertService to conditionally add task tag based on identification method
  - When using property-based identification, the task tag is no longer automatically added to tags
  - Thanks to @jack2game for reporting this issue
- Dark mode calendars no longer show bright white borders - overridden FullCalendar's default border colors
- Fixed Bases Kanban column ordering to respect settings configuration - Thanks to @mweichert
- Fixed state management bug in FilterSettingsComponent that could cause UI inconsistencies
- Improved timezone handling for recurring events in calendar views

## Migration Guide

### First Launch

On first launch after upgrading to v4:

1. **View Migration** - Your saved filter views will be automatically converted to `.base` files in `TaskNotes/Views/`
2. **Command Mapping** - Ribbon and command palette commands will open the new `.base` files
3. **Settings Check** - Review Settings → Integrations → Bases Integration to customize view file paths if needed

### Calendar Integration (Optional)

To use the new OAuth calendar integration:

1. Go to Settings → Integrations → OAuth Calendar Integration
2. Follow the [Calendar Setup Guide](https://callumalpass.github.io/tasknotes/calendar-setup)
3. Create OAuth applications with Google and/or Microsoft (15 minutes)
4. Enter your Client ID and Secret in the calendar cards
5. Click Connect to authorize access

## Known Limitations

- **OAuth Quick Setup temporarily disabled** - Only advanced setup (your own OAuth credentials) is available in this beta
- **Migration is one-way** - Downgrading to v3 after migration may require manual reconfiguration
- **OAuth setup requires technical setup** - You must create your own OAuth applications with Google/Microsoft

## Feedback and Support

Please report any issues on [GitHub](https://github.com/callumalpass/tasknotes/issues). When reporting:

- Include your Obsidian version
- Describe steps to reproduce
- Check console for errors (Ctrl/Cmd + Shift + I)
- Note if issue occurs after migration or fresh install

Thank you for helping test TaskNotes v4!

