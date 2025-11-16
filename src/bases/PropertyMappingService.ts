import TaskNotesPlugin from "../main";
import { FieldMapper } from "../services/FieldMapper";

/**
 * Complete property mapping chain:
 * 1. Bases Property ID → Internal Field Name (via FieldMapper)
 * 2. Internal Field Name → User-Configured Property Name (for frontmatter I/O)
 *
 * Example flow (user configured "state" as their status property):
 * - User adds "note.state" column in Bases
 * - basesToInternal("note.state"):
 *   1. Strip prefix: "note.state" → "state"
 *   2. FieldMapper.fromUserField("state") → "status"
 *   3. Returns: "status" (internal field name)
 * - TaskCard uses PROPERTY_EXTRACTORS["status"] to get task.status
 * - TaskCard uses PROPERTY_RENDERERS["status"] to render status UI (checkbox, dot)
 */
export class PropertyMappingService {
	constructor(
		private plugin: TaskNotesPlugin,
		private fieldMapper: FieldMapper
	) {}

	/**
	 * Map Bases property ID to the internal field name used by TaskInfo.
	 * This is the complete chain: Bases → TaskCard → Internal.
	 *
	 * Example: User configures "state" as their status property
	 * - Bases gives us: "note.state"
	 * - We strip prefix: "state"
	 * - FieldMapper maps: "state" → "status"
	 * - Returns: "status" (internal field name)
	 *
	 * @param basesPropertyId - Property ID from Bases (e.g., "note.state", "file.name")
	 * @returns Internal field name (e.g., "status", "title")
	 */
	basesToInternal(basesPropertyId: string): string {
		// Step 1: Try custom field mapping on full ID first (edge case: user configured "note.state")
		if (this.fieldMapper) {
			const mappingKey = this.fieldMapper.fromUserField(basesPropertyId);
			if (mappingKey) {
				// Property is recognized, return the original property name
				// (not the mapping key, since TaskCard extractors use property names)
				return this.applySpecialTransformations(basesPropertyId);
			}
		}

		// Step 2: Handle dotted prefixes - strip and try FieldMapper again
		if (basesPropertyId.startsWith("note.")) {
			const stripped = basesPropertyId.substring(5); // "note.state" → "state"

			// Try custom field mapping on stripped name (main case!)
			if (this.fieldMapper) {
				const mappingKey = this.fieldMapper.fromUserField(stripped);
				if (mappingKey) {
					// Property is recognized, return the stripped property name
					// (not the mapping key, since TaskCard extractors use property names)
					return this.applySpecialTransformations(stripped);
				}
			}

			// Handle known note properties
			if (stripped === "dateCreated") return "dateCreated";
			if (stripped === "dateModified") return "dateModified";
			if (stripped === "completedDate") return "completedDate";

			return this.applySpecialTransformations(stripped);
		}

		if (basesPropertyId.startsWith("task.")) {
			const stripped = basesPropertyId.substring(5);

			// Try custom field mapping on stripped name
			if (this.fieldMapper) {
				const mappingKey = this.fieldMapper.fromUserField(stripped);
				if (mappingKey) {
					// Property is recognized, return the stripped property name
					return this.applySpecialTransformations(stripped);
				}
			}

			return this.applySpecialTransformations(stripped);
		}

		if (basesPropertyId.startsWith("file.")) {
			// Map file properties to TaskInfo equivalents
			if (basesPropertyId === "file.ctime") return "dateCreated";
			if (basesPropertyId === "file.mtime") return "dateModified";
			if (basesPropertyId === "file.name") return "title";
			if (basesPropertyId === "file.basename") return "title";

			const stripped = basesPropertyId.substring(5);
			return this.applySpecialTransformations(stripped);
		}

		// Step 3: Keep formula properties unchanged
		if (basesPropertyId.startsWith("formula.")) {
			return basesPropertyId;
		}

		// Step 4: Direct property (no prefix) - apply special transformations
		return this.applySpecialTransformations(basesPropertyId);
	}

	/**
	 * Map internal field name to user-configured property name.
	 * This is used when reading/writing frontmatter.
	 *
	 * @param internalFieldName - Internal field (e.g., "status")
	 * @returns User-configured property name (e.g., "task-status")
	 */
	internalToUserProperty(internalFieldName: string): string {
		return this.fieldMapper.toUserField(internalFieldName as any);
	}

	/**
	 * Map user-configured property name back to internal field name.
	 *
	 * @param userPropertyName - User's property name (e.g., "task-status")
	 * @returns Internal field name (e.g., "status")
	 */
	userPropertyToInternal(userPropertyName: string): string {
		return this.fieldMapper.fromUserField(userPropertyName) || userPropertyName;
	}

	/**
	 * Complete mapping: Bases property ID → User-configured property name.
	 * Use this when you need to read/write frontmatter based on Bases config.
	 */
	basesToUserProperty(basesPropertyId: string): string {
		const internal = this.basesToInternal(basesPropertyId);
		return this.internalToUserProperty(internal);
	}

	/**
	 * Apply TaskCard-specific property transformations.
	 * These are display-only transformations that don't affect data storage.
	 * Transforms calculated properties to their display representations.
	 */
	private applySpecialTransformations(propId: string): string {
		// timeEntries → totalTrackedTime (show computed total instead of raw array)
		if (propId === "timeEntries") return "totalTrackedTime";

		// blockedBy → blocked (show status pill instead of dependency array)
		if (propId === "blockedBy") return "blocked";

		// Keep everything else unchanged
		return propId;
	}

	/**
	 * Map a list of Bases property IDs to TaskCard property IDs.
	 * Simply maps each property - no filtering.
	 * If a property is in the Bases config, it will be shown.
	 *
	 * @param basesPropertyIds - Property IDs from Bases config
	 * @returns Mapped property IDs for TaskCard rendering
	 */
	mapVisibleProperties(basesPropertyIds: string[]): string[] {
		return basesPropertyIds.map((id) => this.basesToInternal(id));
	}
}
