import TaskNotesPlugin from "../main";
import { BasesDataAdapter } from "./BasesDataAdapter";
import { PropertyMappingService } from "./PropertyMappingService";
import { TaskInfo, EVENT_TASK_UPDATED } from "../types";

/**
 * Abstract base class for all TaskNotes Bases views.
 * Handles common lifecycle, data extraction, and event management.
 */
export abstract class BasesViewBase {
	protected plugin: TaskNotesPlugin;
	protected dataAdapter: BasesDataAdapter;
	protected propertyMapper: PropertyMappingService;
	protected containerEl: HTMLElement;
	protected rootElement: HTMLElement | null = null;
	protected taskUpdateListener: any = null;
	protected updateDebounceTimer: number | null = null;

	constructor(controller: any, containerEl: HTMLElement, plugin: TaskNotesPlugin) {
		// Note: We don't call super() since BasesView isn't available in types
		// The factory function will handle attaching this object to the proper view lifecycle
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
				const isRelevant = dataItems.some((item) => item.path === updatedTask.path);

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
				"due",
				"scheduled",
				"projects",
				"contexts",
				"tags",
			];
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
	 * Handle a single task update for selective rendering.
	 * Subclasses can implement efficient updates or fall back to full refresh.
	 */
	protected abstract handleTaskUpdate(task: TaskInfo): Promise<void>;

	/**
	 * The view type identifier.
	 */
	abstract type: string;
}
