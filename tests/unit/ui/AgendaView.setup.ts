import { makeContainer } from '../../helpers/dom-helpers';

export function attachAgendaContainer(view: any) {
  // Ensure contentEl exists and has Obsidian helpers
  const contentEl = makeContainer();
  (view as any).contentEl = contentEl as any;
  return contentEl;
}

