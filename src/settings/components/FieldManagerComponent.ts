import { setIcon } from "obsidian";
import type TaskNotesPlugin from "../../main";
import type { ModalFieldConfig, FieldGroup, TaskModalFieldsConfig } from "../../types/settings";
import { createCard, createCardInput, createCardSelect, setupCardDragAndDrop } from "./CardComponent";

/**
 * Creates the field manager UI component for configuring modal fields
 */
export function createFieldManager(
	container: HTMLElement,
	plugin: TaskNotesPlugin,
	config: TaskModalFieldsConfig,
	onUpdate: (config: TaskModalFieldsConfig) => void
): void {
	const translate = (key: string, params?: Record<string, string | number>) =>
		plugin.i18n.translate(key as any, params);

	container.empty();
	container.addClass("field-manager");

	// Create tabs for different field groups
	const tabsContainer = container.createDiv({ cls: "field-manager__tabs" });
	const contentContainer = container.createDiv({ cls: "field-manager__content" });

	// Sort groups by order
	const sortedGroups = [...config.groups].sort((a, b) => a.order - b.order);

	// Create tabs
	sortedGroups.forEach((group, index) => {
		const tab = tabsContainer.createDiv({ cls: "field-manager__tab" });
		if (index === 0) {
			tab.addClass("field-manager__tab--active");
		}
		tab.setText(group.displayName);
		tab.onclick = () => {
			// Update active tab
			tabsContainer.querySelectorAll(".field-manager__tab").forEach((t) => {
				t.removeClass("field-manager__tab--active");
			});
			tab.addClass("field-manager__tab--active");

			// Render fields for this group
			renderFieldGroup(contentContainer, group.id, config, plugin, onUpdate);
		};
	});

	// Render first group by default
	if (sortedGroups.length > 0) {
		renderFieldGroup(contentContainer, sortedGroups[0].id, config, plugin, onUpdate);
	}
}

/**
 * Renders fields for a specific group
 */
function renderFieldGroup(
	container: HTMLElement,
	groupId: FieldGroup,
	config: TaskModalFieldsConfig,
	plugin: TaskNotesPlugin,
	onUpdate: (config: TaskModalFieldsConfig) => void
): void {
	container.empty();

	const translate = (key: string, params?: Record<string, string | number>) =>
		plugin.i18n.translate(key as any, params);

	// Get fields for this group
	const groupFields = config.fields
		.filter((f) => f.group === groupId)
		.sort((a, b) => a.order - b.order);

	if (groupFields.length === 0) {
		const emptyState = container.createDiv({ cls: "field-manager__empty" });
		emptyState.setText("No fields in this group");
		return;
	}

	// Create container for field cards
	const cardsContainer = container.createDiv({ cls: "field-manager__cards" });

	// Render each field as a card
	groupFields.forEach((field, index) => {
		createFieldCard(cardsContainer, field, index, config, plugin, onUpdate);
	});

	// Setup drag and drop for reordering
	setupCardDragAndDrop(
		cardsContainer,
		".field-card",
		(startIndex: number, endIndex: number) => {
			// Update field orders
			const reorderedFields = [...groupFields];
			const [movedField] = reorderedFields.splice(startIndex, 1);
			reorderedFields.splice(endIndex, 0, movedField);

			// Update order values
			reorderedFields.forEach((f, i) => {
				const fieldIndex = config.fields.findIndex((cf) => cf.id === f.id);
				if (fieldIndex !== -1) {
					config.fields[fieldIndex].order = i;
				}
			});

			onUpdate(config);
			renderFieldGroup(container, groupId, config, plugin, onUpdate);
		}
	);
}

/**
 * Creates a card for a single field
 */
function createFieldCard(
	container: HTMLElement,
	field: ModalFieldConfig,
	index: number,
	config: TaskModalFieldsConfig,
	plugin: TaskNotesPlugin,
	onUpdate: (config: TaskModalFieldsConfig) => void
): void {
	const translate = (key: string, params?: Record<string, string | number>) =>
		plugin.i18n.translate(key as any, params);

	const card = container.createDiv({ cls: "field-card" });
	card.setAttribute("data-field-id", field.id);

	// Header with drag handle and field name
	const header = card.createDiv({ cls: "field-card__header" });

	// Drag handle
	const dragHandle = header.createDiv({ cls: "field-card__drag-handle" });
	setIcon(dragHandle, "grip-vertical");

	// Field name and type
	const nameContainer = header.createDiv({ cls: "field-card__name-container" });
	const nameEl = nameContainer.createDiv({ cls: "field-card__name" });
	nameEl.setText(field.displayName);

	const typeEl = nameContainer.createDiv({ cls: "field-card__type" });
	typeEl.setText(field.fieldType);
	typeEl.addClass(`field-card__type--${field.fieldType}`);

	// Toggle switches for visibility
	const controls = header.createDiv({ cls: "field-card__controls" });

	// Enable/disable toggle
	const enableToggle = controls.createDiv({ cls: "field-card__toggle" });
	const enableLabel = enableToggle.createSpan({ cls: "field-card__toggle-label" });
	enableLabel.setText("Enabled");
	const enableInput = enableToggle.createEl("input", {
		type: "checkbox",
		cls: "field-card__checkbox",
	});
	enableInput.checked = field.enabled;
	enableInput.onchange = () => {
		const fieldIndex = config.fields.findIndex((f) => f.id === field.id);
		if (fieldIndex !== -1) {
			config.fields[fieldIndex].enabled = enableInput.checked;
			onUpdate(config);
		}
	};

	// Body with visibility options (only shown when enabled)
	const body = card.createDiv({ cls: "field-card__body" });
	if (!field.enabled) {
		body.style.display = "none";
	}

	enableInput.onchange = () => {
		const fieldIndex = config.fields.findIndex((f) => f.id === field.id);
		if (fieldIndex !== -1) {
			config.fields[fieldIndex].enabled = enableInput.checked;
			body.style.display = enableInput.checked ? "block" : "none";
			onUpdate(config);
		}
	};

	// Visibility toggles
	const visibilityRow = body.createDiv({ cls: "field-card__visibility" });

	// Creation modal visibility
	const creationToggle = visibilityRow.createDiv({ cls: "field-card__toggle" });
	const creationLabel = creationToggle.createSpan({ cls: "field-card__toggle-label" });
	creationLabel.setText("Show in Creation");
	const creationInput = creationToggle.createEl("input", {
		type: "checkbox",
		cls: "field-card__checkbox",
	});
	creationInput.checked = field.visibleInCreation;
	creationInput.onchange = () => {
		const fieldIndex = config.fields.findIndex((f) => f.id === field.id);
		if (fieldIndex !== -1) {
			config.fields[fieldIndex].visibleInCreation = creationInput.checked;
			onUpdate(config);
		}
	};

	// Edit modal visibility
	const editToggle = visibilityRow.createDiv({ cls: "field-card__toggle" });
	const editLabel = editToggle.createSpan({ cls: "field-card__toggle-label" });
	editLabel.setText("Show in Edit");
	const editInput = editToggle.createEl("input", {
		type: "checkbox",
		cls: "field-card__checkbox",
	});
	editInput.checked = field.visibleInEdit;
	editInput.onchange = () => {
		const fieldIndex = config.fields.findIndex((f) => f.id === field.id);
		if (fieldIndex !== -1) {
			config.fields[fieldIndex].visibleInEdit = editInput.checked;
			onUpdate(config);
		}
	};

	// Group selector
	const groupRow = body.createDiv({ cls: "field-card__group-row" });
	const groupLabel = groupRow.createSpan({ cls: "field-card__label" });
	groupLabel.setText("Group:");

	const groupSelect = groupRow.createEl("select", { cls: "field-card__select" });
	config.groups.forEach((group) => {
		const option = groupSelect.createEl("option", { value: group.id });
		option.setText(group.displayName);
		if (group.id === field.group) {
			option.selected = true;
		}
	});
	groupSelect.onchange = () => {
		const fieldIndex = config.fields.findIndex((f) => f.id === field.id);
		if (fieldIndex !== -1) {
			config.fields[fieldIndex].group = groupSelect.value as FieldGroup;
			onUpdate(config);
			// Re-render to show field in new group
			const activeTab = document.querySelector(".field-manager__tab--active") as HTMLElement;
			if (activeTab) {
				activeTab.click();
			}
		}
	};
}

/**
 * Add styles for field manager
 */
export function addFieldManagerStyles(): void {
	const styleId = "field-manager-styles";
	if (document.getElementById(styleId)) return;

	const style = document.createElement("style");
	style.id = styleId;
	style.textContent = `
		.field-manager {
			display: flex;
			flex-direction: column;
			gap: 1rem;
		}

		.field-manager__tabs {
			display: flex;
			gap: 0.5rem;
			border-bottom: 2px solid var(--background-modifier-border);
			padding-bottom: 0.5rem;
		}

		.field-manager__tab {
			padding: 0.5rem 1rem;
			cursor: pointer;
			border-radius: 4px;
			transition: background-color 0.2s;
		}

		.field-manager__tab:hover {
			background-color: var(--background-modifier-hover);
		}

		.field-manager__tab--active {
			background-color: var(--interactive-accent);
			color: var(--text-on-accent);
		}

		.field-manager__content {
			padding: 1rem 0;
		}

		.field-manager__cards {
			display: flex;
			flex-direction: column;
			gap: 0.75rem;
		}

		.field-manager__empty {
			text-align: center;
			padding: 2rem;
			color: var(--text-muted);
		}

		.field-card {
			background: var(--background-secondary);
			border: 1px solid var(--background-modifier-border);
			border-radius: 6px;
			padding: 0.75rem;
			cursor: grab;
		}

		.field-card:active {
			cursor: grabbing;
		}

		.field-card__header {
			display: flex;
			align-items: center;
			gap: 0.75rem;
			margin-bottom: 0.75rem;
		}

		.field-card__drag-handle {
			color: var(--text-muted);
			cursor: grab;
			flex-shrink: 0;
		}

		.field-card__name-container {
			flex: 1;
			display: flex;
			align-items: center;
			gap: 0.5rem;
		}

		.field-card__name {
			font-weight: 500;
		}

		.field-card__type {
			font-size: 0.75rem;
			padding: 0.125rem 0.5rem;
			border-radius: 3px;
			background: var(--background-modifier-border);
		}

		.field-card__type--core {
			background: var(--interactive-accent);
			color: var(--text-on-accent);
		}

		.field-card__type--user {
			background: var(--color-purple);
			color: white;
		}

		.field-card__type--dependency {
			background: var(--color-orange);
			color: white;
		}

		.field-card__type--organization {
			background: var(--color-green);
			color: white;
		}

		.field-card__controls {
			display: flex;
			gap: 1rem;
		}

		.field-card__toggle {
			display: flex;
			align-items: center;
			gap: 0.5rem;
		}

		.field-card__toggle-label {
			font-size: 0.875rem;
		}

		.field-card__checkbox {
			cursor: pointer;
		}

		.field-card__body {
			padding-top: 0.75rem;
			border-top: 1px solid var(--background-modifier-border);
		}

		.field-card__visibility {
			display: flex;
			gap: 1.5rem;
			margin-bottom: 0.75rem;
		}

		.field-card__group-row {
			display: flex;
			align-items: center;
			gap: 0.5rem;
		}

		.field-card__label {
			font-size: 0.875rem;
			color: var(--text-muted);
		}

		.field-card__select {
			flex: 1;
			padding: 0.25rem 0.5rem;
			border-radius: 3px;
			border: 1px solid var(--background-modifier-border);
			background: var(--background-primary);
		}
	`;

	document.head.appendChild(style);
}
