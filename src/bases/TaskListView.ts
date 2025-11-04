import { Notice, TFile, setIcon } from "obsidian";
import TaskNotesPlugin from "../main";
import { BasesViewBase } from "./BasesViewBase";
import { TaskInfo } from "../types";
import { identifyTaskNotesFromBasesData, BasesDataItem } from "./helpers";
import { createTaskCard, showTaskContextMenu } from "../ui/TaskCard";
import { renderGroupTitle } from "./groupTitleRenderer";
import { type LinkServices } from "../ui/renderers/linkRenderer";
import { DateContextMenu } from "../components/DateContextMenu";
import { PriorityContextMenu } from "../components/PriorityContextMenu";
import { RecurrenceContextMenu } from "../components/RecurrenceContextMenu";
import { ReminderModal } from "../modals/ReminderModal";
import { getDatePart, getTimePart } from "../utils/dateUtils";
import { VirtualScroller } from "../utils/VirtualScroller";

export class TaskListView extends BasesViewBase {
	type = "tasknoteTaskList";
	private itemsContainer: HTMLElement | null = null;
	private currentTaskElements = new Map<string, HTMLElement>();
	// Store reference to Bases View context for accessing data and config
	private basesViewContext?: any;
	private lastRenderWasGrouped = false;
	private lastFlatPaths: string[] = [];
	private lastTaskSignatures = new Map<string, string>();
	private taskInfoCache = new Map<string, TaskInfo>();
	private clickTimeouts = new Map<string, number>();
	private currentTargetDate = new Date();
	private containerListenersRegistered = false;
	private virtualScroller: VirtualScroller<TaskInfo> | null = null;
	private useVirtualScrolling = false;
	private groupScrollers = new Map<string, VirtualScroller<TaskInfo>>(); // groupKey -> scroller
	private readonly VIRTUAL_SCROLL_THRESHOLD = 250; // Use virtual scrolling for 250+ tasks (flat mode)
	private readonly GROUP_VIRTUAL_SCROLL_THRESHOLD = 50; // Use virtual scrolling for 50+ tasks per group

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
		itemsContainer.style.cssText = "margin-top: 12px; min-height: 400px; flex: 1;";
		this.rootElement?.appendChild(itemsContainer);
		this.itemsContainer = itemsContainer;
		this.registerContainerListeners();
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

			if (taskNotes.length === 0) {
				this.clearAllTaskElements();
				this.renderEmptyState();
				this.lastRenderWasGrouped = false;
				return;
			}

			const isGrouped = this.dataAdapter.isGrouped();

			if (isGrouped) {
				if (!this.lastRenderWasGrouped) {
					this.clearAllTaskElements();
				}
				console.log("[TaskNotes][TaskListView] Rendering grouped view");
				await this.renderGrouped(taskNotes);
			} else {
				if (this.lastRenderWasGrouped) {
					this.clearAllTaskElements();
				}
				console.log("[TaskNotes][TaskListView] Rendering flat view");
				await this.renderFlat(taskNotes);
			}

			this.lastRenderWasGrouped = isGrouped;

			// Check if we have grouped data
		} catch (error: any) {
			console.error("[TaskNotes][TaskListView] Error rendering:", error);
			this.clearAllTaskElements();
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

		// Note: taskNotes are already sorted by Bases according to sort configuration
		// No manual sorting needed - Bases provides pre-sorted data

		const targetDate = new Date();
		this.currentTargetDate = targetDate;

		const cardOptions = this.getCardOptions(targetDate);

		// Decide whether to use virtual scrolling
		const shouldUseVirtualScrolling = taskNotes.length >= this.VIRTUAL_SCROLL_THRESHOLD;

		if (shouldUseVirtualScrolling && !this.useVirtualScrolling) {
			// Switch to virtual scrolling
			this.cleanupNonVirtualRendering();
			this.useVirtualScrolling = true;
		} else if (!shouldUseVirtualScrolling && this.useVirtualScrolling) {
			// Switch back to normal rendering
			this.destroyVirtualScroller();
			this.useVirtualScrolling = false;
		}

		if (this.useVirtualScrolling) {
			await this.renderFlatVirtual(taskNotes, visibleProperties, cardOptions);
		} else {
			await this.renderFlatNormal(taskNotes, visibleProperties, cardOptions);
		}
	}

	private async renderFlatVirtual(
		taskNotes: TaskInfo[],
		visibleProperties: string[] | undefined,
		cardOptions: any
	): Promise<void> {
		if (!this.virtualScroller) {
			// Initialize virtual scroller
			this.virtualScroller = new VirtualScroller<TaskInfo>({
				container: this.itemsContainer!,
				items: taskNotes,
				itemHeight: 60, // Approximate task card height - can be adjusted
				overscan: 5,
				renderItem: (taskInfo: TaskInfo, index: number) => {
					// Create card using lazy mode
					const card = createTaskCard(taskInfo, this.plugin, visibleProperties, cardOptions);

					// Cache task info for event handlers
					this.taskInfoCache.set(taskInfo.path, taskInfo);
					this.lastTaskSignatures.set(taskInfo.path, this.buildTaskSignature(taskInfo));

					return card;
				},
				getItemKey: (taskInfo: TaskInfo) => taskInfo.path,
			});

			// Force recalculation after DOM settles
			setTimeout(() => {
				this.virtualScroller?.recalculate();
			}, 0);
		} else {
			// Update existing virtual scroller with new items
			this.virtualScroller.updateItems(taskNotes);
		}

		this.lastFlatPaths = taskNotes.map((task) => task.path);
	}

	private async renderFlatNormal(
		taskNotes: TaskInfo[],
		visibleProperties: string[] | undefined,
		cardOptions: any
	): Promise<void> {
		const seenPaths = new Set<string>();
		const orderChanged = !this.arePathArraysEqual(taskNotes, this.lastFlatPaths);

		if (orderChanged) {
			this.itemsContainer!.empty();
			this.currentTaskElements.clear();
		}

		for (const taskInfo of taskNotes) {
			let cardEl = orderChanged ? null : this.currentTaskElements.get(taskInfo.path) || null;
			const signature = this.buildTaskSignature(taskInfo);
			const previousSignature = this.lastTaskSignatures.get(taskInfo.path);
			const needsUpdate = signature !== previousSignature || !cardEl;

			if (!cardEl || needsUpdate) {
				const newCard = createTaskCard(
					taskInfo,
					this.plugin,
					visibleProperties,
					cardOptions
				);
				if (cardEl && cardEl.isConnected) {
					cardEl.replaceWith(newCard);
				}
				cardEl = newCard;
			}

			if (!cardEl!.isConnected) {
				this.itemsContainer!.appendChild(cardEl!);
			}

			this.currentTaskElements.set(taskInfo.path, cardEl!);
			this.taskInfoCache.set(taskInfo.path, taskInfo);
			this.lastTaskSignatures.set(taskInfo.path, signature);
			seenPaths.add(taskInfo.path);
		}

		if (!orderChanged && seenPaths.size !== this.currentTaskElements.size) {
			for (const [path, el] of this.currentTaskElements) {
				if (!seenPaths.has(path)) {
					el.remove();
					this.currentTaskElements.delete(path);

					// Clean up related state in the same pass
					const timeout = this.clickTimeouts.get(path);
					if (timeout) {
						clearTimeout(timeout);
						this.clickTimeouts.delete(path);
					}
					this.taskInfoCache.delete(path);
					this.lastTaskSignatures.delete(path);
				}
			}
		}

		this.lastFlatPaths = taskNotes.map((task) => task.path);
	}

	private async renderGrouped(taskNotes: TaskInfo[]): Promise<void> {
		const visibleProperties = this.getVisibleProperties();
		const groups = this.dataAdapter.getGroupedData();

		// Clean up any existing group scrollers
		this.destroyGroupScrollers();

		this.itemsContainer!.empty();
		this.currentTaskElements.clear();
		this.clearClickTimeouts();
		this.taskInfoCache.clear();
		this.lastTaskSignatures.clear();

		const targetDate = new Date();
		this.currentTargetDate = targetDate;
		const cardOptions = this.getCardOptions(targetDate);

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

			// Note: groupTasks preserve order from Bases grouped data
			// No manual sorting needed - Bases provides pre-sorted data within groups

			// Use virtual scrolling for large groups
			const groupKey = groupTitle; // Use group title as key
			if (groupTasks.length >= this.GROUP_VIRTUAL_SCROLL_THRESHOLD) {
				this.renderGroupVirtual(taskCardsContainer, groupKey, groupTasks, visibleProperties, cardOptions);
			} else {
				this.renderGroupNormal(taskCardsContainer, groupTasks, visibleProperties, cardOptions);
			}
		}

		this.lastFlatPaths = taskNotes.map((task) => task.path);
	}

	private renderGroupVirtual(
		taskCardsContainer: HTMLElement,
		groupKey: string,
		groupTasks: TaskInfo[],
		visibleProperties: string[] | undefined,
		cardOptions: any
	): void {
		// Make container scrollable with max height
		taskCardsContainer.style.cssText = "overflow-y: auto; max-height: 600px; position: relative;";

		const scroller = new VirtualScroller<TaskInfo>({
			container: taskCardsContainer,
			items: groupTasks,
			itemHeight: 60, // Estimated card height
			overscan: 5,
			renderItem: (taskInfo: TaskInfo) => {
				const cardEl = createTaskCard(taskInfo, this.plugin, visibleProperties, cardOptions);

				// Cache task info for event handlers
				this.taskInfoCache.set(taskInfo.path, taskInfo);
				this.lastTaskSignatures.set(taskInfo.path, this.buildTaskSignature(taskInfo));

				return cardEl;
			},
			getItemKey: (taskInfo: TaskInfo) => taskInfo.path,
		});

		this.groupScrollers.set(groupKey, scroller);
	}

	private renderGroupNormal(
		taskCardsContainer: HTMLElement,
		groupTasks: TaskInfo[],
		visibleProperties: string[] | undefined,
		cardOptions: any
	): void {
		// Render tasks normally
		for (const taskInfo of groupTasks) {
			const cardEl = createTaskCard(taskInfo, this.plugin, visibleProperties, cardOptions);
			taskCardsContainer.appendChild(cardEl);
			this.currentTaskElements.set(taskInfo.path, cardEl);
			this.taskInfoCache.set(taskInfo.path, taskInfo);
			this.lastTaskSignatures.set(taskInfo.path, this.buildTaskSignature(taskInfo));
		}
	}

	private destroyGroupScrollers(): void {
		for (const scroller of this.groupScrollers.values()) {
			scroller.destroy();
		}
		this.groupScrollers.clear();
	}

	protected async handleTaskUpdate(task: TaskInfo): Promise<void> {
		// Update cache
		this.taskInfoCache.set(task.path, task);
		this.lastTaskSignatures.set(task.path, this.buildTaskSignature(task));

		// For virtual scrolling, just do a full refresh
		// Simple and reliable, performance is still good with virtual scrolling
		if (this.useVirtualScrolling) {
			this.debouncedRefresh();
		} else {
			// Normal mode - update the specific card
			const existingElement = this.currentTaskElements.get(task.path);
			if (existingElement && existingElement.isConnected) {
				const visibleProperties = this.getVisibleProperties();
				const replacement = createTaskCard(task, this.plugin, visibleProperties, this.getCardOptions(this.currentTargetDate));
				existingElement.replaceWith(replacement);
				replacement.classList.add("task-card--updated");
				window.setTimeout(() => {
					replacement.classList.remove("task-card--updated");
				}, 1000);
				this.currentTaskElements.set(task.path, replacement);
			} else {
				this.debouncedRefresh();
			}
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

	protected cleanup(): void {
		super.cleanup();
		this.unregisterContainerListeners();
		this.destroyVirtualScroller();
		this.destroyGroupScrollers();
		this.currentTaskElements.clear();
		this.itemsContainer = null;
		this.lastRenderWasGrouped = false;
		this.clearClickTimeouts();
		this.taskInfoCache.clear();
		this.lastTaskSignatures.clear();
		this.lastFlatPaths = [];
		this.useVirtualScrolling = false;
	}

	private clearAllTaskElements(): void {
		if (this.useVirtualScrolling) {
			this.destroyVirtualScroller();
			this.useVirtualScrolling = false;
		}
		this.destroyGroupScrollers();
		this.itemsContainer?.empty();
		this.currentTaskElements.forEach((el) => el.remove());
		this.currentTaskElements.clear();
		this.lastFlatPaths = [];
		this.lastTaskSignatures.clear();
		this.taskInfoCache.clear();
		this.clearClickTimeouts();
	}

	private getCardOptions(targetDate: Date) {
		return {
			showCheckbox: false,
			showArchiveButton: false,
			showTimeTracking: false,
			showRecurringControls: true,
			groupByDate: false,
			targetDate,
			interactionMode: "lazy" as const,
		};
	}

	private clearClickTimeouts(): void {
		for (const timeout of this.clickTimeouts.values()) {
			if (timeout) {
				clearTimeout(timeout);
			}
		}
		this.clickTimeouts.clear();
	}

	private registerContainerListeners(): void {
		if (!this.itemsContainer || this.containerListenersRegistered) return;
		this.itemsContainer.addEventListener("click", this.handleItemClick);
		this.itemsContainer.addEventListener("contextmenu", this.handleItemContextMenu);
		this.itemsContainer.addEventListener("pointerover", this.handleItemPointerOver);
		this.containerListenersRegistered = true;
	}

	private unregisterContainerListeners(): void {
		if (!this.itemsContainer || !this.containerListenersRegistered) return;
		this.itemsContainer.removeEventListener("click", this.handleItemClick);
		this.itemsContainer.removeEventListener("contextmenu", this.handleItemContextMenu);
		this.itemsContainer.removeEventListener("pointerover", this.handleItemPointerOver);
		this.containerListenersRegistered = false;
	}

	private getTaskContextFromEvent(event: Event): { task: TaskInfo; card: HTMLElement } | null {
		const target = event.target as HTMLElement | null;
		if (!target) return null;
		const card = target.closest<HTMLElement>(".task-card");
		if (!card) return null;
		const path = card.dataset.taskPath;
		if (!path) return null;
		const task = this.taskInfoCache.get(path);
		if (!task) return null;
		return { task, card };
	}

	private handleItemClick = async (event: MouseEvent) => {
		const context = this.getTaskContextFromEvent(event);
		if (!context) return;

		const { task, card } = context;
		const target = event.target as HTMLElement;
		const actionEl = target.closest<HTMLElement>("[data-tn-action]");

		if (actionEl && actionEl !== card) {
			const action = actionEl.dataset.tnAction;
			if (action) {
				event.preventDefault();
				event.stopPropagation();
				await this.handleActionClick(action, task, actionEl, event);
				return;
			}
		}

		event.stopPropagation();
		await this.handleCardClick(task, event);
	};

	private handleItemContextMenu = async (event: MouseEvent) => {
		const context = this.getTaskContextFromEvent(event);
		if (!context) return;
		event.preventDefault();
		event.stopPropagation();
		await showTaskContextMenu(event, context.task.path, this.plugin, this.currentTargetDate);
	};

	private handleItemPointerOver = (event: PointerEvent) => {
		if ("pointerType" in event && event.pointerType !== "mouse") {
			return;
		}
		const context = this.getTaskContextFromEvent(event);
		if (!context) return;

		const related = event.relatedTarget as HTMLElement | null;
		if (related && context.card.contains(related)) {
			return;
		}

		const file = this.plugin.app.vault.getAbstractFileByPath(context.task.path);
		if (file) {
			this.plugin.app.workspace.trigger("hover-link", {
				event: event as MouseEvent,
				source: "tasknotes-task-card",
				hoverParent: context.card,
				targetEl: context.card,
				linktext: context.task.path,
				sourcePath: context.task.path,
			});
		}
	};

	private async handleActionClick(
		action: string,
		task: TaskInfo,
		target: HTMLElement,
		event: MouseEvent
	): Promise<void> {
		switch (action) {
			case "toggle-status":
				await this.handleToggleStatus(task, event);
				return;
			case "priority-menu":
				this.showPriorityMenu(task, event);
				return;
			case "recurrence-menu":
				this.showRecurrenceMenu(task, event);
				return;
			case "reminder-menu":
				this.showReminderModal(task);
				return;
			case "task-context-menu":
				await showTaskContextMenu(event, task.path, this.plugin, this.currentTargetDate);
				return;
			case "edit-date":
				await this.openDateContextMenu(task, target.dataset.tnDateType as "due" | "scheduled" | undefined, event);
				return;
			case "filter-project-subtasks":
				await this.filterProjectSubtasks(task);
				return;
			case "toggle-subtasks":
				await this.toggleSubtasks(task, target);
				return;
			case "toggle-blocking-tasks":
				await this.toggleBlockingTasks(task, target);
				return;
			default:
				await this.handleCardClick(task, event);
		}
	}

	private async handleToggleStatus(task: TaskInfo, event: MouseEvent): Promise<void> {
		try {
			if (task.recurrence) {
				await this.plugin.toggleRecurringTaskComplete(task, this.currentTargetDate);
			} else {
				await this.plugin.toggleTaskStatus(task);
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			console.error("[TaskNotes][TaskListView] Failed to toggle status", {
				error: message,
				taskPath: task.path,
			});
			new Notice(`Failed to toggle task status: ${message}`);
		}
	}

	private showPriorityMenu(task: TaskInfo, event: MouseEvent): void {
		const menu = new PriorityContextMenu({
			currentValue: task.priority,
			onSelect: async (newPriority) => {
				try {
					await this.plugin.updateTaskProperty(task, "priority", newPriority);
				} catch (error) {
					console.error("[TaskNotes][TaskListView] Failed to update priority", error);
					new Notice("Failed to update priority");
				}
			},
			plugin: this.plugin,
		});
		menu.show(event);
	}

	private showRecurrenceMenu(task: TaskInfo, event: MouseEvent): void {
		const menu = new RecurrenceContextMenu({
			currentValue: typeof task.recurrence === "string" ? task.recurrence : undefined,
			onSelect: async (newRecurrence: string | null) => {
				try {
					await this.plugin.updateTaskProperty(
						task,
						"recurrence",
						newRecurrence || undefined
					);
				} catch (error) {
					console.error("[TaskNotes][TaskListView] Failed to update recurrence", error);
					new Notice("Failed to update recurrence");
				}
			},
			app: this.plugin.app,
			plugin: this.plugin,
		});
		menu.show(event);
	}

	private showReminderModal(task: TaskInfo): void {
		const modal = new ReminderModal(this.plugin.app, this.plugin, task, async (reminders) => {
			try {
				await this.plugin.updateTaskProperty(
					task,
					"reminders",
					reminders.length > 0 ? reminders : undefined
				);
			} catch (error) {
				console.error("[TaskNotes][TaskListView] Failed to update reminders", error);
				new Notice("Failed to update reminders");
			}
		});
		modal.open();
	}

	private async openDateContextMenu(
		task: TaskInfo,
		dateType: "due" | "scheduled" | undefined,
		event: MouseEvent
	): Promise<void> {
		if (!dateType) return;
		const currentValue = dateType === "due" ? task.due : task.scheduled;
		const menu = new DateContextMenu({
			currentValue: getDatePart(currentValue || ""),
			currentTime: getTimePart(currentValue || ""),
			onSelect: async (dateValue, timeValue) => {
				try {
					let finalValue: string | undefined;
					if (!dateValue) {
						finalValue = undefined;
					} else if (timeValue) {
						finalValue = `${dateValue}T${timeValue}`;
					} else {
						finalValue = dateValue;
					}
					await this.plugin.updateTaskProperty(task, dateType, finalValue);
				} catch (error) {
					const message = error instanceof Error ? error.message : String(error);
					console.error("[TaskNotes][TaskListView] Failed to update date", {
						error: message,
						taskPath: task.path,
						dateType,
					});
					new Notice(`Failed to update ${dateType} date: ${message}`);
				}
			},
			plugin: this.plugin,
		});
		menu.show(event);
	}

	private async handleCardClick(task: TaskInfo, event: MouseEvent): Promise<void> {
		if (this.plugin.settings.doubleClickAction === "none") {
			await this.executeSingleClickAction(task, event);
			return;
		}

		const existingTimeout = this.clickTimeouts.get(task.path);
		if (existingTimeout) {
			clearTimeout(existingTimeout);
			this.clickTimeouts.delete(task.path);
			await this.executeDoubleClickAction(task, event);
		} else {
			const timeout = window.setTimeout(async () => {
				this.clickTimeouts.delete(task.path);
				await this.executeSingleClickAction(task, event);
			}, 250);
			this.clickTimeouts.set(task.path, timeout);
		}
	}

	private async executeSingleClickAction(task: TaskInfo, event: MouseEvent): Promise<void> {
		if (event.ctrlKey || event.metaKey) {
			this.openTaskNote(task, true);
			return;
		}

		switch (this.plugin.settings.singleClickAction) {
			case "edit":
				await this.editTask(task);
				break;
			case "openNote":
				this.openTaskNote(task, false);
				break;
			default:
				break;
		}
	}

	private async executeDoubleClickAction(task: TaskInfo, event: MouseEvent): Promise<void> {
		switch (this.plugin.settings.doubleClickAction) {
			case "edit":
				await this.editTask(task);
				break;
			case "openNote":
				this.openTaskNote(task, false);
				break;
			default:
				break;
		}
	}

	private async editTask(task: TaskInfo): Promise<void> {
		await this.plugin.openTaskEditModal(task);
	}

	private openTaskNote(task: TaskInfo, newTab: boolean): void {
		const file = this.plugin.app.vault.getAbstractFileByPath(task.path);
		if (file instanceof TFile) {
			if (newTab) {
				this.plugin.app.workspace.openLinkText(task.path, "", true);
			} else {
				this.plugin.app.workspace.getLeaf(false).openFile(file);
			}
		}
	}

	private async filterProjectSubtasks(task: TaskInfo): Promise<void> {
		try {
			await this.plugin.applyProjectSubtaskFilter(task);
		} catch (error) {
			console.error("[TaskNotes][TaskListView] Failed to filter project subtasks", error);
			new Notice("Failed to filter project subtasks");
		}
	}

	private async toggleSubtasks(task: TaskInfo, target: HTMLElement): Promise<void> {
		try {
			if (!this.plugin.expandedProjectsService) {
				console.error("[TaskNotes][TaskListView] ExpandedProjectsService not initialized");
				new Notice("Service not available. Please try reloading the plugin.");
				return;
			}

			const newExpanded = this.plugin.expandedProjectsService.toggle(task.path);
			target.classList.toggle("task-card__chevron--expanded", newExpanded);
			target.setAttribute(
				"aria-label",
				newExpanded ? "Collapse subtasks" : "Expand subtasks"
			);

			// Find the card element and toggle subtasks display
			const card = target.closest<HTMLElement>(".task-card");
			if (card) {
				const { toggleSubtasks } = await import("../ui/TaskCard");
				await toggleSubtasks(card, task, this.plugin, newExpanded);
			}
		} catch (error) {
			console.error("[TaskNotes][TaskListView] Failed to toggle subtasks", error);
			new Notice("Failed to toggle subtasks");
		}
	}

	private async toggleBlockingTasks(task: TaskInfo, target: HTMLElement): Promise<void> {
		try {
			const expanded = target.classList.toggle("task-card__blocking-toggle--expanded");

			// Find the card element and toggle blocking tasks display
			const card = target.closest<HTMLElement>(".task-card");
			if (card) {
				const { toggleBlockingTasks } = await import("../ui/TaskCard");
				await toggleBlockingTasks(card, task, this.plugin, expanded);
			}
		} catch (error) {
			console.error("[TaskNotes][TaskListView] Failed to toggle blocking tasks", error);
			new Notice("Failed to toggle blocking tasks");
		}
	}

	private arePathArraysEqual(taskNotes: TaskInfo[], previousPaths: string[]): boolean {
		if (taskNotes.length !== previousPaths.length) return false;
		for (let i = 0; i < taskNotes.length; i++) {
			if (taskNotes[i].path !== previousPaths[i]) return false;
		}
		return true;
	}

	private cleanupNonVirtualRendering(): void {
		this.itemsContainer?.empty();
		this.currentTaskElements.clear();
		this.clearClickTimeouts();
	}

	private destroyVirtualScroller(): void {
		if (this.virtualScroller) {
			this.virtualScroller.destroy();
			this.virtualScroller = null;
		}
	}

	private buildTaskSignature(task: TaskInfo): string {
		// Fast signature using only fields that affect rendering
		return `${task.path}|${task.title}|${task.status}|${task.priority}|${task.due}|${task.scheduled}|${task.recurrence}|${task.archived}|${task.complete_instances?.join(',')}|${task.reminders?.length}|${task.blocking?.length}|${task.blockedBy?.length}`;
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
