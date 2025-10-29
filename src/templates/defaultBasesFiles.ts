/**
 * Default .base file templates for TaskNotes views
 * These are created in TaskNotes/Views/ directory when the user first uses the commands
 */

export const DEFAULT_BASES_FILES: Record<string, string> = {
	'open-kanban-view': `views:
  - type: tasknotesKanban
    name: "Kanban Board"
    options:
      columnWidth: 280
      hideEmptyColumns: false
`,

	'open-tasks-view': `views:
  - type: tasknotesTaskList
    name: "All Tasks"
    sort:
      - column: due
        direction: ASC
`,

	'open-advanced-calendar-view': `views:
  - type: tasknotesCalendar
    name: "Calendar"
    options:
      showScheduled: true
      showDue: true
      showRecurring: true
      showTimeEntries: true
      showTimeblocks: true
      showPropertyBasedEvents: true
      calendarView: "timeGridWeek"
      customDayCount: 3
      firstDay: 0
      slotMinTime: "06:00:00"
      slotMaxTime: "22:00:00"
      slotDuration: "00:30:00"
`,

	'open-agenda-view': `views:
  - type: tasknotesCalendar
    name: "Agenda"
    calendarView: "listWeek"
    startDateProperty: file.ctime
    listDayCount: 7
    titleProperty: file.basename
`,

	'project-subtasks': `# Project Subtasks
# This view shows all tasks that reference the current file in their projects field
# Uses the 'this' keyword to reference the current file dynamically

filters: "note.projects.contains(this.file.asLink())"

views:
  - type: tasknotesTaskList
    name: "Subtasks"
    sort:
      - column: priority
        direction: DESC
`,
};
