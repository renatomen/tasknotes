import { FilterBar } from '../../../src/ui/FilterBar';
import { App } from '../../__mocks__/obsidian';

describe('FilterBar Layout section', () => {
  let app: any;
  let container: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = '';
    app = new App();
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  it('renders a Layout section collapsed by default and toggles open on click', () => {
    const fb = new FilterBar(
      app,
      container,
      { type: 'group', id: 'root', conjunction: 'and', children: [], sortKey: 'priority', sortDirection: 'desc', groupKey: 'none' } as any,
      {} as any
    );

    const headers = Array.from(container.querySelectorAll('.filter-bar__section-header')) as HTMLElement[];
    const layoutHeader = headers.find(h => (h.querySelector('.filter-bar__section-title')?.textContent || '').trim() === 'Layout');
    expect(layoutHeader).toBeTruthy();

    const section = layoutHeader!.parentElement as HTMLElement;
    const contentEl = section.querySelector('.filter-bar__section-content') as HTMLElement;
    expect(contentEl).toBeTruthy();
    expect(contentEl.classList.contains('filter-bar__section-content--collapsed')).toBe(true);

    (layoutHeader!.querySelector('.filter-bar__section-header-main') as HTMLElement).click();
    expect(contentEl.classList.contains('filter-bar__section-content--collapsed')).toBe(false);
  });
});

import { App } from 'obsidian';
import { FilterBar } from '../../../src/ui/FilterBar';
import { FilterQuery, FilterOptions } from '../../../src/types';
import { augmentEl } from '../../helpers/dom-helpers';

function createOptions(): FilterOptions {
  return {
    statuses: [], priorities: [], tags: [], contexts: [], projects: []
  } as any;
}

function createQuery(): FilterQuery {
  return {
    type: 'group', id: 'root', conjunction: 'and', children: [],
    sortKey: 'due', sortDirection: 'asc', groupKey: 'none'
  } as any;
}

describe('FilterBar Layout section', () => {
  let app: App;
  let container: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = '';
    app = new App();
    container = augmentEl(document.createElement('div'));
    document.body.appendChild(container);
  });

  it('renders a Layout section collapsed by default', () => {
    const fb = new FilterBar(app, container, createQuery(), createOptions());

    // Open the main filter box by clicking the filter toggle
    const filterToggle = container.querySelector('.filter-bar__filter-toggle') as HTMLElement;
    expect(filterToggle).toBeTruthy();
    filterToggle.click();

    // Find the Layout section header
    const headers = Array.from(container.querySelectorAll('.filter-bar__section-header')) as HTMLElement[];
    const layoutHeader = headers.find(h => (h.querySelector('.filter-bar__section-title')?.textContent || '').trim() === 'Layout');
    expect(layoutHeader).toBeTruthy();

    // Its content should be collapsed by default
    const section = layoutHeader!.parentElement as HTMLElement; // header is inside a section div
    const contentEl = section.querySelector('.filter-bar__section-content') as HTMLElement;

    expect(contentEl).toBeTruthy();
    expect(contentEl.classList.contains('filter-bar__section-content--collapsed')).toBe(true);

    // Click title to expand, then it should no longer be collapsed
    const titleWrapper = layoutHeader!.querySelector('.filter-bar__section-header-main') as HTMLElement;
    titleWrapper.click();
    expect(contentEl.classList.contains('filter-bar__section-content--collapsed')).toBe(false);
  });
});

