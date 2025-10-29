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
  - Added runtime sanitization in calendar with safe defaults (00:00:00, 24:00:00, 08:00:00)
  - Prevents "Cannot read properties of null (reading 'years')" error from FullCalendar
  - Thanks to @userhandle for reporting and help debugging
```

-->

## Added

- Quick and Advanced OAuth setup for Google and Microsoft calendars bundle PKCE loopback (Google) and device-flow (Microsoft) authentication with a guided device-code modal.
- Integrations tab now handles Lemon Squeezy license activation, provider toggles, command mappings (including the new Agenda view), creation of default `.base` templates, and exporting all saved views through the Bases filter converter.
- Time entry editor modal and new commands let you Alt-drag on the Bases calendar or open the task palette to log and edit tracked time with totals.
- Bases Kanban gains swimlane layout plus options to hide empty columns and tune column widths, with supporting style updates.
- A conversion service to convert saved TaskNotes v3 views to `.bases` views. 

## Changed

- Ribbon and palette commands for Calendar, Kanban, Tasks, Agenda, and Project Subtasks now open the managed `.base` files so shortcuts stay aligned with Bases views (`src/main.ts`).
- Calendar refresh/settings now expose provider toggles, timezone fixes, and configurable list-day counts while merging Google/Microsoft events with ICS and TaskNotes data (`src/bases/calendar-view.ts`, `src/settings/tabs/integrationsTab.ts`).
- Minimum supported Obsidian version is 1.10.1 to match the updated Bases APIs (`manifest.json`).

## Fixed

- (#843) Fixed task tag being added to notes even when "Identify tasks by" is set to "Property" instead of "Tag"
  - Updated TaskCreationModal and TaskEditModal to respect taskIdentificationMethod setting
  - Fixed InstantTaskConvertService to conditionally add task tag based on identification method
  - When using property-based identification, the task tag is no longer automatically added to tags
  - Thanks to @jack2game for reporting
- Dark mode calendars no longer show bright white borders after overriding FullCalendar's border colors (`styles/bases-views.css`).

