import type { Menu, MenuItem } from "obsidian";
import { getSubmenu } from "../../../src/components/task-context-menu/helpers";

type FakeMenu = {
	parentMenu?: object;
	currentSubmenu: Menu | null;
	closeSubmenu: jest.Mock;
	openSubmenu: jest.Mock;
};

function createSubmenuParent(menu: FakeMenu) {
	const submenu = {} as Menu;
	const dom = document.createElement("div");
	const item = { setSubmenu: () => submenu, dom, menu } as unknown as MenuItem;
	return { item, submenu, dom };
}

function createMenu(overrides: Partial<FakeMenu> = {}): FakeMenu {
	const menu: FakeMenu = {
		parentMenu: {},
		currentSubmenu: null,
		closeSubmenu: jest.fn(() => {
			menu.currentSubmenu = null;
		}),
		openSubmenu: jest.fn(),
		...overrides,
	};
	return menu;
}

describe("hovering a submenu parent in a nested task menu", () => {
	beforeEach(() => jest.useFakeTimers());
	afterEach(() => jest.useRealTimers());

	it("replaces a sibling's open submenu once the pointer rests on the item", () => {
		const menu = createMenu({ currentSubmenu: {} as Menu });
		const { item, dom } = createSubmenuParent(menu);
		getSubmenu(item);

		dom.dispatchEvent(new Event("pointerenter"));
		jest.advanceTimersByTime(250);

		expect(menu.closeSubmenu).toHaveBeenCalledTimes(1);
		expect(menu.openSubmenu).toHaveBeenCalledWith(item);
	});

	it("keeps the open submenu when the pointer only passes over the item", () => {
		const menu = createMenu({ currentSubmenu: {} as Menu });
		const { item, dom } = createSubmenuParent(menu);
		getSubmenu(item);

		dom.dispatchEvent(new Event("pointerenter"));
		jest.advanceTimersByTime(100);
		dom.dispatchEvent(new Event("pointerleave"));
		jest.advanceTimersByTime(500);

		expect(menu.closeSubmenu).not.toHaveBeenCalled();
		expect(menu.openSubmenu).not.toHaveBeenCalled();
	});

	it("leaves the first hover to Obsidian when no submenu is open yet", () => {
		const menu = createMenu();
		const { item, dom } = createSubmenuParent(menu);
		getSubmenu(item);

		dom.dispatchEvent(new Event("pointerenter"));
		jest.advanceTimersByTime(250);

		expect(menu.closeSubmenu).not.toHaveBeenCalled();
		expect(menu.openSubmenu).not.toHaveBeenCalled();
	});

	it("leaves its own open submenu alone", () => {
		const menu = createMenu();
		const { item, submenu, dom } = createSubmenuParent(menu);
		getSubmenu(item);
		menu.currentSubmenu = submenu;

		dom.dispatchEvent(new Event("pointerenter"));
		jest.advanceTimersByTime(250);

		expect(menu.closeSubmenu).not.toHaveBeenCalled();
		expect(menu.openSubmenu).not.toHaveBeenCalled();
	});

	it("leaves a top-level menu to Obsidian, which already switches there", () => {
		const menu = createMenu({ parentMenu: undefined, currentSubmenu: {} as Menu });
		const { item, dom } = createSubmenuParent(menu);
		getSubmenu(item);

		dom.dispatchEvent(new Event("pointerenter"));
		jest.advanceTimersByTime(250);

		expect(menu.closeSubmenu).not.toHaveBeenCalled();
		expect(menu.openSubmenu).not.toHaveBeenCalled();
	});
});
