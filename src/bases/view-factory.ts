import TaskNotesPlugin from '../main';
import { BasesDataItem, identifyTaskNotesFromBasesData, renderTaskNotesInBasesView } from './helpers';
import { TaskNotesBasesTaskListComponent } from './component';
import { setIcon } from 'obsidian';
import { renderTextWithLinks, appendInternalLink } from '../ui/renderers/linkRenderer';

export interface BasesContainerLike {
  results?: Map<any, any>;
  query?: { on?: (event: string, cb: () => void) => void; off?: (event: string, cb: () => void) => void };
  viewContainerEl?: HTMLElement;
}

export function buildTasknotesTaskListViewFactory(plugin: TaskNotesPlugin) {
  return function tasknotesTaskListViewFactory(basesContainer: BasesContainerLike) {
    let currentRoot: HTMLElement | null = null;

    // Guard
    const viewContainerEl = (basesContainer as any)?.viewContainerEl as HTMLElement | undefined;
    if (!viewContainerEl) {
      console.error('[TaskNotes][BasesPOC] No viewContainerEl found');
      return { destroy: () => {} } as any;
    }

    // Ensure clean container
    viewContainerEl.innerHTML = '';

    // Root container for TaskNotes view
    const root = document.createElement('div');
    root.className = 'tn-bases-integration tasknotes-plugin tasknotes-container';
    viewContainerEl.appendChild(root);
    currentRoot = root;


    const itemsContainer = document.createElement('div');
    itemsContainer.className = 'tn-bases-items-container';
    itemsContainer.style.cssText = 'margin-top: 20px;';
    root.appendChild(itemsContainer);

    // Helper to extract items from Bases results
    const extractDataItems = (): BasesDataItem[] => {
      const dataItems: BasesDataItem[] = [];
      const results = (basesContainer as any)?.results as Map<any, any> | undefined;
      if (results && results instanceof Map) {
        for (const [key, value] of results.entries()) {
          dataItems.push({
            key,
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

        // Render body
        itemsContainer.innerHTML = '';
        if (taskNotes.length === 0) {
          const emptyEl = document.createElement('div');
          emptyEl.className = 'tn-bases-empty';
          emptyEl.style.cssText = 'padding: 20px; text-align: center; color: #666;';

          const emptyTitle = document.createElement('p');
          emptyTitle.textContent = 'No TaskNotes tasks found for this Base.';
          emptyTitle.style.cssText = 'margin: 0 0 10px 0; font-weight: 500;';
          emptyEl.appendChild(emptyTitle);

          const emptyDesc = document.createElement('p');
          emptyDesc.textContent = 'TaskNotes are identified by files with task-related frontmatter properties.';
          emptyDesc.style.cssText = 'margin: 0; font-size: 0.9em; opacity: 0.7;';
          emptyEl.appendChild(emptyDesc);

          itemsContainer.appendChild(emptyEl);
        } else {
          // Build a map from task path to its properties/frontmatter for property value resolution
          const pathToProps = new Map<string, Record<string, any>>(
            dataItems.filter(i => !!i.path).map(i => [i.path!, (i as any).properties || (i as any).frontmatter || {}])
          );

          // Compute Bases-driven third row configuration (properties row)
          const { getBasesPropertyRowConfig } = await import('./property-selection');
          const extra = getBasesPropertyRowConfig(basesContainer as any, pathToProps) || undefined;

          // Attempt to read Bases native groupBy configuration
          const { getBasesGroupByConfig } = await import('./group-by');
          const groupCfg = getBasesGroupByConfig(basesContainer as any, pathToProps);

          if (groupCfg) {
            // Group tasks by the configured Bases property
            // Sort tasks using Bases view sort settings if available
            const { getBasesSortComparator } = await import('./sorting');
            const cmp = getBasesSortComparator(basesContainer as any, pathToProps);
            const tasksForGrouping = cmp ? [...taskNotes].sort(cmp) : taskNotes;

            const groups = new Map<string, typeof taskNotes>();
            for (const t of tasksForGrouping) {
              const values = groupCfg.getGroupValues(t.path) || ['none'];
              for (const v of values) {
                const key = String(v ?? 'none');
                if (!groups.has(key)) groups.set(key, []);
                groups.get(key)!.push(t);
              }
            }

            // Order group headings: if first sort key matches the same domain, use its direction; else alphabetical
            let groupNames = Array.from(groups.keys());
            if (cmp && (cmp as any).__basesSortEntries && (cmp as any).__basesSortEntries.length > 0) {
              const first = (cmp as any).__basesSortEntries[0];
              const { getGroupNameComparator } = await import('./group-ordering');
              groupNames = groupNames.sort(getGroupNameComparator(first));
            } else {
              groupNames = groupNames.sort((a, b) => a.localeCompare(b));
            }

            // Utilities for count and collapsed state
            const { GroupCountUtils } = await import('../utils/GroupCountUtils');
            const { GroupingUtils } = await import('../utils/GroupingUtils');
            const { BASES_TASK_LIST_VIEW_TYPE } = await import('../types');
            const groupingKey = `bases:${groupCfg.normalizedId}`;

            for (const groupName of groupNames) {
              const tasks = groups.get(groupName)!;
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

              // Render wikilinks/markdown links clickable in group names (Text/List props)
              // If the rendered result has no anchors, fall back to plain text
              renderTextWithLinks(labelSpan, groupName, { metadataCache: plugin.app.metadataCache, workspace: plugin.app.workspace });
              if (labelSpan.querySelectorAll('a').length === 0) {
                labelSpan.textContent = groupName;
              }
              header.appendChild(labelSpan);

              // Count
              const stats = GroupCountUtils.calculateGroupStats(tasks, plugin);
              const countSpan = document.createElement('span');
              countSpan.className = 'agenda-view__item-count';
              countSpan.textContent = ` ${GroupCountUtils.formatGroupCount(stats.completed, stats.total).text}`;
              header.appendChild(countSpan);

              section.appendChild(header);

              // List container
              const list = document.createElement('div');
              list.className = 'tasks-container task-cards';
              section.appendChild(list);

              // Collapsed state
              const collapsedInitially = GroupingUtils.isGroupCollapsed(
                BASES_TASK_LIST_VIEW_TYPE,
                groupingKey,
                groupName,
                plugin
              );
              if (collapsedInitially) {
                section.classList.add('is-collapsed');
                list.style.display = 'none';
              }
              toggleBtn.setAttribute('aria-expanded', String(!collapsedInitially));

              // Toggle behavior
              const toggle = () => {
                const willCollapse = !section.classList.contains('is-collapsed');
                GroupingUtils.setGroupCollapsed(BASES_TASK_LIST_VIEW_TYPE, groupingKey, groupName, willCollapse, plugin);
                section.classList.toggle('is-collapsed', willCollapse);
                list.style.display = willCollapse ? 'none' : '';
                toggleBtn.setAttribute('aria-expanded', String(!willCollapse));
              };
              header.addEventListener('click', (e) => {
                const target = e.target as HTMLElement;
                if (target.closest('a')) return; // ignore internal link clicks
                toggle();
              });
              toggleBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                toggle();
              });

              // Render tasks for this group using existing helper
              await renderTaskNotesInBasesView(list, tasks, plugin, { extraPropertiesRow: extra });

              itemsContainer.appendChild(section);
            }
          } else {
            // No groupBy configured -> flat list, but still apply Bases sort if present
            const { getBasesSortComparator } = await import('./sorting');
            const cmp = getBasesSortComparator(basesContainer as any, pathToProps);
            const toRender = cmp ? [...taskNotes].sort(cmp) : taskNotes;
            await renderTaskNotesInBasesView(itemsContainer, toRender, plugin, { extraPropertiesRow: extra });
          }
        }
      } catch (error: any) {
        console.error('[TaskNotes][BasesPOC] Error rendering Bases data:', error);
        const errorEl = document.createElement('div');
        errorEl.className = 'tn-bases-error';
        errorEl.style.cssText = 'padding: 20px; color: #d73a49; background: #ffeaea; border-radius: 4px; margin: 10px 0;';
        root.appendChild(errorEl);
      }
    };

    // Build component with lifecycle hooks
    const component = new TaskNotesBasesTaskListComponent({
      getContainer: () => currentRoot,
      setContainer: (el) => { currentRoot = el; },
      refresh: render,
      attachQueryListener: (handler) => (basesContainer as any)?.query?.on?.('change', handler),
      detachQueryListener: (handler) => (basesContainer as any)?.query?.off?.('change', handler)
    });

    // Add Bases lifecycle shims
    (component as any).load = component.onload.bind(component);
    (component as any).unload = component.onunload.bind(component);
    // Do not override onResize; use class method

    // Kick off initial async render
    void render();

    return component as any;
  };
}

