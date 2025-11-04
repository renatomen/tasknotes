import { parseLinktext, TFile } from "obsidian";
import { appendInternalLink, type LinkServices } from "../ui/renderers/linkRenderer";

/**
 * Render a group title, converting wiki-links and file paths to clickable links with hover preview.
 * Handles:
 * - [[link]] and [[link|alias]] wiki-link formats
 * - File paths (with or without .md extension)
 * - Regular text
 */
export function renderGroupTitle(
	container: HTMLElement,
	title: string,
	linkServices: LinkServices
): void {
	// Check if the title looks like a wiki-link
	const wikiLinkMatch = title.match(/^\[\[([^\]]+)\]\]$/);

	if (wikiLinkMatch) {
		// Parse wiki-link format: [[path|alias]] or [[path]]
		const linkContent = wikiLinkMatch[1];
		const parsedLink = parseLinktext(linkContent);
		const filePath = parsedLink.path;
		const displayText = parsedLink.subpath
			? `${parsedLink.path}${parsedLink.subpath}`
			: (linkContent.contains('|') ? linkContent.split('|')[1].trim() : parsedLink.path);

		appendInternalLink(container, filePath, displayText, linkServices, {
			cssClass: "internal-link task-group-link",
			hoverSource: "tasknotes-bases-group",
			showErrorNotices: false,
		});
		return;
	}

	// Check if title is a file path (with or without .md extension)
	// Try to resolve it as a file
	const filePathToTry = title.endsWith('.md') ? title.replace(/\.md$/, '') : title;
	const file = linkServices.metadataCache.getFirstLinkpathDest(filePathToTry, '');

	if (file instanceof TFile) {
		// Render as clickable link with the file's basename as display text
		const displayText = file.basename;
		appendInternalLink(container, filePathToTry, displayText, linkServices, {
			cssClass: "internal-link task-group-link",
			hoverSource: "tasknotes-bases-group",
			showErrorNotices: false,
		});
		return;
	}

	// Not a link or file path - render as regular text
	container.textContent = title;
}
