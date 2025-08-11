import { App } from 'obsidian';
import { FilterBar } from '../../../src/ui/FilterBar';
import { FilterQuery, FilterOptions } from '../../../src/types';

function blankQuery(): FilterQuery {
  return {
    type: 'group',
    id: 'root',
    conjunction: 'and',
    children: [],
    sortKey: 'due',
    sortDirection: 'asc',
    groupKey: 'none'
  } as any;
}

function createOptions(): FilterOptions {
  return { statuses: [], priorities: [], tags: [], contexts: [], projects: [] } as any;
}

describe('FilterBar: Expand/Collapse visibility', () => {
  let app: App;
  let container: HTMLElement;

  beforeEach(() => {
    // @ts-ignore - mock App
    app = new App();
    container = document.createElement('div');
  });

  test('by default, expand/collapse buttons are hidden', () => {
    new FilterBar(app, container, blankQuery(), createOptions());

    const expandBtn = container.querySelector('.filter-bar__expand-groups');
    const collapseBtn = container.querySelector('.filter-bar__collapse-groups');
    expect(expandBtn).toBeNull();
    expect(collapseBtn).toBeNull();
  });

  test('when enabled via config, buttons are visible', () => {
    new FilterBar(app, container, blankQuery(), createOptions(), { showGroupExpandCollapse: true });

    const expandBtn = container.querySelector('.filter-bar__expand-groups');
    const collapseBtn = container.querySelector('.filter-bar__collapse-groups');
    expect(expandBtn).toBeTruthy();
    expect(collapseBtn).toBeTruthy();
  });
});

