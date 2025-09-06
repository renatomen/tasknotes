import { Menu } from 'obsidian';
import { TaskGroupKey, FilterOptions } from '../types';

/**
 * Options for configuring the subgroup menu builder
 */
export interface SubgroupMenuOptions {
    /** Current primary grouping key */
    currentGroupKey: TaskGroupKey;
    /** Current secondary grouping key (optional) */
    currentSubgroupKey?: TaskGroupKey;
    /** Available filter options for populating menu */
    filterOptions: FilterOptions;
    /** Callback when subgroup option is selected */
    onSubgroupSelect: (subgroupKey: TaskGroupKey) => void;
}

/**
 * Builder for creating subgroup menu sections in context menus
 * Follows single responsibility principle by focusing solely on subgroup menu construction
 * Uses dependency injection pattern for configuration and callbacks
 * 
 * Implements the builder pattern for constructing menu sections with proper validation
 */
export class SubgroupMenuBuilder {
    private options: SubgroupMenuOptions;

    constructor(options: SubgroupMenuOptions) {
        this.options = options;
        this.validateOptions();
    }

    /**
     * Add SUBGROUP section to existing menu
     * Only adds section when primary grouping is active (not 'none')
     * Implements conditional UI pattern based on current state
     * 
     * @param menu - Obsidian Menu instance to add items to
     */
    addSubgroupSection(menu: Menu): void {
        // Early return if subgroup section should not be shown
        if (!this.shouldShowSubgroupSection()) {
            return;
        }

        // Add visual separator before SUBGROUP section
        menu.addSeparator();

        // Add SUBGROUP heading (disabled item for visual grouping)
        this.addSubgroupHeading(menu);

        // Add "None" option for disabling subgrouping
        this.addNoneOption(menu);

        // Add available subgroup field options
        this.addSubgroupFieldOptions(menu);
    }

    /**
     * Validate constructor options to ensure proper configuration
     * Implements fail-fast validation pattern
     */
    private validateOptions(): void {
        if (!this.options.filterOptions) {
            throw new Error('FilterOptions is required for SubgroupMenuBuilder');
        }

        if (typeof this.options.onSubgroupSelect !== 'function') {
            throw new Error('onSubgroupSelect callback is required for SubgroupMenuBuilder');
        }
    }

    /**
     * Determine if subgroup section should be displayed
     * Encapsulates business logic for conditional UI display
     */
    private shouldShowSubgroupSection(): boolean {
        const { currentGroupKey } = this.options;
        return !!(currentGroupKey && currentGroupKey !== 'none');
    }

    /**
     * Add disabled heading item for visual organization
     * Follows UI pattern of section headers in Obsidian menus
     */
    private addSubgroupHeading(menu: Menu): void {
        menu.addItem(item => {
            item.setTitle('SUBGROUP');
            item.setDisabled(true);
        });
    }

    /**
     * Add "None" option for disabling subgrouping
     * Provides clear way to return to single-level grouping
     */
    private addNoneOption(menu: Menu): void {
        const { currentSubgroupKey, onSubgroupSelect } = this.options;
        
        menu.addItem(item => {
            item.setTitle('None');
            
            // Mark as selected if no subgrouping is currently active
            if (currentSubgroupKey === 'none' || !currentSubgroupKey) {
                item.setIcon('check');
            }
            
            item.onClick(() => {
                onSubgroupSelect('none');
            });
        });
    }

    /**
     * Add menu items for available subgroup fields
     * Excludes current primary group key to prevent duplicate grouping
     */
    private addSubgroupFieldOptions(menu: Menu): void {
        const availableOptions = this.getAvailableSubgroupOptions();
        const { currentSubgroupKey, onSubgroupSelect } = this.options;

        Object.entries(availableOptions).forEach(([key, label]) => {
            menu.addItem(item => {
                item.setTitle(label);
                
                // Mark as selected if this is the current subgroup key
                if (currentSubgroupKey === key) {
                    item.setIcon('check');
                }
                
                item.onClick(() => {
                    onSubgroupSelect(key as TaskGroupKey);
                });
            });
        });
    }

    /**
     * Get available subgroup options excluding current primary group key
     * Combines built-in grouping options with user-defined properties
     * Implements field exclusion logic to prevent invalid configurations
     */
    private getAvailableSubgroupOptions(): Record<string, string> {
        const { currentGroupKey, filterOptions } = this.options;
        
        // Base grouping options available for subgrouping
        const baseOptions: Record<string, string> = {
            'status': 'Status',
            'priority': 'Priority',
            'context': 'Context',
            'project': 'Project',
            'due': 'Due Date',
            'scheduled': 'Scheduled Date',
            'tags': 'Tags'
        };

        // Add user-defined properties from filter options
        const userOptions: Record<string, string> = {};
        const userProperties = filterOptions.userProperties || [];
        
        for (const property of userProperties) {
            if (this.isValidUserProperty(property)) {
                userOptions[property.id] = property.label;
            }
        }

        // Combine all options
        const allOptions = { ...baseOptions, ...userOptions };
        
        // Remove current primary group key to prevent duplicate grouping
        if (currentGroupKey && currentGroupKey !== 'none') {
            delete allOptions[currentGroupKey];
        }
        
        return allOptions;
    }

    /**
     * Validate user property for inclusion in subgroup options
     * Ensures property has required fields and correct format
     */
    private isValidUserProperty(property: any): boolean {
        return !!(
            property?.id && 
            property?.label && 
            typeof property.id === 'string' && 
            property.id.startsWith('user:')
        );
    }
}
