# Bases Integration Refactor Plan

## Executive Summary

This document outlines a comprehensive refactor of the TaskNotes Bases integration to:
1. **Eliminate all internal Bases API usage** - migrate fully to Bases 1.10.0+ public API
2. **Extract duplicated patterns** - reduce ~500 lines of duplicate code across 3 views
3. **Improve architecture** - introduce clean class-based design with clear separation of concerns
4. **Fix TaskCard/FieldMapper coordination** - unify property mapping and rendering systems

## Current State Analysis

### Critical Issues

#### 1. Internal API Dependencies
All three views (Task List, Kanban, Calendar) rely on internal Bases API:
- `controller.getViewConfig()` - deprecated internal method
- `query.getViewConfig("order")` - internal query access
- `controller.query.views` - undocumented internal structure
- `fullCfg.order`, `fullCfg.groupBy`, `fullCfg.sort` - internal config objects

**Impact**: Will break when Bases plugin updates. Already seeing issues where public API and internal API return different results.

#### 2. Massive Code Duplication
Identical patterns repeated across all 3 view factories:

**Data Extraction** (~30 lines × 3 files = 90 lines):
```typescript
// Repeated in base-view-factory.ts, kanban-view.ts, calendar-view.ts
const extractDataItems = (viewContext?: any): BasesDataItem[] => {
    const dataItems: BasesDataItem[] = [];
    // ... 25 lines of identical logic
};
```

**Lifecycle Methods** (~80 lines × 3 files = 240 lines):
```typescript
// Repeated in all view factories
const viewObject = {
    load() { /* ... */ },
    unload() { /* ... */ },
    refresh() { /* ... */ },
    onDataUpdated() { /* ... */ },
    destroy() { /* ... */ },
    getEphemeralState() { /* ... */ },
    setEphemeralState() { /* ... */ },
    focus() { /* ... */ }
};
```

**Config Access** (~40 lines × 3 files = 120 lines):
- Mixed public/internal API access patterns
- Inconsistent fallback behavior
- Duplicate logging

#### 3. TaskCard/FieldMapper Coordination Issues

**Problem**: Two separate systems for property management:

**System 1: FieldMapper** (`src/services/FieldMapper.ts`)
- Maps internal field names ↔ user-configured property names
- Example: `"status"` (internal) ↔ `"task-status"` (user config)

**System 2: TaskCard** (`src/ui/TaskCard.ts`)
- `PROPERTY_EXTRACTORS` - extracts property values from TaskInfo
- `PROPERTY_RENDERERS` - renders properties to DOM
- `mapBasesPropertyToTaskCardProperty()` - converts Bases property IDs

**Coordination Gap**:
```typescript
// In Bases views, we do:
const mapped = mapBasesPropertyToTaskCardProperty("note.status", plugin);
// Returns: "status"

// But TaskCard doesn't check FieldMapper!
PROPERTY_EXTRACTORS["status"](task); // Uses hardcoded "status"

// User has configured: status → "task-status" in frontmatter
// Result: Property not found, renders as "Unknown property"
```

**Root Cause**: Property mapping happens at 3 different levels:
1. Bases property ID → TaskCard property ID (`mapBasesPropertyToTaskCardProperty`)
2. TaskCard property ID → Internal field name (not happening!)
3. Internal field name → User-configured property name (`FieldMapper`)

#### 4. Inconsistent Property Mapping

**In calendar-view.ts**: Uses shared helper
```typescript
visibleProperties = basesProperties.map(propId =>
    mapBasesPropertyToTaskCardProperty(propId, plugin)
);
```

**In kanban-view.ts**: Manual prefix stripping
```typescript
// Lines 413-425: Manual implementation instead of using helper
if (propertyId.startsWith("note.")) {
    propertyId = propertyId.substring(5);
} else if (propertyId.startsWith("task.")) {
    propertyId = propertyId.substring(5);
}
```

### Files Requiring Changes

#### Core Files (Must Change)
- `src/bases/api.ts` - Bases API interfaces
- `src/bases/helpers.ts` - Data transformation
- `src/bases/group-by.ts` - Group extraction
- `src/bases/sorting.ts` - Sort extraction
- `src/bases/base-view-factory.ts` - Task List view
- `src/bases/kanban-view.ts` - Kanban view
- `src/bases/calendar-view.ts` - Calendar view
- `src/ui/TaskCard.ts` - Property rendering
- `src/services/FieldMapper.ts` - Field mapping

#### Supporting Files (May Change)
- `src/bases/registration.ts` - View registration
- `src/bases/group-ordering.ts` - Group sorting

## Proposed Architecture

### Phase 1: Create Core Abstractions

#### 1.1: BasesDataAdapter Class

**Purpose**: Centralize all Bases data access using public API only.

**File**: `src/bases/BasesDataAdapter.ts` (NEW)

```typescript
import { BasesView, BasesQueryResult, BasesEntry, BasesEntryGroup, BasesPropertyId } from "obsidian";
import { BasesDataItem } from "./types";

/**
 * Adapter for accessing Bases data using public API (1.10.0+).
 * Eliminates all internal API dependencies.
 */
export class BasesDataAdapter {
    constructor(private basesView: BasesView) {}

    /**
     * Extract all data items from Bases query result.
     * Uses public API: basesView.data.data
     */
    extractDataItems(): BasesDataItem[] {
        const entries = this.basesView.data.data;
        return entries.map(entry => ({
            key: entry.file.path,
            data: entry,
            file: entry.file,
            path: entry.file.path,
            properties: this.extractEntryProperties(entry),
            basesData: entry
        }));
    }

    /**
     * Get grouped data from Bases.
     * Uses public API: basesView.data.groupedData
     *
     * Note: Returns pre-grouped data. Bases has already applied groupBy configuration.
     */
    getGroupedData(): BasesEntryGroup[] {
        return this.basesView.data.groupedData;
    }

    /**
     * Check if data is actually grouped (not just wrapped in single group).
     */
    isGrouped(): boolean {
        const groups = this.basesView.data.groupedData;
        if (groups.length !== 1) return true;

        const singleGroup = groups[0];
        return singleGroup.hasKey(); // False if key is null/undefined
    }

    /**
     * Get sort configuration.
     * Uses public API: basesView.config.getSort()
     *
     * Note: Data from basesView.data is already pre-sorted.
     * This is only needed for custom sorting logic.
     */
    getSortConfig() {
        return this.basesView.config.getSort();
    }

    /**
     * Get visible property IDs.
     * Uses public API: basesView.config.getOrder()
     */
    getVisiblePropertyIds(): BasesPropertyId[] {
        return this.basesView.config.getOrder();
    }

    /**
     * Get display name for a property.
     * Uses public API: basesView.config.getDisplayName()
     */
    getPropertyDisplayName(propertyId: BasesPropertyId): string {
        return this.basesView.config.getDisplayName(propertyId);
    }

    /**
     * Get property value from a Bases entry.
     * Uses public API: entry.getValue()
     */
    getPropertyValue(entry: BasesEntry, propertyId: BasesPropertyId): any {
        try {
            const value = entry.getValue(propertyId);
            return this.convertValueToNative(value);
        } catch (e) {
            console.warn(`[BasesDataAdapter] Failed to get property ${propertyId}:`, e);
            return null;
        }
    }

    /**
     * Convert Bases Value object to native JavaScript value.
     * Handles: PrimitiveValue, ListValue, DateValue, FileValue, NullValue, etc.
     */
    private convertValueToNative(value: any): any {
        if (value == null || value.constructor?.name === "NullValue") {
            return null;
        }

        // PrimitiveValue (string, number, boolean)
        if (typeof value.data !== "undefined") {
            return value.data;
        }

        // ListValue
        if (typeof value.length === "function") {
            const len = value.length();
            const result = [];
            for (let i = 0; i < len; i++) {
                const item = value.at(i);
                result.push(this.convertValueToNative(item));
            }
            return result;
        }

        // DateValue
        if (value.constructor?.name === "DateValue" && value.toISOString) {
            return value.toISOString();
        }

        // FileValue
        if (value.file) {
            return value.file.path;
        }

        // Fallback: try to extract raw data
        return value;
    }

    /**
     * Convert group key Value to display string.
     */
    convertGroupKeyToString(key: any): string {
        if (key == null || !key.hasKey?.()) {
            return "Unknown";
        }

        const value = this.convertValueToNative(key);
        if (value == null) return "Unknown";
        if (typeof value === "string") return value;
        if (typeof value === "number") return String(value);
        if (typeof value === "boolean") return value ? "True" : "False";
        if (Array.isArray(value)) return value.join(", ");

        return String(value);
    }

    /**
     * Extract properties from a BasesEntry.
     * Handles frontmatter and computed properties.
     */
    private extractEntryProperties(entry: BasesEntry): Record<string, any> {
        // Use entry's built-in property access
        const properties: Record<string, any> = {};

        // Try to get all visible properties
        const visibleProps = this.getVisiblePropertyIds();
        for (const propId of visibleProps) {
            try {
                const value = this.getPropertyValue(entry, propId);
                if (value !== null) {
                    // Strip property type prefix for storage
                    const name = this.stripPropertyPrefix(propId);
                    properties[name] = value;
                }
            } catch (e) {
                // Property doesn't exist or can't be evaluated - skip
            }
        }

        return properties;
    }

    /**
     * Remove property type prefix (note., file., formula.)
     */
    private stripPropertyPrefix(propertyId: BasesPropertyId): string {
        const parts = propertyId.split(".");
        if (parts.length > 1 && ["note", "file", "formula"].includes(parts[0])) {
            return parts.slice(1).join(".");
        }
        return propertyId;
    }
}
```

**Benefits**:
- Single source of truth for Bases data access
- All public API access in one place
- Easy to update when Bases API changes
- Clear conversion between Bases types and TaskNotes types

#### 1.2: PropertyMappingService Class

**Purpose**: Unify all property mapping logic (Bases → TaskCard → Internal → User Config).

**File**: `src/bases/PropertyMappingService.ts` (NEW)

```typescript
import { BasesPropertyId } from "obsidian";
import TaskNotesPlugin from "../main";
import { FieldMapper } from "../services/FieldMapper";

/**
 * Complete property mapping chain:
 * 1. Bases Property ID → TaskCard Property ID
 * 2. TaskCard Property ID → Internal Field Name
 * 3. Internal Field Name → User-Configured Property Name
 *
 * Example flow:
 * "note.status" → "status" → "status" → "task-status" (if user configured)
 */
export class PropertyMappingService {
    constructor(
        private plugin: TaskNotesPlugin,
        private fieldMapper: FieldMapper
    ) {}

    /**
     * Map Bases property ID to the internal field name used by TaskInfo.
     * This is the complete chain: Bases → TaskCard → Internal.
     *
     * @param basesPropertyId - Property ID from Bases (e.g., "note.status", "file.name")
     * @returns Internal field name (e.g., "status", "title")
     */
    basesToInternal(basesPropertyId: BasesPropertyId): string {
        let mapped = basesPropertyId;

        // Step 1: Try custom field mapping first (highest priority)
        if (this.fieldMapper) {
            const internalFieldName = this.fieldMapper.fromUserField(basesPropertyId);
            if (internalFieldName) {
                return this.applySpecialTransformations(internalFieldName);
            }
        }

        // Step 2: Handle dotted prefixes (note., task., file., formula.)
        if (basesPropertyId.startsWith("note.")) {
            mapped = basesPropertyId.substring(5);
        } else if (basesPropertyId.startsWith("task.")) {
            mapped = basesPropertyId.substring(5);
        } else if (basesPropertyId.startsWith("file.")) {
            // Map file properties to TaskInfo equivalents
            if (basesPropertyId === "file.ctime") return "dateCreated";
            if (basesPropertyId === "file.mtime") return "dateModified";
            if (basesPropertyId === "file.name") return "title";
            if (basesPropertyId === "file.basename") return "title";
            mapped = basesPropertyId.substring(5);
        }

        // Step 3: Apply special transformations
        return this.applySpecialTransformations(mapped);
    }

    /**
     * Map internal field name to user-configured property name.
     * This is used when reading/writing frontmatter.
     *
     * @param internalFieldName - Internal field (e.g., "status")
     * @returns User-configured property name (e.g., "task-status")
     */
    internalToUserProperty(internalFieldName: string): string {
        return this.fieldMapper.toUserField(internalFieldName);
    }

    /**
     * Map user-configured property name back to internal field name.
     *
     * @param userPropertyName - User's property name (e.g., "task-status")
     * @returns Internal field name (e.g., "status")
     */
    userPropertyToInternal(userPropertyName: string): string {
        return this.fieldMapper.fromUserField(userPropertyName) || userPropertyName;
    }

    /**
     * Complete mapping: Bases property ID → User-configured property name.
     * Use this when you need to read/write frontmatter based on Bases config.
     */
    basesToUserProperty(basesPropertyId: BasesPropertyId): string {
        const internal = this.basesToInternal(basesPropertyId);
        return this.internalToUserProperty(internal);
    }

    /**
     * Apply TaskCard-specific property transformations.
     * These are display-only transformations that don't affect data storage.
     */
    private applySpecialTransformations(propId: string): string {
        // timeEntries → totalTrackedTime (show computed total instead of raw array)
        if (propId === "timeEntries") return "totalTrackedTime";

        // blockedBy → blocked (show status pill instead of dependency list)
        if (propId === "blockedBy") return "blocked";

        // Keep everything else unchanged
        return propId;
    }

    /**
     * Check if a Bases property list includes blockedBy (in any form).
     * Used to determine if dependency pills should be shown.
     */
    hasBlockedByProperty(basesPropertyIds: BasesPropertyId[]): boolean {
        return basesPropertyIds.some(id =>
            id === "blockedBy" ||
            id === "note.blockedBy" ||
            id === "task.blockedBy"
        );
    }

    /**
     * Map a list of Bases property IDs to TaskCard property IDs.
     * Filters out computed dependency properties unless explicitly requested.
     *
     * @param basesPropertyIds - Property IDs from Bases config
     * @returns Mapped property IDs for TaskCard rendering
     */
    mapVisibleProperties(basesPropertyIds: BasesPropertyId[]): string[] {
        const hasBlockedBy = this.hasBlockedByProperty(basesPropertyIds);

        return basesPropertyIds
            .map(id => this.basesToInternal(id))
            .filter(propId => {
                // Filter out computed dependency properties unless explicitly requested
                if (propId === "blocked" || propId === "blocking") {
                    return hasBlockedBy;
                }
                return true;
            });
    }
}
```

**Benefits**:
- Complete property mapping chain in one place
- Clear separation of concerns (Bases → TaskCard → Internal → User)
- Fixes TaskCard/FieldMapper coordination gap
- Easy to trace property transformations
- Eliminates duplicate mapping logic

#### 1.3: BasesViewBase Abstract Class

**Purpose**: Extract common lifecycle and rendering patterns shared by all 3 views.

**File**: `src/bases/BasesViewBase.ts` (NEW)

```typescript
import { Component, BasesView, QueryController } from "obsidian";
import TaskNotesPlugin from "../main";
import { BasesDataAdapter } from "./BasesDataAdapter";
import { PropertyMappingService } from "./PropertyMappingService";
import { TaskInfo, EVENT_TASK_UPDATED } from "../types";

/**
 * Abstract base class for all TaskNotes Bases views.
 * Handles common lifecycle, data extraction, and event management.
 */
export abstract class BasesViewBase extends BasesView {
    protected plugin: TaskNotesPlugin;
    protected dataAdapter: BasesDataAdapter;
    protected propertyMapper: PropertyMappingService;
    protected containerEl: HTMLElement;
    protected rootElement: HTMLElement | null = null;
    protected taskUpdateListener: any = null;
    protected updateDebounceTimer: number | null = null;

    constructor(controller: QueryController, containerEl: HTMLElement, plugin: TaskNotesPlugin) {
        super(controller);
        this.plugin = plugin;
        this.containerEl = containerEl;
        this.dataAdapter = new BasesDataAdapter(this);
        this.propertyMapper = new PropertyMappingService(plugin, plugin.fieldMapper);
    }

    /**
     * Lifecycle: Called when view is first loaded.
     */
    load(): void {
        this.setupContainer();
        this.setupTaskUpdateListener();
        this.render();
    }

    /**
     * Lifecycle: Called when view is unloaded (tab closed, etc).
     */
    unload(): void {
        this.cleanup();
    }

    /**
     * Lifecycle: Called when Bases data changes.
     * Public API callback - Bases will call this automatically.
     */
    onDataUpdated(): void {
        this.render();
    }

    /**
     * Lifecycle: Save ephemeral state (scroll position, etc).
     */
    getEphemeralState(): any {
        return {
            scrollTop: this.rootElement?.scrollTop || 0
        };
    }

    /**
     * Lifecycle: Restore ephemeral state.
     */
    setEphemeralState(state: any): void {
        if (!state || !this.rootElement || !this.rootElement.isConnected) return;

        try {
            if (state.scrollTop !== undefined) {
                this.rootElement.scrollTop = state.scrollTop;
            }
        } catch (e) {
            console.debug("[TaskNotes][Bases] Failed to restore ephemeral state:", e);
        }
    }

    /**
     * Lifecycle: Focus this view.
     */
    focus(): void {
        try {
            if (this.rootElement?.isConnected && typeof this.rootElement.focus === "function") {
                this.rootElement.focus();
            }
        } catch (e) {
            console.debug("[TaskNotes][Bases] Failed to focus view:", e);
        }
    }

    /**
     * Lifecycle: Refresh/re-render the view.
     */
    refresh(): void {
        this.render();
    }

    /**
     * Setup container element for this view.
     */
    protected setupContainer(): void {
        this.containerEl.empty();

        const root = document.createElement("div");
        root.className = `tn-bases-integration tasknotes-plugin tasknotes-container tn-${this.type}`;
        root.tabIndex = -1; // Make focusable without adding to tab order
        this.containerEl.appendChild(root);
        this.rootElement = root;
    }

    /**
     * Setup listener for real-time task updates.
     * Allows selective updates without full re-render.
     */
    protected setupTaskUpdateListener(): void {
        if (this.taskUpdateListener) return;

        this.taskUpdateListener = this.plugin.emitter.on(EVENT_TASK_UPDATED, async (eventData: any) => {
            try {
                const updatedTask = eventData?.task || eventData?.taskInfo;
                if (!updatedTask?.path) return;

                // Check if this task is in our current view
                const dataItems = this.dataAdapter.extractDataItems();
                const isRelevant = dataItems.some(item => item.path === updatedTask.path);

                if (isRelevant) {
                    await this.handleTaskUpdate(updatedTask);
                }
            } catch (error) {
                console.error("[TaskNotes][Bases] Error in task update handler:", error);
                this.debouncedRefresh();
            }
        });
    }

    /**
     * Cleanup all resources.
     */
    protected cleanup(): void {
        // Clean up task update listener
        if (this.taskUpdateListener) {
            this.plugin.emitter.offref(this.taskUpdateListener);
            this.taskUpdateListener = null;
        }

        // Clean up debounce timer
        if (this.updateDebounceTimer) {
            clearTimeout(this.updateDebounceTimer);
            this.updateDebounceTimer = null;
        }

        // Clean up DOM
        if (this.rootElement) {
            this.rootElement.remove();
            this.rootElement = null;
        }
    }

    /**
     * Debounced refresh to prevent multiple rapid re-renders.
     */
    protected debouncedRefresh(): void {
        if (this.updateDebounceTimer) {
            clearTimeout(this.updateDebounceTimer);
        }

        this.updateDebounceTimer = window.setTimeout(() => {
            this.render();
            this.updateDebounceTimer = null;
        }, 150);
    }

    /**
     * Get visible properties for rendering task cards.
     */
    protected getVisibleProperties(): string[] {
        const basesPropertyIds = this.dataAdapter.getVisiblePropertyIds();
        let visibleProperties = this.propertyMapper.mapVisibleProperties(basesPropertyIds);

        // Fallback to plugin defaults if no properties configured
        if (!visibleProperties || visibleProperties.length === 0) {
            visibleProperties = this.plugin.settings.defaultVisibleProperties || [
                "due", "scheduled", "projects", "contexts", "tags"
            ];

            // Filter out computed properties from defaults
            visibleProperties = visibleProperties.filter(
                p => p !== "blocked" && p !== "blocking"
            );
        }

        return visibleProperties;
    }

    // Abstract methods that subclasses must implement

    /**
     * Render the view with current data.
     * Subclasses implement view-specific rendering (list, kanban, calendar).
     */
    protected abstract render(): void;

    /**
     * Handle a single task update for selective rendering.
     * Subclasses can implement efficient updates or fall back to full refresh.
     */
    protected abstract handleTaskUpdate(task: TaskInfo): Promise<void>;

    /**
     * The view type identifier.
     */
    abstract type: string;
}
```

**Benefits**:
- Eliminates 240+ lines of duplicate lifecycle code
- Consistent event handling across all views
- Centralized data access via adapters
- Extensible for custom view logic

### Phase 2: Refactor View Implementations

#### 2.1: Refactor Task List View

**File**: `src/bases/TaskListView.ts` (RENAME from base-view-factory.ts)

```typescript
import { QueryController } from "obsidian";
import TaskNotesPlugin from "../main";
import { BasesViewBase } from "./BasesViewBase";
import { TaskInfo } from "../types";
import { identifyTaskNotesFromBasesData } from "./helpers";

export class TaskListView extends BasesViewBase {
    type = "tasknoteTaskList";
    private itemsContainer: HTMLElement | null = null;
    private currentTaskElements = new Map<string, HTMLElement>();

    constructor(controller: QueryController, containerEl: HTMLElement, plugin: TaskNotesPlugin) {
        super(controller, containerEl, plugin);
    }

    protected setupContainer(): void {
        super.setupContainer();

        // Create items container
        const itemsContainer = document.createElement("div");
        itemsContainer.className = "tn-bases-items-container";
        itemsContainer.style.cssText = "margin-top: 12px;";
        this.rootElement?.appendChild(itemsContainer);
        this.itemsContainer = itemsContainer;
    }

    protected async render(): Promise<void> {
        if (!this.itemsContainer || !this.rootElement) return;

        try {
            // Extract data using adapter
            const dataItems = this.dataAdapter.extractDataItems();
            const taskNotes = await identifyTaskNotesFromBasesData(dataItems, this.plugin);

            // Clear previous render
            this.itemsContainer.empty();
            this.currentTaskElements.clear();

            if (taskNotes.length === 0) {
                this.renderEmptyState();
                return;
            }

            // Check if we have grouped data
            if (this.dataAdapter.isGrouped()) {
                await this.renderGrouped(taskNotes);
            } else {
                await this.renderFlat(taskNotes);
            }
        } catch (error: any) {
            console.error("[TaskNotes][TaskListView] Error rendering:", error);
            this.renderError(error);
        }
    }

    private async renderFlat(taskNotes: TaskInfo[]): Promise<void> {
        const { createTaskCard } = await import("../ui/TaskCard");
        const visibleProperties = this.getVisibleProperties();

        const cardOptions = {
            showCheckbox: false,
            showArchiveButton: false,
            showTimeTracking: false,
            showRecurringControls: true,
            groupByDate: false,
        };

        for (const taskInfo of taskNotes) {
            const cardEl = createTaskCard(
                taskInfo,
                this.plugin,
                visibleProperties,
                cardOptions
            );
            this.itemsContainer!.appendChild(cardEl);
            this.currentTaskElements.set(taskInfo.path, cardEl);
        }
    }

    private async renderGrouped(taskNotes: TaskInfo[]): Promise<void> {
        const { createTaskCard } = await import("../ui/TaskCard");
        const visibleProperties = this.getVisibleProperties();
        const groups = this.dataAdapter.getGroupedData();

        const cardOptions = {
            showCheckbox: false,
            showArchiveButton: false,
            showTimeTracking: false,
            showRecurringControls: true,
            groupByDate: false,
        };

        for (const group of groups) {
            // Create group header
            const groupHeader = document.createElement("div");
            groupHeader.className = "tn-bases-group-header";
            const groupTitle = this.dataAdapter.convertGroupKeyToString(group.key);
            groupHeader.textContent = groupTitle;
            this.itemsContainer!.appendChild(groupHeader);

            // Create group container
            const groupContainer = document.createElement("div");
            groupContainer.className = "tn-bases-group-container";
            this.itemsContainer!.appendChild(groupContainer);

            // Get tasks for this group
            const groupPaths = new Set(group.entries.map(e => e.file.path));
            const groupTasks = taskNotes.filter(t => groupPaths.has(t.path));

            // Render tasks in group
            for (const taskInfo of groupTasks) {
                const cardEl = createTaskCard(
                    taskInfo,
                    this.plugin,
                    visibleProperties,
                    cardOptions
                );
                groupContainer.appendChild(cardEl);
                this.currentTaskElements.set(taskInfo.path, cardEl);
            }
        }
    }

    protected async handleTaskUpdate(task: TaskInfo): Promise<void> {
        const taskElement = this.currentTaskElements.get(task.path);

        if (taskElement) {
            // Selective update - just update this one task card
            const { updateTaskCard } = await import("../ui/TaskCard");
            const visibleProperties = this.getVisibleProperties();

            updateTaskCard(taskElement, task, this.plugin, visibleProperties, {
                showDueDate: true,
                showCheckbox: false,
                showArchiveButton: false,
                showTimeTracking: false,
                showRecurringControls: true,
                targetDate: new Date(),
            });

            // Add update animation
            taskElement.classList.add("task-card--updated");
            window.setTimeout(() => {
                taskElement.classList.remove("task-card--updated");
            }, 1000);
        } else {
            // Task not visible or newly added - full refresh
            this.debouncedRefresh();
        }
    }

    private renderEmptyState(): void {
        const emptyEl = document.createElement("div");
        emptyEl.className = "tn-bases-empty";
        emptyEl.style.cssText = "padding: 20px; text-align: center; color: #666;";
        emptyEl.textContent = "No TaskNotes tasks found for this Base.";
        this.itemsContainer!.appendChild(emptyEl);
    }

    private renderError(error: Error): void {
        const errorEl = document.createElement("div");
        errorEl.className = "tn-bases-error";
        errorEl.style.cssText = "padding: 20px; color: #d73a49; background: #ffeaea; border-radius: 4px; margin: 10px 0;";
        errorEl.textContent = `Error loading tasks: ${error.message || "Unknown error"}`;
        this.itemsContainer!.appendChild(errorEl);
    }

    protected cleanup(): void {
        super.cleanup();
        this.currentTaskElements.clear();
        this.itemsContainer = null;
    }
}

// Factory function for Bases registration
export function buildTaskListViewFactory(plugin: TaskNotesPlugin) {
    return function(controller: QueryController, containerEl: HTMLElement) {
        return new TaskListView(controller, containerEl, plugin);
    };
}
```

**Benefits**:
- Reduced from 414 lines → ~180 lines
- Inherits common lifecycle from base class
- Uses adapters for all data access
- Clean separation of flat vs grouped rendering

#### 2.2: Refactor Kanban View

**File**: `src/bases/KanbanView.ts` (RENAME from kanban-view.ts)

Similar structure to TaskListView but with kanban-specific rendering:

```typescript
export class KanbanView extends BasesViewBase {
    type = "tasknoteKanban";
    // ... kanban-specific implementation

    protected async render(): Promise<void> {
        // Use this.dataAdapter.getGroupedData() for columns
        // Use this.propertyMapper.mapVisibleProperties() for cards
        // Eliminate manual prefix stripping (lines 413-425 in current file)
    }
}
```

**Key Changes**:
- Remove duplicate `extractDataItems` - use `this.dataAdapter.extractDataItems()`
- Remove manual property prefix stripping - use `this.propertyMapper.basesToInternal()`
- Use `this.dataAdapter.getGroupedData()` for column data
- Inherit lifecycle from `BasesViewBase`

#### 2.3: Refactor Calendar View

**File**: `src/bases/CalendarView.ts` (RENAME from calendar-view.ts)

```typescript
export class CalendarView extends BasesViewBase {
    type = "tasknoteCalendar";
    private calendar: Calendar | null = null;
    // ... calendar-specific implementation

    protected async render(): Promise<void> {
        // Use this.dataAdapter.extractDataItems() for events
        // Use this.propertyMapper.mapVisibleProperties() for property-based events
        // Use FullCalendar for rendering
    }
}
```

**Key Changes**:
- Remove duplicate `extractDataItems` - use adapter
- Use `propertyMapper` for all property conversions
- Maintain FullCalendar integration but with cleaner data flow

### Phase 3: Update TaskCard Integration

#### 3.1: Update TaskCard Property System

**File**: `src/ui/TaskCard.ts`

**Current Issue**: `PROPERTY_EXTRACTORS` uses hardcoded property names, doesn't check FieldMapper.

**Fix**: Modify `getPropertyValue()` to use FieldMapper:

```typescript
function getPropertyValue(
    task: TaskInfo,
    propertyId: string,
    plugin: TaskNotesPlugin
): unknown {
    try {
        // Map display property ID to internal field name
        // This handles user-configured property mappings
        const internalFieldName = plugin.fieldMapper?.fromUserField(propertyId) || propertyId;

        // Use extractors for standard properties (now using internal field names)
        if (internalFieldName in PROPERTY_EXTRACTORS) {
            return PROPERTY_EXTRACTORS[internalFieldName](task);
        }

        // Handle user properties
        if (propertyId.startsWith("user:")) {
            const userFieldId = propertyId.substring(5);
            const userFields = plugin.settings.userFields || [];
            const userField = userFields.find(f => f.id === userFieldId);
            if (userField) {
                const userPropName = plugin.fieldMapper?.toUserField(`user:${userFieldId}`);
                return task.customProperties?.[userPropName || userFieldId];
            }
        }

        // Handle formula properties from Bases
        if (propertyId.startsWith("formula.")) {
            return task.customProperties?.[propertyId];
        }

        // Fallback to custom properties
        return task.customProperties?.[propertyId];
    } catch (e) {
        console.warn(`[TaskCard] Error getting property value for ${propertyId}:`, e);
        return undefined;
    }
}
```

**Impact**: Now TaskCard respects user-configured property names from FieldMapper.

#### 3.2: Update Property Extractors

Update `PROPERTY_EXTRACTORS` to handle both internal and user-configured names:

```typescript
const PROPERTY_EXTRACTORS: Record<string, (task: TaskInfo) => any> = {
    // Core properties (internal names)
    status: (task) => task.status,
    priority: (task) => task.priority,
    due: (task) => task.due,
    scheduled: (task) => task.scheduled,
    // ... etc

    // Also support common user-configured alternatives
    // These will be handled by FieldMapper mapping first
};
```

### Phase 4: Cleanup and Migration

#### 4.1: Remove Deprecated Files

**Delete**:
- `src/bases/view-factory.ts` - replaced by `TaskListView.ts`
- `src/bases/base-view-factory.ts` - replaced by `TaskListView.ts`

**Keep but simplify**:
- `src/bases/helpers.ts` - Keep `identifyTaskNotesFromBasesData()`, remove duplicate logic
- `src/bases/group-by.ts` - REMOVE (replaced by `BasesDataAdapter.getGroupedData()`)
- `src/bases/sorting.ts` - REMOVE (data is pre-sorted by Bases)

#### 4.2: Update Registration

**File**: `src/bases/registration.ts`

Update to use new view classes:

```typescript
import { buildTaskListViewFactory } from "./TaskListView";
import { buildKanbanViewFactory } from "./KanbanView";
import { buildCalendarViewFactory } from "./CalendarView";

// Register views
const taskListFactory = buildTaskListViewFactory(plugin);
const kanbanFactory = buildKanbanViewFactory(plugin);
const calendarFactory = buildCalendarViewFactory(plugin);

await registerBasesView(basesPlugin, "tasknoteTaskList", {
    name: "TaskNotes: Task List",
    icon: "list",
    factory: taskListFactory,
    // ... options
});

// etc for kanban and calendar
```

#### 4.3: Update Imports

Update all imports throughout codebase:
- `import { BasesDataAdapter } from "./BasesDataAdapter"`
- `import { PropertyMappingService } from "./PropertyMappingService"`
- `import { BasesViewBase } from "./BasesViewBase"`

## Migration Strategy

### Step 1: Create New Files (Non-Breaking)
1. Create `BasesDataAdapter.ts`
2. Create `PropertyMappingService.ts`
3. Create `BasesViewBase.ts`
4. Add tests for new abstractions

### Step 2: Refactor Task List View
1. Create `TaskListView.ts` using new base class
2. Test thoroughly with various Bases configurations
3. Keep `base-view-factory.ts` temporarily for rollback

### Step 3: Refactor Kanban View
1. Create `KanbanView.ts` using new base class
2. Test drag-and-drop, grouping, swimlanes
3. Keep `kanban-view.ts` temporarily for rollback

### Step 4: Refactor Calendar View
1. Create `CalendarView.ts` using new base class
2. Test event rendering, drag/drop, all calendar features
3. Keep `calendar-view.ts` temporarily for rollback

### Step 5: Update TaskCard
1. Modify `getPropertyValue()` to use FieldMapper
2. Test property rendering with custom field mappings
3. Verify formula properties still work

### Step 6: Clean Up
1. Delete old view factory files
2. Remove deprecated helpers
3. Remove internal API fallback code
4. Update documentation

## Testing Checklist

### Functional Testing
- [ ] Task List view renders correctly
- [ ] Kanban view renders columns and cards
- [ ] Calendar view shows events correctly
- [ ] Grouped views work (all 3 view types)
- [ ] Flat (ungrouped) views work
- [ ] Property visibility respects user selection
- [ ] Custom field mappings work end-to-end
- [ ] Drag and drop works (Kanban, Calendar)
- [ ] Real-time task updates work
- [ ] Formula properties display correctly
- [ ] Empty states display correctly
- [ ] Error states display correctly

### Edge Cases
- [ ] Views with no data
- [ ] Views with 1000+ tasks (performance)
- [ ] Rapid task updates (debouncing)
- [ ] Invalid property configurations
- [ ] Missing Bases plugin
- [ ] View switching
- [ ] Multiple bases open simultaneously

### Property Mapping
- [ ] Standard properties (status, priority, due)
- [ ] File properties (file.name, file.mtime)
- [ ] Formula properties (formula.customFormula)
- [ ] User-configured property names
- [ ] Blocked/blocking properties (conditional)
- [ ] Time tracking properties (timeEntries → totalTrackedTime)

## Success Metrics

### Code Quality
- **Lines of code**: Reduce from ~4000 → ~2500 (40% reduction in duplication)
- **Files**: Increase from 10 → 12 (better organization)
- **Cyclomatic complexity**: Reduce average complexity by 30%
- **Test coverage**: Achieve 80%+ coverage for new classes

### Maintainability
- **Internal API usage**: 0 instances (currently 15+ instances)
- **Public API usage**: 100% (currently 60%)
- **Code duplication**: < 5% (currently ~20%)
- **Property mapping paths**: 1 unified path (currently 3 separate paths)

### Performance
- **Render time**: < 100ms for 1000 tasks (same as current)
- **Memory usage**: No increase
- **Update latency**: < 50ms for single task update (selective update)

## Risks and Mitigation

### Risk 1: Breaking Changes
**Risk**: Refactor breaks existing functionality

**Mitigation**:
- Keep old files during migration for rollback
- Comprehensive testing checklist
- Incremental rollout (one view at a time)
- Beta testing with users

### Risk 2: Bases API Changes
**Risk**: Bases public API doesn't provide needed functionality

**Mitigation**:
- Confirmed all needed APIs exist in obsidian.d.ts
- Document any limitations
- Have fallback strategy for edge cases
- Communicate with Bases developers if needed

### Risk 3: Performance Regression
**Risk**: New abstraction layers slow down rendering

**Mitigation**:
- Profile before and after
- Optimize hot paths (data extraction, rendering)
- Use caching where appropriate
- Lazy initialization of expensive objects

## Timeline

**Estimated effort**: 3-5 days for experienced developer

- **Day 1**: Create abstractions (BasesDataAdapter, PropertyMappingService, BasesViewBase)
- **Day 2**: Refactor Task List and Kanban views
- **Day 3**: Refactor Calendar view
- **Day 4**: Update TaskCard, fix property mapping
- **Day 5**: Testing, cleanup, documentation

## Future Improvements

### After Refactor
1. **Add unit tests** for all new classes
2. **Add integration tests** for Bases views
3. **Performance profiling** and optimization
4. **Documentation** for custom view development
5. **Migration guide** for users with custom configurations

### Potential Enhancements
1. **View composition**: Allow combining multiple views
2. **Custom view templates**: User-defined view configurations
3. **Property transformers**: User-defined property rendering
4. **Advanced filtering**: Client-side filtering on top of Bases queries
5. **Export functionality**: Export view data to CSV/JSON

## Conclusion

This refactor will:
- ✅ Eliminate all internal Bases API dependencies
- ✅ Reduce code duplication by 40%
- ✅ Fix TaskCard/FieldMapper coordination issues
- ✅ Establish clean architecture for future development
- ✅ Improve maintainability and testability
- ✅ Preserve all existing functionality

The clean class-based architecture will make it much easier to:
- Add new view types
- Debug property mapping issues
- Adapt to future Bases API changes
- Onboard new developers to the codebase

**Recommended approach**: Start with Phase 1 (abstractions), then tackle views one at a time with thorough testing between each phase.
