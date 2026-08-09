import fs from "fs";
import path from "path";

function readRepoFile(relativePath: string): string {
	return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

function extractCssBlock(css: string, selector: string): string {
	const index = css.indexOf(selector);
	if (index === -1) {
		return "";
	}

	const blockStart = css.indexOf("{", index);
	if (blockStart === -1) {
		return "";
	}

	let depth = 0;
	for (let i = blockStart; i < css.length; i += 1) {
		if (css[i] === "{") {
			depth += 1;
		} else if (css[i] === "}") {
			depth -= 1;
			if (depth === 0) {
				return css.slice(blockStart + 1, i);
			}
		}
	}

	return "";
}

describe("Issue #2212: settings layout in Obsidian settings modal", () => {
	it("keeps TaskNotes settings from inheriting the centered Obsidian settings-page padding", () => {
		const css = readRepoFile("styles/settings-view.css");

		const rootBlock = extractCssBlock(
			css,
			"body:not(.is-mobile) .modal.mod-settings .tasknotes-settings.vertical-tab-content"
		);

		expect(rootBlock).toContain("padding-inline: var(--size-4-8);");
		expect(rootBlock).toContain("box-sizing: border-box;");
	});

	it("left-aligns native SettingGroup sections beneath the TaskNotes tab bar", () => {
		const css = readRepoFile("styles/settings-view.css");

		const groupBlock = extractCssBlock(
			css,
			"body:not(.is-mobile) .modal.mod-settings .tasknotes-settings .settings-view__tab-content > .setting-group"
		);

		expect(groupBlock).toContain("margin-inline: 0;");
	});
});
