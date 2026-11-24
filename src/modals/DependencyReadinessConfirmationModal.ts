import { applyModalShell } from "../ui/kit/modal";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { Modal } from "obsidian";
import type TaskNotesPlugin from "../main";
import {
	describeMissingStartCategories,
	describeMissingStartConsequence,
} from "../settings/defaults";
import type { StatusCategory } from "../types";

export type DependencyReadinessChoice = "go-back" | "enable" | "enable-and-open-statuses";

const CHOICES: ReadonlyArray<[MessageDescriptor, DependencyReadinessChoice]> = [
	[msg({ message: "Go back", context: "modals.dependencyReadiness.buttons.goBack" }), "go-back"],
	[msg({ message: "Just enable", context: "modals.dependencyReadiness.buttons.justEnable" }), "enable"],
	[msg({ message: "Enable and go to statuses...", context: "modals.dependencyReadiness.buttons.enableAndOpenStatuses" }), "enable-and-open-statuses"],
];

/**
 * Acknowledgement for enabling advanced dependency types while a start category has no
 * status. Closing it without choosing resolves to "go-back".
 */
export class DependencyReadinessConfirmationModal extends Modal {
	private readonly plugin: TaskNotesPlugin;
	private readonly missingCategories: StatusCategory[];
	private resolve: ((choice: DependencyReadinessChoice) => void) | null = null;

	constructor(plugin: TaskNotesPlugin, missingCategories: StatusCategory[]) {
		super(plugin.app);
		applyModalShell(this);
		this.plugin = plugin;
		this.missingCategories = missingCategories;
	}

	private t(key: MessageDescriptor): string {
		return this.plugin.i18n.translate(key);
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

		this.setTitle(this.t(msg({ message: "Enable advanced dependency types?", context: "modals.dependencyReadiness.title" })));

		contentEl.createEl("p", { text: this.t(describeMissingStartCategories(this.missingCategories)) });
		contentEl.createEl("p", { text: this.t(describeMissingStartConsequence(this.missingCategories)) });
		contentEl.createEl("p", {
			text: this.t(msg({ message: "To change that, assign the missing category to one of your existing statuses in the task properties settings.", context: "modals.dependencyReadiness.remedy" })),
		});

		const buttonContainer = contentEl.createDiv({ cls: "modal-button-container" });
		const buttons = CHOICES.map(([label, choice]) => {
			const button = buttonContainer.createEl("button", { text: this.t(label) });
			button.addEventListener("click", () => {
				this.settle(choice);
				this.close();
			});
			return button;
		});

		const primaryButton = buttons[buttons.length - 1];
		primaryButton.addClass("mod-cta");
		window.setTimeout(() => {
			primaryButton.focus();
		}, 0);
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
