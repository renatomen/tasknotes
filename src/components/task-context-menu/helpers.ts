import { Menu, type MenuItem } from "obsidian";

type NestedMenu = {
	parentMenu?: unknown;
	currentSubmenu?: unknown;
	closeSubmenu?(): void;
	openSubmenu?(item: MenuItem): void;
};
type SubmenuMenuItem = {
	setSubmenu(): Menu;
	menu?: NestedMenu;
	dom?: HTMLElement;
	domEl?: HTMLElement;
};

/** Matches Obsidian's own delay before a hovered item opens its submenu. */
const SUBMENU_HOVER_DELAY_MS = 250;

export function getSubmenu(item: MenuItem): Menu {
	const submenu = (item as unknown as SubmenuMenuItem).setSubmenu();
	switchToSubmenuOnHover(item, submenu);
	return submenu;
}

/**
 * Inside a nested menu Obsidian keeps the first submenu it opened: hovering a sibling
 * neither closes it nor opens the sibling's own. Do both once the pointer rests on the item.
 */
function switchToSubmenuOnHover(item: MenuItem, submenu: Menu): void {
	const element = getMenuItemElement(item);
	const menuItem = item as unknown as SubmenuMenuItem;
	const menu = "menu" in menuItem ? menuItem.menu : undefined;
	if (!element || !menu) return;

	let pending: number | undefined;
	element.addEventListener("pointerenter", () => {
		pending = window.setTimeout(() => {
			if (!menu.parentMenu || !menu.currentSubmenu || menu.currentSubmenu === submenu) return;
			if (!menu.closeSubmenu || !menu.openSubmenu) return;
			menu.closeSubmenu();
			menu.openSubmenu(item);
		}, SUBMENU_HOVER_DELAY_MS);
	});
	element.addEventListener("pointerleave", () => window.clearTimeout(pending));
}
export function getMenuItemElement(item: MenuItem): HTMLElement | null {
	const menuItem = item as unknown as SubmenuMenuItem;
	return menuItem.dom ?? menuItem.domEl ?? null;
}
export function toMenuTitle(value: unknown, fallback = ""): string {
	const text =
		typeof value === "string" ||
		typeof value === "number" ||
		typeof value === "boolean" ||
		typeof value === "bigint"
			? String(value)
			: "";
	const trimmed = text.trim();
	return trimmed.length > 0 ? trimmed : fallback;
}
/**
 * Where to open a picker chosen from a menu item: over the item, which the
 * menu removes as it closes, else at the pointer.
 */
export function menuItemAnchor(item: MenuItem, event: MouseEvent | KeyboardEvent): { x: number; y: number } {
	const rect = getMenuItemElement(item)?.getBoundingClientRect();
	if (rect && (rect.width || rect.height)) return { x: rect.left, y: rect.top };
	if ("clientX" in event && (event.clientX || event.clientY)) return { x: event.clientX, y: event.clientY };
	const selected = activeDocument.querySelector(".menu .menu-item.selected")?.getBoundingClientRect();
	return selected ? { x: selected.left, y: selected.top } : { x: activeWindow.innerWidth / 3, y: activeWindow.innerHeight / 3 };
}
