import { SavedView } from '../../src/types';

export const makeBasicPluginMock = () => ({
  onReady: jest.fn().mockResolvedValue(undefined),
  waitForMigration: jest.fn().mockResolvedValue(undefined),
  selectedDate: new Date().toISOString(),
  emitter: { on: jest.fn().mockReturnValue({}), offref: jest.fn() },
  viewStateManager: {
    getFilterState: jest.fn(),
    setFilterState: jest.fn(),
    getViewPreferences: jest.fn().mockReturnValue({}),
    setViewPreferences: jest.fn(),
    getSavedViews: jest.fn().mockReturnValue([] as SavedView[]),
    on: jest.fn(),
  },
  filterService: Object.assign(new (class {
    async getFilterOptions() { return { userProperties: [] }; }
    createDefaultQuery() { return { type: 'group', id: 'root', conjunction: 'and', children: [], sortKey: 'scheduled', sortDirection: 'asc', groupKey: 'none' }; }
    async getTasksForDate() { return []; }
    groupTasks(tasks: any[], key: any) { return new Map([['all', tasks]]); }
  })(), {
    on: jest.fn().mockReturnValue(() => {}),
  }),
  icsSubscriptionService: undefined,
  domReconciler: { updateList: jest.fn((container: any, items: any[]) => { (container as any)._items = items; }) },
  statusManager: { isCompletedStatus: jest.fn().mockReturnValue(false) },
  // Minimal cacheManager for AgendaView.waitForCacheReady and notes fetching
  cacheManager: {
    isInitialized: jest.fn().mockReturnValue(true),
    subscribe: jest.fn().mockReturnValue(() => {}),
    getNotesForDate: jest.fn().mockResolvedValue([]),
  },
  settings: { disableNoteIndexing: true },
});

