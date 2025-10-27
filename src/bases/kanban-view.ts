import TaskNotesPlugin from "../main";
import { BasesDataItem, identifyTaskNotesFromBasesData, getBasesVisibleProperties } from "./helpers";
import { TaskInfo } from "../types";
import { getBasesGroupByConfig, BasesGroupByConfig } from "./group-by";
import { getGroupNameComparator } from "./group-ordering";
import { getBasesSortComparator } from "./sorting";
import { createTaskCard } from "../ui/TaskCard";

interface SwimLaneConfig {
	propertyId: string;
	displayName: string;
	getSwimLaneValue: (task: TaskInfo) => string;
}

// Use the same interface as base-view-factory for compatibility
interface BasesContainerLike {
	results?: Map<any, any>;
	query?: {
		on?: (event: string, cb: () => void) => void;
		off?: (event: string, cb: () => void) => void;
		getViewConfig?: (key: string) => any;
	};
	viewContainerEl?: HTMLElement;
	controller?: {
		runQuery?: () => Promise<void>;
		getViewConfig?: () => any;
	};
}

export function buildTasknotesKanbanViewFactory(plugin: TaskNotesPlugin) {
	return function tasknotesKanbanViewFactory(basesContainer: BasesContainerLike, containerEl?: HTMLElement) {
		let currentRoot: HTMLElement | null = null;
		let cachedGroupByPropertyId: string | null | undefined = undefined; // undefined = not yet determined

		// Public API (1.10.0+): factory receives (controller, containerEl)
		// basesContainer is the QueryController/BasesView instance
		const viewContainerEl = containerEl || basesContainer.viewContainerEl;
		const controller = basesContainer as any;

		if (!viewContainerEl) {
			console.error("[TaskNotes][Bases] No viewContainerEl found");
			return {
				destroy: () => {},
				load: () => {},
				unload: () => {},
				refresh: () => {},
				onDataUpdated: () => {},
				onResize: () => {},
				getEphemeralState: () => ({ scrollTop: 0 }),
				setEphemeralState: () => {},
			};
		}

		// Clear container
		viewContainerEl.innerHTML = "";

		// Root container
		const root = document.createElement("div");
		root.className = "tn-bases-integration tasknotes-plugin kanban-view";
		root.tabIndex = -1; // Make focusable without adding to tab order
		viewContainerEl.appendChild(root);
		currentRoot = root;

		// Board container
		const board = document.createElement("div");
		board.className = "kanban-view__board";
		root.appendChild(board);

		// Helper to get column width from config
		const getColumnWidth = (viewContext: any): number => {
			const config = viewContext?.config;
			let columnWidth = 280; // default

			if (config && typeof config.get === "function") {
				try {
					const width = config.get("columnWidth");
					if (typeof width === "number" && width >= 200 && width <= 500) {
						columnWidth = width;
					}
				} catch (_) {
					// Ignore
				}
			}

			return columnWidth;
		};

		// Helper to check if empty columns should be hidden
		const shouldHideEmptyColumns = (viewContext: any): boolean => {
			const config = viewContext?.config;
			let hideEmpty = false; // default

			if (config && typeof config.get === "function") {
				try {
					const hide = config.get("hideEmptyColumns");
					if (typeof hide === "boolean") {
						hideEmpty = hide;
					}
				} catch (_) {
					// Ignore
				}
			}

			return hideEmpty;
		};

		// Extract items using public API (1.10.0+)
		const extractDataItems = (viewContext?: any): BasesDataItem[] => {
			const dataItems: BasesDataItem[] = [];
			const ctx = viewContext || controller;

			// Use public API (1.10.0+) - viewContext.data.data contains BasesEntry[]
			if (ctx.data?.data && Array.isArray(ctx.data.data)) {
				// Use BasesEntry objects from public API
				for (const entry of ctx.data.data) {
					dataItems.push({
						key: entry.file?.path || "",
						data: entry,
						file: entry.file,
						path: entry.file?.path,
						properties: (entry as any).frontmatter || (entry as any).properties,
					});
				}
			}
			return dataItems;
		};

		// Helper to get swimlane configuration from view config
		const getSwimLaneConfig = (viewContext: any, pathToProps: Map<string, any>): SwimLaneConfig | null => {
			try {
				// Check if swimlane is configured in view config
				const config = viewContext?.config;
				let swimLanePropertyId: string | null = null;

				// Try to get from config.get('swimLane')
				if (config && typeof config.get === "function") {
					try {
						swimLanePropertyId = config.get("swimLane");
					} catch (_) {
						// Ignore
					}
				}

				if (!swimLanePropertyId) {
					return null;
				}

				// Normalize the property ID
				const normalizedId = swimLanePropertyId;
				const displayName = normalizedId;

				// Create value getter based on property type
				const getSwimLaneValue = (task: TaskInfo): string => {
					const props = pathToProps.get(task.path) || {};

					// Check for native TaskNotes properties
					if (normalizedId === "priority" || normalizedId === "note.priority") {
						return task.priority || "none";
					}
					if (normalizedId === "status" || normalizedId === "note.status") {
						return task.status || "none";
					}
					if (normalizedId === "projects" || normalizedId === "note.projects" || normalizedId === "project" || normalizedId === "note.project") {
						const projects = task.projects;
						if (Array.isArray(projects) && projects.length > 0) {
							return projects[0]; // Use first project
						}
						return "none";
					}
					if (normalizedId === "contexts" || normalizedId === "note.contexts" || normalizedId === "context" || normalizedId === "note.context") {
						const contexts = task.contexts;
						if (Array.isArray(contexts) && contexts.length > 0) {
							return contexts[0]; // Use first context
						}
						return "none";
					}

					// Check custom properties
					const value = props[normalizedId] || props[normalizedId.replace("note.", "")] || props[normalizedId.replace("task.", "")];
					if (value !== undefined && value !== null && value !== "") {
						if (Array.isArray(value) && value.length > 0) {
							return String(value[0]);
						}
						return String(value);
					}

					return "none";
				};

				return {
					propertyId: normalizedId,
					displayName,
					getSwimLaneValue,
				};
			} catch (e) {
				console.debug("[TaskNotes][Bases] Failed to get swimlane config:", e);
				return null;
			}
		};

		const render = async function(this: any) {
			if (!currentRoot) return;

			try {
				// Public API (1.10.0+): 'this' is the BasesView with data/config
				const viewContext = this?.data ? this : controller;
				// Capture the BasesView instance for use in async callbacks (like drop handlers)
				const basesViewInstance = this;

				// Skip rendering if we have no data yet (prevents flickering during data updates)
				// Check BEFORE any logging or processing
				const hasGroupedData = !!(viewContext.data?.groupedData && Array.isArray(viewContext.data.groupedData) && viewContext.data.groupedData.length > 0);
				const hasFlatData = !!(viewContext.data?.data && Array.isArray(viewContext.data.data) && viewContext.data.data.length > 0);

				if (!hasGroupedData && !hasFlatData) {
					return; // Skip render silently - no data available
				}


				const dataItems = extractDataItems(viewContext);
				const taskNotes = await identifyTaskNotesFromBasesData(dataItems, plugin);

				// Clear board
				board.innerHTML = "";

				if (taskNotes.length === 0) {
					const empty = document.createElement("div");
					empty.className = "tn-bases-empty";
					empty.style.cssText =
						"padding: 20px; text-align: center; color: var(--text-muted);";
					empty.textContent = "No TaskNotes tasks found for this Base.";
					board.appendChild(empty);
					return;
				}

				// Build path -> props map for dynamic property access
				const pathToProps = new Map<string, Record<string, any>>(
					dataItems.filter((i) => !!i.path).map((i) => [i.path || "", i.properties || {}])
				);

				// Group tasks
				const groups = new Map<string, TaskInfo[]>();
				let groupByPropertyId: string | null = null;
				let usedFallbackStatusGrouping = false;

				// Try to use public API (1.10.0+) data.groupedData
				// But skip it if all groups are "none" (meaning no groupBy was configured)
				const hasValidGrouping = viewContext.data?.groupedData &&
					Array.isArray(viewContext.data.groupedData) &&
					viewContext.data.groupedData.some((g: any) => {
						const keyValue = g.key?.data ?? "none";
						const keyString = String(keyValue);
						return keyString !== "none";
					});


				if (hasValidGrouping) {
					console.debug("[TaskNotes][Bases] Using public API groupedData", {
						groupCount: viewContext.data.groupedData.length,
						hasConfig: !!viewContext.config
					});

					// Try different ways to get groupBy from config
					// Only use cache if it has a valid value (not null or undefined)
					// This ensures we retry detection if it previously failed
					if (cachedGroupByPropertyId === undefined || cachedGroupByPropertyId === null) {
					// IMPORTANT: Access groupBy from controller.query.views (internal API)
					// This is required because the Bases public API does NOT expose groupBy:
					// - config.get('groupBy') returns undefined
					// - config.getAsPropertyId('groupBy') returns null
					// The view configuration is stored in the Bases markdown file and parsed into controller.query
					if (basesContainer?.controller || controller) {
						try {
							const ctrl = basesContainer?.controller || controller;
							const viewName = ctrl.viewName;
							const views = ctrl.query?.views;

							if (views && viewName) {
								// Views are stored as an array, find the one matching current viewName
								for (let i = 0; i < 20; i++) { // Check first 20 views
									const view = views[i];
									if (view && view.name === viewName && view.groupBy) {
										// In 1.10.0+, groupBy is {property: string, direction: string}
										if (typeof view.groupBy === 'object' && view.groupBy.property) {
											groupByPropertyId = view.groupBy.property;
										} else if (typeof view.groupBy === 'string') {
											// Fallback for older format
											groupByPropertyId = view.groupBy;
										}
										break;
									}
								}
							}
						} catch (e) {
							// Silently fail and try fallback
						}
					}

					// Fallback: try getBasesGroupByConfig
					if (!groupByPropertyId) {
						const groupByConfig = getBasesGroupByConfig(viewContext, pathToProps);
						if (groupByConfig) {
							groupByPropertyId = groupByConfig.normalizedId;
						}
					}

					// Cache the determined value (even if null)
					cachedGroupByPropertyId = groupByPropertyId;
				} else {
					// Use cached value
					groupByPropertyId = cachedGroupByPropertyId;
				}

					// If still null, infer from the grouped data
					if (!groupByPropertyId && viewContext.data.groupedData.length > 0) {
						// Check the group values to infer the property type
						const firstGroup = viewContext.data.groupedData[0];
						const keyData = firstGroup.key?.data;


						// Try to infer property type from the values
						const allKeys = viewContext.data.groupedData
							.map((g: any) => String(g.key?.data || '').toLowerCase())
							.filter((k: string) => k && k !== 'none');

						// Check if values match known status values
						const statusValues = new Set(['done', 'open', 'in-progress', 'waiting', 'todo', 'complete']);
						const isProbablyStatus = allKeys.some((k: string) => statusValues.has(k));

						// Check if values match known priority values
						const priorityValues = new Set(['high', 'medium', 'low', 'urgent', 'normal']);
						const isProbablyPriority = allKeys.some((k: string) => priorityValues.has(k));

						if (isProbablyStatus) {
							groupByPropertyId = "note.status";
						} else if (isProbablyPriority) {
							groupByPropertyId = "note.priority";
						}
						// Otherwise leave as null - dont default to status
					}
					

					// Use pre-grouped data from Bases
					for (const group of viewContext.data.groupedData) {
						// Get the key value (it's a Value object with .data property)
						const keyValue = group.key?.data ?? "none";
						const keyString = String(keyValue);

						console.debug("[TaskNotes][Bases] Processing group:", {
							keyString,
							entryCount: group.entries?.length
						});

						// Convert BasesEntry objects to TaskInfo
						const groupTasks: TaskInfo[] = [];
						for (const entry of group.entries) {
							const task = taskNotes.find((t) => t.path === entry.file?.path);
							if (task) groupTasks.push(task);
						}

						if (groupTasks.length > 0) {
							groups.set(keyString, groupTasks);
						}
					}
					console.debug("[TaskNotes][Bases] Final groups:", Array.from(groups.keys()));
				} else {
					console.debug("[TaskNotes][Bases] No groupedData available, using fallback grouping", {
						hasData: !!viewContext.data,
						hasGroupedData: !!viewContext.data?.groupedData,
						isArray: Array.isArray(viewContext.data?.groupedData)
					});
					// Fallback to manual grouping for older versions
					const groupByConfig = getBasesGroupByConfig(basesContainer, pathToProps);

					if (groupByConfig) {
						groupByPropertyId = groupByConfig.normalizedId;
						// Use dynamic groupBy from Bases configuration
						for (const task of taskNotes) {
							const groupValues = groupByConfig.getGroupValues(task.path);

							// Tasks can belong to multiple groups (e.g., multiple tags)
							for (const groupValue of groupValues) {
								if (!groups.has(groupValue)) {
									groups.set(groupValue, []);
								}
								groups.get(groupValue)?.push(task);
							}
						}
					} else {
						// Fallback to status grouping when no groupBy is configured
						groupByPropertyId = "status";
						usedFallbackStatusGrouping = true;

						// First, create all status columns in the order defined in settings
						plugin.statusManager.getStatusesByOrder().forEach((status) => {
							groups.set(status.value, []);
						});

						// Then populate them with tasks
						for (const task of taskNotes) {
							const groupValue = task.status || "open";
							if (!groups.has(groupValue)) {
								groups.set(groupValue, []);
							}
							groups.get(groupValue)?.push(task);
						}
					}
				}

				// Get visible properties from Bases
				const basesVisibleProps = getBasesVisibleProperties(basesContainer);
				const visiblePropsIds = basesVisibleProps.length > 0
					? basesVisibleProps.map((p) => {
							// Map Bases property IDs to TaskNotes internal names
							let mapped = p.id;
							if (mapped.startsWith("note.")) {
								mapped = mapped.substring(5);
							} else if (mapped.startsWith("task.")) {
								mapped = mapped.substring(5);
							}
							return mapped;
						})
					: (plugin.settings.defaultVisibleProperties || []);

				// Get sorting configuration
				const sortComparator = getBasesSortComparator(viewContext, pathToProps);

				// Sort tasks within each group if sorting is configured
				if (sortComparator) {
					for (const [groupId, tasks] of groups.entries()) {
						tasks.sort(sortComparator);
					}
				}

				// Get group name ordering
				// When using fallback status grouping, preserve the order from settings
				let columnIds: string[];
				if (usedFallbackStatusGrouping) {
					// Preserve the insertion order from getStatusesByOrder()
					columnIds = Array.from(groups.keys());
				} else {
					// Use normal sorting for Bases-provided grouping
					const firstSortEntry = sortComparator
						? { id: groupByPropertyId || "status", direction: "ASC" as const }
						: null;
					const groupNameComparator = getGroupNameComparator(firstSortEntry);
					columnIds = Array.from(groups.keys()).sort(groupNameComparator);
				}

				// Check if swimlanes are configured
				const swimLaneConfig = getSwimLaneConfig(viewContext, pathToProps);
				const columnWidth = getColumnWidth(viewContext);
				const hideEmptyColumns = shouldHideEmptyColumns(viewContext);

				// Filter out empty columns if configured
				let visibleColumnIds = columnIds;
				if (hideEmptyColumns) {
					visibleColumnIds = columnIds.filter(columnId => {
						const tasks = groups.get(columnId) || [];
						return tasks.length > 0;
					});
				}

				if (swimLaneConfig) {
					// Render with swimlanes (2D grid)
					renderWithSwimLanes(board, groups, visibleColumnIds, swimLaneConfig, groupByPropertyId, visiblePropsIds, basesViewInstance, plugin, taskNotes, columnWidth, hideEmptyColumns);
				} else {
					// Render traditional single-row kanban
					for (const columnId of visibleColumnIds) {
						const tasks = groups.get(columnId) || [];
						const columnEl = createColumnElement(columnId, tasks, groupByPropertyId, visiblePropsIds, basesViewInstance, columnWidth);
						board.appendChild(columnEl);
					}
				}
			} catch (error) {
				console.error("[TaskNotes][Bases] Error rendering Kanban:", error);
			}
		};

		// Render kanban with swimlanes (2D grid: columns × swim lanes)
		const renderWithSwimLanes = (
			board: HTMLElement,
			groups: Map<string, TaskInfo[]>,
			columnIds: string[],
			swimLaneConfig: SwimLaneConfig,
			groupByPropertyId: string | null,
			visibleProperties: string[],
			basesViewInstance: any,
			plugin: TaskNotesPlugin,
			allTasks: TaskInfo[],
			columnWidth: number,
			hideEmptyColumns: boolean
		) => {
			// Organize tasks into swimlanes
			const swimLanes = new Map<string, Map<string, TaskInfo[]>>();
			const swimLaneIds = new Set<string>();

			// First, identify all unique swimlane values
			for (const task of allTasks) {
				const swimLaneValue = swimLaneConfig.getSwimLaneValue(task);
				swimLaneIds.add(swimLaneValue);
			}

			// Sort swimlane IDs
			const sortedSwimLaneIds = Array.from(swimLaneIds).sort((a, b) => {
				// Put "none" at the end
				if (a === "none") return 1;
				if (b === "none") return -1;
				return a.localeCompare(b);
			});

			// Organize tasks by swimlane and column
			for (const [columnId, columnTasks] of groups.entries()) {
				for (const task of columnTasks) {
					const swimLaneValue = swimLaneConfig.getSwimLaneValue(task);

					if (!swimLanes.has(swimLaneValue)) {
						swimLanes.set(swimLaneValue, new Map());
					}

					const swimLane = swimLanes.get(swimLaneValue)!;
					if (!swimLane.has(columnId)) {
						swimLane.set(columnId, []);
					}

					swimLane.get(columnId)!.push(task);
				}
			}

			// Add swimlane class to board and set column width
			board.addClass("kanban-view__board--swimlanes");
			board.style.setProperty("--kanban-column-width", `${columnWidth}px`);

			// Render header row with column titles
			const headerRow = board.createDiv({ cls: "kanban-view__swimlane-row kanban-view__swimlane-row--header" });
			headerRow.createDiv({ cls: "kanban-view__swimlane-label" }); // Empty corner cell
			for (const columnId of columnIds) {
				const headerCell = headerRow.createDiv({ cls: "kanban-view__column-header-cell" });
				const title = getColumnTitle(columnId, groupByPropertyId, plugin);
				headerCell.createEl("div", { cls: "kanban-view__column-title", text: title });
			}

			// Render each swimlane row
			for (const swimLaneId of sortedSwimLaneIds) {
				// Get tasks for this swimlane
				const swimLaneTasks = swimLanes.get(swimLaneId) || new Map();

				// Count total tasks in this swimlane
				let totalTasks = 0;
				for (const tasks of swimLaneTasks.values()) {
					totalTasks += tasks.length;
				}

				// Skip empty swimlane rows if hideEmptyColumns is enabled
				if (hideEmptyColumns && totalTasks === 0) {
					continue;
				}

				const swimLaneRow = board.createDiv({ cls: "kanban-view__swimlane-row" });
				swimLaneRow.dataset.swimlaneId = swimLaneId;

				// Swimlane label cell
				const labelCell = swimLaneRow.createDiv({ cls: "kanban-view__swimlane-label" });
				const swimLaneTitle = getSwimLaneTitle(swimLaneId, swimLaneConfig.propertyId, plugin);
				labelCell.createEl("div", { cls: "kanban-view__swimlane-title", text: swimLaneTitle });
				labelCell.createEl("div", { cls: "kanban-view__swimlane-count", text: `${totalTasks}` });

				// Render column cells for this swimlane
				for (const columnId of columnIds) {
					const tasks = swimLaneTasks.get(columnId) || [];
					const columnCell = swimLaneRow.createDiv({ cls: "kanban-view__swimlane-column" });
					columnCell.dataset.columnId = columnId;
					columnCell.dataset.swimlaneId = swimLaneId;

					// Render tasks in this cell
					const tasksContainer = columnCell.createDiv({ cls: "kanban-view__tasks-container" });
					for (const task of tasks) {
						const taskCard = createTaskCard(task, plugin, visibleProperties, {
							showDueDate: true,
							showCheckbox: false,
							showTimeTracking: true,
						});

						// Make draggable
						taskCard.draggable = true;
						taskCard.addEventListener("dragstart", (e: DragEvent) => {
							if (e.dataTransfer) {
								e.dataTransfer.setData("text/plain", task.path);
								e.dataTransfer.setData("swimlane", swimLaneId);
								e.dataTransfer.effectAllowed = "move";
							}
						});

						tasksContainer.appendChild(taskCard);
					}

					// Add drop handlers for this cell
					addSwimLaneCellDropHandlers(columnCell, swimLaneId, columnId, groupByPropertyId, swimLaneConfig, basesViewInstance, plugin);
				}
			}
		};

		// Get column title based on property type
		const getColumnTitle = (columnId: string, groupByPropertyId: string | null, plugin: TaskNotesPlugin): string => {
			if (!groupByPropertyId) {
				const statusConfig = plugin.statusManager.getStatusConfig(columnId);
				return statusConfig?.label || columnId;
			}

			const propertyId = groupByPropertyId.toLowerCase();

			if (propertyId === "status" || propertyId === "note.status") {
				const statusConfig = plugin.statusManager.getStatusConfig(columnId);
				return statusConfig?.label || columnId;
			} else if (propertyId === "priority" || propertyId === "note.priority") {
				const priorityConfig = plugin.priorityManager.getPriorityConfig(columnId);
				return priorityConfig?.label || columnId;
			} else if (propertyId === "projects" || propertyId === "project" || propertyId === "note.projects" || propertyId === "note.project") {
				return columnId === "none" ? "No Project" : columnId;
			} else if (propertyId === "contexts" || propertyId === "context" || propertyId === "note.contexts" || propertyId === "note.context") {
				return columnId === "none" ? "Uncategorized" : `@${columnId}`;
			} else if (propertyId.includes("tag")) {
				return columnId === "none" ? "Untagged" : `#${columnId}`;
			} else {
				return columnId === "none" ? "None" : columnId;
			}
		};

		// Get swimlane title based on property type
		const getSwimLaneTitle = (swimLaneId: string, propertyId: string, plugin: TaskNotesPlugin): string => {
			const normalized = propertyId.toLowerCase();

			if (normalized === "priority" || normalized === "note.priority") {
				const priorityConfig = plugin.priorityManager.getPriorityConfig(swimLaneId);
				return priorityConfig?.label || swimLaneId;
			} else if (normalized === "status" || normalized === "note.status") {
				const statusConfig = plugin.statusManager.getStatusConfig(swimLaneId);
				return statusConfig?.label || swimLaneId;
			} else if (normalized === "projects" || normalized === "project" || normalized === "note.projects" || normalized === "note.project") {
				return swimLaneId === "none" ? "No Project" : swimLaneId;
			} else if (normalized === "contexts" || normalized === "context" || normalized === "note.contexts" || normalized === "note.context") {
				return swimLaneId === "none" ? "Uncategorized" : `@${swimLaneId}`;
			} else {
				return swimLaneId === "none" ? "None" : swimLaneId;
			}
		};

		// Add drop handlers for swimlane cells
		const addSwimLaneCellDropHandlers = (
			cell: HTMLElement,
			swimLaneId: string,
			columnId: string,
			groupByPropertyId: string | null,
			swimLaneConfig: SwimLaneConfig,
			basesViewInstance: any,
			plugin: TaskNotesPlugin
		) => {
			cell.addEventListener("dragover", (e) => {
				e.preventDefault();
				if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
				cell.classList.add("kanban-view__swimlane-column--dragover");
			});

			cell.addEventListener("dragleave", (e) => {
				if (!cell.contains(e.relatedTarget as Node)) {
					cell.classList.remove("kanban-view__swimlane-column--dragover");
				}
			});

			cell.addEventListener("drop", async (e) => {
				e.preventDefault();
				e.stopPropagation();
				cell.classList.remove("kanban-view__swimlane-column--dragover");

				const taskPath = e.dataTransfer?.getData("text/plain");
				if (!taskPath) return;

				try {
					const task = await plugin.cacheManager.getCachedTaskInfo(taskPath);
					if (!task) return;

					// Update both the column property (groupBy) and swimlane property
					// Column property
					if (groupByPropertyId) {
						await updateTaskProperty(task, groupByPropertyId, columnId, plugin);
					}

					// Swimlane property
					if (swimLaneId !== "none") {
						await updateTaskProperty(task, swimLaneConfig.propertyId, swimLaneId, plugin);
					}

					// Refresh view
					setTimeout(() => {
						if (basesViewInstance && typeof basesViewInstance.refresh === "function") {
							basesViewInstance.refresh();
						}
					}, 100);
				} catch (error) {
					console.error("[TaskNotes][Bases] Swimlane drop failed:", error);
				}
			});
		};

		// Helper to update task property
		const updateTaskProperty = async (task: TaskInfo, propertyId: string, value: string, plugin: TaskNotesPlugin) => {
			const normalized = propertyId.toLowerCase();

			if (normalized === "status" || normalized === "note.status") {
				await plugin.updateTaskProperty(task, "status", value, { silent: false });
			} else if (normalized === "priority" || normalized === "note.priority") {
				await plugin.updateTaskProperty(task, "priority", value, { silent: false });
			} else if (normalized === "projects" || normalized === "project" || normalized === "note.projects" || normalized === "note.project") {
				await plugin.updateTaskProperty(task, "projects", [value], { silent: false });
			} else if (normalized === "contexts" || normalized === "context" || normalized === "note.contexts" || normalized === "note.context") {
				await plugin.updateTaskProperty(task, "contexts", [value], { silent: false });
			} else {
				// Custom property - update frontmatter
				const file = plugin.app.vault.getAbstractFileByPath(task.path);
				if (file && "stat" in file) {
					await plugin.app.fileManager.processFrontMatter(file as any, (frontmatter: any) => {
						const propertyName = propertyId.includes(".")
							? propertyId.split(".").pop() || propertyId
							: propertyId;
						frontmatter[propertyName] = value;
					});
				}
			}
		};

		// Reuse existing kanban column creation logic
		const createColumnElement = (
			columnId: string,
			tasks: TaskInfo[],
			groupByPropertyId: string | null,
			visibleProperties: string[],
			basesViewInstance: any,
			columnWidth: number
		): HTMLElement => {
			const columnEl = document.createElement("div");
			columnEl.className = "kanban-view__column";
			columnEl.dataset.columnId = columnId;
			columnEl.style.width = `${columnWidth}px`;
			columnEl.style.minWidth = `${columnWidth}px`;
			columnEl.style.flex = `0 0 ${columnWidth}px`;

			// Column header
			const headerEl = columnEl.createDiv({ cls: "kanban-view__column-header" });

			// Title - format based on property type and use TaskNotes display values
			let title: string;

			if (groupByPropertyId) {
				const propertyId = groupByPropertyId.toLowerCase();

				// Map Bases property IDs to TaskNotes native properties and use display values
				if (propertyId === "status" || propertyId === "note.status") {
					const statusConfig = plugin.statusManager.getStatusConfig(columnId);
					title = statusConfig?.label || columnId;
				} else if (propertyId === "priority" || propertyId === "note.priority") {
					const priorityConfig = plugin.priorityManager.getPriorityConfig(columnId);
					title = priorityConfig?.label || columnId;
				} else if (
					propertyId === "projects" ||
					propertyId === "project" ||
					propertyId === "note.projects" ||
					propertyId === "note.project"
				) {
					title = columnId === "none" ? "No Project" : columnId;
				} else if (
					propertyId === "contexts" ||
					propertyId === "context" ||
					propertyId === "note.contexts" ||
					propertyId === "note.context"
				) {
					title = columnId === "none" ? "Uncategorized" : `@${columnId}`;
				} else if (propertyId.includes("tag")) {
					// Handle tags properties
					title = columnId === "none" ? "Untagged" : `#${columnId}`;
				} else {
					// For custom properties, show the value directly (not prefixed)
					title = columnId === "none" ? "None" : columnId;
				}
			} else {
				// Fallback for status grouping
				const statusConfig = plugin.statusManager.getStatusConfig(columnId);
				title = statusConfig?.label || columnId;
			}
			headerEl.createEl("div", { cls: "kanban-view__column-title", text: title });

			// Count
			headerEl.createEl("div", {
				text: `${tasks.length} tasks`,
				cls: "kanban-view__column-count",
			});

			// Column body
			const bodyEl = columnEl.createDiv({ cls: "kanban-view__column-body" });
			const tasksContainer = bodyEl.createDiv({ cls: "kanban-view__tasks-container" });

			// Render tasks using existing TaskCard system
			tasks.forEach((task) => {
				const taskCard = createTaskCard(task, plugin, visibleProperties, {
					showDueDate: true,
					showCheckbox: false,
					showTimeTracking: true,
				});

				// Make draggable
				taskCard.draggable = true;
				taskCard.addEventListener("dragstart", (e: DragEvent) => {
					if (e.dataTransfer) {
						e.dataTransfer.setData("text/plain", task.path);
						e.dataTransfer.effectAllowed = "move";
					}
				});

				tasksContainer.appendChild(taskCard);
			});

			// Add drop handlers - enhanced for dynamic groupBy
			addColumnDropHandlers(columnEl, async (taskPath: string, targetColumnId: string) => {
				try {
					const task = await plugin.cacheManager.getCachedTaskInfo(taskPath);
					if (task && groupByPropertyId) {
						// Map Bases property IDs to TaskNotes native properties for updates
						const originalPropertyId = groupByPropertyId;
						const propertyId = originalPropertyId.toLowerCase();

						// Handle different property types
						let valueToSet: any;
						if (targetColumnId === "none" || targetColumnId === "uncategorized") {
							valueToSet = null; // Clear the property
						} else {
							// For most properties, set the single value
							// For array properties, determine if we should use array or single value
							valueToSet = targetColumnId;
						}

						// For native TaskNotes properties, use TaskNotes update methods directly
						if (propertyId === "status" || propertyId === "note.status") {
							await plugin.updateTaskProperty(task, "status", valueToSet, {
								silent: false,
							});
						} else if (propertyId === "priority" || propertyId === "note.priority") {
							await plugin.updateTaskProperty(task, "priority", valueToSet, {
								silent: false,
							});
						} else if (
							propertyId === "projects" ||
							propertyId === "project" ||
							propertyId === "note.projects" ||
							propertyId === "note.project"
						) {
							// KNOWN LIMITATION: Project grouping uses literal wikilink strings
							// When drag-and-drop updates the projects property, we preserve the exact
							// wikilink format to match the target column. However, Bases groups by the
							// literal string value, not by resolved file path. This means tasks with
							// different wikilink formats pointing to the same file will appear in
							// separate columns (e.g., [[Project]], [[path/to/Project]], [[Project|Alias]])
							// See group-by.ts for more details on this limitation.
							const projectValue = valueToSet
								? Array.isArray(valueToSet)
									? valueToSet
									: [valueToSet]
								: [];
							await plugin.updateTaskProperty(task, "projects", projectValue, {
								silent: false,
							});
						} else if (
							propertyId === "contexts" ||
							propertyId === "context" ||
							propertyId === "note.contexts" ||
							propertyId === "note.context"
						) {
							const contextValue = valueToSet
								? Array.isArray(valueToSet)
									? valueToSet
									: [valueToSet]
								: [];
							await plugin.updateTaskProperty(task, "contexts", contextValue, {
								silent: false,
							});
						} else {
							// For custom properties, update frontmatter directly
							try {
								const file = plugin.app.vault.getAbstractFileByPath(task.path);
								if (file && "stat" in file) {
									// Check if it's a TFile
									await plugin.app.fileManager.processFrontMatter(
										file as any,
										(frontmatter: any) => {
											// Extract the actual property name from Bases property ID
											// e.g., "note.note.projects" -> "projects"
											const propertyName = originalPropertyId.includes(".")
												? originalPropertyId.split(".").pop() || originalPropertyId
												: originalPropertyId;
											frontmatter[propertyName] = valueToSet;
										}
									);
								}
							} catch (frontmatterError) {
								console.warn(
									"[TaskNotes][Bases] Frontmatter update failed for custom property:",
									frontmatterError
								);
							}
						}

						// Trigger refresh after a brief delay to ensure file write completes
						// and Bases has time to detect the change
						setTimeout(() => {
							if (basesViewInstance && typeof basesViewInstance.refresh === "function") {
								basesViewInstance.refresh();
							}
						}, 100);
					} else if (task && !groupByPropertyId) {
						// Fallback to status update when no groupBy config
						await plugin.updateTaskProperty(task, "status", targetColumnId, {
							silent: false,
						});
						// Trigger refresh after a brief delay
						setTimeout(() => {
							if (basesViewInstance && typeof basesViewInstance.refresh === "function") {
								basesViewInstance.refresh();
							}
						}, 100);
					}
				} catch (e) {
					console.error("[TaskNotes][Bases] Move failed:", e);
				}
			});

			return columnEl;
		};

		// Column title formatting now handled in createColumnElement with groupBy config

		// Reuse existing drop handler logic
		const addColumnDropHandlers = (
			columnEl: HTMLElement,
			onDropTask: (taskPath: string, targetColumnId: string) => void | Promise<void>
		) => {
			columnEl.addEventListener("dragover", (e) => {
				e.preventDefault();
				if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
				columnEl.classList.add("kanban-view__column--dragover");
			});

			columnEl.addEventListener("dragleave", (e) => {
				if (!columnEl.contains(e.relatedTarget as Node)) {
					columnEl.classList.remove("kanban-view__column--dragover");
				}
			});

			columnEl.addEventListener("drop", async (e) => {
				e.preventDefault();
				e.stopPropagation();
				columnEl.classList.remove("kanban-view__column--dragover");
				const data = e.dataTransfer?.getData("text/plain");
				const taskPath = data;
				const targetColumnId = columnEl.getAttribute("data-column-id") || "";
				if (taskPath && targetColumnId) {
					await onDropTask(taskPath, targetColumnId);
				}
			});
		};

		// Kick off initial async render
		void render();

		// Set up lifecycle following the working pattern from base-view-factory
		let queryListener: (() => void) | null = null;

		const component = {
			focus() {
				// Focus the root element if it exists and is connected
				try {
					if (currentRoot && currentRoot.isConnected && typeof currentRoot.focus === "function") {
						currentRoot.focus();
					}
				} catch (e) {
					// Silently fail - focus is non-critical
					console.debug("[TaskNotes][Bases] Failed to focus view:", e);
				}
			},
			load() {
				// Set up query listener
				const query = controller.query || basesContainer.query;
				if (query?.on && !queryListener) {
					queryListener = () => void render.call(this);
					try {
						query.on("change", queryListener);
					} catch (e) {
						// Query listener registration may fail for various reasons
						console.debug("[TaskNotes][Bases] Query listener registration failed:", e);
					}
				}

				// Initial render - data will be available via this.data (public API) or controller (legacy)
				// onDataUpdated() will be called by the framework when data changes
				void render.call(this);
			},
			unload() {
				// Cleanup query listener
				const query = controller.query || basesContainer.query;
				if (queryListener && query?.off) {
					try {
						query.off("change", queryListener);
					} catch (e) {
						// Query listener removal may fail if already disposed
						console.debug("[TaskNotes][Bases] Query listener cleanup failed:", e);
					}
				}
				queryListener = null;
			},
			refresh() {
				void render.call(this);
			},
			onDataUpdated() {
				void render.call(this);
			},
			onResize() {
				// Handle resize - no-op for now
			},
			getEphemeralState() {
				return { scrollTop: currentRoot?.scrollTop || 0 };
			},
			setEphemeralState(state: any) {
				if (!state) return;

				try {
					// Only set scroll if element exists and is connected to DOM
					if (currentRoot && currentRoot.isConnected && state.scrollTop !== undefined) {
						currentRoot.scrollTop = state.scrollTop;
					}
				} catch (e) {
					// Silently fail - ephemeral state restoration is non-critical
					console.debug("[TaskNotes][Bases] Failed to restore ephemeral state:", e);
				}
			},
			destroy() {
				const query = controller.query || basesContainer.query;
				if (queryListener && query?.off) {
					try {
						query.off("change", queryListener);
					} catch (e) {
						// Query listener removal may fail if already disposed
					}
				}
				if (currentRoot) {
					currentRoot.remove();
					currentRoot = null;
				}
				queryListener = null;
			},
		};

		return component;
	};
}
