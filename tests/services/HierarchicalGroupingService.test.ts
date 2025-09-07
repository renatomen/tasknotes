import { HierarchicalGroupingService } from '../../src/services/HierarchicalGroupingService';
import { FilterService } from '../../src/services/FilterService';
import { TaskInfo, TaskGroupKey, GroupedTasksResult } from '../../src/types';

// Mock FilterService
jest.mock('../../src/services/FilterService');

describe('HierarchicalGroupingService', () => {
    let hierarchicalGroupingService: HierarchicalGroupingService;
    let mockFilterService: jest.Mocked<FilterService>;

    const createMockTask = (overrides: Partial<TaskInfo> = {}): TaskInfo => ({
        title: 'Test Task',
        status: 'open',
        priority: 'normal',
        path: '/test.md',
        archived: false,
        ...overrides
    });

    beforeEach(() => {
        mockFilterService = new FilterService(null as any, null as any, null as any) as jest.Mocked<FilterService>;
        hierarchicalGroupingService = new HierarchicalGroupingService(mockFilterService);
    });

    describe('groupTasksHierarchically', () => {
        test('should return flat grouping when no subgroup key provided', () => {
            const tasks = [createMockTask({ status: 'open' })];
            const mockFlatGroups = new Map([['open', tasks]]);
            
            // Mock the private groupTasks method
            (mockFilterService as any).groupTasks = jest.fn().mockReturnValue(mockFlatGroups);

            const result = hierarchicalGroupingService.groupTasksHierarchically(
                tasks,
                'status',
                undefined
            );

            expect(result.isHierarchical).toBe(false);
            expect(result.flatGroups).toEqual(mockFlatGroups);
            expect(result.hierarchicalGroups).toBeUndefined();
        });

        test('should return flat grouping when subgroup key is none', () => {
            const tasks = [createMockTask({ status: 'open' })];
            const mockFlatGroups = new Map([['open', tasks]]);
            
            (mockFilterService as any).groupTasks = jest.fn().mockReturnValue(mockFlatGroups);

            const result = hierarchicalGroupingService.groupTasksHierarchically(
                tasks,
                'status',
                'none'
            );

            expect(result.isHierarchical).toBe(false);
            expect(result.flatGroups).toEqual(mockFlatGroups);
        });

        test('should return flat grouping when primary and secondary keys are same', () => {
            const tasks = [createMockTask({ status: 'open' })];
            const mockFlatGroups = new Map([['open', tasks]]);
            
            (mockFilterService as any).groupTasks = jest.fn().mockReturnValue(mockFlatGroups);

            const result = hierarchicalGroupingService.groupTasksHierarchically(
                tasks,
                'status',
                'status'
            );

            expect(result.isHierarchical).toBe(false);
            expect(result.flatGroups).toEqual(mockFlatGroups);
        });

        test('should return hierarchical grouping for different primary and secondary keys', () => {
            const tasks = [
                createMockTask({ status: 'open', priority: 'high' }),
                createMockTask({ status: 'open', priority: 'low' }),
                createMockTask({ status: 'done', priority: 'high' })
            ];

            // Mock primary grouping (by status)
            const primaryGroups = new Map([
                ['open', [tasks[0], tasks[1]]],
                ['done', [tasks[2]]]
            ]);

            // Mock secondary grouping for 'open' status
            const openSubgroups = new Map([
                ['high', [tasks[0]]],
                ['low', [tasks[1]]]
            ]);

            // Mock secondary grouping for 'done' status
            const doneSubgroups = new Map([
                ['high', [tasks[2]]]
            ]);

            (mockFilterService as any).groupTasks = jest.fn()
                .mockReturnValueOnce(primaryGroups) // First call for primary grouping
                .mockReturnValueOnce(openSubgroups) // Second call for 'open' subgrouping
                .mockReturnValueOnce(doneSubgroups); // Third call for 'done' subgrouping

            const result = hierarchicalGroupingService.groupTasksHierarchically(
                tasks,
                'status',
                'priority'
            );

            expect(result.isHierarchical).toBe(true);
            expect(result.flatGroups).toBeUndefined();
            expect(result.hierarchicalGroups).toBeDefined();

            const hierarchicalGroups = result.hierarchicalGroups!;
            expect(hierarchicalGroups.get('open')).toEqual(openSubgroups);
            expect(hierarchicalGroups.get('done')).toEqual(doneSubgroups);
        });

        test('should handle empty task arrays gracefully', () => {
            const tasks: TaskInfo[] = [];
            const mockFlatGroups = new Map();
            
            (mockFilterService as any).groupTasks = jest.fn().mockReturnValue(mockFlatGroups);

            const result = hierarchicalGroupingService.groupTasksHierarchically(
                tasks,
                'status',
                'priority'
            );

            expect(result.isHierarchical).toBe(true);
            expect(result.hierarchicalGroups).toBeDefined();
            expect(result.hierarchicalGroups!.size).toBe(0);
        });

        test('should pass target date to grouping operations', () => {
            const tasks = [createMockTask()];
            const targetDate = new Date('2024-01-01');
            const mockFlatGroups = new Map([['group', tasks]]);
            
            (mockFilterService as any).groupTasks = jest.fn().mockReturnValue(mockFlatGroups);

            hierarchicalGroupingService.groupTasksHierarchically(
                tasks,
                'status',
                'priority',
                targetDate
            );

            expect((mockFilterService as any).groupTasks).toHaveBeenCalledWith(
                tasks,
                'status',
                targetDate
            );
        });
    });

    describe('validateGroupingKeys', () => {
        test('should validate that grouping keys are different', () => {
            expect(() => {
                hierarchicalGroupingService.validateGroupingKeys('status', 'status');
            }).toThrow('Primary and secondary grouping keys cannot be the same');
        });

        test('should allow different grouping keys', () => {
            expect(() => {
                hierarchicalGroupingService.validateGroupingKeys('status', 'priority');
            }).not.toThrow();
        });

        test('should allow undefined secondary key', () => {
            expect(() => {
                hierarchicalGroupingService.validateGroupingKeys('status', undefined);
            }).not.toThrow();
        });

        test('should allow none as secondary key', () => {
            expect(() => {
                hierarchicalGroupingService.validateGroupingKeys('status', 'none');
            }).not.toThrow();
        });
    });
});
