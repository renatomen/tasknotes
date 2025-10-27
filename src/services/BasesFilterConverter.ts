import {
	FilterQuery,
	FilterGroup,
	FilterCondition,
	FilterNode,
	FilterProperty,
	FilterOperator,
} from "../types";
import { StatusManager } from "./StatusManager";
import { PriorityManager } from "./PriorityManager";
import type TaskNotesPlugin from "../main";
import type { UserMappedField } from "../types/settings";

/**
 * Converts TaskNotes FilterQuery structures to Bases filter expressions
 *
 * Bases uses a functional expression syntax like:
 * - note.property === "value"
 * - note.property.contains("value")
 * - note.property && note.property !== ""
 * - (condition1 && condition2) || condition3
 *
 * TaskNotes FilterQuery uses a tree structure with FilterGroups and FilterConditions
 */
export class BasesFilterConverter {
	private statusManager: StatusManager;
	private priorityManager: PriorityManager;
	private plugin: TaskNotesPlugin;

	constructor(plugin: TaskNotesPlugin) {
		this.plugin = plugin;
		this.statusManager = plugin.statusManager;
		this.priorityManager = plugin.priorityManager;
	}

	/**
	 * Convert a TaskNotes FilterQuery to a Bases filter expression string
	 */
	convertToBasesFilter(query: FilterQuery): string {
		try {
			// Convert the root group
			const filterExpression = this.convertNode(query);

			// If the filter is empty or just whitespace, return empty string
			if (!filterExpression || filterExpression.trim() === "") {
				return "";
			}

			return filterExpression;
		} catch (error) {
			console.error("Error converting TaskNotes filter to Bases:", error);
			throw new Error(`Failed to convert filter: ${error.message}`);
		}
	}

	/**
	 * Convert a FilterNode (group or condition) to Bases expression
	 */
	private convertNode(node: FilterNode): string {
		if (node.type === "group") {
			return this.convertGroup(node as FilterGroup);
		} else if (node.type === "condition") {
			return this.convertCondition(node as FilterCondition);
		}
		return "";
	}

	/**
	 * Convert a FilterGroup to Bases expression with proper conjunction
	 */
	private convertGroup(group: FilterGroup): string {
		// Filter out incomplete conditions
		const completeChildren = group.children.filter((child) => {
			if (child.type === "condition") {
				return this.isConditionComplete(child as FilterCondition);
			}
			return true; // Groups are always evaluated
		});

		// If no complete children, return empty
		if (completeChildren.length === 0) {
			return "";
		}

		// Convert each child to Bases expression
		const childExpressions = completeChildren
			.map((child) => this.convertNode(child))
			.filter((expr) => expr && expr.trim() !== "");

		// If no valid expressions, return empty
		if (childExpressions.length === 0) {
			return "";
		}

		// If only one expression, return it directly (no need for parentheses)
		if (childExpressions.length === 1) {
			return childExpressions[0];
		}

		// Join with conjunction operator
		const operator = group.conjunction === "and" ? " && " : " || ";

		// Wrap in parentheses if this is a nested group
		return `(${childExpressions.join(operator)})`;
	}

	/**
	 * Check if a condition is complete (has property, operator, and value if needed)
	 */
	private isConditionComplete(condition: FilterCondition): boolean {
		const { property, operator, value } = condition;

		// Must have property and operator
		if (!property || !operator) {
			return false;
		}

		// Some operators don't need a value (is-empty, is-not-empty, is-checked, is-not-checked)
		const noValueOperators = ["is-empty", "is-not-empty", "is-checked", "is-not-checked"];
		if (noValueOperators.includes(operator)) {
			return true;
		}

		// For other operators, value is required
		return value !== null && value !== undefined && value !== "";
	}

	/**
	 * Convert a FilterCondition to Bases expression
	 */
	private convertCondition(condition: FilterCondition): string {
		const { property, operator, value } = condition;

		// Handle special property: status.isCompleted
		if (property === "status.isCompleted") {
			return this.convertCompletedStatusCondition(operator, value);
		}

		// Handle user-defined fields (user:<id>)
		if (property.startsWith("user:")) {
			return this.convertUserFieldCondition(property, operator, value);
		}

		// Get the Bases property path (note.property)
		const basesProperty = this.getBasesPropertyPath(property);

		// Convert based on operator
		return this.convertOperator(basesProperty, operator, value, property);
	}

	/**
	 * Convert status.isCompleted to Bases expression
	 * This needs to expand to check against all completed statuses and handle recurring tasks
	 */
	private convertCompletedStatusCondition(operator: FilterOperator, value: any): string {
		const completedStatusValues = this.statusManager.getCompletedStatuses();

		// Build expression checking if status is in completed list
		const statusConditions = completedStatusValues
			.map((statusValue) => `note.status === "${this.escapeString(statusValue)}"`)
			.join(" || ");

		// For recurring tasks, also check if current instance is completed
		// Bases would need to evaluate: (status is completed) OR (current date in complete_instances)
		// For now, we'll focus on the status check
		// TODO: Add complete_instances check if Bases supports date array operations

		let expression = completedStatusValues.length > 1
			? `(${statusConditions})`
			: statusConditions;

		// Handle operator
		if (operator === "is-not-checked" || operator === "is-not") {
			expression = `!(${expression})`;
		}

		return expression;
	}

	/**
	 * Convert user field condition to Bases expression
	 */
	private convertUserFieldCondition(
		property: string,
		operator: FilterOperator,
		value: any
	): string {
		const fieldId = property.slice(5); // Remove "user:" prefix
		const userFields = this.plugin.settings.userFields || [];
		const field = userFields.find((f: UserMappedField) =>
			(f.id || f.key) === fieldId || f.key === fieldId
		);

		if (!field) {
			console.warn(`User field not found: ${fieldId}`);
			return "true"; // Default to always true if field not found
		}

		// Use the frontmatter key for the property path
		const basesProperty = `note.${field.key}`;

		// Convert based on field type
		// Cast to FilterProperty since user fields are valid FilterProperty values (user:${string})
		return this.convertOperator(basesProperty, operator, value, property as FilterProperty, field.type);
	}

	/**
	 * Get the Bases property path for a TaskNotes property
	 */
	private getBasesPropertyPath(property: FilterProperty): string {
		// Get field mapping from settings
		const fieldMapping = this.plugin.settings.fieldMapping;

		// Map TaskNotes property to frontmatter key
		let frontmatterKey: string;

		switch (property) {
			case "title":
				frontmatterKey = fieldMapping.title;
				break;
			case "status":
				frontmatterKey = fieldMapping.status;
				break;
			case "priority":
				frontmatterKey = fieldMapping.priority;
				break;
			case "due":
				frontmatterKey = fieldMapping.due;
				break;
			case "scheduled":
				frontmatterKey = fieldMapping.scheduled;
				break;
			case "contexts":
				frontmatterKey = fieldMapping.contexts;
				break;
			case "projects":
				frontmatterKey = fieldMapping.projects;
				break;
			case "tags":
				return "file.tags"; // Use file.tags for Bases
			case "path":
				return "file.path";
			case "file.ctime":
				return "file.ctime";
			case "file.mtime":
				return "file.mtime";
			case "archived":
				// Check if task has the archive tag
				return `file.tags.includes("${this.escapeString(fieldMapping.archiveTag)}")`;
			case "timeEstimate":
				frontmatterKey = fieldMapping.timeEstimate;
				break;
			case "completedDate":
				frontmatterKey = fieldMapping.completedDate;
				break;
			case "recurrence":
				frontmatterKey = fieldMapping.recurrence;
				break;
			case "blockedBy":
				frontmatterKey = fieldMapping.blockedBy;
				break;
			case "blocking":
				frontmatterKey = "blocking"; // Computed property, not in field mapping
				break;
			case "dependencies.isBlocked":
			case "dependencies.isBlocking":
				// These are computed properties based on blockedBy
				// For now, return a placeholder - proper implementation would need more complex logic
				return property === "dependencies.isBlocked"
					? `note.${fieldMapping.blockedBy} && note.${fieldMapping.blockedBy}.length > 0`
					: "false"; // isBlocking needs reverse lookup, complex to implement
			default:
				// Default to the property name (handles user fields and unknown properties)
				frontmatterKey = property as string;
		}

		return `note.${frontmatterKey}`;
	}

	/**
	 * Convert an operator and value to Bases expression
	 */
	private convertOperator(
		basesProperty: string,
		operator: FilterOperator,
		value: any,
		originalProperty: FilterProperty,
		fieldType?: string
	): string {
		switch (operator) {
			case "is":
				return this.convertIsOperator(basesProperty, value, fieldType);

			case "is-not":
				return `!(${this.convertIsOperator(basesProperty, value, fieldType)})`;

			case "contains":
				return this.convertContainsOperator(basesProperty, value, originalProperty);

			case "does-not-contain":
				return `!(${this.convertContainsOperator(basesProperty, value, originalProperty)})`;

			case "is-before":
				return `${basesProperty} < "${this.escapeString(String(value))}"`;

			case "is-after":
				return `${basesProperty} > "${this.escapeString(String(value))}"`;

			case "is-on-or-before":
				return `${basesProperty} <= "${this.escapeString(String(value))}"`;

			case "is-on-or-after":
				return `${basesProperty} >= "${this.escapeString(String(value))}"`;

			case "is-empty":
				return `(!${basesProperty} || ${basesProperty} === "" || ${basesProperty} === null)`;

			case "is-not-empty":
				return `(${basesProperty} && ${basesProperty} !== "" && ${basesProperty} !== null)`;

			case "is-checked":
				return `${basesProperty} === true`;

			case "is-not-checked":
				return `${basesProperty} !== true`;

			case "is-greater-than":
				return `${basesProperty} > ${this.formatNumericValue(value)}`;

			case "is-less-than":
				return `${basesProperty} < ${this.formatNumericValue(value)}`;

			case "is-greater-than-or-equal":
				return `${basesProperty} >= ${this.formatNumericValue(value)}`;

			case "is-less-than-or-equal":
				return `${basesProperty} <= ${this.formatNumericValue(value)}`;

			default:
				console.warn(`Unknown operator: ${operator}`);
				return "true";
		}
	}

	/**
	 * Convert "is" operator to Bases expression
	 */
	private convertIsOperator(basesProperty: string, value: any, fieldType?: string): string {
		// Handle array values (for multi-select properties)
		if (Array.isArray(value)) {
			if (value.length === 0) {
				return `(!${basesProperty} || ${basesProperty}.length === 0)`;
			}

			// Check if property contains any of the values
			const conditions = value.map(
				(v) => `${basesProperty}.includes("${this.escapeString(String(v))}")`
			);
			return conditions.length > 1 ? `(${conditions.join(" || ")})` : conditions[0];
		}

		// Handle list-type user fields
		if (fieldType === "list") {
			return `${basesProperty}.includes("${this.escapeString(String(value))}")`;
		}

		// Handle boolean values
		if (typeof value === "boolean" || fieldType === "boolean") {
			return `${basesProperty} === ${value}`;
		}

		// Handle numeric values
		if (typeof value === "number" || fieldType === "number") {
			return `${basesProperty} === ${value}`;
		}

		// Handle null/empty
		if (value === null || value === "") {
			return `(!${basesProperty} || ${basesProperty} === "" || ${basesProperty} === null)`;
		}

		// Default: string comparison
		return `${basesProperty} === "${this.escapeString(String(value))}"`;
	}

	/**
	 * Convert "contains" operator to Bases expression
	 */
	private convertContainsOperator(
		basesProperty: string,
		value: any,
		originalProperty: FilterProperty
	): string {
		// Handle array properties (tags, contexts, projects)
		const arrayProperties: FilterProperty[] = ["tags", "contexts", "projects"];

		if (arrayProperties.includes(originalProperty)) {
			// For array properties, use .some() with includes
			if (Array.isArray(value)) {
				const conditions = value.map(
					(v) => `${basesProperty}.includes("${this.escapeString(String(v))}")`
				);
				return conditions.length > 1 ? `(${conditions.join(" || ")})` : conditions[0];
			}

			// Special handling for projects - match wiki links
			if (originalProperty === "projects") {
				const projectValue = String(value);
				// Try to match both with and without wiki link brackets
				if (projectValue.startsWith("[[") && projectValue.endsWith("]]")) {
					return `${basesProperty}.includes("${this.escapeString(projectValue)}")`;
				} else {
					// Try both formats
					return `(${basesProperty}.includes("[[${this.escapeString(projectValue)}]]") || ${basesProperty}.includes("${this.escapeString(projectValue)}"))`;
				}
			}

			return `${basesProperty}.includes("${this.escapeString(String(value))}")`;
		}

		// For string properties, use substring match
		return `${basesProperty}.toLowerCase().includes("${this.escapeString(String(value).toLowerCase())}")`;
	}

	/**
	 * Format numeric value for Bases expression (no quotes)
	 */
	private formatNumericValue(value: any): string {
		if (typeof value === "number") {
			return String(value);
		}
		const num = parseFloat(String(value));
		return isNaN(num) ? "0" : String(num);
	}

	/**
	 * Escape special characters in string values
	 */
	private escapeString(str: string): string {
		return str
			.replace(/\\/g, "\\\\") // Escape backslashes
			.replace(/"/g, '\\"')   // Escape quotes
			.replace(/\n/g, "\\n")  // Escape newlines
			.replace(/\r/g, "\\r")  // Escape carriage returns
			.replace(/\t/g, "\\t"); // Escape tabs
	}

	/**
	 * Convert a SavedView to a Bases .base file content
	 */
	convertSavedViewToBasesFile(
		savedView: any,
		viewType: "tasknotesTaskList" | "tasknotesKanban" | "tasknotesCalendar" = "tasknotesTaskList"
	): string {
		const filterExpression = this.convertToBasesFilter(savedView.query);

		// Build the Bases file content
		let content = `# ${savedView.name}\n\n`;

		if (filterExpression && filterExpression.trim() !== "") {
			content += `filters: "${filterExpression}"\n\n`;
		}

		content += `views:\n`;
		content += `  - type: ${viewType}\n`;
		content += `    name: "${savedView.name}"\n`;

		// Add sorting if present
		if (savedView.query.sortKey && savedView.query.sortKey !== "none") {
			const sortColumn = this.mapSortKeyToBasesColumn(savedView.query.sortKey);
			const sortDirection = (savedView.query.sortDirection || "asc").toUpperCase();
			content += `    sort:\n`;
			content += `      - column: ${sortColumn}\n`;
			content += `        direction: ${sortDirection}\n`;
		}

		// Add grouping if present
		if (savedView.query.groupKey && savedView.query.groupKey !== "none") {
			const groupColumn = this.mapGroupKeyToBasesColumn(savedView.query.groupKey);
			content += `    group:\n`;
			content += `      column: ${groupColumn}\n`;
		}

		// Add view options if present
		if (savedView.viewOptions) {
			content += `    options:\n`;
			Object.entries(savedView.viewOptions).forEach(([key, value]) => {
				content += `      ${key}: ${value}\n`;
			});
		}

		return content;
	}

	/**
	 * Map TaskNotes sort key to Bases column name
	 */
	private mapSortKeyToBasesColumn(sortKey: string): string {
		const fieldMapping = this.plugin.settings.fieldMapping;

		// Handle known TaskNotes sort keys
		switch (sortKey) {
			case "due": return fieldMapping.due;
			case "scheduled": return fieldMapping.scheduled;
			case "priority": return fieldMapping.priority;
			case "status": return fieldMapping.status;
			case "title": return fieldMapping.title;
			case "dateCreated": return "file.ctime";
			case "dateModified": return "file.mtime";
			case "completedDate": return fieldMapping.completedDate;
			case "tags": return "file.tags";
			case "path": return "file.path";
			case "timeEstimate": return fieldMapping.timeEstimate;
			case "recurrence": return fieldMapping.recurrence;
			default:
				// Handle user fields
				if (sortKey.startsWith("user:")) {
					const fieldId = sortKey.slice(5);
					const userFields = this.plugin.settings.userFields || [];
					const field = userFields.find((f: UserMappedField) =>
						(f.id || f.key) === fieldId || f.key === fieldId
					);
					return field?.key || sortKey;
				}
				// Default: return as-is
				return sortKey;
		}
	}

	/**
	 * Map TaskNotes group key to Bases column name
	 */
	private mapGroupKeyToBasesColumn(groupKey: string): string {
		// Same mapping as sort key
		return this.mapSortKeyToBasesColumn(groupKey);
	}
}
