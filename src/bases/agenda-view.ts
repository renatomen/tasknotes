import TaskNotesPlugin from '../main';
import { TextComponent, debounce, setTooltip, ButtonComponent, setIcon } from 'obsidian';
import { BasesDataItem, identifyTaskNotesFromBasesData, renderTaskNotesInBasesView } from './helpers';
import { getTaskNotesTasklistRows } from './tasklist-rows';
import { buildSearchIndex, filterTasksBySearch } from './search';
import { TaskNotesBasesTaskListComponent } from './component';
import { GroupCountUtils } from '../utils/GroupCountUtils';
import { GroupingUtils } from '../utils/GroupingUtils';
import { BASES_TASK_LIST_VIEW_TYPE } from '../types';

export interface BasesContainerLike {
  results?: Map<any, any>;
  query?: { on?: (event: string, cb: () => void) => void; off?: (event: string, cb: () => void) => void };
  viewContainerEl?: HTMLElement;
}

// Simplified date extraction from task properties for grouping
function getTaskDates(props: Record<string, any>): string[] {
  const out: string[] = [];
  const due = props['due'] ?? props['note.due'];
  const scheduled = props['scheduled'] ?? props['note.scheduled'];
  const push = (v: any) => {
    if (!v) return;
    if (Array.isArray(v)) v.forEach((x) => { if (x) out.push(String(x)); });
    else out.push(String(v));
  };
  push(due);
  push(scheduled);
  // normalize to YYYY-MM-DD if possible (already expected)
  return out.filter(Boolean);
}

export function buildTasknotesAgendaViewFactory(plugin: TaskNotesPlugin) {
  return function tasknotesAgendaViewFactory(basesContainer: BasesContainerLike) {
    let currentRoot: HTMLElement | null = null;

    const viewContainerEl = (basesContainer as any)?.viewContainerEl as HTMLElement | undefined;
    if (!viewContainerEl) {
      console.error('[TaskNotes][BasesPOC] No viewContainerEl found');
      return { destroy: () => {} } as any;
    }

    viewContainerEl.innerHTML = '';

    // Root & controls
    const root = document.createElement('div');
    root.className = 'tn-bases-integration tasknotes-plugin tasknotes-container';
    viewContainerEl.appendChild(root);
    currentRoot = root;

    const controls = document.createElement('div');
    controls.className = 'filter-bar__top-controls';
    root.appendChild(controls);

    let currentSearchTerm = '';
    try {
      const searchInput = new TextComponent(controls).setPlaceholder('Search path | title | aliases');
      searchInput.inputEl.addClass('filter-bar__search-input');
      setTooltip(searchInput.inputEl, 'Quick search (ephemeral)', { placement: 'top' } as any);
      const triggerSearch = debounce(() => { currentSearchTerm = searchInput.getValue(); void render(); }, 800);
      searchInput.onChange(() => triggerSearch());
    } catch (_) {
      const input = document.createElement('input');
      input.type = 'text';
      input.placeholder = 'Search path | title | aliases';
      input.className = 'filter-bar__search-input';
      input.addEventListener('input', debounce(() => { currentSearchTerm = input.value; void render(); }, 800));
      controls.appendChild(input);
    }

    const itemsContainer = document.createElement('div');
    itemsContainer.className = 'tn-bases-items-container';
    itemsContainer.style.cssText = 'margin-top: 12px;';
    root.appendChild(itemsContainer);

    const extractDataItems = (): BasesDataItem[] => {
      const dataItems: BasesDataItem[] = [];
      const results = (basesContainer as any)?.results as Map<any, any> | undefined;
      if (results && results instanceof Map) {
        for (const [, value] of results.entries()) {
          dataItems.push({
            key: (value as any)?.file?.path || (value as any)?.path,
            data: value,
            file: (value as any)?.file,
            path: (value as any)?.file?.path || (value as any)?.path,
            properties: (value as any)?.properties || (value as any)?.frontmatter
          });
        }
      }
      return dataItems;
    };

    const render = async () => {
      if (!currentRoot) return;
      try {
        const dataItems = extractDataItems();
        const taskNotes = await identifyTaskNotesFromBasesData(dataItems);

        // Reset controls and container (preserve search input)
        itemsContainer.innerHTML = '';
        controls.querySelectorAll('.filter-bar__expand-groups, .filter-bar__collapse-groups').forEach(el => el.remove());

        if (taskNotes.length === 0) {
          const empty = document.createElement('div');
          empty.className = 'tn-bases-empty';
          empty.style.cssText = 'padding: 20px; text-align: center; color: #666;';
          empty.textContent = 'No TaskNotes tasks found for this Base.';
          itemsContainer.appendChild(empty);
          return;
        }

        // path -> props for property rendering
        const pathToProps = new Map<string, Record<string, any>>(
          dataItems.filter(i => !!i.path).map(i => [i.path!, (i as any).properties || (i as any).frontmatter || {}])
        );

        // Extra property rows
        const rows = getTaskNotesTasklistRows(basesContainer as any, pathToProps);
        let extraRows = [rows.row3, rows.row4].filter(Boolean) as any[];
        if (extraRows.length === 0) {
          const { getBasesPropertyRowConfig } = await import('./property-selection');
          const fallback = getBasesPropertyRowConfig(basesContainer as any, pathToProps) || undefined;
          if (fallback) extraRows = [fallback] as any[];
        }

        // Search
        const getAliases = (p: string): string[] => {
          const props = pathToProps.get(p) || {};
          const v = (props as any)['note.aliases'] ?? (props as any)['aliases'];
          if (Array.isArray(v)) return v.filter((x: any) => !!x).map(String);
          if (typeof v === 'string' && v.trim()) return [v];
          return [];
        };
        const searchIndex = buildSearchIndex(taskNotes, { getAliases });
        const searchedTasks = filterTasksBySearch(taskNotes, searchIndex, currentSearchTerm);

        // Group by calendar date keys (YYYY-MM-DD) from due/scheduled
        const groups = new Map<string, typeof taskNotes>();
        for (const t of searchedTasks) {
          const props = pathToProps.get(t.path) || {};
          const dateKeys = getTaskDates(props);
          if (dateKeys.length === 0) {
            if (!groups.has('none')) groups.set('none', []);
            groups.get('none')!.push(t);
            continue;
          }
          for (const key of dateKeys) {
            const k = String(key);
            if (!groups.has(k)) groups.set(k, []);
            groups.get(k)!.push(t);
          }
        }

        // Order day group names (chronological when parsable; else alpha)
        let groupNames = Array.from(groups.keys());
        const parseDate = (s: string): number => {
          // Expecting YYYY-MM-DD
          const m = /^\d{4}-\d{2}-\d{2}$/.test(s) ? Date.parse(s + 'T00:00:00Z') : NaN;
          return isNaN(m) ? NaN : m;
        };
        groupNames.sort((a, b) => {
          const ta = parseDate(a), tb = parseDate(b);
          if (!isNaN(ta) && !isNaN(tb)) return ta - tb;
          if (!isNaN(ta)) return -1;
          if (!isNaN(tb)) return 1;
          return a.localeCompare(b);
        });

        // Render sections
        const groupSections: HTMLElement[] = [];
        for (const groupName of groupNames) {
          const tasks = groups.get(groupName) || [];
          if (!tasks.length) continue;

          const section = document.createElement('section');
          section.className = 'task-section task-group';
          section.setAttribute('data-group', groupName);

          // Header
          const header = document.createElement('h3');
          header.className = 'task-group-header task-list-view__group-header';

          const toggleBtn = document.createElement('button');
          toggleBtn.className = 'task-group-toggle';
          toggleBtn.setAttribute('aria-label', 'Toggle group');
          try {
            setIcon(toggleBtn, 'chevron-right');
            const svg = toggleBtn.querySelector('svg');
            if (svg) { svg.classList.add('chevron'); svg.setAttribute('width', '16'); svg.setAttribute('height', '16'); }
          } catch (_) {
            toggleBtn.textContent = '▸';
          }
          header.appendChild(toggleBtn);

          const labelSpan = document.createElement('span');
          labelSpan.className = 'tn-bases-group-label';
          labelSpan.textContent = groupName;
          header.appendChild(labelSpan);

          const stats = GroupCountUtils.calculateGroupStats(tasks as any, plugin);
          const countSpan = document.createElement('span');
          countSpan.className = 'agenda-view__item-count';
          countSpan.textContent = ` ${GroupCountUtils.formatGroupCount(stats.completed, stats.total).text}`;
          header.appendChild(countSpan);

          section.appendChild(header);

          const list = document.createElement('div');
          list.className = 'tasks-container task-cards';
          section.appendChild(list);

          const collapsedInitially = GroupingUtils.isGroupCollapsed(
            BASES_TASK_LIST_VIEW_TYPE,
            'bases:agenda',
            groupName,
            plugin
          );
          if (collapsedInitially) {
            section.classList.add('is-collapsed');
            list.style.display = 'none';
          }
          toggleBtn.setAttribute('aria-expanded', String(!collapsedInitially));

          const toggle = () => {
            const willCollapse = !section.classList.contains('is-collapsed');
            GroupingUtils.setGroupCollapsed(BASES_TASK_LIST_VIEW_TYPE, 'bases:agenda', groupName, willCollapse, plugin);
            section.classList.toggle('is-collapsed', willCollapse);
            list.style.display = willCollapse ? 'none' : '';
            toggleBtn.setAttribute('aria-expanded', String(!willCollapse));
          };
          header.addEventListener('click', (e) => { const target = e.target as HTMLElement; if (target.closest('a')) return; toggle(); });
          toggleBtn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); toggle(); });

          await renderTaskNotesInBasesView(list, tasks as any, plugin, { extraPropertiesRows: extraRows as any });

          itemsContainer.appendChild(section);
          groupSections.push(section);
        }

        // Expand/Collapse all
        try {
          const expandAllBtn = new ButtonComponent(controls)
            .setIcon('list-tree')
            .setTooltip('Expand All Groups')
            .setClass('filter-bar__expand-groups');
          (expandAllBtn as any).buttonEl.classList.add('clickable-icon');
          expandAllBtn.onClick(() => {
            for (const section of groupSections) {
              section.classList.remove('is-collapsed');
              const list = section.querySelector('.task-cards') as HTMLElement | null;
              if (list) list.style.display = '';
              const name = section.getAttribute('data-group') || '';
              GroupingUtils.setGroupCollapsed(BASES_TASK_LIST_VIEW_TYPE, 'bases:agenda', name, false, plugin);
              const btn = section.querySelector('.task-group-toggle');
              btn?.setAttribute('aria-expanded', 'true');
            }
          });

          const collapseAllBtn = new ButtonComponent(controls)
            .setIcon('list-collapse')
            .setTooltip('Collapse All Groups')
            .setClass('filter-bar__collapse-groups');
          (collapseAllBtn as any).buttonEl.classList.add('clickable-icon');
          collapseAllBtn.onClick(() => {
            const names = groupSections.map(s => s.getAttribute('data-group') || '');
            for (const section of groupSections) {
              const list = section.querySelector('.task-cards') as HTMLElement | null;
              const hasTasks = !!list && list.children.length > 0;
              if (hasTasks) {
                section.classList.add('is-collapsed');
                if (list) list.style.display = 'none';
                const btn = section.querySelector('.task-group-toggle');
                btn?.setAttribute('aria-expanded', 'false');
              }
            }
            GroupingUtils.collapseAllGroups(BASES_TASK_LIST_VIEW_TYPE, 'bases:agenda', names, plugin);
          });
        } catch (_) { /* ignore */ }
      } catch (error) {
        console.error('[TaskNotes][BasesPOC] Error rendering Bases Agenda:', error);
      }
    };

    const component = new TaskNotesBasesTaskListComponent({
      getContainer: () => currentRoot,
      setContainer: (el) => { currentRoot = el; },
      refresh: render,
      attachQueryListener: (handler) => (basesContainer as any)?.query?.on?.('change', handler),
      detachQueryListener: (handler) => (basesContainer as any)?.query?.off?.('change', handler)
    });

    (component as any).load = component.onload.bind(component);
    (component as any).unload = component.onunload.bind(component);

    void render();

    return component as any;
  };
}

