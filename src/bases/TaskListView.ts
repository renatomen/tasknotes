import { setIcon } from "obsidian";
import TaskNotesPlugin from "../main";
import { BasesViewBase } from "./BasesViewBase";
import { TaskInfo } from "../types";
import { identifyTaskNotesFromBasesData, BasesDataItem } from "./helpers";
import { createTaskCard, updateTaskCard } from "../ui/TaskCard";
import { getBasesSortComparator } from "./sorting";
import { renderGroupTitle } from "./groupTitleRenderer";
import { type LinkServices } from "../ui/renderers/linkRenderer";

export class TaskListView extends BasesViewBase {
	type = "tasknoteTaskList";
	private itemsContainer: HTMLElement | null = null;
	private currentTaskElements = new Map<string, HTMLElement>();
	// Store reference to BasesView context for accessing data and config
	private basesViewContext?: any;

	constructor(controller: any, containerEl: HTMLElement, plugin: TaskNotesPlugin) {
		super(controller, containerEl, plugin);
	}

	/**
	 * Set the Bases view context (called by factory during onDataUpdated)
	 */
	setBasesViewContext(context: any): void {
		this.basesViewContext = context;
		// Update the data adapter to use the correct context
		(this.dataAdapter as any).basesView = context;
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

	async render(): Promise<void> {
		console.log("[TaskNotes][TaskListView] ========== RENDER CALLED ==========");
		if (!this.itemsContainer || !this.rootElement) return;

		try {
			// Skip rendering if we have no data yet (prevents flickering during data updates)
			if (!this.basesViewContext?.data?.data) {
				return;
			}

			// Extract data using adapter
			const dataItems = this.dataAdapter.extractDataItems();

			// Compute Bases formulas for TaskNotes items
			await this.computeFormulas(dataItems);

			const taskNotes = await identifyTaskNotesFromBasesData(dataItems, this.plugin);
			console.log("[TaskNotes][TaskListView] Found", taskNotes.length, "tasks");

			// Clear previous render
			this.itemsContainer.empty();
			this.currentTaskElements.clear();

			if (taskNotes.length === 0) {
				this.renderEmptyState();
				return;
			}

			// Check if we have grouped data
			if (this.dataAdapter.isGrouped()) {
				console.log("[TaskNotes][TaskListView] Rendering grouped view");
				await this.renderGrouped(taskNotes);
			} else {
				console.log("[TaskNotes][TaskListView] Rendering flat view");
				await this.renderFlat(taskNotes);
			}
		} catch (error: any) {
			console.error("[TaskNotes][TaskListView] Error rendering:", error);
			this.renderError(error);
		}
	}

	/**
	 * Compute Bases formulas for TaskNotes items.
	 * This ensures formulas have access to TaskNote-specific properties.
	 */
	private async computeFormulas(dataItems: BasesDataItem[]): Promise<void> {
		const ctxFormulas = this.basesViewContext?.ctx?.formulas;
		if (!ctxFormulas || typeof ctxFormulas !== "object" || dataItems.length === 0) {
			return;
		}

		for (let i = 0; i < dataItems.length; i++) {
			const item = dataItems[i];
			const itemFormulaResults = item.basesData?.formulaResults;
			if (!itemFormulaResults?.cachedFormulaOutputs) continue;

			for (const formulaName of Object.keys(ctxFormulas)) {
				const formula = ctxFormulas[formulaName];
				if (formula && typeof formula.getValue === "function") {
					try {
						const baseData = item.basesData;
						const taskProperties = item.properties || {};

						let result;

						// Temporarily merge TaskNote properties into frontmatter for formula access
						if (baseData.frontmatter && Object.keys(taskProperties).length > 0) {
							const originalFrontmatter = baseData.frontmatter;
							baseData.frontmatter = {
								...originalFrontmatter,
								...taskProperties,
							};
							result = formula.getValue(baseData);
							baseData.frontmatter = originalFrontmatter; // Restore original state
						} else {
							result = formula.getValue(baseData);
						}

						// Store computed result for TaskCard rendering
						if (result !== undefined) {
							itemFormulaResults.cachedFormulaOutputs[formulaName] = result;
						}
					} catch (e) {
						// Formulas may fail for various reasons - this is expected
					}
				}
			}
		}
	}

	private async renderFlat(taskNotes: TaskInfo[]): Promise<void> {
		const visibleProperties = this.getVisibleProperties();

		// Apply Bases sorting if configured
		const pathToProps = this.buildPathToPropsMap();
		const sortComparator = getBasesSortComparator(this, pathToProps);
		if (sortComparator) {
			taskNotes.sort(sortComparator);
		}

		const cardOptions = {
			showCheckbox: false,
			showArchiveButton: false,
			showTimeTracking: false,
			showRecurringControls: true,
			groupByDate: false,
		};

		for (const taskInfo of taskNotes) {
			const cardEl = createTaskCard(taskInfo, this.plugin, visibleProperties, {
				...cardOptions,
				targetDate: new Date(),
			});
			this.itemsContainer!.appendChild(cardEl);
			this.currentTaskElements.set(taskInfo.path, cardEl);
		}
	}

	private async renderGrouped(taskNotes: TaskInfo[]): Promise<void> {
		const visibleProperties = this.getVisibleProperties();
		const groups = this.dataAdapter.getGroupedData();

		const cardOptions = {
			showCheckbox: false,
			showArchiveButton: false,
			showTimeTracking: false,
			showRecurringControls: true,
			groupByDate: false,
		};

		// Create a map from file path to TaskInfo for quick lookup
		const tasksByPath = new Map<string, TaskInfo>();
		taskNotes.forEach((task) => {
			if (task.path) {
				tasksByPath.set(task.path, task);
			}
		});

		for (const group of groups) {
			// Create group header
			const groupHeader = document.createElement("div");
			groupHeader.className = "task-section task-group";
			this.itemsContainer!.appendChild(groupHeader);

			// Create header element
			const headerElement = document.createElement("h3");
			headerElement.className = "task-group-header task-list-view__group-header";
			groupHeader.appendChild(headerElement);

			// Add toggle button
			const toggleBtn = document.createElement("button");
			toggleBtn.className = "task-group-toggle";
			toggleBtn.setAttribute("aria-label", "Toggle group");
			toggleBtn.setAttribute("aria-expanded", "true");
			headerElement.appendChild(toggleBtn);

			// Add chevron icon
			setIcon(toggleBtn, "chevron-right");
			const svg = toggleBtn.querySelector("svg");
			if (svg) {
				svg.classList.add("chevron");
				svg.setAttribute("width", "16");
				svg.setAttribute("height", "16");
			}

			// Add group title (with link support if it's a wiki-link)
			const groupTitle = this.dataAdapter.convertGroupKeyToString(group.key);
			const titleContainer = headerElement.createSpan({ cls: "task-group-title" });
			this.renderGroupTitle(titleContainer, groupTitle);

			// Add count
			headerElement.createSpan({
				text: ` (${group.entries.length})`,
				cls: "agenda-view__item-count",
			});

			// Create task cards container
			const taskCardsContainer = document.createElement("div");
			taskCardsContainer.className = "tasks-container task-cards";
			groupHeader.appendChild(taskCardsContainer);

			// Add click handler for toggle
			headerElement.addEventListener("click", (e: any) => {
				const target = e.target as HTMLElement;
				if (target.closest("a")) return; // Don't toggle if clicking on a link

				e.preventDefault();
				e.stopPropagation();

				const isCollapsed = groupHeader.classList.toggle("is-collapsed");
				toggleBtn.setAttribute("aria-expanded", String(!isCollapsed));

				// Toggle task cards visibility
				taskCardsContainer.style.display = isCollapsed ? "none" : "";
			});

			// Get tasks for this group
			const groupPaths = new Set(group.entries.map((e: any) => e.file.path));
			const groupTasks = taskNotes.filter((t) => groupPaths.has(t.path));

			// Apply sorting within group
			const pathToProps = this.buildPathToPropsMap();
			const sortComparator = getBasesSortComparator(this, pathToProps);
			if (sortComparator) {
				groupTasks.sort(sortComparator);
			}

			// Render tasks in group
			for (const taskInfo of groupTasks) {
				const cardEl = createTaskCard(taskInfo, this.plugin, visibleProperties, {
					...cardOptions,
					targetDate: new Date(),
				});
				taskCardsContainer.appendChild(cardEl);
				this.currentTaskElements.set(taskInfo.path, cardEl);
			}
		}
	}

	protected async handleTaskUpdate(task: TaskInfo): Promise<void> {
		const taskElement = this.currentTaskElements.get(task.path);

		if (taskElement) {
			// Selective update - just update this one task card
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
		errorEl.style.cssText =
			"padding: 20px; color: #d73a49; background: #ffeaea; border-radius: 4px; margin: 10px 0;";
		errorEl.textContent = `Error loading tasks: ${error.message || "Unknown error"}`;
		this.itemsContainer!.appendChild(errorEl);
	}

	/**
	 * Render group title using shared utility.
	 */
	private renderGroupTitle(container: HTMLElement, title: string): void {
		const linkServices: LinkServices = {
			metadataCache: this.plugin.app.metadataCache,
			workspace: this.plugin.app.workspace,
		};

		renderGroupTitle(container, title, linkServices);
	}

	private buildPathToPropsMap(): Map<string, Record<string, any>> {
		const dataItems = this.dataAdapter.extractDataItems();
		return new Map(
			dataItems
				.filter((i) => !!i.path)
				.map((i) => [i.path || "", i.properties || {}])
		);
	}

	protected cleanup(): void {
		super.cleanup();
		this.currentTaskElements.clear();
		this.itemsContainer = null;
	}
}

// Factory function for Bases registration
export function buildTaskListViewFactory(plugin: TaskNotesPlugin) {
	return function (basesContainer: any, containerEl?: HTMLElement) {
		// Public API (1.10.0+): factory receives (controller, containerEl)
		const viewContainerEl = containerEl || basesContainer.viewContainerEl;
		const controller = basesContainer;

		if (!viewContainerEl) {
			console.error("[TaskNotes][TaskListView] No viewContainerEl found");
			return { destroy: () => {} } as any;
		}

		const view = new TaskListView(controller, viewContainerEl, plugin);

		return {
			load: () => view.load(),
			unload: () => view.unload(),
			refresh() { view.render(); },
			onDataUpdated: function(this: any) {
				// Store reference to 'this' from Bases (the BasesView instance)
				// This gives us access to both data and config
				view.setBasesViewContext(this);
				view.onDataUpdated();
			},
			onResize: () => {
				// Handle resize - no-op for now
			},
			getEphemeralState: () => view.getEphemeralState(),
			setEphemeralState: (state: any) => view.setEphemeralState(state),
			focus: () => view.focus(),
			destroy() {
				// Access cleanup via public unload
				view.unload();
			},
		};
	};
}
