import { setIcon } from "obsidian";
import TaskNotesPlugin from "../main";
import { BasesViewBase } from "./BasesViewBase";
import { TaskInfo } from "../types";
import { identifyTaskNotesFromBasesData } from "./helpers";
import { createTaskCard } from "../ui/TaskCard";
import { getBasesSortComparator } from "./sorting";
import { renderGroupTitle } from "./groupTitleRenderer";
import { type LinkServices } from "../ui/renderers/linkRenderer";

export class KanbanView extends BasesViewBase {
	type = "tasknoteKanban";
	private boardEl: HTMLElement | null = null;
	private basesViewContext?: any;
	private basesController: any; // Store controller for accessing query.views
	private currentTaskElements = new Map<string, HTMLElement>();
	private draggedTaskPath: string | null = null;

	// View options (accessed via config)
	private swimLanePropertyId: string | null = null;
	private columnWidth: number = 280;
	private hideEmptyColumns: boolean = false;

	constructor(controller: any, containerEl: HTMLElement, plugin: TaskNotesPlugin) {
		super(controller, containerEl, plugin);
		this.basesController = controller; // Store for groupBy detection
	}

	setBasesViewContext(context: any): void {
		this.basesViewContext = context;
		(this.dataAdapter as any).basesView = context;

		// Read view options from config
		this.readViewOptions();
	}

	private readViewOptions(): void {
		if (!this.basesViewContext?.config) return;

		const config = this.basesViewContext.config;

		// Read swimLane option
		if (typeof config.get === 'function') {
			try {
				this.swimLanePropertyId = config.get('swimLane') || null;
				this.columnWidth = config.get('columnWidth') || 280;
				this.hideEmptyColumns = config.get('hideEmptyColumns') || false;
			} catch (e) {
				// Use defaults
			}
		}
	}

	async render(): Promise<void> {
		if (!this.boardEl || !this.rootElement) return;
		if (!this.basesViewContext?.data?.data) return;

		try {
			const dataItems = this.dataAdapter.extractDataItems();
			const taskNotes = await identifyTaskNotesFromBasesData(dataItems, this.plugin);

			// Clear board
			this.boardEl.empty();

			if (taskNotes.length === 0) {
				this.renderEmptyState();
				return;
			}

			// Build path -> props map for dynamic property access
			const pathToProps = this.buildPathToPropsMap();

			// Determine groupBy property ID
			const groupByPropertyId = this.getGroupByPropertyId();

			if (!groupByPropertyId) {
				// No groupBy - show error
				this.renderNoGroupByError();
				return;
			}

			// Group tasks
			const groups = this.groupTasks(taskNotes, groupByPropertyId, pathToProps);

			// Render swimlanes if configured
			if (this.swimLanePropertyId) {
				await this.renderWithSwimLanes(groups, taskNotes, pathToProps, groupByPropertyId);
			} else {
				await this.renderFlat(groups, pathToProps);
			}
		} catch (error: any) {
			console.error("[TaskNotes][KanbanView] Error rendering:", error);
			this.renderError(error);
		}
	}

	private getGroupByPropertyId(): string | null {
		// Try to get from grouped data first (public API)
		const isGrouped = this.dataAdapter.isGrouped();

		console.debug("[TaskNotes][KanbanView] Getting groupBy property", {
			isGrouped,
			hasBasesController: !!this.basesController,
			hasQuery: !!this.basesController?.query,
			hasViews: !!this.basesController?.query?.views,
			viewName: this.basesController?.viewName,
			hasGroupedData: !!this.basesViewContext?.data?.groupedData,
			groupedDataLength: this.basesViewContext?.data?.groupedData?.length
		});

		if (isGrouped) {
			// Bases has groupBy configured - we need to determine what property
			// IMPORTANT: Public API doesn't expose groupBy property!
			// Must use internal API as fallback
			const controller = this.basesController;
			if (controller?.query?.views && controller?.viewName) {
				const views = controller.query.views;
				const viewName = controller.viewName;

				console.debug("[TaskNotes][KanbanView] Searching for view in query", {
					viewName,
					viewCount: views.length || 0
				});

				for (let i = 0; i < 20; i++) {
					const view = views[i];
					if (view && view.name === viewName) {
						console.debug("[TaskNotes][KanbanView] Found matching view", {
							viewName: view.name,
							hasGroupBy: !!view.groupBy,
							groupByType: typeof view.groupBy,
							groupBy: view.groupBy
						});

						if (view.groupBy) {
							if (typeof view.groupBy === 'object' && view.groupBy.property) {
								return view.groupBy.property;
							} else if (typeof view.groupBy === 'string') {
								return view.groupBy;
							}
						}
					}
				}

				console.warn("[TaskNotes][KanbanView] View found but no groupBy property detected");
			} else {
				console.warn("[TaskNotes][KanbanView] Missing controller structure", {
					hasQuery: !!controller?.query,
					hasViews: !!controller?.query?.views,
					hasViewName: !!controller?.viewName
				});
			}
		}
		return null;
	}

	private groupTasks(
		taskNotes: TaskInfo[],
		groupByPropertyId: string,
		pathToProps: Map<string, Record<string, any>>
	): Map<string, TaskInfo[]> {
		// Use Bases grouped data if available
		const groups = new Map<string, TaskInfo[]>();

		if (this.dataAdapter.isGrouped()) {
			const basesGroups = this.dataAdapter.getGroupedData();
			const tasksByPath = new Map(taskNotes.map(t => [t.path, t]));

			for (const group of basesGroups) {
				const groupKey = this.dataAdapter.convertGroupKeyToString(group.key);
				const groupTasks: TaskInfo[] = [];

				for (const entry of group.entries) {
					const task = tasksByPath.get(entry.file.path);
					if (task) groupTasks.push(task);
				}

				groups.set(groupKey, groupTasks);
			}
		}

		return groups;
	}

	private async renderFlat(
		groups: Map<string, TaskInfo[]>,
		pathToProps: Map<string, Record<string, any>>
	): Promise<void> {
		// Render columns without swimlanes
		const visibleProperties = this.getVisibleProperties();

		// Apply sorting within each column
		const sortComparator = getBasesSortComparator(this.basesViewContext, pathToProps);

		for (const [groupKey, tasks] of groups.entries()) {
			// Filter empty columns if option enabled
			if (this.hideEmptyColumns && tasks.length === 0) {
				continue;
			}

			// Sort tasks in column
			if (sortComparator) {
				tasks.sort(sortComparator);
			}

			// Create column
			const column = await this.createColumn(groupKey, tasks, visibleProperties);
			this.boardEl!.appendChild(column);
		}
	}

	private async renderWithSwimLanes(
		groups: Map<string, TaskInfo[]>,
		allTasks: TaskInfo[],
		pathToProps: Map<string, Record<string, any>>,
		groupByPropertyId: string
	): Promise<void> {
		// Group by swimlane first, then by column within each swimlane
		const swimLanes = new Map<string, Map<string, TaskInfo[]>>();

		// Get all unique swimlane values
		const swimLaneValues = new Set<string>();

		for (const task of allTasks) {
			const props = pathToProps.get(task.path) || {};
			const swimLaneValue = this.getPropertyValue(props, this.swimLanePropertyId!);
			const swimLaneKey = this.valueToString(swimLaneValue);
			swimLaneValues.add(swimLaneKey);
		}

		// Initialize swimlane -> column -> tasks structure
		for (const swimLaneKey of swimLaneValues) {
			swimLanes.set(swimLaneKey, new Map());

			// Initialize each column in this swimlane
			for (const [columnKey] of groups) {
				swimLanes.get(swimLaneKey)!.set(columnKey, []);
			}
		}

		// Distribute tasks into swimlane + column cells
		for (const task of allTasks) {
			const props = pathToProps.get(task.path) || {};

			// Determine swimlane
			const swimLaneValue = this.getPropertyValue(props, this.swimLanePropertyId!);
			const swimLaneKey = this.valueToString(swimLaneValue);

			// Determine column (groupBy value)
			const columnValue = this.getPropertyValue(props, groupByPropertyId);
			const columnKey = this.valueToString(columnValue);

			const swimLane = swimLanes.get(swimLaneKey);
			if (swimLane && swimLane.has(columnKey)) {
				swimLane.get(columnKey)!.push(task);
			}
		}

		// Sort column keys to maintain consistent order
		const columnKeys = Array.from(groups.keys());

		// Render swimlane table
		await this.renderSwimLaneTable(swimLanes, columnKeys, pathToProps);
	}

	private async renderSwimLaneTable(
		swimLanes: Map<string, Map<string, TaskInfo[]>>,
		columnKeys: string[],
		pathToProps: Map<string, Record<string, any>>
	): Promise<void> {
		// Set CSS variable for column width
		this.boardEl!.style.setProperty('--kanban-column-width', `${this.columnWidth}px`);

		// Add swimlanes class to board
		this.boardEl!.addClass("kanban-view__board--swimlanes");

		// Create header row
		const headerRow = this.boardEl!.createEl("div", {
			cls: "kanban-view__swimlane-row kanban-view__swimlane-row--header"
		});

		// Empty corner cell for swimlane label column
		headerRow.createEl("div", { cls: "kanban-view__swimlane-label" });

		// Column headers
		for (const columnKey of columnKeys) {
			const headerCell = headerRow.createEl("div", {
				cls: "kanban-view__column-header-cell"
			});

			const titleContainer = headerCell.createSpan({ cls: "kanban-view__column-title" });
			this.renderGroupTitleWrapper(titleContainer, columnKey);
		}

		// Get visible properties for cards
		const visibleProperties = this.getVisibleProperties();
		const sortComparator = getBasesSortComparator(this.basesViewContext, pathToProps);

		// Render each swimlane row
		for (const [swimLaneKey, columns] of swimLanes) {
			const row = this.boardEl!.createEl("div", { cls: "kanban-view__swimlane-row" });

			// Swimlane label cell
			const labelCell = row.createEl("div", { cls: "kanban-view__swimlane-label" });

			// Add swimlane title and count
			const titleEl = labelCell.createEl("div", { cls: "kanban-view__swimlane-title" });
			this.renderGroupTitleWrapper(titleEl, swimLaneKey);

			// Count total tasks in this swimlane
			const totalTasks = Array.from(columns.values()).reduce((sum, tasks) => sum + tasks.length, 0);
			labelCell.createEl("div", {
				cls: "kanban-view__swimlane-count",
				text: `${totalTasks}`
			});

			// Render columns in this swimlane
			for (const columnKey of columnKeys) {
				const tasks = columns.get(columnKey) || [];

				// Sort tasks
				if (sortComparator) {
					tasks.sort(sortComparator);
				}

				// Create cell
				const cell = row.createEl("div", {
					cls: "kanban-view__swimlane-column",
					attr: {
						"data-column": columnKey,
						"data-swimlane": swimLaneKey
					}
				});

				// Setup drop handlers for this cell
				this.setupSwimLaneCellDragDrop(cell, columnKey, swimLaneKey);

				// Create tasks container inside the cell
				const tasksContainer = cell.createDiv({ cls: "kanban-view__tasks-container" });

				// Render tasks in this cell
				for (const task of tasks) {
					const cardWrapper = tasksContainer.createDiv({ cls: "kanban-view__card-wrapper" });
					cardWrapper.setAttribute("draggable", "true");
					cardWrapper.setAttribute("data-task-path", task.path);

					const card = createTaskCard(task, this.plugin, visibleProperties, {
						showCheckbox: false,
						showArchiveButton: false,
						showTimeTracking: false,
						showRecurringControls: true,
						groupByDate: false,
						targetDate: new Date()
					});

					cardWrapper.appendChild(card);
					this.currentTaskElements.set(task.path, cardWrapper);

					// Setup card drag handlers
					this.setupCardDragHandlers(cardWrapper, task);
				}
			}
		}
	}

	private async createColumn(
		groupKey: string,
		tasks: TaskInfo[],
		visibleProperties: string[]
	): Promise<HTMLElement> {
		const column = document.createElement("div");
		column.className = "kanban-view__column";
		column.style.width = `${this.columnWidth}px`;
		column.setAttribute("data-group", groupKey);

		// Column header
		const header = column.createDiv({ cls: "kanban-view__column-header" });
		const titleContainer = header.createSpan({ cls: "kanban-view__column-title" });
		this.renderGroupTitleWrapper(titleContainer, groupKey);

		header.createSpan({
			cls: "kanban-view__column-count",
			text: ` (${tasks.length})`
		});

		// Cards container
		const cardsContainer = column.createDiv({ cls: "kanban-view__cards" });

		// Setup drag-and-drop
		this.setupColumnDragDrop(column, cardsContainer, groupKey);

		// Render task cards
		const cardOptions = {
			showCheckbox: false,
			showArchiveButton: false,
			showTimeTracking: false,
			showRecurringControls: true,
			groupByDate: false,
			targetDate: new Date()
		};

		for (const task of tasks) {
			const cardWrapper = cardsContainer.createDiv({ cls: "kanban-view__card-wrapper" });
			cardWrapper.setAttribute("draggable", "true");
			cardWrapper.setAttribute("data-task-path", task.path);

			const card = createTaskCard(task, this.plugin, visibleProperties, cardOptions);

			cardWrapper.appendChild(card);
			this.currentTaskElements.set(task.path, cardWrapper);

			// Setup card drag handlers
			this.setupCardDragHandlers(cardWrapper, task);
		}

		return column;
	}

	private setupColumnDragDrop(
		column: HTMLElement,
		cardsContainer: HTMLElement,
		groupKey: string
	): void {
		// Drag over handler
		column.addEventListener("dragover", (e: DragEvent) => {
			e.preventDefault();
			e.stopPropagation();
			if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
			column.classList.add("kanban-view__column--dragover");
		});

		// Drag leave handler
		column.addEventListener("dragleave", (e: DragEvent) => {
			if (e.target === column) {
				column.classList.remove("kanban-view__column--dragover");
			}
		});

		// Drop handler
		column.addEventListener("drop", async (e: DragEvent) => {
			e.preventDefault();
			e.stopPropagation();
			column.classList.remove("kanban-view__column--dragover");

			if (!this.draggedTaskPath) return;

			// Update the task's groupBy property in Bases
			await this.handleTaskDrop(this.draggedTaskPath, groupKey, null);

			this.draggedTaskPath = null;
		});
	}

	private setupSwimLaneCellDragDrop(
		cell: HTMLElement,
		columnKey: string,
		swimLaneKey: string
	): void {
		// Drag over handler
		cell.addEventListener("dragover", (e: DragEvent) => {
			e.preventDefault();
			e.stopPropagation();
			if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
			cell.classList.add("kanban-view__swimlane-column--dragover");
		});

		// Drag leave handler
		cell.addEventListener("dragleave", (e: DragEvent) => {
			if (e.target === cell) {
				cell.classList.remove("kanban-view__swimlane-column--dragover");
			}
		});

		// Drop handler
		cell.addEventListener("drop", async (e: DragEvent) => {
			e.preventDefault();
			e.stopPropagation();
			cell.classList.remove("kanban-view__swimlane-column--dragover");

			if (!this.draggedTaskPath) return;

			// Update both the groupBy property and swimlane property
			await this.handleTaskDrop(this.draggedTaskPath, columnKey, swimLaneKey);

			this.draggedTaskPath = null;
		});
	}

	private setupCardDragHandlers(cardWrapper: HTMLElement, task: TaskInfo): void {
		cardWrapper.addEventListener("dragstart", (e: DragEvent) => {
			this.draggedTaskPath = task.path;
			cardWrapper.classList.add("kanban-view__card--dragging");

			if (e.dataTransfer) {
				e.dataTransfer.effectAllowed = "move";
				e.dataTransfer.setData("text/plain", task.path);
			}
		});

		cardWrapper.addEventListener("dragend", () => {
			cardWrapper.classList.remove("kanban-view__card--dragging");
		});
	}

	private async handleTaskDrop(
		taskPath: string,
		newGroupValue: string,
		newSwimLaneValue: string | null
	): Promise<void> {
		try {
			// Get the groupBy property from the controller
			const groupByPropertyId = this.getGroupByPropertyId();
			if (!groupByPropertyId) return;

			// Map Bases property ID to internal field name
			const internalFieldName = this.propertyMapper.basesToInternal(groupByPropertyId);

			// Update the groupBy property
			await this.plugin.updateTaskProperty(
				{ path: taskPath } as TaskInfo,
				internalFieldName as any,
				newGroupValue
			);

			// Update swimlane property if applicable
			if (newSwimLaneValue !== null && this.swimLanePropertyId) {
				const swimLaneInternalField = this.propertyMapper.basesToInternal(this.swimLanePropertyId);
				await this.plugin.updateTaskProperty(
					{ path: taskPath } as TaskInfo,
					swimLaneInternalField as any,
					newSwimLaneValue
				);
			}

			// Refresh to show updated position
			this.debouncedRefresh();
		} catch (error) {
			console.error("[TaskNotes][KanbanView] Error updating task:", error);
		}
	}

	protected setupContainer(): void {
		super.setupContainer();

		const board = document.createElement("div");
		board.className = "kanban-view__board";
		this.rootElement?.appendChild(board);
		this.boardEl = board;
	}

	protected async handleTaskUpdate(task: TaskInfo): Promise<void> {
		// For kanban, just do full refresh since cards might move columns
		this.debouncedRefresh();
	}

	private renderEmptyState(): void {
		const empty = document.createElement("div");
		empty.className = "tn-bases-empty";
		empty.style.cssText = "padding: 20px; text-align: center; color: var(--text-muted);";
		empty.textContent = "No TaskNotes tasks found for this Base.";
		this.boardEl!.appendChild(empty);
	}

	private renderNoGroupByError(): void {
		const error = document.createElement("div");
		error.className = "tn-bases-error";
		error.style.cssText = "padding: 20px; text-align: center; color: var(--text-error);";
		error.textContent = "Kanban view requires a 'Group by' property to be configured.";
		this.boardEl!.appendChild(error);
	}

	private renderError(error: Error): void {
		const errorEl = document.createElement("div");
		errorEl.className = "tn-bases-error";
		errorEl.style.cssText =
			"padding: 20px; color: #d73a49; background: #ffeaea; border-radius: 4px; margin: 10px 0;";
		errorEl.textContent = `Error loading kanban: ${error.message || "Unknown error"}`;
		this.boardEl!.appendChild(errorEl);
	}

	private buildPathToPropsMap(): Map<string, Record<string, any>> {
		const dataItems = this.dataAdapter.extractDataItems();
		return new Map(
			dataItems
				.filter((i) => !!i.path)
				.map((i) => [i.path || "", i.properties || {}])
		);
	}

	private getPropertyValue(props: Record<string, any>, propertyId: string): any {
		// Strip prefix from property ID if present
		const cleanId = this.stripPropertyPrefix(propertyId);

		// Try exact match first
		if (props[propertyId] !== undefined) return props[propertyId];
		if (props[cleanId] !== undefined) return props[cleanId];

		return null;
	}

	private stripPropertyPrefix(propertyId: string): string {
		const parts = propertyId.split(".");
		if (parts.length > 1 && ["note", "file", "formula", "task"].includes(parts[0])) {
			return parts.slice(1).join(".");
		}
		return propertyId;
	}

	private valueToString(value: any): string {
		if (value === null || value === undefined) return "None";
		if (typeof value === "string") return value || "None";
		if (typeof value === "number") return String(value);
		if (typeof value === "boolean") return value ? "True" : "False";
		if (Array.isArray(value)) return value.length > 0 ? value.join(", ") : "None";
		return String(value);
	}

	private renderGroupTitleWrapper(container: HTMLElement, title: string): void {
		const linkServices: LinkServices = {
			metadataCache: this.plugin.app.metadataCache,
			workspace: this.plugin.app.workspace,
		};
		renderGroupTitle(container, title, linkServices);
	}

	protected cleanup(): void {
		super.cleanup();
		this.currentTaskElements.clear();
		this.boardEl = null;
	}
}

// Factory function
export function buildKanbanViewFactory(plugin: TaskNotesPlugin) {
	return function (basesContainer: any, containerEl?: HTMLElement) {
		const viewContainerEl = containerEl || basesContainer.viewContainerEl;
		const controller = basesContainer;

		if (!viewContainerEl) {
			console.error("[TaskNotes][KanbanView] No viewContainerEl found");
			return { destroy: () => {} } as any;
		}

		const view = new KanbanView(controller, viewContainerEl, plugin);

		return {
			load: () => view.load(),
			unload: () => view.unload(),
			refresh() { view.render(); },
			onDataUpdated: function(this: any) {
				view.setBasesViewContext(this);
				view.onDataUpdated();
			},
			onResize: () => {
				// Handle resize if needed
			},
			getEphemeralState: () => view.getEphemeralState(),
			setEphemeralState: (state: any) => view.setEphemeralState(state),
			focus: () => view.focus(),
			destroy() {
				view.unload();
			},
		};
	};
}
