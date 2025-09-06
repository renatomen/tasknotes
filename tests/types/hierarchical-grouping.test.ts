import { 
    GroupedTasksResult, 
    HierarchicalGroupState,
    SubgroupCollapsedState 
} from '../../src/types';
import { TaskInfo } from '../../src/types';

describe('Hierarchical Grouping Types', () => {
    describe('GroupedTasksResult', () => {
        test('should support flat grouping structure', () => {
            const mockTasks: TaskInfo[] = [
                { 
                    title: 'Test Task', 
                    status: 'open', 
                    priority: 'normal', 
                    path: '/test.md', 
                    archived: false 
                }
            ];

            const flatResult: GroupedTasksResult = {
                isHierarchical: false,
                flatGroups: new Map([['group1', mockTasks]])
            };

            expect(flatResult.isHierarchical).toBe(false);
            expect(flatResult.flatGroups).toBeDefined();
            expect(flatResult.hierarchicalGroups).toBeUndefined();
            expect(flatResult.flatGroups?.get('group1')).toEqual(mockTasks);
        });

        test('should support hierarchical grouping structure', () => {
            const mockTasks: TaskInfo[] = [
                { 
                    title: 'Test Task', 
                    status: 'open', 
                    priority: 'normal', 
                    path: '/test.md', 
                    archived: false 
                }
            ];

            const hierarchicalResult: GroupedTasksResult = {
                isHierarchical: true,
                hierarchicalGroups: new Map([
                    ['primaryGroup', new Map([
                        ['subgroup1', mockTasks]
                    ])]
                ])
            };

            expect(hierarchicalResult.isHierarchical).toBe(true);
            expect(hierarchicalResult.hierarchicalGroups).toBeDefined();
            expect(hierarchicalResult.flatGroups).toBeUndefined();
            
            const primaryGroup = hierarchicalResult.hierarchicalGroups?.get('primaryGroup');
            expect(primaryGroup?.get('subgroup1')).toEqual(mockTasks);
        });

        test('should enforce type safety for mutually exclusive properties', () => {
            // This test ensures TypeScript compilation catches invalid structures
            const validFlat: GroupedTasksResult = {
                isHierarchical: false,
                flatGroups: new Map()
            };

            const validHierarchical: GroupedTasksResult = {
                isHierarchical: true,
                hierarchicalGroups: new Map()
            };

            expect(validFlat.isHierarchical).toBe(false);
            expect(validHierarchical.isHierarchical).toBe(true);
        });
    });

    describe('HierarchicalGroupState', () => {
        test('should structure collapsed state for hierarchical groups', () => {
            const state: HierarchicalGroupState = {
                collapsedGroups: {
                    'status': {
                        'open': true,
                        'done': false
                    }
                },
                collapsedSubgroups: {
                    'open': {
                        'priority': {
                            'high': true,
                            'normal': false
                        }
                    }
                }
            };

            expect(state.collapsedGroups?.status?.open).toBe(true);
            expect(state.collapsedSubgroups?.open?.priority?.high).toBe(true);
            expect(state.collapsedSubgroups?.open?.priority?.normal).toBe(false);
        });

        test('should handle optional properties correctly', () => {
            const minimalState: HierarchicalGroupState = {};
            
            expect(minimalState.collapsedGroups).toBeUndefined();
            expect(minimalState.collapsedSubgroups).toBeUndefined();
        });
    });

    describe('SubgroupCollapsedState', () => {
        test('should provide nested structure for subgroup collapse state', () => {
            const subgroupState: SubgroupCollapsedState = {
                'primaryGroup1': {
                    'subgroupKey1': {
                        'subgroup1': true,
                        'subgroup2': false
                    }
                }
            };

            expect(subgroupState.primaryGroup1?.subgroupKey1?.subgroup1).toBe(true);
            expect(subgroupState.primaryGroup1?.subgroupKey1?.subgroup2).toBe(false);
        });
    });
});
