export interface BasesGroupByConfig {
	normalizedId: string;
	displayName: string;
	getGroupValues: (taskPath: string) => string[];
}

function isNonEmpty(value: unknown): boolean {
	if (value === null || value === undefined) return false;
	if (typeof value === "string") return value.trim().length > 0;
	if (Array.isArray(value)) return value.length > 0;
	return true;
}

function toStringTokens(value: unknown): string[] {
	if (!isNonEmpty(value)) return ["none"];
	if (Array.isArray(value)) {
		const out: string[] = [];
		for (const v of value) {
			if (!isNonEmpty(v)) continue;
			out.push(String(v));
		}
		return out.length ? out : ["none"];
	}
	return [String(value)];
}

/**
 * Read Bases view groupBy config and normalize it against query.properties
 * Returns a config object or null if groupBy is absent.
 *
 * NOTE: GroupBy retrieval uses internal controller.query.views structure
 * because the public API (1.10.0+) does not expose groupBy configuration:
 * - config.get('groupBy') returns undefined
 * - config.getAsPropertyId('groupBy') returns null
 *
 * This is a known limitation of the Bases public API. We access the internal
 * structure to retrieve the groupBy configuration from the parsed Bases YAML file.
 *
 * KNOWN LIMITATION: When grouping by projects (note.projects):
 * - Bases groups by literal wikilink strings in frontmatter, NOT by resolved file paths
 * - Tasks linking to the same project file with different wikilink formats will appear
 *   in separate columns (e.g., [[Project]], [[path/to/Project]], [[Project|Alias]])
 * - This differs from native TaskNotes Kanban which resolves all wikilinks to absolute
 *   paths for consistent grouping (see FilterService.resolveProjectToAbsolutePath)
 * - No workaround exists without modifying Bases internals or post-processing grouped data
 */
export function getBasesGroupByConfig(
	basesContainer: any,
	pathToProps: Map<string, any>
): BasesGroupByConfig | null {
	try {
		const controller = (basesContainer?.controller ?? basesContainer) as any;
		const query = (basesContainer?.query ?? controller?.query) as any;
		if (!controller) return null;

		// Access internal API since public API doesn't expose groupBy
		let groupBy: any;
		const fullCfg = controller?.getViewConfig?.() ?? {};
		try {
			groupBy = query?.getViewConfig?.("groupBy");
		} catch (_) {
			// ignore
		}
		if (groupBy == null) groupBy = (fullCfg as any)?.groupBy;

		if (!groupBy) return null; // No grouping configured

		// Accept string or first element from array-like inputs
		const token = Array.isArray(groupBy) ? groupBy[0] : groupBy;
		if (!token || typeof token !== "string") return null;

		// Build property id index from query.properties
		const propsMap: Record<string, any> | undefined = query?.properties;
		const idIndex = new Map<string, string>();
		if (propsMap && typeof propsMap === "object") {
			for (const id of Object.keys(propsMap)) {
				idIndex.set(id, id);
				const last = id.includes(".") ? id.split(".").pop() || id : id;
				idIndex.set(last, id);
				const dn = propsMap[id]?.getDisplayName?.();
				if (typeof dn === "string" && dn.trim()) idIndex.set(dn.toLowerCase(), id);
			}
		}

		const normalizeToId = (t: string): string | undefined => {
			if (!t) return undefined;
			return idIndex.get(t) || idIndex.get(t.toLowerCase()) || t;
		};

		const normalizedId = normalizeToId(token);
		if (!normalizedId) return null;

		// Get display name from query properties
		const displayName = propsMap?.[normalizedId]?.getDisplayName?.() ?? normalizedId;

		const getGroupValues = (taskPath: string): string[] => {
			const props = pathToProps.get(taskPath) || {};
			const v = props[normalizedId];
			if (isNonEmpty(v)) return toStringTokens(v);
			const last = normalizedId.includes(".") ? normalizedId.split(".").pop() || normalizedId : normalizedId;
			return toStringTokens(props[last]);
		};

		return { normalizedId, displayName, getGroupValues };
	} catch (e) {
		console.debug("[TaskNotes][Bases] getBasesGroupByConfig failed:", e);
		return null;
	}
}
