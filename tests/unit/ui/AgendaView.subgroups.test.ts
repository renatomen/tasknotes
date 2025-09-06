import { AgendaView } from '../../../src/views/AgendaView';
import TaskNotesPlugin from '../../../src/main';
import { TASK_LIST_VIEW_TYPE, TaskInfo, FilterQuery } from '../../../src/types';
import { GroupingUtils } from '../../../src/utils/GroupingUtils';
import { makeBasicPluginMock } from '../../helpers/plugin-mocks';

jest.mock('../../../src/main');
jest.mock('../../../src/utils/GroupingUtils');

const makeTask = (overrides: Partial<TaskInfo> = {}): TaskInfo => ({
  title: 'T', status: 'open', priority: 'normal', path: `/t-${Math.random()}.md`, archived: false, ...overrides,
});

// Mock WorkspaceLeaf and ItemView requirements
class MockLeaf {}

import { attachAgendaContainer } from './AgendaView.setup';

describe('AgendaView hierarchical subgroups', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  test('shows SUBGROUP section in context menu for agenda (via FilterBar integration)', async () => {
    const plugin = makeBasicPluginMock();
    const leaf = new MockLeaf() as any;
    const view = new AgendaView(leaf, plugin as any);

    // Prepare DOM container to initialize
    attachAgendaContainer(view);
    await view.onOpen();

    const filterBar = (view as any).filterBar;
    expect(filterBar).toBeTruthy();
    expect(() => (filterBar as any).updateDisplaySection()).not.toThrow();
  });

  test('renders subgroups within each day when subgroupKey is set', async () => {
    const plugin = makeBasicPluginMock();

    // groupTasks must be called for subgrouping
    plugin.filterService.groupTasks = jest.fn((tasks: TaskInfo[], key: any) => {
      if (key === 'project') {
        const m = new Map<string, TaskInfo[]>();
        for (const task of tasks) {
          const k = (task as any).project || 'no-value';
          if (!m.has(k)) m.set(k, []);
          m.get(k)!.push(task);
        }
        return m;
      }
      return new Map([['all', tasks]]);
    });

    const leaf = new MockLeaf() as any;
    const view = new AgendaView(leaf, plugin as any);
    attachAgendaContainer(view);
    await view.onOpen();

    // Prepare container and day data
    const content = (view as any).contentEl.querySelector('.agenda-view__content') as HTMLElement
      || (view as any).contentEl.createDiv({ cls: 'agenda-view__content' });

    // Set subgroup and render grouped agenda directly
    (view as any).currentQuery.subgroupKey = 'project';
    const tA = makeTask({ path: '/a.md', project: 'Alpha' } as any);
    const tB = makeTask({ path: '/b.md', project: 'Beta' } as any);
    const dayData = [{ date: new Date(), tasks: [tA, tB], notes: [], ics: [] }];
    (view as any).renderGroupedAgendaWithReconciler(content, dayData);

    // Verify subgroup containers are rendered under each day section
    const subgroups = (view as any).contentEl.querySelectorAll('.task-subgroups-container');
    expect(subgroups.length).toBeGreaterThan(0);

    // Verify subgroup headers created with correct class
    const subgroupHeaders = (view as any).contentEl.querySelectorAll('.task-subgroup-header');
    expect(subgroupHeaders.length).toBeGreaterThan(0);
  });

  test('persists subgroup collapsed state per day', async () => {
    const plugin = makeBasicPluginMock();

    // subgroup collapse state mocked via GroupingUtils
    (GroupingUtils as any).isSubgroupCollapsed = jest.fn().mockReturnValue(false);
    (GroupingUtils as any).setSubgroupCollapsed = jest.fn();

    const leaf = new MockLeaf() as any;
    const view = new AgendaView(leaf, plugin as any);
    attachAgendaContainer(view);
    await view.onOpen();

    const content = (view as any).contentEl.querySelector('.agenda-view__content') as HTMLElement
      || (view as any).contentEl.createDiv({ cls: 'agenda-view__content' });

    (view as any).currentQuery.subgroupKey = 'project';
    const tA = makeTask({ path: '/a.md', project: 'Alpha' } as any);
    const tB = makeTask({ path: '/b.md', project: 'Beta' } as any);
    (view as any).renderGroupedAgendaWithReconciler(content, [{ date: new Date(), tasks: [tA, tB], notes: [], ics: [] }]);

    // Click the first subgroup header to toggle collapse
    const header = (view as any).contentEl.querySelector('.task-subgroup-header') as HTMLElement;
    expect(header).toBeTruthy();
    header.click();

    // Expect persistence to be called
    expect((GroupingUtils as any).setSubgroupCollapsed).toHaveBeenCalled();
  });
});

