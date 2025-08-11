import { App } from 'obsidian';
import { FilterBar } from '../../../src/ui/FilterBar';
import { FilterQuery, FilterOptions } from '../../../src/types';

function createFilterOptions(): FilterOptions {
  return {
    statuses: [],
    priorities: [],
    tags: [],
    contexts: [],
    projects: []
  } as any;
}

describe('FilterBar filter toggle badge on initial render', () => {
  let app: App;
  let container: HTMLElement;
  let options: FilterOptions;

  beforeEach(() => {
    // @ts-ignore - App is a mock from tests/__mocks__/obsidian.ts
    app = new App();
    container = document.createElement('div');
    options = createFilterOptions();
  });

  test('does not show active badge when no filters are applied', () => {
    const query: FilterQuery = {
      type: 'group',
      id: 'root',
      conjunction: 'and',
      children: [],
      sortKey: 'due',
      sortDirection: 'asc',
      groupKey: 'none'
    } as any;

    // Constructing renders and updates UI
    new FilterBar(app, container, query, options);

    const toggle = container.querySelector('.filter-bar__filter-toggle') as HTMLElement | null;
    expect(toggle).toBeTruthy();
    expect(toggle!.classList.contains('has-active-filters')).toBe(false);
  });

  test('shows active badge when a complete filter condition is present from persisted state', () => {
    const query: FilterQuery = {
      type: 'group',
      id: 'root',
      conjunction: 'and',
      children: [
        {
          type: 'condition',
          id: 'c1',
          property: 'status',
          operator: 'is',
          value: 'open'
        }
      ],
      sortKey: 'due',
      sortDirection: 'asc',
      groupKey: 'none'
    } as any;

    new FilterBar(app, container, query, options);

    const toggle = container.querySelector('.filter-bar__filter-toggle') as HTMLElement | null;
    expect(toggle).toBeTruthy();
    expect(toggle!.classList.contains('has-active-filters')).toBe(true);
  });
});

