/**
 * Default .base file templates for TaskNotes views
 * These are created in TaskNotes/Views/ directory when the user first uses the commands
 */

import type { TaskNotesSettings } from "../types/settings";

/**
 * Generate a task filter expression based on the task identification method
 * Returns the filter condition string (not the full YAML structure)
 * Only used for project-subtasks view now
 */
function generateTaskFilterCondition(settings: TaskNotesSettings): string {
	if (settings.taskIdentificationMethod === "tag") {
		// Filter by tag using hasTag method
		const taskTag = settings.taskTag || "task";
		return `file.hasTag("${taskTag}")`;
	} else {
		// Filter by property
		const propertyName = settings.taskPropertyName;
		const propertyValue = settings.taskPropertyValue;

		if (!propertyName) {
			// No property name specified, fall back to tag-based filtering
			const taskTag = settings.taskTag || "task";
			return `file.hasTag("${taskTag}")`;
		}

		if (propertyValue) {
			// Check property has specific value
			return `note.${propertyName} == "${propertyValue}"`;
		} else {
			// Just check property exists (is not empty)
			return `note.${propertyName} && note.${propertyName} != "" && note.${propertyName} != null`;
		}
	}
}

/**
 * Format filter condition(s) as YAML object notation
 * Only used for project-subtasks view now
 */
function formatFilterAsYAML(conditions: string | string[]): string {
	const conditionArray = Array.isArray(conditions) ? conditions : [conditions];
	const formattedConditions = conditionArray.map(c => `    - ${c}`).join('\n');
	return `filters:
  and:
${formattedConditions}`;
}

/**
 * Map internal TaskNotes property names to Bases property names
 */
function mapPropertyToBasesProperty(property: string, settings: TaskNotesSettings): string {
	const fieldMapping = settings.fieldMapping;

	switch (property) {
		case "status":
			return fieldMapping.status;
		case "priority":
			return fieldMapping.priority;
		case "due":
			return fieldMapping.due;
		case "scheduled":
			return fieldMapping.scheduled;
		case "contexts":
			return fieldMapping.contexts;
		case "projects":
			return fieldMapping.projects;
		case "tags":
			return "file.tags";
		case "timeEstimate":
			return fieldMapping.timeEstimate;
		case "blocked":
		case "blockedBy":
			return fieldMapping.blockedBy;
		case "blocking":
			// Blocking is a computed property, use blockedBy as the source
			return fieldMapping.blockedBy;
		case "recurrence":
			return fieldMapping.recurrence;
		case "complete_instances":
		case "completeInstances":
			return fieldMapping.completeInstances;
		case "completedDate":
			return fieldMapping.completedDate;
		case "dateCreated":
			return "file.ctime";
		case "dateModified":
			return "file.mtime";
		case "title":
			return "file.name";
		default:
			return property;
	}
}

/**
 * Generate the order array from defaultVisibleProperties
 */
function generateOrderArray(settings: TaskNotesSettings): string[] {
	const visibleProperties = settings.defaultVisibleProperties || [
		"status",
		"priority",
		"due",
		"scheduled",
		"projects",
		"contexts",
		"tags",
	];

	// Map to Bases property names
	const basesProperties = visibleProperties.map(prop =>
		mapPropertyToBasesProperty(prop, settings)
	);

	// Add essential properties that should always be in the order
	const essentialProperties = [
		"file.name", // title
		mapPropertyToBasesProperty("recurrence", settings),
		mapPropertyToBasesProperty("complete_instances", settings),
	];

	// Combine, removing duplicates while preserving order
	const allProperties: string[] = [];
	const seen = new Set<string>();

	// Add visible properties first
	for (const prop of basesProperties) {
		if (!seen.has(prop)) {
			allProperties.push(prop);
			seen.add(prop);
		}
	}

	// Add essential properties
	for (const prop of essentialProperties) {
		if (!seen.has(prop)) {
			allProperties.push(prop);
			seen.add(prop);
		}
	}

	return allProperties;
}

/**
 * Format the order array as YAML
 */
function formatOrderArray(orderArray: string[]): string {
	return orderArray.map(prop => `      - ${prop}`).join('\n');
}

/**
 * Generate a Bases file template for a specific command with user settings
 */
export function generateBasesFileTemplate(commandId: string, settings: TaskNotesSettings): string {
	const taskFilterCondition = generateTaskFilterCondition(settings);
	const orderArray = generateOrderArray(settings);
	const orderYaml = formatOrderArray(orderArray);

	switch (commandId) {
		case 'open-calendar-view': {
			const dueProperty = mapPropertyToBasesProperty('due', settings);
			const scheduledProperty = mapPropertyToBasesProperty('scheduled', settings);
			return `# Mini Calendar
# Generated with your TaskNotes settings

views:
  - type: tasknotesMiniCalendar
    name: "Due"
    order:
${orderYaml}
    sort:
      - property: ${dueProperty}
        direction: ASC
    dateProperty: ${dueProperty}
  - type: tasknotesMiniCalendar
    name: "Scheduled"
    order: []
    dateProperty: ${scheduledProperty}
  - type: tasknotesMiniCalendar
    name: "Created"
    dateProperty: file.ctime
  - type: tasknotesMiniCalendar
    name: "Modified"
    dateProperty: file.mtime
`;
		}
		case 'open-kanban-view':
			return `# Kanban Board

views:
  - type: tasknotesKanban
    name: "Kanban Board"
    order:
${orderYaml}
    options:
      columnWidth: 280
      hideEmptyColumns: false
`;

		case 'open-tasks-view':
			return `# All Tasks

views:
  - type: tasknotesTaskList
    name: "All Tasks"
    order:
${orderYaml}
    sort:
      - column: due
        direction: ASC
`;

		case 'open-advanced-calendar-view':
			return `# Calendar

views:
  - type: tasknotesCalendar
    name: "Calendar"
    order:
${orderYaml}
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
`;

		case 'open-agenda-view':
			return `# Agenda

views:
  - type: tasknotesCalendar
    name: "Agenda"
    order:
${orderYaml}
    calendarView: "listWeek"
    startDateProperty: file.ctime
    listDayCount: 7
    titleProperty: file.basename
`;

		case 'project-subtasks':
			// This view needs a special filter that combines task filter AND project filter
			const projectFilter = `note.${settings.fieldMapping.projects}.contains(this.file.asLink())`;
			return `# Project Subtasks
# This view shows all tasks that reference the current file in their projects field
# Uses the 'this' keyword to reference the current file dynamically

${formatFilterAsYAML([taskFilterCondition, projectFilter])}

views:
  - type: tasknotesTaskList
    name: "Subtasks"
    order:
${orderYaml}
    sort:
      - column: priority
        direction: DESC
`;

		default:
			return '';
	}
}

/**
 * Legacy static templates for backward compatibility
 * These are used as fallbacks when settings are not available
 */
export const DEFAULT_BASES_FILES: Record<string, string> = {
	'open-calendar-view': `views:
  - type: tasknotesMiniCalendar
    name: "Due"
    sort:
      - property: note.due
        direction: ASC
    dateProperty: note.due
  - type: tasknotesMiniCalendar
    name: "Scheduled"
    dateProperty: note.scheduled
  - type: tasknotesMiniCalendar
    name: "Created"
    dateProperty: file.ctime
  - type: tasknotesMiniCalendar
    name: "Modified"
    dateProperty: file.mtime
`,
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
