import { setIcon } from 'obsidian';
import { TaskInfo, GroupedTasksResult } from '../types';
import { GroupingUtils } from '../utils/GroupingUtils';
import { GroupCountUtils } from '../utils/GroupCountUtils';
import TaskNotesPlugin from '../main';

/**
 * Renderer for hierarchical task grouping with two-level structure
 * Handles both flat and hierarchical grouping display with proper state management
 * 
 * Follows single responsibility principle by focusing solely on hierarchical rendering
 * Uses dependency injection for plugin services and callbacks
 * Implements proper separation between UI rendering and business logic
 */
export class HierarchicalTaskRenderer {
    private plugin: TaskNotesPlugin;
    private viewType: string;

    constructor(plugin: TaskNotesPlugin, viewType: string) {
        this.plugin = plugin;
        this.viewType = viewType;
    }

    /**
     * Render hierarchical groups with proper nesting and count display
     * Handles both flat and hierarchical structures based on result type
     * 
     * @param container - DOM container for rendering
     * @param groupedResult - Result from hierarchical grouping service
     * @param currentQuery - Current filter query for state management
     * @param taskElements - Map for tracking task DOM elements
     * @param createTaskCardCallback - Callback for creating new task cards
     * @param updateTaskCardCallback - Callback for updating existing task cards
     */
    renderHierarchicalGroups(
        container: HTMLElement, 
        groupedResult: GroupedTasksResult,
        currentQuery: any,
        taskElements: Map<string, HTMLElement>,
        createTaskCardCallback: (task: TaskInfo) => HTMLElement,
        updateTaskCardCallback: (element: HTMLElement, task: TaskInfo) => void
    ): void {
        // Clear container and reset tracking
        this.clearContainer(container, taskElements);

        // Route to appropriate rendering method based on structure
        if (!groupedResult.isHierarchical || !groupedResult.hierarchicalGroups) {
            this.renderFlatGroups(
                container, 
                groupedResult.flatGroups || new Map(), 
                currentQuery, 
                taskElements, 
                createTaskCardCallback, 
                updateTaskCardCallback
            );
            return;
        }

        // Render hierarchical structure
        this.renderHierarchicalStructure(
            container,
            groupedResult.hierarchicalGroups,
            currentQuery,
            taskElements,
            createTaskCardCallback,
            updateTaskCardCallback
        );
    }

    /**
     * Clear container and reset element tracking
     * Implements proper cleanup for DOM reconciliation
     */
    private clearContainer(container: HTMLElement, taskElements: Map<string, HTMLElement>): void {
        container.empty();
        taskElements.clear();
    }

    /**
     * Render flat groups using existing patterns
     * Maintains backward compatibility with single-level grouping
     */
    private renderFlatGroups(
        container: HTMLElement,
        flatGroups: Map<string, TaskInfo[]>,
        currentQuery: any,
        taskElements: Map<string, HTMLElement>,
        createTaskCardCallback: (task: TaskInfo) => HTMLElement,
        updateTaskCardCallback: (element: HTMLElement, task: TaskInfo) => void
    ): void {
        flatGroups.forEach((tasks, groupName) => {
            if (tasks.length === 0) return;
            
            this.renderSingleGroup(
                container,
                groupName,
                tasks,
                currentQuery,
                taskElements,
                createTaskCardCallback,
                updateTaskCardCallback,
                false // Not a hierarchical context
            );
        });
    }

    /**
     * Render hierarchical structure with primary groups and subgroups
     * Implements two-level nesting with proper visual hierarchy
     */
    private renderHierarchicalStructure(
        container: HTMLElement,
        hierarchicalGroups: Map<string, Map<string, TaskInfo[]>>,
        currentQuery: any,
        taskElements: Map<string, HTMLElement>,
        createTaskCardCallback: (task: TaskInfo) => HTMLElement,
        updateTaskCardCallback: (element: HTMLElement, task: TaskInfo) => void
    ): void {
        hierarchicalGroups.forEach((subgroups, primaryGroupName) => {
            this.renderPrimaryGroup(
                container, 
                primaryGroupName, 
                subgroups, 
                currentQuery,
                taskElements,
                createTaskCardCallback,
                updateTaskCardCallback
            );
        });
    }

    /**
     * Render a primary group with its subgroups
     * Creates the top-level group container with aggregated counts
     */
    private renderPrimaryGroup(
        container: HTMLElement,
        primaryGroupName: string,
        subgroups: Map<string, TaskInfo[]>,
        currentQuery: any,
        taskElements: Map<string, HTMLElement>,
        createTaskCardCallback: (task: TaskInfo) => HTMLElement,
        updateTaskCardCallback: (element: HTMLElement, task: TaskInfo) => void
    ): void {
        // Create primary group section
        const primarySection = container.createDiv({ 
            cls: 'task-section task-group task-primary-group' 
        });
        primarySection.setAttribute('data-group', primaryGroupName);
        primarySection.setAttribute('data-group-level', 'primary');

        // Calculate aggregated stats for all tasks in this primary group
        const allPrimaryTasks = Array.from(subgroups.values()).flat();
        const primaryGroupStats = GroupCountUtils.calculateGroupStats(allPrimaryTasks, this.plugin);

        // Create primary group header with count
        this.createPrimaryGroupHeader(
            primarySection, 
            primaryGroupName, 
            primaryGroupStats, 
            currentQuery
        );

        // Create subgroups container
        const subgroupsContainer = primarySection.createDiv({ 
            cls: 'task-subgroups-container' 
        });

        // Apply initial collapsed state
        const primaryGroupingKey = currentQuery.groupKey || 'none';
        const isPrimaryCollapsed = this.isGroupCollapsed(primaryGroupingKey, primaryGroupName);
        
        if (isPrimaryCollapsed) {
            primarySection.addClass('is-collapsed');
            subgroupsContainer.style.display = 'none';
        }

        // Render each subgroup
        subgroups.forEach((tasks, subgroupName) => {
            this.renderSubgroup(
                subgroupsContainer,
                primaryGroupName,
                subgroupName,
                tasks,
                currentQuery,
                taskElements,
                createTaskCardCallback,
                updateTaskCardCallback
            );
        });
    }

    /**
     * Create primary group header with toggle, title, and count
     * Implements consistent header structure with existing patterns
     */
    private createPrimaryGroupHeader(
        primarySection: HTMLElement,
        primaryGroupName: string,
        primaryGroupStats: { completed: number; total: number },
        currentQuery: any
    ): void {
        const primaryHeader = primarySection.createEl('h3', {
            cls: 'task-group-header task-list-view__group-header task-primary-group-header'
        });

        // Create left side container (toggle + title)
        const leftContainer = primaryHeader.createDiv({
            cls: 'task-group-header-left'
        });

        // Create toggle button
        const toggleBtn = leftContainer.createEl('button', {
            cls: 'task-group-toggle',
            attr: { 'aria-label': 'Toggle group' }
        });

        try {
            setIcon(toggleBtn, 'chevron-right');
        } catch (_) {
            toggleBtn.textContent = '▸';
            toggleBtn.addClass('chevron-text');
        }

        // Group name
        leftContainer.createSpan({ text: this.formatGroupName(primaryGroupName) });

        // Create right side container (controls + count)
        const rightContainer = primaryHeader.createDiv({
            cls: 'task-group-header-right'
        });

        // Add expand/collapse subgroup buttons when subgrouping is active
        const subgroupKey = currentQuery.subgroupKey;
        if (subgroupKey && subgroupKey !== 'none') {
            this.addSubgroupControlButtons(rightContainer, primarySection, primaryGroupName, subgroupKey);
        }

        // Add primary group count
        const countSpan = rightContainer.createSpan({
            text: ` ${GroupCountUtils.formatGroupCount(primaryGroupStats.completed, primaryGroupStats.total).text}`,
            cls: 'agenda-view__item-count'
        });

        // Add click handler for collapse/expand
        this.addPrimaryGroupClickHandler(primaryHeader, primarySection, toggleBtn, currentQuery, primaryGroupName);
    }

    /**
     * Add expand/collapse subgroup control buttons to primary group header
     * Buttons are positioned to the right of the task count with proper spacing
     */
    private addSubgroupControlButtons(
        primaryHeader: HTMLElement,
        primarySection: HTMLElement,
        primaryGroupName: string,
        subgroupKey: string
    ): void {
        // Create container for subgroup control buttons
        const controlsContainer = primaryHeader.createDiv({
            cls: 'task-group-subgroup-controls'
        });

        // Expand group and subgroups button
        const expandSubgroupsBtn = controlsContainer.createEl('button', {
            cls: 'task-group-subgroup-control-btn task-group-expand-subgroups',
            attr: {
                'aria-label': `Expand ${primaryGroupName} and all its subgroups`,
                'title': 'Expand group and all subgroups'
            }
        });

        try {
            setIcon(expandSubgroupsBtn, 'list-tree');
        } catch (_) {
            expandSubgroupsBtn.textContent = '⊞';
        }

        // Collapse group and subgroups button
        const collapseSubgroupsBtn = controlsContainer.createEl('button', {
            cls: 'task-group-subgroup-control-btn task-group-collapse-subgroups',
            attr: {
                'aria-label': `Collapse ${primaryGroupName} and all its subgroups`,
                'title': 'Collapse group and all subgroups'
            }
        });

        try {
            setIcon(collapseSubgroupsBtn, 'list-collapse');
        } catch (_) {
            collapseSubgroupsBtn.textContent = '⊟';
        }

        // Add click handlers
        expandSubgroupsBtn.addEventListener('click', (e: MouseEvent) => {
            e.stopPropagation(); // Prevent primary group toggle
            this.expandGroupAndSubgroups(primarySection, primaryGroupName, subgroupKey);
        });

        collapseSubgroupsBtn.addEventListener('click', (e: MouseEvent) => {
            e.stopPropagation(); // Prevent primary group toggle
            this.collapseGroupAndSubgroups(primarySection, primaryGroupName, subgroupKey);
        });
    }

    /**
     * Expand primary group and all its subgroups
     */
    private expandGroupAndSubgroups(
        primarySection: HTMLElement,
        primaryGroupName: string,
        subgroupKey: string
    ): void {
        // First, expand the primary group itself
        primarySection.classList.remove('is-collapsed');
        const subgroupsContainer = primarySection.querySelector('.task-subgroups-container') as HTMLElement | null;
        if (subgroupsContainer) {
            subgroupsContainer.style.display = '';
        }

        // Then, expand all subgroups within this primary group
        const subgroups = primarySection.querySelectorAll('.task-subgroup');
        subgroups.forEach(subgroupSection => {
            subgroupSection.classList.remove('is-collapsed');
            const taskCards = subgroupSection.querySelector('.task-cards') as HTMLElement | null;
            if (taskCards) taskCards.style.display = '';
        });

        // Update state - expand primary group and all its subgroups
        // Note: We need to get the primary grouping key from the current query
        // For now, we'll handle the subgroups state only since primary group state is managed elsewhere
        GroupingUtils.expandAllSubgroups(this.viewType, primaryGroupName, subgroupKey, this.plugin);
    }

    /**
     * Collapse primary group and all its subgroups
     */
    private collapseGroupAndSubgroups(
        primarySection: HTMLElement,
        primaryGroupName: string,
        subgroupKey: string
    ): void {
        // First, collapse the primary group itself
        primarySection.classList.add('is-collapsed');
        const subgroupsContainer = primarySection.querySelector('.task-subgroups-container') as HTMLElement | null;
        if (subgroupsContainer) {
            subgroupsContainer.style.display = 'none';
        }

        // Collect subgroup names for state management
        const subgroupNames: string[] = [];
        const subgroups = primarySection.querySelectorAll('.task-subgroup');

        subgroups.forEach(subgroupSection => {
            const subgroupName = (subgroupSection as HTMLElement).dataset.subgroup;
            if (subgroupName) {
                subgroupNames.push(subgroupName);
                subgroupSection.classList.add('is-collapsed');
                const taskCards = subgroupSection.querySelector('.task-cards') as HTMLElement | null;
                if (taskCards) taskCards.style.display = 'none';
            }
        });

        // Update state - collapse primary group and all its subgroups
        // Note: We need to get the primary grouping key from the current query
        // For now, we'll handle the subgroups state only since primary group state is managed elsewhere
        GroupingUtils.collapseAllSubgroups(this.viewType, primaryGroupName, subgroupKey, subgroupNames, this.plugin);
    }

    /**
     * Add click handler for primary group collapse/expand
     * Implements proper state management and visual feedback
     */
    private addPrimaryGroupClickHandler(
        header: HTMLElement,
        section: HTMLElement,
        toggleBtn: HTMLElement,
        currentQuery: any,
        groupName: string
    ): void {
        header.addEventListener('click', (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            if (target.closest('a')) return; // Ignore clicks on project links
            if (target.closest('.task-group-header-right')) return; // Ignore clicks on right side (controls + count)

            const willCollapse = !section.hasClass('is-collapsed');
            const groupingKey = currentQuery.groupKey || 'none';

            this.setGroupCollapsed(groupingKey, groupName, willCollapse);
            section.toggleClass('is-collapsed', willCollapse);

            const subgroupsContainer = section.querySelector('.task-subgroups-container') as HTMLElement | null;
            if (subgroupsContainer) {
                subgroupsContainer.style.display = willCollapse ? 'none' : '';
            }

            toggleBtn.setAttr('aria-expanded', String(!willCollapse));
        });
    }

    /**
     * Render a subgroup within a primary group
     * Creates secondary-level group with individual task rendering
     */
    private renderSubgroup(
        container: HTMLElement,
        primaryGroupName: string,
        subgroupName: string,
        tasks: TaskInfo[],
        currentQuery: any,
        taskElements: Map<string, HTMLElement>,
        createTaskCardCallback: (task: TaskInfo) => HTMLElement,
        updateTaskCardCallback: (element: HTMLElement, task: TaskInfo) => void
    ): void {
        // Create subgroup section
        const subgroupSection = container.createDiv({ cls: 'task-section task-subgroup' });
        subgroupSection.setAttribute('data-group', primaryGroupName);
        subgroupSection.setAttribute('data-subgroup', subgroupName);
        subgroupSection.setAttribute('data-group-level', 'secondary');

        // Calculate completion stats for this subgroup
        const subgroupStats = GroupCountUtils.calculateGroupStats(tasks, this.plugin);

        // Create subgroup header with count
        this.createSubgroupHeader(
            subgroupSection,
            subgroupName,
            subgroupStats,
            currentQuery,
            primaryGroupName
        );

        // Create task cards container
        const taskCardsContainer = subgroupSection.createDiv({
            cls: 'tasks-container task-cards'
        });

        // Apply initial collapsed state for subgroup
        const subgroupingKey = currentQuery.subgroupKey || 'none';
        const isSubgroupCollapsed = this.isSubgroupCollapsed(primaryGroupName, subgroupingKey, subgroupName);

        if (isSubgroupCollapsed) {
            subgroupSection.addClass('is-collapsed');
            taskCardsContainer.style.display = 'none';
        }

        // Render tasks using DOM reconciler
        this.plugin.domReconciler.updateList<TaskInfo>(
            taskCardsContainer,
            tasks,
            (task) => task.path, // Unique key
            createTaskCardCallback,
            updateTaskCardCallback
        );

        // Update task elements tracking for this subgroup
        this.updateTaskElementsTracking(taskCardsContainer, taskElements);
    }

    /**
     * Create subgroup header with toggle, title, and count
     * Implements secondary-level header with proper styling
     */
    private createSubgroupHeader(
        subgroupSection: HTMLElement,
        subgroupName: string,
        subgroupStats: { completed: number; total: number },
        currentQuery: any,
        primaryGroupName: string
    ): void {
        const subgroupHeader = subgroupSection.createEl('h4', {
            cls: 'task-group-header task-subgroup-header'
        });

        // Create left side container (toggle + title)
        const leftContainer = subgroupHeader.createDiv({
            cls: 'task-group-header-left'
        });

        // Create toggle button for subgroup
        const subToggleBtn = leftContainer.createEl('button', {
            cls: 'task-group-toggle',
            attr: { 'aria-label': 'Toggle subgroup' }
        });

        try {
            setIcon(subToggleBtn, 'chevron-right');
        } catch (_) {
            subToggleBtn.textContent = '▸';
            subToggleBtn.addClass('chevron-text');
        }

        // Subgroup name
        leftContainer.createSpan({ text: this.formatGroupName(subgroupName) });

        // Create right side container (count only for subgroups)
        const rightContainer = subgroupHeader.createDiv({
            cls: 'task-group-header-right'
        });

        // Add subgroup count
        rightContainer.createSpan({
            text: ` ${GroupCountUtils.formatGroupCount(subgroupStats.completed, subgroupStats.total).text}`,
            cls: 'agenda-view__item-count'
        });

        // Add click handler for subgroup collapse/expand
        this.addSubgroupClickHandler(
            subgroupHeader,
            subgroupSection,
            subToggleBtn,
            currentQuery,
            primaryGroupName,
            subgroupName
        );
    }

    /**
     * Add click handler for subgroup collapse/expand
     * Manages subgroup-specific state persistence
     */
    private addSubgroupClickHandler(
        header: HTMLElement,
        section: HTMLElement,
        toggleBtn: HTMLElement,
        currentQuery: any,
        primaryGroupName: string,
        subgroupName: string
    ): void {
        header.addEventListener('click', (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            if (target.closest('a')) return;
            if (target.closest('.task-group-header-right')) return; // Ignore clicks on right side (count)

            const willCollapse = !section.hasClass('is-collapsed');
            const subgroupingKey = currentQuery.subgroupKey || 'none';

            this.setSubgroupCollapsed(primaryGroupName, subgroupingKey, subgroupName, willCollapse);
            section.toggleClass('is-collapsed', willCollapse);

            const taskCardsContainer = section.querySelector('.task-cards') as HTMLElement | null;
            if (taskCardsContainer) {
                taskCardsContainer.style.display = willCollapse ? 'none' : '';
            }

            toggleBtn.setAttr('aria-expanded', String(!willCollapse));
        });
    }

    /**
     * Render a single group (used for flat grouping)
     * Maintains compatibility with existing single-level grouping
     */
    private renderSingleGroup(
        container: HTMLElement,
        groupName: string,
        tasks: TaskInfo[],
        currentQuery: any,
        taskElements: Map<string, HTMLElement>,
        createTaskCardCallback: (task: TaskInfo) => HTMLElement,
        updateTaskCardCallback: (element: HTMLElement, task: TaskInfo) => void,
        isHierarchical: boolean
    ): void {
        // Create group section
        const groupSection = container.createDiv({ cls: 'task-section task-group' });
        groupSection.setAttribute('data-group', groupName);

        const groupingKey = currentQuery.groupKey || 'none';
        const isAllGroup = groupingKey === 'none' && groupName === 'all';
        const collapsedInitially = this.isGroupCollapsed(groupingKey, groupName);

        // Add group header (skip only if grouping is 'none' and group name is 'all')
        if (!isAllGroup) {
            const headerElement = groupSection.createEl('h3', {
                cls: 'task-group-header task-list-view__group-header'
            });

            // Calculate completion stats for this group
            const groupStats = GroupCountUtils.calculateGroupStats(tasks, this.plugin);

            // Create toggle button
            const toggleBtn = headerElement.createEl('button', {
                cls: 'task-group-toggle',
                attr: { 'aria-label': 'Toggle group' }
            });

            try {
                setIcon(toggleBtn, 'chevron-right');
            } catch (_) {
                toggleBtn.textContent = '▸';
                toggleBtn.addClass('chevron-text');
            }

            // Group name and count
            headerElement.createSpan({ text: this.formatGroupName(groupName) });
            headerElement.createSpan({
                text: ` ${GroupCountUtils.formatGroupCount(groupStats.completed, groupStats.total).text}`,
                cls: 'agenda-view__item-count'
            });

            // Click handler
            headerElement.addEventListener('click', (e: MouseEvent) => {
                const target = e.target as HTMLElement;
                if (target.closest('a')) return;

                const willCollapse = !groupSection.hasClass('is-collapsed');
                this.setGroupCollapsed(groupingKey, groupName, willCollapse);
                groupSection.toggleClass('is-collapsed', willCollapse);

                const list = groupSection.querySelector('.task-cards') as HTMLElement | null;
                if (list) list.style.display = willCollapse ? 'none' : '';
                toggleBtn.setAttr('aria-expanded', String(!willCollapse));
            });
        }

        // Create task cards container
        const taskCardsContainer = groupSection.createDiv({ cls: 'tasks-container task-cards' });

        // Apply initial collapsed state
        if (collapsedInitially && !isAllGroup) {
            groupSection.addClass('is-collapsed');
            taskCardsContainer.style.display = 'none';
        }

        // Use reconciler for this group's task list
        this.plugin.domReconciler.updateList<TaskInfo>(
            taskCardsContainer,
            tasks,
            (task) => task.path,
            createTaskCardCallback,
            updateTaskCardCallback
        );

        // Update task elements tracking
        this.updateTaskElementsTracking(taskCardsContainer, taskElements);
    }

    /**
     * Update task elements tracking map
     * Maintains reference to DOM elements for efficient updates
     */
    private updateTaskElementsTracking(
        container: HTMLElement,
        taskElements: Map<string, HTMLElement>
    ): void {
        Array.from(container.children).forEach(child => {
            const taskPath = (child as HTMLElement).dataset.key;
            if (taskPath) {
                taskElements.set(taskPath, child as HTMLElement);
            }
        });
    }

    /**
     * Format group name for display
     * Delegates to GroupingUtils for consistent formatting
     */
    private formatGroupName(groupName: string): string {
        return GroupingUtils.formatGroupName(groupName, this.plugin);
    }

    /**
     * Check if a group should be collapsed initially
     * Uses GroupingUtils for state persistence
     */
    private isGroupCollapsed(groupingKey: string, groupName: string): boolean {
        return GroupingUtils.isGroupCollapsed(this.viewType, groupingKey, groupName, this.plugin);
    }

    /**
     * Set the collapsed state for a group
     * Uses GroupingUtils for state persistence
     */
    private setGroupCollapsed(groupingKey: string, groupName: string, collapsed: boolean): void {
        GroupingUtils.setGroupCollapsed(this.viewType, groupingKey, groupName, collapsed, this.plugin);
    }

    /**
     * Check if a subgroup should be collapsed initially
     * Uses extended GroupingUtils for hierarchical state
     */
    private isSubgroupCollapsed(primaryGroupName: string, subgroupingKey: string, subgroupName: string): boolean {
        return GroupingUtils.isSubgroupCollapsed(this.viewType, primaryGroupName, subgroupingKey, subgroupName, this.plugin);
    }

    /**
     * Set the collapsed state for a subgroup
     * Uses extended GroupingUtils for hierarchical state
     */
    private setSubgroupCollapsed(primaryGroupName: string, subgroupingKey: string, subgroupName: string, collapsed: boolean): void {
        GroupingUtils.setSubgroupCollapsed(this.viewType, primaryGroupName, subgroupingKey, subgroupName, collapsed, this.plugin);
    }
}
