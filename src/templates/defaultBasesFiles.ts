/**
 * Default .base file templates for TaskNotes views
 * These are created in TaskNotes/Views/ directory when the user first uses the commands
 *
 * ⚠️ IMPORTANT: Changes to these templates should be reflected in the documentation at:
 *    obsidian-help/en/Bases/Default base templates.md
 *
 * When updating templates:
 * 1. Update the template generation code below
 * 2. Update the documentation with example output using DEFAULT_SETTINGS from src/settings/defaults.ts
 * 3. Ensure all Bases syntax is valid according to obsidian-help/en/Bases/Bases syntax.md
 */

import type { TaskNotesSettings } from "../types/settings";
import type TaskNotesPlugin from "../main";
import type { FieldMapping } from "../types";

/**
 * Generate a task filter expression based on the task identification method
 * Returns the filter condition string (not the full YAML structure)
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
 */
function formatFilterAsYAML(conditions: string | string[]): string {
	const conditionArray = Array.isArray(conditions) ? conditions : [conditions];
	const formattedConditions = conditionArray.map(c => `    - ${c}`).join('\n');
	return `filters:
  and:
${formattedConditions}`;
}

/**
 * Extract just the property name from a fully-qualified property path
 * e.g., "note.projects" -> "projects", "file.ctime" -> "ctime"
 */
function getPropertyName(fullPath: string): string {
	return fullPath.replace(/^(note\.|file\.|task\.|formula\.)/, '');
}

/**
 * Map internal TaskNotes property names to Bases property names.
 * Uses FieldMapper for type-safe field mapping.
 */
function mapPropertyToBasesProperty(property: string, plugin: TaskNotesPlugin): string {
	const fm = plugin.fieldMapper;

	// Handle special Bases-specific properties first
	switch (property) {
		case "tags":
			return "file.tags";
		case "dateCreated":
			return "file.ctime";
		case "dateModified":
			return "file.mtime";
		case "title":
			return "file.name";
		case "blocked":
		case "blocking":
			// Blocking is a computed property, use blockedBy as the source
			return fm.toUserField("blockedBy");
		case "complete_instances":
			return fm.toUserField("completeInstances");
	}

	// Try to map using FieldMapper
	const mapping = fm.getMapping();
	if (property in mapping) {
		return fm.toUserField(property as keyof FieldMapping);
	}

	// Unknown property, return as-is
	return property;
}

/**
 * Generate the order array from defaultVisibleProperties
 */
function generateOrderArray(plugin: TaskNotesPlugin): string[] {
	const settings = plugin.settings;
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
		mapPropertyToBasesProperty(prop, plugin)
	);

	// Add essential properties that should always be in the order
	const essentialProperties = [
		"file.name", // title
		mapPropertyToBasesProperty("recurrence", plugin),
		mapPropertyToBasesProperty("complete_instances", plugin),
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
export function generateBasesFileTemplate(commandId: string, plugin: TaskNotesPlugin): string {
	const settings = plugin.settings;
	const taskFilterCondition = generateTaskFilterCondition(settings);
	const orderArray = generateOrderArray(plugin);
	const orderYaml = formatOrderArray(orderArray);

	switch (commandId) {
		case 'open-calendar-view': {
			const dueProperty = mapPropertyToBasesProperty('due', plugin);
			const scheduledProperty = mapPropertyToBasesProperty('scheduled', plugin);
			return `# Mini Calendar
# Generated with your TaskNotes settings

${formatFilterAsYAML([taskFilterCondition])}

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

${formatFilterAsYAML([taskFilterCondition])}

views:
  - type: tasknotesKanban
    name: "Kanban Board"
    order:
${orderYaml}
    options:
      columnWidth: 280
      hideEmptyColumns: false
`;

		case 'open-tasks-view': {
			const statusProperty = mapPropertyToBasesProperty('status', plugin);
			const dueProperty = mapPropertyToBasesProperty('due', plugin);
			const scheduledProperty = mapPropertyToBasesProperty('scheduled', plugin);
			const recurrenceProperty = mapPropertyToBasesProperty('recurrence', plugin);
			const completeInstancesProperty = mapPropertyToBasesProperty('completeInstances', plugin);

			// Get all completed status values
			const completedStatuses = settings.customStatuses
				.filter(s => s.isCompleted)
				.map(s => s.value);

			// Generate filter for non-recurring incomplete tasks
			// Status must not be in any of the completed statuses
			const nonRecurringIncompleteFilter = completedStatuses
				.map(status => `${statusProperty} != "${status}"`)
				.join('\n            - ');

			return `# All Tasks

${formatFilterAsYAML([taskFilterCondition])}

views:
  - type: tasknotesTaskList
    name: "All Tasks"
    order:
${orderYaml}
    sort:
      - column: due
        direction: ASC
  - type: tasknotesTaskList
    name: "Today"
    filters:
      and:
        # Incomplete tasks (handles both recurring and non-recurring)
        - or:
          # Non-recurring task that's not in any completed status
          - and:
            - ${recurrenceProperty}.isEmpty()
            - ${nonRecurringIncompleteFilter}
          # Recurring task where today is not in complete_instances
          - and:
            - ${recurrenceProperty}
            - "!${completeInstancesProperty}.contains(today().format(\\"yyyy-MM-dd\\"))"
        # Due or scheduled today
        - or:
          - date(${dueProperty}) == today()
          - date(${scheduledProperty}) == today()
    order:
${orderYaml}
    sort:
      - column: due
        direction: ASC
  - type: tasknotesTaskList
    name: "Overdue"
    filters:
      and:
        # Incomplete tasks
        - or:
          # Non-recurring task that's not in any completed status
          - and:
            - ${recurrenceProperty}.isEmpty()
            - ${nonRecurringIncompleteFilter}
          # Recurring task where today is not in complete_instances
          - and:
            - ${recurrenceProperty}
            - "!${completeInstancesProperty}.contains(today().format(\\"yyyy-MM-dd\\"))"
        # Due in the past
        - date(${dueProperty}) < today()
    order:
${orderYaml}
    sort:
      - column: due
        direction: ASC
  - type: tasknotesTaskList
    name: "This Week"
    filters:
      and:
        # Incomplete tasks
        - or:
          # Non-recurring task that's not in any completed status
          - and:
            - ${recurrenceProperty}.isEmpty()
            - ${nonRecurringIncompleteFilter}
          # Recurring task where today is not in complete_instances
          - and:
            - ${recurrenceProperty}
            - "!${completeInstancesProperty}.contains(today().format(\\"yyyy-MM-dd\\"))"
        # Due or scheduled this week
        - or:
          - and:
            - date(${dueProperty}) >= today()
            - date(${dueProperty}) <= today() + "7 days"
          - and:
            - date(${scheduledProperty}) >= today()
            - date(${scheduledProperty}) <= today() + "7 days"
    order:
${orderYaml}
    sort:
      - column: due
        direction: ASC
  - type: tasknotesTaskList
    name: "Unscheduled"
    filters:
      and:
        # Incomplete tasks
        - or:
          # Non-recurring task that's not in any completed status
          - and:
            - ${recurrenceProperty}.isEmpty()
            - ${nonRecurringIncompleteFilter}
          # Recurring task where today is not in complete_instances
          - and:
            - ${recurrenceProperty}
            - "!${completeInstancesProperty}.contains(today().format(\\"yyyy-MM-dd\\"))"
        # No due date and no scheduled date
        - date(${dueProperty}).isEmpty()
        - date(${scheduledProperty}).isEmpty()
    order:
${orderYaml}
    sort:
      - column: ${statusProperty}
        direction: ASC
`;
		}

		case 'open-advanced-calendar-view':
			return `# Calendar

${formatFilterAsYAML([taskFilterCondition])}

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

${formatFilterAsYAML([taskFilterCondition])}

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

		case 'relationships': {
			// Unified relationships widget that shows all relationship types
			// Extract just the property names (without prefixes) since the template controls the context
			const projectsProperty = getPropertyName(mapPropertyToBasesProperty('projects', plugin));
			const blockedByProperty = getPropertyName(mapPropertyToBasesProperty('blockedBy', plugin));
			const statusProperty = getPropertyName(mapPropertyToBasesProperty('status', plugin));

			return `# Relationships
# This view shows all relationships for the current file
# Dynamically shows/hides tabs based on available data

${formatFilterAsYAML([taskFilterCondition])}

views:
  - type: tasknotesKanban
    name: "Subtasks"
    filters:
      and:
        - note.${projectsProperty}.contains(this.file.asLink())
    order:
${orderYaml}
    groupBy:
      property: ${statusProperty}
      direction: ASC
  - type: tasknotesTaskList
    name: "Projects"
    filters:
      and:
        - list(this.${projectsProperty}).contains(file.asLink())
    order:
${orderYaml}
  - type: tasknotesTaskList
    name: "Blocked By"
    filters:
      and:
        - list(this.note.${blockedByProperty}).map(value.uid).contains(file.asLink())
    order:
${orderYaml}
  - type: tasknotesKanban
    name: "Blocking"
    filters:
      and:
        - note.${blockedByProperty}.map(value.uid).contains(this.file.asLink())
    order:
${orderYaml}
    groupBy:
      property: ${statusProperty}
      direction: ASC
`;
		}

		default:
			return '';
	}
}
