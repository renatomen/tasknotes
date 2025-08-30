import TaskNotesPlugin from '../main';
import { BasesDataItem, identifyTaskNotesFromBasesData, renderTaskNotesInBasesView } from './helpers';
import { TaskNotesBasesTaskListComponent } from './component';

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

          // Compute Bases-driven third row configuration
          const { getBasesPropertyRowConfig } = await import('./property-selection');
          const extra = getBasesPropertyRowConfig(basesContainer as any, pathToProps) || undefined;

          await renderTaskNotesInBasesView(itemsContainer, taskNotes, plugin, {
            extraPropertiesRow: extra
          });
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

