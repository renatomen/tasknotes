import type { TaskInfo } from '../types';

export interface BasesSelectedProperty { id: string; displayName: string; visible: boolean }
export interface BasesRowConfig {
  selected: BasesSelectedProperty[];
  getValue: (taskPath: string, propId: string) => unknown;
}

export interface TasklistRows { row3?: BasesRowConfig; row4?: BasesRowConfig }

function isNonEmpty(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function buildIdIndex(propsMap?: Record<string, any>): Map<string, string> {
  const idIndex = new Map<string, string>();
  if (!propsMap || typeof propsMap !== 'object') return idIndex;
  for (const id of Object.keys(propsMap)) {
    idIndex.set(id, id);
    const last = id.includes('.') ? id.split('.').pop()! : id;
    idIndex.set(last, id);
    const dn = propsMap[id]?.getDisplayName?.();
    if (typeof dn === 'string' && dn.trim()) idIndex.set(dn.toLowerCase(), id);
  }
  return idIndex;
}

function normalizeTokens(tokens: unknown, idIndex: Map<string, string>): string[] {
  if (!tokens) return [];
  const arr = Array.isArray(tokens) ? tokens : [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const token of arr) {
    const t = String(token || '');
    if (!t) continue;
    const id = idIndex.get(t) || idIndex.get(t.toLowerCase()) || t;
    if (!seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

function makeGetValue(pathToProps: Map<string, any>) {
  return (taskPath: string, propId: string): unknown => {
    const props = pathToProps.get(taskPath) || {};
    const v = props[propId];
    if (isNonEmpty(v)) return v;
    const last = propId.includes('.') ? propId.split('.').pop()! : propId;
    return props[last];
  };
}

export function getTaskNotesTasklistRows(basesContainer: any, pathToProps: Map<string, any>): TasklistRows {
  try {
    const controller = (basesContainer?.controller ?? basesContainer) as any;
    const query = (basesContainer?.query ?? controller?.query) as any;
    if (!controller) return {};

    const fullCfg = controller?.getViewConfig?.() ?? {};
    const propsMap: Record<string, any> | undefined = query?.properties;
    const idIndex = buildIdIndex(propsMap);
    const getValue = makeGetValue(pathToProps);

    // Diagnostic: log what Bases provides when logs are enabled in settings
    try {
      const settingsLogsOn = !!(controller?.plugin?.settings?.basesPOCLogs);
      if (settingsLogsOn) {
        console.debug('[TaskNotes][Bases] DIAGNOSTIC - fullCfg keys:', Object.keys(fullCfg));
        console.debug('[TaskNotes][Bases] DIAGNOSTIC - fullCfg:', fullCfg);
      }
    } catch (_) { /* ignore */ }

    // Prefer reading custom keys from fullCfg.data (as seen in your environment)
    const data = (fullCfg as any)?.data ?? {};

    // Read custom config under tasknotes.tasklist (or tasknote.tasklist)
    // Bases may provide dotted keys under fullCfg.data
    let tn = data['tasknotes.tasklist']
      ?? data?.tasknotes?.tasklist
      ?? (fullCfg as any)['tasknotes.tasklist']
      ?? (fullCfg as any)?.tasknotes?.tasklist
      ?? (fullCfg as any)['tasknote.tasklist']
      ?? (fullCfg as any)?.tasknote?.tasklist;
    if (!tn) {
      try {
        tn = query?.getViewConfig?.('tasknotes.tasklist')
          ?? (query?.getViewConfig?.('tasknotes') as any)?.tasklist;
      } catch (_) { /* ignore */ }
    }

    let row3Ids: string[] | undefined;
    let row4Ids: string[] | undefined;

    // Debug logging (support both full config and query lookups)
    let debug = !!(data['tasknotes.debug']
      ?? data?.tasknotes?.debug
      ?? (fullCfg as any)['tasknotes.debug']
      ?? (fullCfg as any)?.tasknotes?.debug);
    if (!debug) {
      try {
        debug = !!(query?.getViewConfig?.('tasknotes.debug')
          ?? (query?.getViewConfig?.('tasknotes') as any)?.debug);
      } catch (_) { /* ignore */ }
    }
    if (debug) {
      console.debug('[TaskNotes][Bases] tasklist-rows config detected:', tn);
    }

    if (tn) {
      if (Array.isArray(tn)) {
        // Array of objects e.g., [{ 'row.3': [...] }, { 'row.4': [...] }]
        if (debug) console.debug('[TaskNotes][Bases] Processing array form:', tn);
        for (const entry of tn) {
          if (!entry || typeof entry !== 'object') continue;
          if ((entry as any)['row.3']) row3Ids = normalizeTokens((entry as any)['row.3'], idIndex);
          if ((entry as any)['row.4']) row4Ids = normalizeTokens((entry as any)['row.4'], idIndex);
        }
      } else if (typeof tn === 'object') {
        // Object forms: { 'row.3': [...], 'row.4': [...] } or { rows: { '3': [...], '4': [...] } }
        if (debug) console.debug('[TaskNotes][Bases] Processing object form:', tn);
        if ((tn as any)['row.3'] || (tn as any)['row.4']) {
          row3Ids = normalizeTokens((tn as any)['row.3'], idIndex);
          row4Ids = normalizeTokens((tn as any)['row.4'], idIndex);
        } else if ((tn as any).rows) {
          row3Ids = normalizeTokens((tn as any).rows?.['3'], idIndex);
          row4Ids = normalizeTokens((tn as any).rows?.['4'], idIndex);
        }
      }
    }

    // Log parsed rows when logs are enabled in settings
    try {
      const settingsLogsOn = !!(controller?.plugin?.settings?.basesPOCLogs);
      if (settingsLogsOn) {
        console.log('[TaskNotes][Bases] PARSED_ROWS_UNCONDITIONAL:', { row3Ids, row4Ids });
      }
    } catch (_) { /* ignore */ }

    if (debug) {
      console.debug('[TaskNotes][Bases] Parsed rows:', { row3Ids, row4Ids });
    }

    // Fallback: if no row3 configured, use Bases 'order'
    if (!row3Ids || row3Ids.length === 0) {
      let order: string[] | undefined;
      try {
        order = (query?.getViewConfig?.('order') as string[] | undefined)
          ?? (fullCfg as any)?.order
          ?? (fullCfg as any)?.columns?.order;
      } catch (_) {
        order = (fullCfg as any)?.order ?? (fullCfg as any)?.columns?.order;
      }
      if (Array.isArray(order)) {
        row3Ids = normalizeTokens(order, idIndex);
      }
    }

    const rows: TasklistRows = {};

    const makeRow = (ids?: string[]): BasesRowConfig | undefined => {
      if (!ids || ids.length === 0) return undefined;
      const selected = ids.map(id => ({
        id,
        displayName: propsMap?.[id]?.getDisplayName?.() ?? id,
        visible: true
      }));
      return { selected, getValue };
    };

    rows.row3 = makeRow(row3Ids);
    rows.row4 = makeRow(row4Ids);

    return rows;
  } catch (e) {
    console.debug('[TaskNotes][Bases] getTaskNotesTasklistRows failed:', e);
    return {};
  }
}

