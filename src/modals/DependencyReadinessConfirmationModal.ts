import { Modal, Setting } from "obsidian";
import TaskNotesPlugin from "../main";
import { StatusCategory } from "../types";
import { describeMissingStartCategories } from "../settings/defaults";

export type DependencyReadinessChoice = "go-back" | "enable" | "enable-and-open-statuses";

const CHOICES: ReadonlyArray<[string, DependencyReadinessChoice]> = [
	["goBack", "go-back"],
	["justEnable", "enable"],
	["enableAndOpenStatuses", "enable-and-open-statuses"],
];

/**
 * Acknowledgement for enabling advanced dependency types while a start category has no
 * status. Callers pass the missing categories; the modal reads no settings of its own.
 */
export class DependencyReadinessConfirmationModal extends Modal {
	private plugin: TaskNotesPlugin;
	private missingCategories: StatusCategory[];
	private resolve: ((choice: DependencyReadinessChoice) => void) | null = null;

	constructor(plugin: TaskNotesPlugin, missingCategories: StatusCategory[]) {
		super(plugin.app);
		this.plugin = plugin;
		this.missingCategories = missingCategories;
	}

	private t(key: string, params?: Record<string, string | number>): string {
		return this.plugin.i18n.translate(key, params);
	}

	public show(): Promise<DependencyReadinessChoice> {
		return new Promise((resolve) => {
			this.resolve = resolve;
			this.open();
		});
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();

		new Setting(contentEl).setName(this.t("modals.dependencyReadiness.title")).setHeading();

		const categories = describeMissingStartCategories(this.missingCategories, (key) =>
			this.t(key)
		);

		contentEl.createEl("p", {
			text: this.t("modals.dependencyReadiness.missing", { categories }),
		});
		contentEl.createEl("p", { text: this.t("modals.dependencyReadiness.consequence") });
		contentEl.createEl("p", { text: this.t("modals.dependencyReadiness.remedy") });

		const buttonContainer = contentEl.createDiv({ cls: "modal-button-container" });
		const buttons = CHOICES.map(([labelKey, choice]) => {
			const button = buttonContainer.createEl("button", {
				text: this.t(`modals.dependencyReadiness.buttons.${labelKey}`),
			});
			button.addEventListener("click", () => {
				this.settle(choice);
				this.close();
			});
			return button;
		});

		const primaryButton = buttons[buttons.length - 1];
		primaryButton.classList.add("mod-cta");
		window.setTimeout(() => {
			primaryButton.focus();
		}, 50);
	}

	onClose(): void {
		this.contentEl.empty();
		this.settle("go-back");
	}

	private settle(choice: DependencyReadinessChoice): void {
		this.resolve?.(choice);
		this.resolve = null;
	}
}
