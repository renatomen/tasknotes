import { Component, App } from "obsidian";
import TaskNotesPlugin from "../main";
import { BasesDataAdapter } from "./BasesDataAdapter";
import { PropertyMappingService } from "./PropertyMappingService";
import { TaskInfo, EVENT_TASK_UPDATED } from "../types";
import { convertInternalToUserProperties } from "../utils/propertyMapping";
import { DEFAULT_INTERNAL_VISIBLE_PROPERTIES } from "../settings/defaults";

/**
 * Abstract base class for all TaskNotes Bases views.
 * Properly extends Component to leverage lifecycle, and implements BasesView interface.
 * Note: Bases types (BasesView, BasesViewConfig) are available from obsidian-api declarations.
 */
export abstract class BasesViewBase extends Component {
	// BasesView properties (provided by Bases when factory returns this instance)
	// These match the BasesView interface from Obsidian's internal Bases API
	app!: App;
	config!: any; // BasesViewConfig - using any since not exported from public API
	data!: any; // BasesQueryResult - using any since not exported from public API
	protected plugin: TaskNotesPlugin;
	protected dataAdapter: BasesDataAdapter;
	protected propertyMapper: PropertyMappingService;
	protected containerEl: HTMLElement;
	protected rootElement: HTMLElement | null = null;
	protected taskUpdateListener: any = null;
	protected updateDebounceTimer: number | null = null;

	constructor(controller: any, containerEl: HTMLElement, plugin: TaskNotesPlugin) {
		// Call Component constructor
		super();
		this.plugin = plugin;
		this.containerEl = containerEl;

		// Note: app, config, and data will be set by Bases when it creates the view
		// We just need to ensure our types match the BasesView interface

		this.dataAdapter = new BasesDataAdapter(this);
		this.propertyMapper = new PropertyMappingService(plugin, plugin.fieldMapper);

		// Bind createFileForView to ensure Bases can find it
		// Some versions of Bases may check hasOwnProperty rather than prototype chain
		this.createFileForView = this.createFileForView.bind(this);
	}

	/**
	 * Component lifecycle: Called when view is first loaded.
	 * Override from Component base class.
	 */
	onload(): void {
		this.setupContainer();
		this.setupTaskUpdateListener();
		this.render();
	}

	/**
	 * BasesView lifecycle: Called when Bases data changes.
	 * Required abstract method implementation.
	 */
	onDataUpdated(): void {
		try {
			this.render();
		} catch (error) {
			console.error(`[TaskNotes][${this.type}] Render error:`, error);
			this.renderError(error as Error);
		}
	}

	/**
	 * Lifecycle: Save ephemeral state (scroll position, etc).
	 */
	getEphemeralState(): any {
		return {
			scrollTop: this.rootElement?.scrollTop || 0,
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
	 * Lifecycle: Handle view resize.
	 * Called by Bases when the view container is resized.
	 * Subclasses can override to handle resize events.
	 */
	onResize(): void {
		// Default implementation does nothing
		// Subclasses can override if they need resize handling
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
	 * Uses Component.register() for automatic cleanup on unload.
	 */
	protected setupTaskUpdateListener(): void {
		if (this.taskUpdateListener) return;

		this.taskUpdateListener = this.plugin.emitter.on(EVENT_TASK_UPDATED, async (eventData: any) => {
			try {
				const updatedTask = eventData?.task || eventData?.taskInfo;
				if (!updatedTask?.path) return;

				// Check if this task is in our current view
				const dataItems = this.dataAdapter.extractDataItems();
				const isRelevant = dataItems.some((item) => item.path === updatedTask.path);

				if (isRelevant) {
					await this.handleTaskUpdate(updatedTask);
				}
			} catch (error) {
				console.error("[TaskNotes][Bases] Error in task update handler:", error);
				this.debouncedRefresh();
			}
		});

		// Register cleanup using Component lifecycle
		this.register(() => {
			if (this.taskUpdateListener) {
				this.plugin.emitter.offref(this.taskUpdateListener);
				this.taskUpdateListener = null;
			}
		});
	}

	/**
	 * Debounced refresh to prevent multiple rapid re-renders.
	 * Timer is automatically cleaned up on component unload.
	 */
	protected debouncedRefresh(): void {
		if (this.updateDebounceTimer) {
			clearTimeout(this.updateDebounceTimer);
		}

		this.updateDebounceTimer = window.setTimeout(() => {
			this.render();
			this.updateDebounceTimer = null;
		}, 150);

		// Note: We don't need to explicitly register cleanup for this timer
		// because it's short-lived (150ms) and clears itself. If the component
		// unloads before the timer fires, the worst case is a no-op render call.
	}

	/**
	 * Override Bases "New" button to open TaskNotes creation modal instead of default file creation.
	 * Called when user clicks the "New" button in the Bases toolbar.
	 *
	 * NOTE: This requires Obsidian API 1.10.2+ and Bases support for createFileForView.
	 * As of the current implementation, Bases (still in beta) may not yet call this method.
	 * When Obsidian 1.10.2 is released and Bases supports it, this will work automatically.
	 *
	 * @param baseFileName - Suggested filename from Bases (typically unused in TaskNotes)
	 * @param frontmatterProcessor - Optional callback that Bases uses to set default frontmatter values
	 */
	async createFileForView(
		baseFileName: string,
		frontmatterProcessor?: (frontmatter: any) => void
	): Promise<void> {
		const { TaskCreationModal } = await import("../modals/TaskCreationModal");

		// Extract any default values from the frontmatter processor if provided
		const prePopulatedValues: Partial<TaskInfo> = {};
		const customFrontmatter: Record<string, any> = {};

		if (frontmatterProcessor) {
			// Create a mock frontmatter object to extract defaults
			const mockFrontmatter: any = {};
			frontmatterProcessor(mockFrontmatter);

			// Get field mapper for property name mapping
			const fm = this.plugin.fieldMapper;

			// Map core TaskNotes properties from frontmatter
			if (mockFrontmatter[fm.toUserField("title")]) {
				prePopulatedValues.title = String(mockFrontmatter[fm.toUserField("title")]);
			}
			if (mockFrontmatter[fm.toUserField("status")]) {
				prePopulatedValues.status = String(mockFrontmatter[fm.toUserField("status")]);
			}
			if (mockFrontmatter[fm.toUserField("priority")]) {
				prePopulatedValues.priority = String(mockFrontmatter[fm.toUserField("priority")]);
			}
			if (mockFrontmatter[fm.toUserField("due")]) {
				prePopulatedValues.due = String(mockFrontmatter[fm.toUserField("due")]);
			}
			if (mockFrontmatter[fm.toUserField("scheduled")]) {
				prePopulatedValues.scheduled = String(mockFrontmatter[fm.toUserField("scheduled")]);
			}
			if (mockFrontmatter[fm.toUserField("contexts")]) {
				const contexts = mockFrontmatter[fm.toUserField("contexts")];
				prePopulatedValues.contexts = Array.isArray(contexts) ? contexts : [contexts];
			}
			if (mockFrontmatter[fm.toUserField("projects")]) {
				const projects = mockFrontmatter[fm.toUserField("projects")];
				prePopulatedValues.projects = Array.isArray(projects) ? projects : [projects];
			}

			// Tags - check both the standard 'tags' property and archiveTag
			if (mockFrontmatter.tags) {
				const tags = mockFrontmatter.tags;
				prePopulatedValues.tags = Array.isArray(tags) ? tags : [tags];
			}

			// Archived - check for archive tag
			if (mockFrontmatter.tags && Array.isArray(mockFrontmatter.tags)) {
				const archiveTag = fm.toUserField("archiveTag");
				prePopulatedValues.archived = mockFrontmatter.tags.includes(archiveTag);
			}

			if (mockFrontmatter[fm.toUserField("timeEstimate")]) {
				prePopulatedValues.timeEstimate = Number(mockFrontmatter[fm.toUserField("timeEstimate")]);
			}
			if (mockFrontmatter[fm.toUserField("recurrence")]) {
				prePopulatedValues.recurrence = String(mockFrontmatter[fm.toUserField("recurrence")]);
			}
			if (mockFrontmatter[fm.toUserField("completedDate")]) {
				prePopulatedValues.completedDate = String(mockFrontmatter[fm.toUserField("completedDate")]);
			}
			if (mockFrontmatter[fm.toUserField("dateCreated")]) {
				prePopulatedValues.dateCreated = String(mockFrontmatter[fm.toUserField("dateCreated")]);
			}
			if (mockFrontmatter[fm.toUserField("blockedBy")]) {
				const blockedBy = mockFrontmatter[fm.toUserField("blockedBy")];
				prePopulatedValues.blockedBy = Array.isArray(blockedBy) ? blockedBy : [blockedBy];
			}

			// Handle user-defined custom fields
			const userFields = this.plugin.settings.userFields || [];
			for (const userField of userFields) {
				if (mockFrontmatter[userField.key] !== undefined) {
					// Store in customFrontmatter for TaskCreationData
					customFrontmatter[userField.key] = mockFrontmatter[userField.key];
				}
			}

			// Capture any other frontmatter properties that weren't mapped above
			// This ensures we don't lose any Bases-specific values
			const mappedKeys = new Set([
				fm.toUserField("title"),
				fm.toUserField("status"),
				fm.toUserField("priority"),
				fm.toUserField("due"),
				fm.toUserField("scheduled"),
				fm.toUserField("contexts"),
				fm.toUserField("projects"),
				"tags", // Not in FieldMapping
				fm.toUserField("archiveTag"), // For archived status
				fm.toUserField("timeEstimate"),
				fm.toUserField("recurrence"),
				fm.toUserField("completedDate"),
				fm.toUserField("dateCreated"),
				fm.toUserField("blockedBy"),
				...userFields.map(uf => uf.key),
			]);

			for (const [key, value] of Object.entries(mockFrontmatter)) {
				if (!mappedKeys.has(key)) {
					customFrontmatter[key] = value;
				}
			}
		}

		// Build the complete pre-populated values (TaskCreationData structure)
		const taskCreationData: any = { ...prePopulatedValues };
		if (Object.keys(customFrontmatter).length > 0) {
			taskCreationData.customFrontmatter = customFrontmatter;
		}

		// Open TaskNotes creation modal
		const modal = new TaskCreationModal(this.app, this.plugin, {
			prePopulatedValues: taskCreationData,
			onTaskCreated: (task: TaskInfo) => {
				// Refresh the view after task creation so it appears immediately
				this.refresh();
			},
		});

		modal.open();
	}

	/**
	 * Get visible properties for rendering task cards.
	 * Uses BasesView's config API directly.
	 */
	protected getVisibleProperties(): string[] {
		// Get ordered properties from Bases config (configured by user in Bases UI)
		const basesPropertyIds = this.config.getOrder();
		let visibleProperties = this.propertyMapper.mapVisibleProperties(basesPropertyIds);

		// Fallback to plugin defaults if no properties configured
		if (!visibleProperties || visibleProperties.length === 0) {
			const internalDefaults = this.plugin.settings.defaultVisibleProperties || [
				...DEFAULT_INTERNAL_VISIBLE_PROPERTIES,
				"tags",
			];
			// Convert internal field names to user-configured property names
			visibleProperties = convertInternalToUserProperties(internalDefaults, this.plugin);
		}

		return visibleProperties;
	}

	// Abstract methods that subclasses must implement

	/**
	 * Render the view with current data.
	 * Subclasses implement view-specific rendering (list, kanban, calendar).
	 */
	abstract render(): void;

	/**
	 * Render an error state when rendering fails.
	 * Subclasses should display user-friendly error messages.
	 * Made public to match abstract method visibility requirements.
	 */
	abstract renderError(error: Error): void;

	/**
	 * Handle a single task update for selective rendering.
	 * Subclasses can implement efficient updates or fall back to full refresh.
	 */
	protected abstract handleTaskUpdate(task: TaskInfo): Promise<void>;

	/**
	 * The view type identifier (required by BasesView).
	 * Must be unique across all registered Bases views.
	 */
	abstract type: string;
}
