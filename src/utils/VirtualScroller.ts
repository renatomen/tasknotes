/**
 * Simple virtual scrolling implementation for large lists
 *
 * Renders only visible items plus a buffer to improve performance
 * with large datasets (1000+ items).
 */

export interface VirtualScrollerOptions<T> {
	/** Container element that will have overflow scroll */
	container: HTMLElement;
	/** Array of items to virtualize */
	items: T[];
	/** Estimated height of each item in pixels */
	itemHeight: number;
	/** Number of items to render above/below viewport (buffer) */
	overscan?: number;
	/** Function to render an item */
	renderItem: (item: T, index: number) => HTMLElement;
	/** Optional function to get unique key for item */
	getItemKey?: (item: T, index: number) => string;
}

export interface VirtualScrollState {
	/** Index of first visible item */
	startIndex: number;
	/** Index of last visible item */
	endIndex: number;
	/** Total items */
	totalItems: number;
	/** Offset from top in pixels */
	offsetY: number;
}

export class VirtualScroller<T> {
	private container: HTMLElement;
	private scrollContainer: HTMLElement;
	private contentContainer: HTMLElement;
	private spacer: HTMLElement;

	private items: T[] = [];
	private itemHeight: number;
	private overscan: number;
	private renderItem: (item: T, index: number) => HTMLElement;
	private getItemKey: (item: T, index: number) => string;

	private state: VirtualScrollState = {
		startIndex: 0,
		endIndex: 0,
		totalItems: 0,
		offsetY: 0,
	};

	private renderedElements = new Map<string, HTMLElement>();
	private scrollRAF: number | null = null;

	constructor(options: VirtualScrollerOptions<T>) {
		this.container = options.container;
		this.items = options.items;
		this.itemHeight = options.itemHeight;
		this.overscan = options.overscan ?? 5;
		this.renderItem = options.renderItem;
		this.getItemKey = options.getItemKey ?? ((item, index) => String(index));

		this.setupDOM();
		this.attachScrollListener();
		this.updateVisibleRange();
	}

	private setupDOM(): void {
		// Clear existing content
		this.container.empty();

		// Container should just be relative, parent handles overflow
		this.container.style.position = 'relative';

		// Create spacer to maintain scroll height
		this.spacer = this.container.createDiv({
			cls: 'virtual-scroller__spacer',
		});
		this.spacer.style.cssText = `
			position: absolute;
			top: 0;
			left: 0;
			right: 0;
			pointer-events: none;
		`;
		this.updateSpacerHeight();

		// Create content container for rendered items
		this.contentContainer = this.container.createDiv({
			cls: 'virtual-scroller__content',
		});
		this.contentContainer.style.cssText = `
			position: relative;
		`;

		// Find the actual scrolling container by walking up the DOM
		this.scrollContainer = this.findScrollContainer(this.container);
		console.log('[VirtualScroller] Found scroll container:', this.scrollContainer.className, 'clientHeight:', this.scrollContainer.clientHeight);
	}

	private findScrollContainer(element: HTMLElement): HTMLElement {
		let current: HTMLElement | null = element;

		// Walk up the DOM tree to find an element with overflow scroll/auto
		while (current) {
			const style = window.getComputedStyle(current);
			const overflowY = style.overflowY;

			if (overflowY === 'scroll' || overflowY === 'auto') {
				console.log('[VirtualScroller] Found scrollable element:', current.className, 'overflow:', overflowY);
				return current;
			}

			current = current.parentElement;
		}

		// Fallback to container itself
		console.warn('[VirtualScroller] No scrollable parent found, using container');
		return element;
	}

	private updateSpacerHeight(): void {
		const totalHeight = this.items.length * this.itemHeight;
		this.spacer.style.height = `${totalHeight}px`;
	}

	private attachScrollListener(): void {
		this.scrollContainer.addEventListener('scroll', this.handleScroll);
	}

	private handleScroll = (): void => {
		// Use RAF to throttle scroll updates
		if (this.scrollRAF !== null) {
			return;
		}

		this.scrollRAF = requestAnimationFrame(() => {
			console.log('[VirtualScroller] Scroll event, scrollTop:', this.scrollContainer.scrollTop);
			this.updateVisibleRange();
			this.scrollRAF = null;
		});
	};

	private updateVisibleRange(): void {
		const scrollTop = this.scrollContainer.scrollTop;
		let containerHeight = this.scrollContainer.clientHeight;

		// If container height is 0, try to get a better estimate
		if (containerHeight === 0) {
			// Try parent element height
			containerHeight = this.scrollContainer.parentElement?.clientHeight || 0;
		}
		if (containerHeight === 0) {
			// Fall back to window height as last resort
			containerHeight = window.innerHeight;
			console.warn('[VirtualScroller] Using window height as fallback:', containerHeight);
		}

		// Calculate visible range
		const startIndex = Math.max(0, Math.floor(scrollTop / this.itemHeight) - this.overscan);
		const endIndex = Math.min(
			this.items.length - 1,
			Math.ceil((scrollTop + containerHeight) / this.itemHeight) + this.overscan
		);

		const offsetY = startIndex * this.itemHeight;

		// Only update if range changed
		if (
			startIndex !== this.state.startIndex ||
			endIndex !== this.state.endIndex ||
			this.items.length !== this.state.totalItems
		) {
			console.log('[VirtualScroller] Rendering range:', startIndex, '-', endIndex, 'of', this.items.length, 'offsetY:', offsetY);
			this.state = {
				startIndex,
				endIndex,
				totalItems: this.items.length,
				offsetY,
			};
			this.renderVisibleItems();
		}
	}

	private renderVisibleItems(): void {
		const { startIndex, endIndex, offsetY } = this.state;

		// Track which items are currently visible
		const visibleKeys = new Set<string>();

		// Position the content container
		this.contentContainer.style.transform = `translateY(${offsetY}px)`;

		// Render visible items
		for (let i = startIndex; i <= endIndex; i++) {
			const item = this.items[i];
			const key = this.getItemKey(item, i);
			visibleKeys.add(key);

			let element = this.renderedElements.get(key);

			if (!element) {
				// Create new element
				element = this.renderItem(item, i);
				this.renderedElements.set(key, element);
				this.contentContainer.appendChild(element);
			} else if (!element.isConnected) {
				// Re-attach existing element
				this.contentContainer.appendChild(element);
			}
		}

		// Remove elements that are no longer visible
		for (const [key, element] of this.renderedElements) {
			if (!visibleKeys.has(key)) {
				element.remove();
			}
		}
	}

	/**
	 * Update the items list and re-render
	 */
	updateItems(items: T[]): void {
		// Save current scroll position
		const currentScrollTop = this.scrollContainer.scrollTop;
		console.log('[VirtualScroller] updateItems called, preserving scrollTop:', currentScrollTop);

		this.items = items;
		this.state.totalItems = items.length;
		this.updateSpacerHeight();

		// Clear rendered elements cache since items changed
		// This forces fresh cards to be created with updated data
		this.renderedElements.clear();
		this.contentContainer.empty();

		// Force state reset to trigger re-render at current scroll position
		this.state.startIndex = -1;
		this.state.endIndex = -1;

		// IMPORTANT: Restore scroll position BEFORE updateVisibleRange
		// so it calculates the right visible range
		this.scrollContainer.scrollTop = currentScrollTop;

		this.updateVisibleRange();

		console.log('[VirtualScroller] After update, scrollTop is:', this.scrollContainer.scrollTop);
	}

	/**
	 * Scroll to a specific item index
	 */
	scrollToIndex(index: number, behavior: ScrollBehavior = 'smooth'): void {
		const targetScroll = index * this.itemHeight;
		this.scrollContainer.scrollTo({
			top: targetScroll,
			behavior,
		});
	}

	/**
	 * Force recalculation of visible range (useful after container resize)
	 */
	recalculate(): void {
		// Force a fresh calculation by resetting state
		this.state.startIndex = -1;
		this.state.endIndex = -1;
		this.updateVisibleRange();
	}

	/**
	 * Invalidate a specific item by key, forcing it to re-render
	 */
	invalidateItem(key: string): void {
		const element = this.renderedElements.get(key);
		if (element) {
			// Remove from cache - will be recreated on next render
			this.renderedElements.delete(key);
			element.remove();
		}
		// Force re-render of visible range
		this.updateVisibleRange();
	}

	/**
	 * Get current scroll state (for debugging)
	 */
	getState(): VirtualScrollState {
		return { ...this.state };
	}

	/**
	 * Clean up event listeners
	 */
	destroy(): void {
		if (this.scrollRAF !== null) {
			cancelAnimationFrame(this.scrollRAF);
		}
		this.scrollContainer.removeEventListener('scroll', this.handleScroll);
		this.renderedElements.clear();
		this.contentContainer.empty();
	}
}
