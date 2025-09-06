import TaskNotesPlugin from '../main';

/**
 * Utility functions for task grouping functionality
 * Shared between TaskListView and subtask widget
 */
export class GroupingUtils {
    
    /**
     * Format group name for display with proper labels
     */
    static formatGroupName(groupName: string, plugin: TaskNotesPlugin): string {
        // Check if it's a priority value
        const priorityConfig = plugin.priorityManager.getPriorityConfig(groupName);
        if (priorityConfig) {
            return `${priorityConfig.label} priority`;
        }
        
        // Check if it's a status value  
        const statusConfig = plugin.statusManager.getStatusConfig(groupName);
        if (statusConfig) {
            return statusConfig.label;
        }
        
        switch (groupName) {
            case 'all':
                return 'All tasks';
            case 'no-status':
                return 'No status assigned';
            case 'No Status':
                return 'No Status';
            case 'No Priority':
                return 'No Priority';
            case 'No Context':
                return 'No Context';
            case 'No Project':
                return 'No Project';
            case 'No Due Date':
                return 'No Due Date';
            case 'No Scheduled Date':
                return 'No Scheduled Date';
            default:
                // For project names that may come from consolidation, return as-is
                // since they should already be cleaned by FilterService.consolidateProjectName
                return groupName;
        }
    }

    /**
     * Get group display name with task count
     */
    static getGroupDisplayName(groupKey: string, taskCount: number, plugin: TaskNotesPlugin): string {
        const formattedName = GroupingUtils.formatGroupName(groupKey, plugin);
        return `${formattedName} (${taskCount})`;
    }

    /**
     * Check if a group should be collapsed initially
     */
    static isGroupCollapsed(viewType: string, groupingKey: string, groupName: string, plugin: TaskNotesPlugin): boolean {
        try {
            const prefs = plugin.viewStateManager.getViewPreferences<any>(viewType) || {};
            const collapsed = prefs.collapsedGroups || {};
            return !!collapsed?.[groupingKey]?.[groupName];
        } catch {
            return false;
        }
    }

    /**
     * Set the collapsed state for a group
     */
    static setGroupCollapsed(viewType: string, groupingKey: string, groupName: string, collapsed: boolean, plugin: TaskNotesPlugin): void {
        const prefs = plugin.viewStateManager.getViewPreferences<any>(viewType) || {};
        const next = { ...prefs };
        if (!next.collapsedGroups) next.collapsedGroups = {};
        if (!next.collapsedGroups[groupingKey]) next.collapsedGroups[groupingKey] = {};
        next.collapsedGroups[groupingKey][groupName] = collapsed;
        plugin.viewStateManager.setViewPreferences(viewType, next);
    }

    /**
     * Expand all groups for a specific view and grouping key
     */
    static expandAllGroups(viewType: string, groupingKey: string, plugin: TaskNotesPlugin): void {
        const prefs = plugin.viewStateManager.getViewPreferences<any>(viewType) || {};
        const next = { ...(prefs.collapsedGroups || {}) } as Record<string, Record<string, boolean>>;
        next[groupingKey] = {};
        plugin.viewStateManager.setViewPreferences(viewType, { ...prefs, collapsedGroups: next });
    }

    /**
     * Collapse all groups for a specific view and grouping key
     */
    static collapseAllGroups(viewType: string, groupingKey: string, groupNames: string[], plugin: TaskNotesPlugin): void {
        const prefs = plugin.viewStateManager.getViewPreferences<any>(viewType) || {};
        const next = { ...(prefs.collapsedGroups || {}) } as Record<string, Record<string, boolean>>;
        const collapsed: Record<string, boolean> = {};
        groupNames.forEach(name => {
            collapsed[name] = true;
        });
        next[groupingKey] = collapsed;
        plugin.viewStateManager.setViewPreferences(viewType, { ...prefs, collapsedGroups: next });
    }

    /**
     * Check if a subgroup should be collapsed initially
     * Supports hierarchical grouping state management
     */
    static isSubgroupCollapsed(
        viewType: string,
        primaryGroupName: string,
        subgroupingKey: string,
        subgroupName: string,
        plugin: TaskNotesPlugin
    ): boolean {
        try {
            const prefs = plugin.viewStateManager.getViewPreferences<any>(viewType) || {};
            const collapsedSubgroups = prefs.collapsedSubgroups || {};
            return !!collapsedSubgroups?.[primaryGroupName]?.[subgroupingKey]?.[subgroupName];
        } catch {
            return false;
        }
    }

    /**
     * Set the collapsed state for a subgroup
     * Implements hierarchical state persistence for subgroups
     */
    static setSubgroupCollapsed(
        viewType: string,
        primaryGroupName: string,
        subgroupingKey: string,
        subgroupName: string,
        collapsed: boolean,
        plugin: TaskNotesPlugin
    ): void {
        const prefs = plugin.viewStateManager.getViewPreferences<any>(viewType) || {};
        const next = { ...prefs };

        // Initialize nested structure if needed
        if (!next.collapsedSubgroups) next.collapsedSubgroups = {};
        if (!next.collapsedSubgroups[primaryGroupName]) next.collapsedSubgroups[primaryGroupName] = {};
        if (!next.collapsedSubgroups[primaryGroupName][subgroupingKey]) {
            next.collapsedSubgroups[primaryGroupName][subgroupingKey] = {};
        }

        // Set the collapsed state
        next.collapsedSubgroups[primaryGroupName][subgroupingKey][subgroupName] = collapsed;

        plugin.viewStateManager.setViewPreferences(viewType, next);
    }

    /**
     * Expand all subgroups for a specific primary group
     * Utility for bulk subgroup state management
     */
    static expandAllSubgroups(
        viewType: string,
        primaryGroupName: string,
        subgroupingKey: string,
        plugin: TaskNotesPlugin
    ): void {
        const prefs = plugin.viewStateManager.getViewPreferences<any>(viewType) || {};
        const next = { ...prefs };

        if (next.collapsedSubgroups?.[primaryGroupName]?.[subgroupingKey]) {
            // Set all subgroups in this primary group to expanded (false)
            Object.keys(next.collapsedSubgroups[primaryGroupName][subgroupingKey]).forEach(subgroupName => {
                next.collapsedSubgroups[primaryGroupName][subgroupingKey][subgroupName] = false;
            });

            plugin.viewStateManager.setViewPreferences(viewType, next);
        }
    }

    /**
     * Collapse all subgroups for a specific primary group
     * Utility for bulk subgroup state management
     */
    static collapseAllSubgroups(
        viewType: string,
        primaryGroupName: string,
        subgroupingKey: string,
        subgroupNames: string[],
        plugin: TaskNotesPlugin
    ): void {
        const prefs = plugin.viewStateManager.getViewPreferences<any>(viewType) || {};
        const next = { ...prefs };

        // Initialize nested structure if needed
        if (!next.collapsedSubgroups) next.collapsedSubgroups = {};
        if (!next.collapsedSubgroups[primaryGroupName]) next.collapsedSubgroups[primaryGroupName] = {};
        if (!next.collapsedSubgroups[primaryGroupName][subgroupingKey]) {
            next.collapsedSubgroups[primaryGroupName][subgroupingKey] = {};
        }

        // Set all specified subgroups to collapsed (true)
        subgroupNames.forEach(subgroupName => {
            next.collapsedSubgroups[primaryGroupName][subgroupingKey][subgroupName] = true;
        });

        plugin.viewStateManager.setViewPreferences(viewType, next);
    }

    /**
     * Expand all subgroups globally across all primary groups
     * Used by expand all functionality for hierarchical grouping
     */
    static expandAllSubgroupsGlobally(
        viewType: string,
        subgroupingKey: string,
        plugin: TaskNotesPlugin
    ): void {
        const prefs = plugin.viewStateManager.getViewPreferences<any>(viewType) || {};
        const next = { ...prefs };

        // Clear all subgroup collapsed states for this subgrouping key
        if (next.collapsedSubgroups) {
            Object.keys(next.collapsedSubgroups).forEach(primaryGroupName => {
                if (next.collapsedSubgroups[primaryGroupName]?.[subgroupingKey]) {
                    next.collapsedSubgroups[primaryGroupName][subgroupingKey] = {};
                }
            });
        }

        plugin.viewStateManager.setViewPreferences(viewType, next);
    }

    /**
     * Collapse all subgroups globally across all primary groups
     * Used by collapse all functionality for hierarchical grouping
     */
    static collapseAllSubgroupsGlobally(
        viewType: string,
        subgroupingKey: string,
        subgroupData: Array<{primaryGroup: string, subgroupName: string}>,
        plugin: TaskNotesPlugin
    ): void {
        const prefs = plugin.viewStateManager.getViewPreferences<any>(viewType) || {};
        const next = { ...prefs };

        // Initialize nested structure if needed
        if (!next.collapsedSubgroups) next.collapsedSubgroups = {};

        // Set all specified subgroups to collapsed
        subgroupData.forEach(({primaryGroup, subgroupName}) => {
            if (!next.collapsedSubgroups[primaryGroup]) next.collapsedSubgroups[primaryGroup] = {};
            if (!next.collapsedSubgroups[primaryGroup][subgroupingKey]) {
                next.collapsedSubgroups[primaryGroup][subgroupingKey] = {};
            }
            next.collapsedSubgroups[primaryGroup][subgroupingKey][subgroupName] = true;
        });

        plugin.viewStateManager.setViewPreferences(viewType, next);
    }
}
