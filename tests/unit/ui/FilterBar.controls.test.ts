import { App } from 'obsidian';
import { FilterBar } from '../../../src/ui/FilterBar';
import { FilterQuery, FilterOptions, SavedView } from '../../../src/types';

function createBasicQuery(): FilterQuery {
  return {
    type: 'group',
    id: 'root',
    conjunction: 'and',
    children: [],
    sortKey: 'due',
    sortDirection: 'asc',
    groupKey: 'project'
  } as any;
}

function createFilterOptions(): FilterOptions {
  return {
    statuses: [],
    priorities: [],
    tags: [],
    contexts: [],
    projects: []
  } as any;
}

describe('FilterBar controls (expand/collapse groups)', () => {
  let app: App;
  let container: HTMLElement;
  let query: FilterQuery;
  let options: FilterOptions;

  beforeEach(() => {
    // @ts-ignore - App is a mock from tests/__mocks__/obsidian.ts
    app = new App();
    container = document.createElement('div');
    query = createBasicQuery();
    options = createFilterOptions();
  });

  test('renders Expand/Collapse buttons with correct classes and tooltips, and emits events', () => {
    const bar = new FilterBar(app, container, query, options, { showGroupExpandCollapse: true });

    const expandBtn = container.querySelector('.filter-bar__expand-groups') as HTMLButtonElement | null;
    const collapseBtn = container.querySelector('.filter-bar__collapse-groups') as HTMLButtonElement | null;

    expect(expandBtn).toBeTruthy();
    expect(collapseBtn).toBeTruthy();

    // Tooltip text is stored by the mock on data-tooltip
    expect(expandBtn?.getAttribute('data-tooltip')).toMatch(/Expand All Groups/i);
    expect(collapseBtn?.getAttribute('data-tooltip')).toMatch(/Collapse All Groups/i);

    const spyExpand = jest.fn();
    const spyCollapse = jest.fn();
    // @ts-ignore private EventEmitter methods are available at runtime
    bar.on('expandAllGroups', spyExpand);
    // @ts-ignore
    bar.on('collapseAllGroups', spyCollapse);

    expandBtn!.click();
    collapseBtn!.click();

    expect(spyExpand).toHaveBeenCalledTimes(1);
    expect(spyCollapse).toHaveBeenCalledTimes(1);
  });
});

