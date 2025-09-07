import { TaskInfo, TaskGroupKey, GroupedTasksResult } from '../types';
import { FilterService } from './FilterService';

/**
 * Service for handling hierarchical task grouping operations
 * Implements two-level grouping with primary and secondary grouping keys
 * 
 * Follows single responsibility principle by focusing solely on hierarchical grouping logic
 * Uses dependency injection for FilterService to enable testing and modularity
 */
export class HierarchicalGroupingService {
    private filterService: FilterService;

    constructor(filterService: FilterService) {
        this.filterService = filterService;
    }

    /**
     * Group tasks hierarchically by primary and secondary fields
     * 
     * @param tasks - Array of tasks to group
     * @param primaryGroupKey - Primary grouping field
     * @param secondaryGroupKey - Optional secondary grouping field
     * @param targetDate - Optional target date for date-based grouping
     * @returns GroupedTasksResult with either flat or hierarchical structure
     */
    groupTasksHierarchically(
        tasks: TaskInfo[],
        primaryGroupKey: TaskGroupKey,
        secondaryGroupKey?: TaskGroupKey,
        targetDate?: Date
    ): GroupedTasksResult {
        // Debug logging removed

        // Validate inputs early (fail-fast pattern)
        this.validateInputs(tasks, primaryGroupKey, secondaryGroupKey);

        // Single-level grouping conditions
        if (this.shouldUseFlatGrouping(primaryGroupKey, secondaryGroupKey)) {
            return this.createFlatGroupingResult(tasks, primaryGroupKey, targetDate);
        }

        // Two-level hierarchical grouping
        return this.createHierarchicalGroupingResult(tasks, primaryGroupKey, secondaryGroupKey!, targetDate);
    }

    /**
     * Validate grouping keys to prevent invalid configurations
     * Implements fail-fast validation pattern
     */
    validateGroupingKeys(primaryKey: TaskGroupKey, secondaryKey?: TaskGroupKey): void {
        if (secondaryKey && secondaryKey !== 'none' && primaryKey === secondaryKey) {
            throw new Error('Primary and secondary grouping keys cannot be the same');
        }
    }

    /**
     * Validate all inputs for hierarchical grouping
     * Private method following single level of abstraction principle
     */
    private validateInputs(
        tasks: TaskInfo[], 
        primaryGroupKey: TaskGroupKey, 
        secondaryGroupKey?: TaskGroupKey
    ): void {
        if (!Array.isArray(tasks)) {
            throw new Error('Tasks must be an array');
        }

        if (!primaryGroupKey) {
            throw new Error('Primary group key is required');
        }

        this.validateGroupingKeys(primaryGroupKey, secondaryGroupKey);
    }

    /**
     * Determine if flat grouping should be used instead of hierarchical
     * Encapsulates decision logic in single method
     */
    private shouldUseFlatGrouping(primaryGroupKey: TaskGroupKey, secondaryGroupKey?: TaskGroupKey): boolean {
        return !secondaryGroupKey || 
               secondaryGroupKey === 'none' || 
               primaryGroupKey === secondaryGroupKey;
    }

    /**
     * Create flat grouping result using existing FilterService logic
     * Maintains backward compatibility with existing grouping behavior
     */
    private createFlatGroupingResult(
        tasks: TaskInfo[], 
        primaryGroupKey: TaskGroupKey, 
        targetDate?: Date
    ): GroupedTasksResult {
        const flatGroups = this.filterService.groupTasks(tasks, primaryGroupKey, targetDate);

        console.log('Flat grouping result:', {
            groupCount: flatGroups.size,
            groups: Array.from(flatGroups.keys()),
            totalTasks: Array.from(flatGroups.values()).reduce((sum, tasks) => sum + tasks.length, 0)
        });

        return {
            isHierarchical: false,
            flatGroups
        };
    }

    /**
     * Create hierarchical grouping result with two-level structure
     * Implements the core hierarchical grouping algorithm
     */
    private createHierarchicalGroupingResult(
        tasks: TaskInfo[], 
        primaryGroupKey: TaskGroupKey, 
        secondaryGroupKey: TaskGroupKey,
        targetDate?: Date
    ): GroupedTasksResult {
        const hierarchicalGroups = new Map<string, Map<string, TaskInfo[]>>();
        
        // First, group by primary field using existing FilterService logic
        const primaryGroups = this.filterService.groupTasks(tasks, primaryGroupKey, targetDate);

        // Debug logging removed

        // Then, subgroup each primary group by secondary field
        primaryGroups.forEach((primaryTasks: TaskInfo[], primaryGroupName: string) => {
            const secondaryGroups = this.filterService.groupTasks(primaryTasks, secondaryGroupKey, targetDate);
            hierarchicalGroups.set(primaryGroupName, secondaryGroups);

            // Debug logging removed
        });

        // Debug logging removed

        return {
            isHierarchical: true,
            hierarchicalGroups
        };
    }
}
