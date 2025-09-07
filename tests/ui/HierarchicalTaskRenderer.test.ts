import { HierarchicalTaskRenderer } from '../../src/ui/HierarchicalTaskRenderer';
import { GroupedTasksResult, TaskInfo } from '../../src/types';
import TaskNotesPlugin from '../../src/main';

// Mock dependencies
jest.mock('../../src/main');
jest.mock('../../src/utils/GroupCountUtils');

describe('HierarchicalTaskRenderer', () => {
    let renderer: HierarchicalTaskRenderer;
    let mockPlugin: jest.Mocked<TaskNotesPlugin>;
    let container: HTMLElement;
    let taskElements: Map<string, HTMLElement>;
    let mockCreateTaskCard: jest.Mock;
    let mockUpdateTaskCard: jest.Mock;

    const createMockTask = (overrides: Partial<TaskInfo> = {}): TaskInfo => ({
        title: 'Test Task',
        status: 'open',
        priority: 'normal',
        path: '/test.md',
        archived: false,
        ...overrides
    });

    beforeEach(() => {
        // Setup DOM environment
        document.body.innerHTML = '';
        container = document.createElement('div');
        document.body.appendChild(container);
        
        taskElements = new Map();
        mockCreateTaskCard = jest.fn().mockReturnValue(document.createElement('div'));
        mockUpdateTaskCard = jest.fn();

        // Mock plugin
        mockPlugin = {
            domReconciler: {
                updateList: jest.fn()
            },
            statusManager: {
                isCompletedStatus: jest.fn().mockReturnValue(false)
            }
        } as any;

        renderer = new HierarchicalTaskRenderer(mockPlugin, 'task-list');
    });

    afterEach(() => {
        document.body.innerHTML = '';
    });

    describe('renderHierarchicalGroups', () => {
        test('should render flat groups when isHierarchical is false', () => {
            const flatResult: GroupedTasksResult = {
                isHierarchical: false,
                flatGroups: new Map([
                    ['group1', [createMockTask({ title: 'Task 1' })]]
                ])
            };

            const mockQuery = { groupKey: 'status' };

            renderer.renderHierarchicalGroups(
                container,
                flatResult,
                mockQuery,
                taskElements,
                mockCreateTaskCard,
                mockUpdateTaskCard
            );

            // Should call renderFlatGroups method
            expect(container.children.length).toBeGreaterThan(0);
        });

        test('should render hierarchical groups when isHierarchical is true', () => {
            const hierarchicalResult: GroupedTasksResult = {
                isHierarchical: true,
                hierarchicalGroups: new Map([
                    ['Primary Group', new Map([
                        ['Subgroup 1', [createMockTask({ title: 'Task 1' })]],
                        ['Subgroup 2', [createMockTask({ title: 'Task 2' })]]
                    ])]
                ])
            };

            const mockQuery = { groupKey: 'status', subgroupKey: 'priority' };

            renderer.renderHierarchicalGroups(
                container,
                hierarchicalResult,
                mockQuery,
                taskElements,
                mockCreateTaskCard,
                mockUpdateTaskCard
            );

            // Should create primary group sections
            const primaryGroups = container.querySelectorAll('.task-primary-group');
            expect(primaryGroups.length).toBe(1);

            // Should create subgroup sections
            const subgroups = container.querySelectorAll('.task-subgroup');
            expect(subgroups.length).toBe(2);
        });

        test('should clear container and taskElements before rendering', () => {
            // Add some existing content
            container.innerHTML = '<div>existing content</div>';
            taskElements.set('existing', document.createElement('div'));

            const flatResult: GroupedTasksResult = {
                isHierarchical: false,
                flatGroups: new Map()
            };

            renderer.renderHierarchicalGroups(
                container,
                flatResult,
                {},
                taskElements,
                mockCreateTaskCard,
                mockUpdateTaskCard
            );

            expect(container.innerHTML).not.toContain('existing content');
            expect(taskElements.size).toBe(0);
        });

        test('should handle empty hierarchical groups', () => {
            const emptyResult: GroupedTasksResult = {
                isHierarchical: true,
                hierarchicalGroups: new Map()
            };

            renderer.renderHierarchicalGroups(
                container,
                emptyResult,
                {},
                taskElements,
                mockCreateTaskCard,
                mockUpdateTaskCard
            );

            expect(container.children.length).toBe(0);
        });
    });

    describe('renderPrimaryGroup', () => {
        test('should create primary group with correct structure', () => {
            const subgroups = new Map([
                ['Subgroup 1', [createMockTask()]]
            ]);

            (renderer as any).renderPrimaryGroup(
                container,
                'Primary Group',
                subgroups,
                { groupKey: 'status', subgroupKey: 'priority' },
                taskElements,
                mockCreateTaskCard,
                mockUpdateTaskCard
            );

            const primaryGroup = container.querySelector('.task-primary-group');
            expect(primaryGroup).toBeTruthy();
            expect(primaryGroup?.getAttribute('data-group')).toBe('Primary Group');
            expect(primaryGroup?.getAttribute('data-group-level')).toBe('primary');
        });

        test('should create primary group header with count', () => {
            const tasks = [
                createMockTask({ status: 'done' }),
                createMockTask({ status: 'open' })
            ];
            const subgroups = new Map([['Subgroup 1', tasks]]);

            // Mock GroupCountUtils
            const mockGroupCountUtils = require('../../src/utils/GroupCountUtils');
            mockGroupCountUtils.GroupCountUtils = {
                calculateGroupStats: jest.fn().mockReturnValue({ completed: 1, total: 2 }),
                formatGroupCount: jest.fn().mockReturnValue({ text: '1 / 2' })
            };

            (renderer as any).renderPrimaryGroup(
                container,
                'Primary Group',
                subgroups,
                { groupKey: 'status', subgroupKey: 'priority' },
                taskElements,
                mockCreateTaskCard,
                mockUpdateTaskCard
            );

            const header = container.querySelector('.task-primary-group-header');
            expect(header).toBeTruthy();
            
            const countElement = header?.querySelector('.agenda-view__item-count');
            expect(countElement).toBeTruthy();
        });

        test('should create subgroups container', () => {
            const subgroups = new Map([
                ['Subgroup 1', [createMockTask()]]
            ]);

            (renderer as any).renderPrimaryGroup(
                container,
                'Primary Group',
                subgroups,
                { groupKey: 'status', subgroupKey: 'priority' },
                taskElements,
                mockCreateTaskCard,
                mockUpdateTaskCard
            );

            const subgroupsContainer = container.querySelector('.task-subgroups-container');
            expect(subgroupsContainer).toBeTruthy();
        });
    });

    describe('renderSubgroup', () => {
        test('should create subgroup with correct structure', () => {
            const tasks = [createMockTask()];

            (renderer as any).renderSubgroup(
                container,
                'Primary Group',
                'Subgroup 1',
                tasks,
                { groupKey: 'status', subgroupKey: 'priority' },
                taskElements,
                mockCreateTaskCard,
                mockUpdateTaskCard
            );

            const subgroup = container.querySelector('.task-subgroup');
            expect(subgroup).toBeTruthy();
            expect(subgroup?.getAttribute('data-group')).toBe('Primary Group');
            expect(subgroup?.getAttribute('data-subgroup')).toBe('Subgroup 1');
            expect(subgroup?.getAttribute('data-group-level')).toBe('secondary');
        });

        test('should create subgroup header with count', () => {
            const tasks = [createMockTask({ status: 'done' })];

            // Mock GroupCountUtils
            const mockGroupCountUtils = require('../../src/utils/GroupCountUtils');
            mockGroupCountUtils.GroupCountUtils = {
                calculateGroupStats: jest.fn().mockReturnValue({ completed: 1, total: 1 }),
                formatGroupCount: jest.fn().mockReturnValue({ text: '1 / 1' })
            };

            (renderer as any).renderSubgroup(
                container,
                'Primary Group',
                'Subgroup 1',
                tasks,
                { groupKey: 'status', subgroupKey: 'priority' },
                taskElements,
                mockCreateTaskCard,
                mockUpdateTaskCard
            );

            const header = container.querySelector('.task-subgroup-header');
            expect(header).toBeTruthy();
            
            const countElement = header?.querySelector('.agenda-view__item-count');
            expect(countElement).toBeTruthy();
        });

        test('should use DOM reconciler for task rendering', () => {
            const tasks = [createMockTask()];

            (renderer as any).renderSubgroup(
                container,
                'Primary Group',
                'Subgroup 1',
                tasks,
                { groupKey: 'status', subgroupKey: 'priority' },
                taskElements,
                mockCreateTaskCard,
                mockUpdateTaskCard
            );

            expect(mockPlugin.domReconciler.updateList).toHaveBeenCalledWith(
                expect.any(HTMLElement),
                tasks,
                expect.any(Function),
                mockCreateTaskCard,
                mockUpdateTaskCard
            );
        });
    });
});
