import type TaskNotesPlugin from "../main";

/**
 * Get all available properties for property selection modals
 * Includes both core properties and user-defined fields
 */
export function getAvailableProperties(
	plugin: TaskNotesPlugin
): Array<{ id: string; label: string }> {
	const coreProperties = [
		{ id: "status", label: "Status" },
		{ id: "priority", label: "Priority" },
		{ id: "blocked", label: "Blocked Status" },
		{ id: "blocking", label: "Blocking Status" },
		{ id: "due", label: "Due Date" },
		{ id: "scheduled", label: "Scheduled Date" },
		{ id: "timeEstimate", label: "Time Estimate" },
		{ id: "totalTrackedTime", label: "Total Tracked Time" },
		{ id: "recurrence", label: "Recurrence" },
		{ id: "completedDate", label: "Completed Date" },
		{ id: "file.ctime", label: "Created Date" },
		{ id: "file.mtime", label: "Modified Date" },
		{ id: "projects", label: "Projects" },
		{ id: "contexts", label: "Contexts" },
		{ id: "tags", label: "Tags" },
	];

	// Add user-defined fields
	const userProperties =
		plugin.settings.userFields?.map((field) => ({
			id: `user:${field.id}`,
			label: field.displayName,
		})) || [];

	return [...coreProperties, ...userProperties];
}

/**
 * Get labels for a list of property IDs
 * Useful for displaying current selection
 */
export function getPropertyLabels(
	plugin: TaskNotesPlugin,
	propertyIds: string[]
): string[] {
	const availableProperties = getAvailableProperties(plugin);
	return propertyIds
		.map((id) => availableProperties.find((p) => p.id === id)?.label || id)
		.filter(Boolean);
}
