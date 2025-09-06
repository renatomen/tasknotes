import { FilterService } from '../../src/services/FilterService';
import { HierarchicalGroupingService } from '../../src/services/HierarchicalGroupingService';
import { FilterQuery, TaskInfo, GroupedTasksResult } from '../../src/types';

// Mock dependencies
jest.mock('../../src/services/HierarchicalGroupingService');

describe('FilterService - Hierarchical Grouping Integration', () => {
    let filterService: FilterService;
    let mockHierarchicalGroupingService: jest.Mocked<HierarchicalGroupingService>;

    const createMockQuery = (overrides: Partial<FilterQuery> = {}): FilterQuery => ({
        type: 'group',
        id: 'test-query',
        conjunction: 'and',
        children: [],
        sortKey: 'due',
        sortDirection: 'asc',
        groupKey: 'status',
        ...overrides
    });

    const createMockTask = (overrides: Partial<TaskInfo> = {}): TaskInfo => ({
        title: 'Test Task',
        status: 'open',
        priority: 'normal',
        path: '/test.md',
        archived: false,
        ...overrides
    });

    beforeEach(() => {
        // Mock the HierarchicalGroupingService
        mockHierarchicalGroupingService = new HierarchicalGroupingService(null as any) as jest.Mocked<HierarchicalGroupingService>;
        
        // Create FilterService with mocked dependencies
        filterService = new FilterService(null as any, null as any, null as any);
        
        // Inject the mocked hierarchical grouping service
        (filterService as any).hierarchicalGroupingService = mockHierarchicalGroupingService;
    });

    describe('getGroupedTasks with hierarchical grouping', () => {
        test('should return flat grouping result when no subgroupKey provided', async () => {
            const query = createMockQuery({ groupKey: 'status' });
            const tasks = [createMockTask()];
            const expectedResult: GroupedTasksResult = {
                isHierarchical: false,
                flatGroups: new Map([['open', tasks]])
            };

            // Mock the hierarchical grouping service
            mockHierarchicalGroupingService.groupTasksHierarchically.mockReturnValue(expectedResult);

            // Mock internal methods that would normally be called
            jest.spyOn(filterService as any, 'getIndexOptimizedTaskPaths').mockReturnValue(new Set(['/test.md']));
            jest.spyOn(filterService as any, 'pathsToTaskInfos').mockResolvedValue(tasks);
            jest.spyOn(filterService as any, 'evaluateFilterNode').mockReturnValue(true);
            jest.spyOn(filterService as any, 'sortTasks').mockReturnValue(tasks);

            const result = await filterService.getGroupedTasks(query);

            expect(result.isHierarchical).toBe(false);
            expect(result.flatGroups).toBeDefined();
            expect(mockHierarchicalGroupingService.groupTasksHierarchically).toHaveBeenCalledWith(
                tasks,
                'status',
                undefined,
                undefined
            );
        });

        test('should return hierarchical grouping result when subgroupKey provided', async () => {
            const query = createMockQuery({ 
                groupKey: 'status', 
                subgroupKey: 'priority' 
            });
            const tasks = [createMockTask()];
            const expectedResult: GroupedTasksResult = {
                isHierarchical: true,
                hierarchicalGroups: new Map([
                    ['open', new Map([
                        ['normal', tasks]
                    ])]
                ])
            };

            mockHierarchicalGroupingService.groupTasksHierarchically.mockReturnValue(expectedResult);

            // Mock internal methods
            jest.spyOn(filterService as any, 'getIndexOptimizedTaskPaths').mockReturnValue(new Set(['/test.md']));
            jest.spyOn(filterService as any, 'pathsToTaskInfos').mockResolvedValue(tasks);
            jest.spyOn(filterService as any, 'evaluateFilterNode').mockReturnValue(true);
            jest.spyOn(filterService as any, 'sortTasks').mockReturnValue(tasks);

            const result = await filterService.getGroupedTasks(query);

            expect(result.isHierarchical).toBe(true);
            expect(result.hierarchicalGroups).toBeDefined();
            expect(mockHierarchicalGroupingService.groupTasksHierarchically).toHaveBeenCalledWith(
                tasks,
                'status',
                'priority',
                undefined
            );
        });

        test('should pass target date to hierarchical grouping service', async () => {
            const query = createMockQuery({ groupKey: 'status', subgroupKey: 'priority' });
            const tasks = [createMockTask()];
            const targetDate = new Date('2024-01-01');
            const expectedResult: GroupedTasksResult = {
                isHierarchical: false,
                flatGroups: new Map()
            };

            mockHierarchicalGroupingService.groupTasksHierarchically.mockReturnValue(expectedResult);

            // Mock internal methods
            jest.spyOn(filterService as any, 'getIndexOptimizedTaskPaths').mockReturnValue(new Set());
            jest.spyOn(filterService as any, 'pathsToTaskInfos').mockResolvedValue(tasks);
            jest.spyOn(filterService as any, 'evaluateFilterNode').mockReturnValue(true);
            jest.spyOn(filterService as any, 'sortTasks').mockReturnValue(tasks);

            await filterService.getGroupedTasks(query, targetDate);

            expect(mockHierarchicalGroupingService.groupTasksHierarchically).toHaveBeenCalledWith(
                tasks,
                'status',
                'priority',
                targetDate
            );
        });

        test('should handle errors gracefully and return empty result', async () => {
            const query = createMockQuery();
            
            mockHierarchicalGroupingService.groupTasksHierarchically.mockImplementation(() => {
                throw new Error('Grouping failed');
            });

            // Mock internal methods to succeed
            jest.spyOn(filterService as any, 'getIndexOptimizedTaskPaths').mockReturnValue(new Set());
            jest.spyOn(filterService as any, 'pathsToTaskInfos').mockResolvedValue([]);
            jest.spyOn(filterService as any, 'evaluateFilterNode').mockReturnValue(true);
            jest.spyOn(filterService as any, 'sortTasks').mockReturnValue([]);

            const result = await filterService.getGroupedTasks(query);

            expect(result.isHierarchical).toBe(false);
            expect(result.flatGroups).toBeDefined();
            expect(result.flatGroups!.size).toBe(0);
        });
    });
});
