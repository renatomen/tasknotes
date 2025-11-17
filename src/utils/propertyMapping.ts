import type TaskNotesPlugin from "../main";
import type { FieldMapping } from "../types";

/**
 * Special property names that are not in FieldMapping but are used in UI.
 * These properties should be passed through unchanged.
 */
const SPECIAL_PROPERTIES = ["tags", "blocked", "blocking"] as const;
type SpecialProperty = typeof SPECIAL_PROPERTIES[number];

/**
 * Check if a property is a special property (not in FieldMapping).
 */
function isSpecialProperty(property: string): property is SpecialProperty {
	return SPECIAL_PROPERTIES.includes(property as SpecialProperty);
}

/**
 * Convert internal field names to user-configured property names.
 *
 * This handles both FieldMapping keys (e.g., "status", "due") and special properties
 * (e.g., "tags", "blocked", "blocking") that are not in the mapping.
 *
 * @param internalNames - Array of internal field names
 * @param plugin - The plugin instance with fieldMapper
 * @returns Array of user-configured property names
 *
 * @example
 * // User has { status: "task-status", due: "deadline" }
 * convertInternalToUserProperties(["status", "due", "tags"], plugin)
 * // Returns: ["task-status", "deadline", "tags"]
 */
export function convertInternalToUserProperties(
	internalNames: string[],
	plugin: TaskNotesPlugin
): string[] {
	return internalNames.map((name) => {
		// Special properties pass through unchanged
		if (isSpecialProperty(name)) {
			return name;
		}

		// Check if it's a valid FieldMapping key
		if (name in plugin.fieldMapper.getMapping()) {
			return plugin.fieldMapper.toUserField(name as keyof FieldMapping);
		}

		// Unknown property, pass through unchanged
		return name;
	});
}

/**
 * Check if a property ID represents a specific internal field.
 * Accounts for custom field mappings.
 *
 * @param propertyId - The property ID to check (user-configured name)
 * @param internalField - The internal field key
 * @param plugin - The plugin instance with fieldMapper
 * @returns true if propertyId is the user's configured name for the internal field
 *
 * @example
 * // User has { status: "task-status" }
 * isPropertyForField("task-status", "status", plugin) // true
 * isPropertyForField("status", "status", plugin)      // false
 */
export function isPropertyForField(
	propertyId: string,
	internalField: keyof FieldMapping,
	plugin: TaskNotesPlugin
): boolean {
	return plugin.fieldMapper.isPropertyForField(propertyId, internalField);
}
