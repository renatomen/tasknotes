import { TFile, FuzzySuggestModal, FuzzyMatch, setTooltip, Notice } from "obsidian";
import TaskNotesPlugin from "../main";
import { BasesViewBase } from "./BasesViewBase";
import { TaskInfo } from "../types";
import { format } from "date-fns";
import {
	formatDateForStorage,
	getTodayLocal,
	createUTCDateFromLocalCalendarDate,
	convertUTCToLocalCalendarDate,
	createSafeUTCDate,
	getDatePart,
} from "../utils/dateUtils";
import { isSameDay } from "../utils/helpers";
import { getAllDailyNotes, getDailyNote, appHasDailyNotesPluginLoaded, createDailyNote } from "obsidian-daily-notes-interface";

interface NoteEntry {
	file: TFile;
	title: string;
	path: string;
	dateValue: string; // The date string from the property
	basesEntry?: any; // Reference to Bases entry for additional data
}

export class MiniCalendarView extends BasesViewBase {
	type = "tasknotesMiniCalendar";
	private calendarEl: HTMLElement | null = null;
	private basesViewContext?: any;

	// View options
	private dateProperty: string | null = null; // e.g., "note.dueDate", "file.ctime", "note.scheduled"
	private displayedMonth: number;
	private displayedYear: number;
	private selectedDate: Date; // UTC-anchored

	// Data
	private notesByDate: Map<string, NoteEntry[]> = new Map();
	private monthCalculationCache: Map<string, { actualMonth: number; dateObj: Date; dateKey: string }> = new Map();

	constructor(controller: any, containerEl: HTMLElement, plugin: TaskNotesPlugin) {
		super(controller, containerEl, plugin);

		// Initialize with today
		const todayLocal = getTodayLocal();
		const todayUTC = createUTCDateFromLocalCalendarDate(todayLocal);
		this.selectedDate = todayUTC;
		this.displayedMonth = todayUTC.getUTCMonth();
		this.displayedYear = todayUTC.getUTCFullYear();
	}

	setBasesViewContext(context: any): void {
		this.basesViewContext = context;
		(this.dataAdapter as any).basesView = context;

		// Read view options
		this.readViewOptions();
	}

	private readViewOptions(): void {
		if (!this.basesViewContext?.config) return;

		const config = this.basesViewContext.config;
		if (typeof config.get !== 'function') return;

		try {
			this.dateProperty = config.get('dateProperty') || 'file.ctime';
		} catch (e) {
			console.error("[TaskNotes][MiniCalendarView] Error reading view options:", e);
		}
	}

	async render(): Promise<void> {
		if (!this.calendarEl || !this.rootElement) return;
		if (!this.basesViewContext?.data?.data) return;

		try {
			// Clear calendar
			this.calendarEl.empty();

			// Use raw Bases data (has getValue() method)
			const basesEntries = this.basesViewContext.data.data;

			// Index notes by date
			this.indexNotesByDate(basesEntries);

			// Render calendar grid
			this.renderCalendarControls();
			this.renderCalendarGrid();
		} catch (error: any) {
			console.error("[TaskNotes][MiniCalendarView] Error rendering:", error);
			this.renderError(error);
		}
	}

	private indexNotesByDate(dataItems: any[]): void {
		this.notesByDate.clear();

		if (!this.dateProperty) {
			return;
		}

		for (const item of dataItems) {
			try {
				const file = item.file;
				if (!file) continue;

				// Get date value from the configured property
				const dateValue = this.getDateValueFromProperty(item, this.dateProperty);
				if (!dateValue) continue;

				// Extract date part (handles both date-only and datetime strings)
				const dateKey = getDatePart(dateValue);
				if (!dateKey) continue;

				// Create note entry
				const noteEntry: NoteEntry = {
					file: file,
					title: file.basename || file.name,
					path: file.path,
					dateValue: dateValue,
					basesEntry: item,
				};

				// Add to map
				if (!this.notesByDate.has(dateKey)) {
					this.notesByDate.set(dateKey, []);
				}
				this.notesByDate.get(dateKey)!.push(noteEntry);
			} catch (error) {
				console.warn("[TaskNotes][MiniCalendarView] Error indexing note:", error);
			}
		}
	}

	private getDateValueFromProperty(item: any, propertyId: string): string | null {
		try {
			// Use BasesDataAdapter to get the property value (handles all Bases Value types)
			const value = this.dataAdapter.getPropertyValue(item, propertyId);

			if (!value) {
				return null;
			}

			// Normalize based on the native JavaScript value shape
			if (typeof value === "string") {
				return this.extractDateFromString(value);
			}

			if (typeof value === "number") {
				return this.toAnchoredDateString(new Date(value));
			}

			if (value instanceof Date) {
				return this.toAnchoredDateString(value);
			}

			if (typeof value === "object") {
				const maybeDate = (value as { date?: Date }).date;
				if (maybeDate instanceof Date) {
					return this.toAnchoredDateString(maybeDate);
				}

				const toISOString = (value as { toISOString?: () => string }).toISOString;
				if (typeof toISOString === "function") {
					return this.extractDateFromString(toISOString.call(value));
				}
			}

			return null;
		} catch (error) {
			console.warn("[TaskNotes][MiniCalendarView] Error getting date value:", error);
			return null;
		}
	}

	private extractDateFromString(rawValue: string): string | null {
		const trimmed = rawValue?.trim();
		if (!trimmed) {
			return null;
		}

		// YYYY-MM-DD already normalized (UTC anchor ready)
		if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
			return this.validateCalendarDate(trimmed);
		}

		// Handle ISO / timezone-aware or space-separated datetime strings
		if (
			trimmed.includes("T") ||
			/\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}/.test(trimmed) ||
			/[+-]\d{2}:\d{2}$/.test(trimmed)
		) {
			const sanitized =
				trimmed.includes(" ") && !trimmed.includes("T") ? trimmed.replace(" ", "T") : trimmed;
			const parsed = new Date(sanitized);
			if (!isNaN(parsed.getTime())) {
				return this.toAnchoredDateString(parsed);
			}
		}

		// Support common alternate separators like YYYY/MM/DD or YYYY.MM.DD
		const alternateSeparatorMatch = trimmed.match(/^(\d{4})[/.](\d{2})[/.](\d{2})$/);
		if (alternateSeparatorMatch) {
			const [, year, month, day] = alternateSeparatorMatch;
			return this.validateCalendarDate(`${year}-${month}-${day}`);
		}

		// As a last resort, pull the first YYYY-MM-DD from the string (e.g., filenames)
		const embeddedMatch = trimmed.match(/(\d{4}-\d{2}-\d{2})/);
		if (embeddedMatch) {
			return this.validateCalendarDate(embeddedMatch[1]);
		}

		return null;
	}

	private toAnchoredDateString(date: Date): string | null {
		if (!(date instanceof Date) || isNaN(date.getTime())) {
			return null;
		}

		const anchored = createUTCDateFromLocalCalendarDate(date);
		return formatDateForStorage(anchored);
	}

	private validateCalendarDate(value: string | null | undefined): string | null {
		if (!value) {
			return null;
		}

		const trimmed = value.trim();
		const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
		if (!match) {
			return null;
		}

		const [, yearStr, monthStr, dayStr] = match;
		const year = Number(yearStr);
		const monthIndex = Number(monthStr) - 1;
		const day = Number(dayStr);

		if (Number.isNaN(year) || Number.isNaN(monthIndex) || Number.isNaN(day)) {
			return null;
		}

		const safe = createSafeUTCDate(year, monthIndex, day);
		if (
			safe.getUTCFullYear() !== year ||
			safe.getUTCMonth() !== monthIndex ||
			safe.getUTCDate() !== day
		) {
			return null;
		}

		return formatDateForStorage(safe);
	}

	private renderCalendarControls(): void {
		const controlsContainer = this.calendarEl!.createDiv({ cls: "mini-calendar-view__controls" });
		const headerContainer = controlsContainer.createDiv({ cls: "mini-calendar-view__header" });

		// Navigation section
		const navSection = headerContainer.createDiv({ cls: "mini-calendar-view__navigation" });

		// Previous month button
		const prevButton = navSection.createEl("button", {
			text: "‹",
			cls: "mini-calendar-view__nav-button mini-calendar-view__nav-button--prev tn-btn tn-btn--icon tn-btn--ghost",
			attr: {
				"aria-label": "Previous month",
				title: "Previous month",
			},
		});
		prevButton.addEventListener("click", () => this.navigateToPreviousMonth());

		// Current month display
		navSection.createDiv({
			cls: "mini-calendar-view__month-display",
			text: format(convertUTCToLocalCalendarDate(this.selectedDate), "MMMM yyyy"),
		});

		// Next month button
		const nextButton = navSection.createEl("button", {
			text: "›",
			cls: "mini-calendar-view__nav-button mini-calendar-view__nav-button--next tn-btn tn-btn--icon tn-btn--ghost",
			attr: {
				"aria-label": "Next month",
				title: "Next month",
			},
		});
		nextButton.addEventListener("click", () => this.navigateToNextMonth());

		// Today button
		const todayButton = headerContainer.createEl("button", {
			text: "Today",
			cls: "mini-calendar-view__today-button tn-btn tn-btn--ghost tn-btn--sm",
			attr: {
				"aria-label": "Go to today",
				title: "Go to today",
			},
		});
		todayButton.addEventListener("click", () => this.navigateToToday());
	}

	private renderCalendarGrid(): void {
		const gridContainer = this.calendarEl!.createDiv({ cls: "mini-calendar-view__grid-container" });

		// Get current month/year from displayed date
		const currentMonth = this.displayedMonth;
		const currentYear = this.displayedYear;

		// Get first and last day of month
		const firstDayOfMonth = new Date(Date.UTC(currentYear, currentMonth, 1));
		const lastDayOfMonth = new Date(Date.UTC(currentYear, currentMonth + 1, 0));

		const firstDaySetting = this.plugin.settings.calendarViewSettings.firstDay || 0;
		const firstDayOfWeek = (firstDayOfMonth.getUTCDay() - firstDaySetting + 7) % 7;

		// Create calendar grid
		const calendarGrid = gridContainer.createDiv({
			cls: "mini-calendar-view__grid",
			attr: {
				role: "grid",
				"aria-label": `Calendar for ${format(convertUTCToLocalCalendarDate(new Date(Date.UTC(currentYear, currentMonth, 1))), "MMMM yyyy")}`,
			},
		});

		// Day names header
		const calendarHeader = calendarGrid.createDiv({
			cls: "mini-calendar-view__grid-header",
			attr: { role: "row" },
		});

		const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
		const reorderedDayNames = [
			...dayNames.slice(firstDaySetting),
			...dayNames.slice(0, firstDaySetting),
		];

		reorderedDayNames.forEach((dayName) => {
			calendarHeader.createDiv({
				text: dayName,
				cls: "mini-calendar-view__day-header",
				attr: { role: "columnheader", "aria-label": dayName },
			});
		});

		// Calculate grid layout
		const daysFromPrevMonth = firstDayOfWeek;
		const totalCells = 42; // 6 rows of 7 days
		const daysThisMonth = lastDayOfMonth.getUTCDate();
		const daysFromNextMonth = totalCells - daysThisMonth - daysFromPrevMonth;
		const lastDayOfPrevMonth = new Date(Date.UTC(currentYear, currentMonth, 0)).getUTCDate();

		// Render days
		let currentWeekRow = calendarGrid.createDiv({
			cls: "mini-calendar-view__week",
			attr: { role: "row" },
		});

		// Previous month days
		for (let i = 0; i < daysFromPrevMonth; i++) {
			const dayNum = lastDayOfPrevMonth - daysFromPrevMonth + i + 1;
			const dayDate = new Date(Date.UTC(currentYear, currentMonth - 1, dayNum));
			this.renderDay(currentWeekRow, dayDate, dayNum, true);
		}

		// Current month days
		for (let i = 1; i <= daysThisMonth; i++) {
			if ((i + daysFromPrevMonth - 1) % 7 === 0 && i > 1) {
				currentWeekRow = calendarGrid.createDiv({
					cls: "mini-calendar-view__week",
					attr: { role: "row" },
				});
			}

			const dayDate = new Date(Date.UTC(currentYear, currentMonth, i));
			this.renderDay(currentWeekRow, dayDate, i, false);
		}

		// Next month days
		for (let i = 1; i <= daysFromNextMonth; i++) {
			if ((i + daysFromPrevMonth + daysThisMonth - 1) % 7 === 0 && i > 1) {
				currentWeekRow = calendarGrid.createDiv({
					cls: "mini-calendar-view__week",
					attr: { role: "row" },
				});
			}

			const dayDate = new Date(Date.UTC(currentYear, currentMonth + 1, i));
			this.renderDay(currentWeekRow, dayDate, i, true);
		}
	}

	private renderDay(weekRow: HTMLElement, dayDate: Date, dayNum: number, isOutsideMonth: boolean): void {
		const todayLocal = getTodayLocal();
		const today = createUTCDateFromLocalCalendarDate(todayLocal);

		const isToday = isSameDay(dayDate, today);
		const isSelected = isSameDay(dayDate, this.selectedDate);

		let classNames = "mini-calendar-view__day";
		if (isToday) classNames += " mini-calendar-view__day--today";
		if (isSelected) classNames += " mini-calendar-view__day--selected";
		if (isOutsideMonth) classNames += " mini-calendar-view__day--outside-month";

		const dayEl = weekRow.createDiv({
			cls: classNames,
			text: dayNum.toString(),
			attr: {
				role: "gridcell",
				tabindex: isSelected ? "0" : "-1",
				"aria-label": format(convertUTCToLocalCalendarDate(dayDate), "EEEE, MMMM d, yyyy") + (isToday ? " (Today)" : ""),
				"aria-selected": isSelected ? "true" : "false",
				"aria-current": isToday ? "date" : null,
			},
		});

		// Add dot indicator if notes exist for this date
		const dateKey = formatDateForStorage(dayDate);
		const notesForDay = this.notesByDate.get(dateKey);

		if (notesForDay && notesForDay.length > 0) {
			const indicator = dayEl.createDiv({ cls: "note-indicator" });

			// Style based on count
			if (notesForDay.length >= 5) {
				indicator.addClass("many-notes");
				dayEl.addClass("mini-calendar-view__day--has-notes-many");
			} else if (notesForDay.length >= 2) {
				indicator.addClass("some-notes");
				dayEl.addClass("mini-calendar-view__day--has-notes-some");
			} else {
				indicator.addClass("few-notes");
				dayEl.addClass("mini-calendar-view__day--has-notes-few");
			}

			setTooltip(indicator, `${notesForDay.length} note${notesForDay.length > 1 ? "s" : ""}`, {
				placement: "top",
			});
		}

		// Click handler - select date or show fuzzy selector
		dayEl.addEventListener("click", (e: MouseEvent) => {
			this.handleDayClick(dayDate, e);
		});

		// Keyboard handler
		dayEl.addEventListener("keydown", async (e: KeyboardEvent) => {
			if (e.key === "Enter" || e.key === " ") {
				e.preventDefault();

				// Check for ctrl/cmd+Enter to open daily note
				if (e.ctrlKey || e.metaKey) {
					await this.openDailyNoteForDate(dayDate);
				} else {
					await this.handleDayClick(dayDate);
				}
			}
		});
	}

	private async handleDayClick(date: Date, event?: MouseEvent): Promise<void> {
		// Update selected date
		this.selectedDate = date;

		// Check for ctrl/cmd click to open daily note
		if (event && (event.ctrlKey || event.metaKey)) {
			await this.openDailyNoteForDate(date);
			return;
		}

		// Update selection visually (highlight the clicked date)
		this.refresh();

		// Check if date has notes
		const dateKey = formatDateForStorage(date);
		const notesForDay = this.notesByDate.get(dateKey);

		if (notesForDay && notesForDay.length > 0) {
			// Show fuzzy selector with notes
			const modal = new NoteSelectionModal(
				this.plugin.app,
				this.plugin,
				notesForDay,
				(selectedNote) => {
					if (selectedNote) {
						// Open the selected note
						this.plugin.app.workspace.getLeaf(false).openFile(selectedNote.file);
					}
				}
			);
			modal.open();
		}
	}

	private async openDailyNoteForDate(date: Date): Promise<void> {
		// Check if daily notes plugin is enabled
		if (!appHasDailyNotesPluginLoaded()) {
			new Notice(
				"Daily Notes core plugin is not enabled. Please enable it in Settings > Core plugins."
			);
			return;
		}

		// Convert date to moment for the API
		const localAnchor = convertUTCToLocalCalendarDate(date);
		const jsDate = new Date(
			localAnchor.getFullYear(),
			localAnchor.getMonth(),
			localAnchor.getDate(),
			12,
			0,
			0,
			0
		);
		const moment = (window as any).moment(jsDate);

		// Get all daily notes to check if one exists for this date
		const allDailyNotes = getAllDailyNotes();
		let dailyNote = getDailyNote(moment, allDailyNotes);

		if (!dailyNote) {
			// Daily note doesn't exist, create it
			try {
				dailyNote = await createDailyNote(moment);
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : String(error);
				console.error("Failed to create daily note:", error);
				new Notice(`Failed to create daily note: ${errorMessage}`);
				return;
			}
		}

		// Open the daily note
		if (dailyNote) {
			await this.plugin.app.workspace.getLeaf(false).openFile(dailyNote);
		}
	}

	private navigateToPreviousMonth(): void {
		const newDate = new Date(this.selectedDate.getTime());
		newDate.setUTCMonth(this.selectedDate.getUTCMonth() - 1);
		this.selectedDate = newDate;
		this.displayedMonth = newDate.getUTCMonth();
		this.displayedYear = newDate.getUTCFullYear();
		this.monthCalculationCache.clear();
		this.refresh();
	}

	private navigateToNextMonth(): void {
		const newDate = new Date(this.selectedDate.getTime());
		newDate.setUTCMonth(this.selectedDate.getUTCMonth() + 1);
		this.selectedDate = newDate;
		this.displayedMonth = newDate.getUTCMonth();
		this.displayedYear = newDate.getUTCFullYear();
		this.monthCalculationCache.clear();
		this.refresh();
	}

	private navigateToToday(): void {
		const todayLocal = getTodayLocal();
		const todayUTC = createUTCDateFromLocalCalendarDate(todayLocal);
		this.selectedDate = todayUTC;
		this.displayedMonth = todayUTC.getUTCMonth();
		this.displayedYear = todayUTC.getUTCFullYear();
		this.monthCalculationCache.clear();
		this.refresh();
	}

	protected setupContainer(): void {
		super.setupContainer();

		const calendar = document.createElement("div");
		calendar.className = "mini-calendar-bases-view";
		this.rootElement?.appendChild(calendar);
		this.calendarEl = calendar;
	}

	protected async handleTaskUpdate(task: TaskInfo): Promise<void> {
		// For mini calendar, refresh on any data change
		this.debouncedRefresh();
	}

	private renderError(error: Error): void {
		if (!this.calendarEl) return;

		const errorEl = document.createElement("div");
		errorEl.className = "tn-bases-error";
		errorEl.style.cssText =
			"padding: 20px; color: #d73a49; background: #ffeaea; border-radius: 4px; margin: 10px 0;";
		errorEl.textContent = `Error loading mini calendar: ${error.message || "Unknown error"}`;
		this.calendarEl.appendChild(errorEl);
	}

	protected cleanup(): void {
		super.cleanup();
		this.calendarEl = null;
		this.notesByDate.clear();
		this.monthCalculationCache.clear();
	}
}

// Fuzzy selector modal for notes
class NoteSelectionModal extends FuzzySuggestModal<NoteEntry> {
	private notes: NoteEntry[];
	private onChooseNote: (note: NoteEntry | null) => void;
	private plugin: TaskNotesPlugin;

	constructor(
		app: any,
		plugin: TaskNotesPlugin,
		notes: NoteEntry[],
		onChooseNote: (note: NoteEntry | null) => void
	) {
		super(app);
		this.plugin = plugin;
		this.notes = notes;
		this.onChooseNote = onChooseNote;

		this.setPlaceholder("Select a note to open");
		this.setInstructions([
			{ command: "↑↓", purpose: "Navigate" },
			{ command: "↵", purpose: "Open note" },
			{ command: "esc", purpose: "Dismiss" },
		]);
	}

	getItems(): NoteEntry[] {
		// Sort by title
		return this.notes.sort((a, b) => a.title.localeCompare(b.title));
	}

	getItemText(note: NoteEntry): string {
		return note.title;
	}

	renderSuggestion(item: FuzzyMatch<NoteEntry>, el: HTMLElement): void {
		const note = item.item;
		const container = el.createDiv({ cls: "note-selector-modal__suggestion" });

		// Title
		container.createDiv({
			cls: "note-selector-modal__title",
			text: note.title,
		});

		// Path (if not same as title)
		if (note.path !== note.title) {
			container.createDiv({
				cls: "note-selector-modal__path",
				text: note.path,
			});
		}
	}

	onChooseItem(item: NoteEntry, evt: MouseEvent | KeyboardEvent): void {
		this.onChooseNote(item);
	}
}

// Factory function
export function buildMiniCalendarViewFactory(plugin: TaskNotesPlugin) {
	return function (basesContainer: any, containerEl?: HTMLElement) {
		const viewContainerEl = containerEl || basesContainer.viewContainerEl;
		const controller = basesContainer;

		if (!viewContainerEl) {
			console.error("[TaskNotes][MiniCalendarView] No viewContainerEl found");
			return { destroy: () => {} } as any;
		}

		const view = new MiniCalendarView(controller, viewContainerEl, plugin);

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
