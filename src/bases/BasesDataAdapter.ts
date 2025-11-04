import { BasesDataItem } from "./helpers";

/**
 * Adapter for accessing Bases data using public API (1.10.0+).
 * Eliminates all internal API dependencies.
 */
export class BasesDataAdapter {
	constructor(private basesView: any) {}

	/**
	 * Extract all data items from Bases query result.
	 * Uses public API: basesView.data.data
	 */
	extractDataItems(): BasesDataItem[] {
		const entries = this.basesView.data.data;
		return entries.map((entry: any) => ({
			key: entry.file.path,
			data: entry,
			file: entry.file,
			path: entry.file.path,
			properties: this.extractEntryProperties(entry),
			basesData: entry,
		}));
	}

	/**
	 * Get grouped data from Bases.
	 * Uses public API: basesView.data.groupedData
	 *
	 * Note: Returns pre-grouped data. Bases has already applied groupBy configuration.
	 */
	getGroupedData(): any[] {
		return this.basesView.data.groupedData;
	}

	/**
	 * Check if data is actually grouped (not just wrapped in single group).
	 */
	isGrouped(): boolean {
		const groups = this.basesView.data.groupedData;
		if (groups.length !== 1) return true;

		const singleGroup = groups[0];
		return singleGroup.hasKey(); // False if key is null/undefined
	}

	/**
	 * Get sort configuration.
	 * Uses public API: basesView.config.getSort()
	 *
	 * Note: Data from basesView.data is already pre-sorted.
	 * This is only needed for custom sorting logic.
	 */
	getSortConfig() {
		return this.basesView.config.getSort();
	}

	/**
	 * Get visible property IDs.
	 * Uses public API: basesView.config.getOrder()
	 */
	getVisiblePropertyIds(): string[] {
		return this.basesView.config.getOrder();
	}

	/**
	 * Get display name for a property.
	 * Uses public API: basesView.config.getDisplayName()
	 */
	getPropertyDisplayName(propertyId: string): string {
		return this.basesView.config.getDisplayName(propertyId);
	}

	/**
	 * Get property value from a Bases entry.
	 * Uses public API: entry.getValue()
	 */
	getPropertyValue(entry: any, propertyId: string): any {
		try {
			const value = entry.getValue(propertyId);
			return this.convertValueToNative(value);
		} catch (e) {
			console.warn(`[BasesDataAdapter] Failed to get property ${propertyId}:`, e);
			return null;
		}
	}

	/**
	 * Convert Bases Value object to native JavaScript value.
	 * Handles: PrimitiveValue, ListValue, DateValue, FileValue, NullValue, etc.
	 */
	private convertValueToNative(value: any): any {
		if (value == null || value.constructor?.name === "NullValue") {
			return null;
		}

		// PrimitiveValue (string, number, boolean)
		if (typeof value.data !== "undefined") {
			return value.data;
		}

		// ListValue
		if (typeof value.length === "function") {
			const len = value.length();
			const result = [];
			for (let i = 0; i < len; i++) {
				const item = value.at(i);
				result.push(this.convertValueToNative(item));
			}
			return result;
		}

		// DateValue - check for date property (more reliable than constructor check)
		if (value.date instanceof Date) {
			// Return the date as ISO string for consistency
			return value.date.toISOString();
		}

		// DateValue - legacy check with toISOString method
		if (value.constructor?.name === "DateValue" && value.toISOString) {
			return value.toISOString();
		}

		// FileValue
		if (value.file) {
			return value.file.path;
		}

		// Fallback: try to extract raw data
		return value;
	}

	/**
	 * Convert group key Value to display string.
	 * Handles Bases Value objects, particularly DateValue which has special structure.
	 * For FileValue (links), returns the file path which can be rendered as a clickable link.
	 */
	convertGroupKeyToString(key: any): string {
		// Check if key exists and is valid
		if (key == null || (key.hasKey && !key.hasKey())) {
			return "Unknown";
		}

		// Extract the actual value from Bases Value object
		let actualValue: any;

		// FileValue has a .file property containing the TFile object
		if (key.file && typeof key.file === 'object') {
			// Return the full path so it can be rendered as a clickable link
			actualValue = key.file.path;
		}
		// DateValue has a .date property containing the Date object
		else if (key.date instanceof Date) {
			actualValue = key.date;
		}
		// Other Value types have a .data property
		else if (key.data !== undefined) {
			actualValue = key.data;
		}
		// Fallback: try to use the key directly
		else {
			actualValue = key;
		}

		// Handle null/undefined after extraction
		if (actualValue === null || actualValue === undefined) {
			return "None";
		}

		// Format Date objects as YYYY-MM-DD (date only, no time)
		if (actualValue instanceof Date) {
			const year = actualValue.getFullYear();
			const month = String(actualValue.getMonth() + 1).padStart(2, '0');
			const day = String(actualValue.getDate()).padStart(2, '0');
			return `${year}-${month}-${day}`;
		}

		// Handle other types
		if (typeof actualValue === "string") {
			return actualValue || "None";
		}
		if (typeof actualValue === "number") return String(actualValue);
		if (typeof actualValue === "boolean") return actualValue ? "True" : "False";
		if (Array.isArray(actualValue)) {
			return actualValue.length > 0 ? actualValue.join(", ") : "None";
		}

		return String(actualValue);
	}

	/**
	 * Extract properties from a BasesEntry.
	 * Handles frontmatter and computed properties.
	 */
	private extractEntryProperties(entry: any): Record<string, any> {
		// Extract all properties from the entry's frontmatter
		// We don't filter by visible properties here - that happens during rendering
		// This ensures all properties are available for TaskInfo creation
		const frontmatter = (entry as any).frontmatter || (entry as any).properties || {};

		// Return a copy to avoid mutations affecting the original
		return { ...frontmatter };
	}

	/**
	 * Remove property type prefix (note., file., formula.)
	 */
	private stripPropertyPrefix(propertyId: string): string {
		const parts = propertyId.split(".");
		if (parts.length > 1 && ["note", "file", "formula"].includes(parts[0])) {
			return parts.slice(1).join(".");
		}
		return propertyId;
	}
}
