import TaskNotesPlugin from '../main';
import { TextComponent, debounce, setTooltip, ButtonComponent, setIcon, TFile } from 'obsidian';
import { BasesDataItem, identifyTaskNotesFromBasesData, renderTaskNotesInBasesView } from './helpers';
import { getTaskNotesTasklistRows } from './tasklist-rows';
import { buildSearchIndex, filterTasksBySearch } from './search';
import { TaskNotesBasesTaskListComponent } from './component';
import { GroupCountUtils } from '../utils/GroupCountUtils';
import { GroupingUtils } from '../utils/GroupingUtils';
import { BASES_TASK_LIST_VIEW_TYPE } from '../types';
import { addDays, startOfWeek, endOfWeek } from 'date-fns';
import { convertUTCToLocalCalendarDate, createUTCDateFromLocalCalendarDate, formatDateForStorage, isTodayUTC } from '../utils/dateUtils';


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

// Bases agenda period config: number of days or "week"; fallback to 7 days
function readAgendaPeriod(basesContainer: any, plugin: TaskNotesPlugin): { daysToShow: number; weekMode: boolean } {
  try {
    const controller = (basesContainer?.controller ?? basesContainer) as any;
    const query = (basesContainer?.query ?? controller?.query) as any;
    const fullCfg = controller?.getViewConfig?.() ?? {};
    const data = (fullCfg as any)?.data ?? {};
    let raw = data['tasknotes.agenda']
      ?? data?.tasknotes?.agenda
      ?? (fullCfg as any)['tasknotes.agenda']
      ?? (fullCfg as any)?.tasknotes?.agenda;
    if (!raw) {
      try { raw = query?.getViewConfig?.('tasknotes.agenda') ?? (query?.getViewConfig?.('tasknotes') as any)?.agenda; } catch (_) {}
    }

    let period = (raw && typeof raw === 'object') ? (raw as any).period : raw;
    if (period === 'week') return { daysToShow: -1, weekMode: true };
    const n = parseInt(String(period ?? '7'), 10);
    if (!isNaN(n) && n > 0) return { daysToShow: n, weekMode: false };
  } catch (_) {}
  return { daysToShow: 7, weekMode: false };
}

function getAgendaDates(selectedDate: Date, daysToShow: number, firstDay: number): Date[] {
  const dates: Date[] = [];
  if (daysToShow === -1) {
    const weekStart = startOfWeek(selectedDate, { weekStartsOn: firstDay as 0|1|2|3|4|5|6 });
    const weekEnd = endOfWeek(selectedDate, { weekStartsOn: firstDay as 0|1|2|3|4|5|6 });
    let current = weekStart;
    while (current <= weekEnd) {
      const normalized = createUTCDateFromLocalCalendarDate(current);
      dates.push(normalized);
      current = addDays(current, 1);
    }
  } else {
    for (let i = 0; i < daysToShow; i++) {
      const target = addDays(selectedDate, i);
      const normalized = createUTCDateFromLocalCalendarDate(target);
      dates.push(normalized);
    }
  }
  return dates;
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

    /**
     * Add "+New" button to the right side of the controls
     */
    const addNewTaskButton = () => {
      // Remove any existing "+New" button first
      controls.querySelectorAll('.filter-bar__new-task-button').forEach(el => el.remove());

      const newTaskButton = new ButtonComponent(controls)
        .setTooltip('Create new task')
        .setClass('filter-bar__new-task-button')
        .onClick(() => {
          createNewTaskWithContext();
        });
      newTaskButton.buttonEl.addClass('clickable-icon');
      newTaskButton.buttonEl.addClass('has-text-icon');

      // Clear any existing content and build manually
      newTaskButton.buttonEl.empty();

      // Add icon
      const iconEl = newTaskButton.buttonEl.createSpan({ cls: 'button-icon' });
      setIcon(iconEl, 'plus');

      // Add text
      const textEl = newTaskButton.buttonEl.createSpan({ cls: 'button-text', text: 'New' });
    };

    /**
     * Context-aware task creation based on workspace position
     */
    const createNewTaskWithContext = () => {
      try {
        // Detect workspace position and determine context
        const context = detectWorkspaceContext();

        if (context.isInSidebar) {
          // Sidebar mode: Use active file as project context
          const activeFile = plugin.app.workspace.getActiveFile();
          if (activeFile) {
            const projectReference = `[[${activeFile.basename}]]`;
            plugin.openTaskCreationModal({
              projects: [projectReference]
            });
          } else {
            // No active file, create standalone task
            plugin.openTaskCreationModal();
          }
        } else {
          // Main content mode: Create standalone task
          plugin.openTaskCreationModal();
        }
      } catch (error) {
        console.error('[TaskNotes][Bases] Error creating new task:', error);
        // Fallback to basic task creation
        plugin.openTaskCreationModal();
      }
    };

    /**
     * Detect if the Bases view is in sidebar vs main content area
     */
    const detectWorkspaceContext = () => {
      try {
        // Try to find the workspace leaf containing this view
        const workspace = plugin.app.workspace;
        let currentLeaf: any = null;

        // Search through all leaves to find the one containing our view
        workspace.iterateAllLeaves((leaf) => {
          if (leaf.view && leaf.view.containerEl &&
              leaf.view.containerEl.contains(viewContainerEl)) {
            currentLeaf = leaf;
          }
        });

        if (!currentLeaf) {
          // Fallback: assume main content if we can't determine
          return { isInSidebar: false, leaf: null };
        }

        // Check if the leaf is in a sidebar by examining its parent structure
        const leafEl = currentLeaf.containerEl;
        const isInLeftSidebar = leafEl.closest('.workspace-split.mod-left-split') !== null;
        const isInRightSidebar = leafEl.closest('.workspace-split.mod-right-split') !== null;
        const isInSidebar = isInLeftSidebar || isInRightSidebar;

        return {
          isInSidebar,
          isInLeftSidebar,
          isInRightSidebar,
          leaf: currentLeaf
        };
      } catch (error) {
        console.error('[TaskNotes][Bases] Error detecting workspace context:', error);
        // Safe fallback
        return { isInSidebar: false, leaf: null };
      }
    };

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
        try {
          if (plugin.settings?.basesAdvancedDataLogs) {
            const raw = Array.from(((basesContainer as any)?.results as Map<any, any> | undefined)?.entries?.() || []);
            console.log('[TaskNotes][Bases][ADVANCED-DUMP]', {
              size: (basesContainer as any)?.results instanceof Map ? (basesContainer as any).results.size : undefined,
              results: raw
            });
          }
        } catch (_) { /* ignore */ }
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

        // Compute agenda dates exactly like AgendaView
        const selected = new Date(plugin.selectedDate);
        const firstDay = (plugin.settings?.calendarViewSettings?.firstDay ?? 0) as number;
        const { daysToShow } = readAgendaPeriod(basesContainer as any, plugin);
        const agendaDates = getAgendaDates(selected, daysToShow, firstDay);

        // Build a base query similar to AgendaView
        const baseQuery: any = {
          type: 'group', id: 'bases-agenda', conjunction: 'and', children: [],
          sortKey: 'due', sortDirection: 'asc', groupKey: 'none'
        };

        // Gather tasks per day using FilterService when available, else fallback to raw tasks
        const agendaData: Array<{ date: Date; tasks: any[] }> = [];
        for (const date of agendaDates) {
          if ((plugin as any).filterService?.getTasksForDate) {
            try {
              const tasksForDate = await (plugin as any).filterService.getTasksForDate(date, baseQuery, true);
              agendaData.push({ date, tasks: filterTasksBySearch(tasksForDate, searchIndex, currentSearchTerm) });
            } catch {
              // Fallback: approximate by checking task props against this date
              const dayKey = formatDateForStorage(date);
              const approx = taskNotes.filter(t => {
                const props = pathToProps.get(t.path) || {};
                const keys = getTaskDates(props);
                return keys.includes(dayKey);
              });
              agendaData.push({ date, tasks: filterTasksBySearch(approx, searchIndex, currentSearchTerm) });
            }
          } else {
            const dayKey = formatDateForStorage(date);
            const approx = taskNotes.filter(t => {
              const props = pathToProps.get(t.path) || {};
              const keys = getTaskDates(props);
              return keys.includes(dayKey);
            });
            agendaData.push({ date, tasks: filterTasksBySearch(approx, searchIndex, currentSearchTerm) });
          }
        }

        // Render sections in chronological order with Agenda header styling
        const groupSections: HTMLElement[] = [];
        for (const { date, tasks } of agendaData) {
          const hasItems = (tasks?.length || 0) > 0;
          if (!hasItems) continue;

          const dayKey = formatDateForStorage(date);

          const section = document.createElement('section');
          section.className = 'agenda-view__day-section task-group';
          section.setAttribute('data-day', dayKey);

          // Header (similar to AgendaView.createDayHeader)
          const header = document.createElement('div');
          header.className = 'agenda-view__day-header task-group-header';
          header.setAttribute('data-day', dayKey);

          const toggleBtn = document.createElement('button');
          toggleBtn.className = 'task-group-toggle';
          toggleBtn.setAttribute('aria-label', 'Toggle day');
          try { setIcon(toggleBtn, 'chevron-right'); } catch (_) {}
          const svg = toggleBtn.querySelector('svg');
          if (svg) { svg.classList.add('chevron'); svg.setAttribute('width', '16'); svg.setAttribute('height', '16'); } else { toggleBtn.textContent = '▸'; }
          header.appendChild(toggleBtn);

          // Add a consistent group label span used by tests and for copyable day key
          const labelSpan = document.createElement('span');
          labelSpan.className = 'tn-bases-group-label';
          labelSpan.textContent = dayKey;
          header.appendChild(labelSpan);

          const headerText = document.createElement('div');
          headerText.className = 'agenda-view__day-header-text';
          const displayDate = convertUTCToLocalCalendarDate(date);
          const { format } = await import('date-fns');
          const dayName = format(displayDate, 'EEEE');
          const dateFormatted = format(displayDate, 'MMMM d');
          if (isTodayUTC(date)) {
            const nameSpan = document.createElement('span');
            nameSpan.className = 'agenda-view__day-name agenda-view__day-name--today';
            nameSpan.textContent = 'Today';
            headerText.appendChild(nameSpan);
            const dateSpan = document.createElement('span');
            dateSpan.className = 'agenda-view__day-date';
            dateSpan.textContent = ` • ${dateFormatted}`;
            headerText.appendChild(dateSpan);
          } else {
            const nameSpan = document.createElement('span');
            nameSpan.className = 'agenda-view__day-name';
            nameSpan.textContent = dayName;
            headerText.appendChild(nameSpan);
            const dateSpan = document.createElement('span');
            dateSpan.className = 'agenda-view__day-date';
            dateSpan.textContent = ` • ${dateFormatted}`;
            headerText.appendChild(dateSpan);
          }
          header.appendChild(headerText);

          // Count badge (tasks completion)
          const stats = GroupCountUtils.calculateGroupStats(tasks as any, plugin);
          const countSpan = document.createElement('span');
          countSpan.className = 'agenda-view__item-count';
          countSpan.textContent = `${GroupCountUtils.formatGroupCount(stats.completed, stats.total).text}`;
          header.appendChild(countSpan);

          section.appendChild(header);

          const list = document.createElement('div');
          list.className = 'agenda-view__day-items';
          section.appendChild(list);

          const collapsedInitially = GroupingUtils.isGroupCollapsed(
            BASES_TASK_LIST_VIEW_TYPE,
            'bases:agenda',
            dayKey,
            plugin
          );
          if (collapsedInitially) {
            section.classList.add('is-collapsed');
            list.style.display = 'none';
          }
          toggleBtn.setAttribute('aria-expanded', String(!collapsedInitially));

          const toggle = () => {
            const willCollapse = !section.classList.contains('is-collapsed');
            GroupingUtils.setGroupCollapsed(BASES_TASK_LIST_VIEW_TYPE, 'bases:agenda', dayKey, willCollapse, plugin);
            section.classList.toggle('is-collapsed', willCollapse);
            list.style.display = willCollapse ? 'none' : '';
            toggleBtn.setAttribute('aria-expanded', String(!willCollapse));
          };
          header.addEventListener('click', (e) => { const target = e.target as HTMLElement; if (target.closest('a')) return; toggle(); });
          toggleBtn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); toggle(); });

          // Check for TaskNotes subgroupBy configuration
          const { getTaskNotesSubgroupBy } = await import('./tasklist-rows');
          const subgroupBy = getTaskNotesSubgroupBy(basesContainer as any);

          if (subgroupBy && subgroupBy !== 'none') {
            // Add group-specific expand/collapse controls to the day header
            addDaySubgroupControlButtons(header, dayKey, subgroupBy, plugin, root);

            // Render hierarchical subgroups within this day
            const subgroupsContainer = list.createDiv({ cls: 'task-subgroups-container' });

            // Group tasks by selected subgroup key for this specific date
            const { getTaskGroupValues } = await import('./view-factory');
            const subgroups = new Map<string, typeof tasks>();
            for (const task of tasks) {
              const subgroupValues = getTaskGroupValues(task, subgroupBy, plugin);
              for (const subgroupValue of subgroupValues) {
                const subgroupKey = String(subgroupValue ?? 'none');
                if (!subgroups.has(subgroupKey)) subgroups.set(subgroupKey, []);
                subgroups.get(subgroupKey)!.push(task);
              }
            }

            // Render each subgroup
            for (const [subgroupName, subgroupTasks] of subgroups) {
              if (subgroupTasks.length === 0) continue;

              // Create subgroup section
              const subgroupSection = subgroupsContainer.createDiv({ cls: 'task-section task-subgroup' });
              subgroupSection.setAttribute('data-group', dayKey);
              subgroupSection.setAttribute('data-subgroup', subgroupName);
              subgroupSection.setAttribute('data-group-level', 'secondary');

              // Build header with toggle and count
              const subgroupHeader = subgroupSection.createEl('h4', {
                cls: 'task-group-header task-subgroup-header'
              });

              const subgroupToggleBtn = document.createElement('button');
              subgroupToggleBtn.className = 'task-group-toggle';
              subgroupToggleBtn.setAttribute('aria-label', 'Toggle subgroup');
              try { setIcon(subgroupToggleBtn, 'chevron-right'); } catch (_) {}
              const subgroupSvg = subgroupToggleBtn.querySelector('svg');
              if (subgroupSvg) {
                subgroupSvg.classList.add('chevron');
                subgroupSvg.setAttribute('width', '16');
                subgroupSvg.setAttribute('height', '16');
              } else {
                subgroupToggleBtn.textContent = '▸';
              }
              subgroupHeader.appendChild(subgroupToggleBtn);

              const subgroupLabelSpan = document.createElement('span');
              subgroupLabelSpan.className = 'tn-bases-subgroup-label';
              subgroupLabelSpan.textContent = subgroupName;
              subgroupHeader.appendChild(subgroupLabelSpan);

              // Count
              const { GroupCountUtils } = await import('../utils/GroupCountUtils');
              const subgroupStats = GroupCountUtils.calculateGroupStats(subgroupTasks, plugin);
              const subgroupCountSpan = document.createElement('span');
              subgroupCountSpan.className = 'agenda-view__item-count';
              subgroupCountSpan.textContent = ` ${GroupCountUtils.formatGroupCount(subgroupStats.completed, subgroupStats.total).text}`;
              subgroupHeader.appendChild(subgroupCountSpan);

              subgroupSection.appendChild(subgroupHeader);

              // Subgroup tasks container
              const subgroupTasksContainer = subgroupSection.createDiv({
                cls: 'tasks-container task-cards'
              });

              // Apply initial collapsed state for subgroup
              const { GroupingUtils } = await import('../utils/GroupingUtils');
              const isSubgroupCollapsed = GroupingUtils.isSubgroupCollapsed(
                BASES_TASK_LIST_VIEW_TYPE,
                dayKey,
                subgroupBy,
                subgroupName,
                plugin
              );

              if (isSubgroupCollapsed) {
                subgroupSection.classList.add('is-collapsed');
                subgroupTasksContainer.style.display = 'none';
              }
              subgroupToggleBtn.setAttribute('aria-expanded', String(!isSubgroupCollapsed));

              // Toggle behavior for subgroup
              const subgroupToggle = () => {
                const willCollapse = !subgroupSection.classList.contains('is-collapsed');
                GroupingUtils.setSubgroupCollapsed(BASES_TASK_LIST_VIEW_TYPE, dayKey, subgroupBy, subgroupName, willCollapse, plugin);
                subgroupSection.classList.toggle('is-collapsed', willCollapse);
                subgroupTasksContainer.style.display = willCollapse ? 'none' : '';
                subgroupToggleBtn.setAttribute('aria-expanded', String(!willCollapse));
              };
              subgroupHeader.addEventListener('click', (e) => {
                const target = e.target as HTMLElement;
                if (target.closest('a')) return;
                if (target.closest('.task-group-header-right')) return;
                subgroupToggle();
              });
              subgroupToggleBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                subgroupToggle();
              });

              // Render tasks in this subgroup
              await renderTaskNotesInBasesView(subgroupTasksContainer, subgroupTasks as any, plugin, { extraPropertiesRows: extraRows as any });
            }
          } else {
            // Standard flat rendering when no subgroupBy
            await renderTaskNotesInBasesView(list, tasks as any, plugin, { extraPropertiesRows: extraRows as any });
          }

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
              const list = section.querySelector('.agenda-view__day-items') as HTMLElement | null;
              if (list) list.style.display = '';
              const name = section.getAttribute('data-day') || '';
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
            const names = groupSections.map(s => s.getAttribute('data-day') || '');
            for (const section of groupSections) {
              const list = section.querySelector('.agenda-view__day-items') as HTMLElement | null;
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

          // Add "+New" button after expand/collapse buttons
          addNewTaskButton();
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

  /**
   * Add group-specific expand/collapse control buttons to day header
   * Similar to HierarchicalTaskRenderer.addSubgroupControlButtons but for Bases Agenda view
   */
  function addDaySubgroupControlButtons(
    dayHeader: HTMLElement,
    dayKey: string,
    subgroupKey: string,
    plugin: TaskNotesPlugin,
    rootElement: HTMLElement
  ): void {
    // Create container for subgroup control buttons
    const controlsContainer = document.createElement('div');
    controlsContainer.className = 'task-group-subgroup-controls';

    // Expand all subgroups button for this day
    const expandSubgroupsBtn = document.createElement('button');
    expandSubgroupsBtn.className = 'task-group-subgroup-control-btn task-group-expand-subgroups';
    expandSubgroupsBtn.setAttribute('aria-label', `Expand all subgroups for ${dayKey}`);
    expandSubgroupsBtn.setAttribute('title', 'Expand all subgroups');

    try {
      setIcon(expandSubgroupsBtn, 'list-tree');
    } catch (_) {
      expandSubgroupsBtn.textContent = '⊞';
    }

    // Collapse all subgroups button for this day
    const collapseSubgroupsBtn = document.createElement('button');
    collapseSubgroupsBtn.className = 'task-group-subgroup-control-btn task-group-collapse-subgroups';
    collapseSubgroupsBtn.setAttribute('aria-label', `Collapse all subgroups for ${dayKey}`);
    collapseSubgroupsBtn.setAttribute('title', 'Collapse all subgroups');

    try {
      setIcon(collapseSubgroupsBtn, 'list-collapse');
    } catch (_) {
      collapseSubgroupsBtn.textContent = '⊟';
    }

    // Add click handlers
    expandSubgroupsBtn.addEventListener('click', (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      expandAllSubgroupsForDay(dayKey, subgroupKey, plugin, rootElement);
    });

    collapseSubgroupsBtn.addEventListener('click', (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      collapseAllSubgroupsForDay(dayKey, subgroupKey, plugin, rootElement);
    });

    // Add buttons to container
    controlsContainer.appendChild(expandSubgroupsBtn);
    controlsContainer.appendChild(collapseSubgroupsBtn);

    // Insert controls before the count span (same positioning as TaskList view)
    const countSpan = dayHeader.querySelector('.agenda-view__item-count');
    if (countSpan) {
      dayHeader.insertBefore(controlsContainer, countSpan);
    } else {
      dayHeader.appendChild(controlsContainer);
    }
  }

  /**
   * Expand all subgroups for a specific day
   */
  function expandAllSubgroupsForDay(dayKey: string, subgroupKey: string, plugin: TaskNotesPlugin, rootElement: HTMLElement): void {
    const { GroupingUtils } = require('../utils/GroupingUtils');
    const { BASES_TASK_LIST_VIEW_TYPE } = require('../types');

    // Find all subgroup sections for this day
    const daySection = rootElement.querySelector(`[data-day="${dayKey}"]`);
    if (!daySection) return;

    const subgroupSections = daySection.querySelectorAll('.task-subgroup');
    subgroupSections.forEach((subgroupSection: Element) => {
      subgroupSection.classList.remove('is-collapsed');
      const taskCards = subgroupSection.querySelector('.task-cards') as HTMLElement | null;
      if (taskCards) taskCards.style.display = '';

      // Update toggle button state
      const toggleBtn = subgroupSection.querySelector('.task-group-toggle');
      if (toggleBtn) toggleBtn.setAttribute('aria-expanded', 'true');
    });

    // Update state - expand all subgroups for this day
    GroupingUtils.expandAllSubgroups(BASES_TASK_LIST_VIEW_TYPE, dayKey, subgroupKey, plugin);
  }

  /**
   * Collapse all subgroups for a specific day
   */
  function collapseAllSubgroupsForDay(dayKey: string, subgroupKey: string, plugin: TaskNotesPlugin, rootElement: HTMLElement): void {
    const { GroupingUtils } = require('../utils/GroupingUtils');
    const { BASES_TASK_LIST_VIEW_TYPE } = require('../types');

    // Find all subgroup sections for this day
    const daySection = rootElement.querySelector(`[data-day="${dayKey}"]`);
    if (!daySection) return;

    const subgroupSections = daySection.querySelectorAll('.task-subgroup');
    const subgroupNames: string[] = [];

    subgroupSections.forEach((subgroupSection: Element) => {
      subgroupSection.classList.add('is-collapsed');
      const taskCards = subgroupSection.querySelector('.task-cards') as HTMLElement | null;
      if (taskCards) taskCards.style.display = 'none';

      // Update toggle button state
      const toggleBtn = subgroupSection.querySelector('.task-group-toggle');
      if (toggleBtn) toggleBtn.setAttribute('aria-expanded', 'false');

      const subgroupName = subgroupSection.getAttribute('data-subgroup') || '';
      if (subgroupName) subgroupNames.push(subgroupName);
    });

    // Update state - collapse all subgroups for this day
    GroupingUtils.collapseAllSubgroups(BASES_TASK_LIST_VIEW_TYPE, dayKey, subgroupKey, subgroupNames, plugin);
  }
}

