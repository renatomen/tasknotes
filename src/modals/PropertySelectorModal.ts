import { Modal, App, Setting } from "obsidian";

/**
 * Modal for selecting visible properties (multi-select checkboxes)
 * Used for both inline and default task card property selection
 */
export class PropertySelectorModal extends Modal {
	private availableProperties: Array<{ id: string; label: string }>;
	private currentSelection: string[];
	private onSubmit: (selected: string[]) => void;
	private tempSelection: string[];
	private modalTitle: string;
	private modalDescription: string;

	constructor(
		app: App,
		availableProperties: Array<{ id: string; label: string }>,
		currentSelection: string[],
		onSubmit: (selected: string[]) => void,
		modalTitle = "Select Task Card Properties",
		modalDescription = "Choose which properties to display in task cards. Selected properties will appear in the order shown below."
	) {
		super(app);
		this.availableProperties = availableProperties;
		this.currentSelection = currentSelection;
		this.tempSelection = [...currentSelection];
		this.onSubmit = onSubmit;
		this.modalTitle = modalTitle;
		this.modalDescription = modalDescription;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl("h2", { text: this.modalTitle });

		contentEl.createEl("p", {
			text: this.modalDescription,
			cls: "setting-item-description",
		});

		// Create checkboxes for each property
		const checkboxContainer = contentEl.createDiv({ cls: "property-selector-checkboxes" });
		checkboxContainer.style.maxHeight = "400px";
		checkboxContainer.style.overflowY = "auto";
		checkboxContainer.style.marginBottom = "20px";

		for (const prop of this.availableProperties) {
			const checkboxSetting = new Setting(checkboxContainer)
				.setName(prop.label)
				.addToggle((toggle) => {
					toggle
						.setValue(this.tempSelection.includes(prop.id))
						.onChange((value) => {
							if (value) {
								if (!this.tempSelection.includes(prop.id)) {
									this.tempSelection.push(prop.id);
								}
							} else {
								const index = this.tempSelection.indexOf(prop.id);
								if (index > -1) {
									this.tempSelection.splice(index, 1);
								}
							}
						});
				});
		}

		// Buttons
		const buttonContainer = contentEl.createDiv({
			cls: "modal-button-container",
		});
		buttonContainer.style.display = "flex";
		buttonContainer.style.gap = "10px";
		buttonContainer.style.justifyContent = "flex-end";

		const cancelButton = buttonContainer.createEl("button", { text: "Cancel" });
		cancelButton.addEventListener("click", () => {
			this.close();
		});

		const saveButton = buttonContainer.createEl("button", {
			text: "Save",
			cls: "mod-cta",
		});
		saveButton.addEventListener("click", () => {
			this.onSubmit(this.tempSelection);
			this.close();
		});
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}
