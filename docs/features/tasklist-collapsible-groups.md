# Feature Design Overview: Collapsible Groups in Task List View

## Goals
- Allow users to collapse/expand each group in Task List View
- Persist collapsed state across sessions per grouping type
- Keep rendering performant and simple (no re-fetch on toggle)
- Maintain accessibility and minimal UI clutter

## UX/Behavior
- Each group header gets a chevron toggle and the group label.
- Clicking the chevron or header toggles collapse/expand.
- If the group header is a project wikilink, clicking the link still navigates; toggle should not hijack the link click.
- Collapsed groups hide only their task list area; the group header remains visible.
- State persists per grouping type (e.g., status, priority, project) so collapsed sets don’t clash across different groupings.

## Data persistence
- Store collapsed state in ViewStateManager view preferences for `TASK_LIST_VIEW_TYPE`.
- Schema:
  - preferencesKey: `TASK_LIST_VIEW_TYPE`
  - value example:
    - {
        "collapsedGroups": {
          "status": { "done": true, "in-progress": true },
          "priority": { "low": true },
          "project": { "[[Alpha]]": true }
        }
      }
  - This isolates collapsed sets per `groupKey` to avoid name collisions.

## Files to change
1. src/views/TaskListView.ts
   - Add private field:
     - `collapsedGroups: Record<string, Record<string, boolean>> = {}`
   - Add helpers:
     - `loadCollapsedPrefs()`: reads `viewStateManager.getViewPreferences(TASK_LIST_VIEW_TYPE)`, initializes `collapsedGroups`
     - `isGroupCollapsed(groupKey: string, groupName: string): boolean`
     - `setGroupCollapsed(groupKey: string, groupName: string, collapsed: boolean)`: updates memory + `viewStateManager.setViewPreferences`
   - Where to call `loadCollapsedPrefs()`:
     - In `createTasksContent` (after `waitForCacheReady()` and before initial `refreshTasks()`)
   - In `renderGroupedTasksWithReconciler()`:
     - Compute collapsed state per group and reflect it in DOM (`is-collapsed` class and hide the task list container)
     - Insert a chevron toggle into the header and wire click handlers on header and button
     - Preserve existing project wikilink behavior; avoid toggling when clicking the link
     - Set ARIA attributes (button with `aria-expanded` and `aria-controls`)

2. styles/task-list-view.css
   - Add styles:
     - `.tasknotes-plugin .task-group-header { display:flex; align-items:center; gap: var(--tn-spacing-xs); cursor: pointer; }`
     - `.tasknotes-plugin .task-group-toggle { display:flex; align-items:center; justify-content:center; width: 20px; height: 20px; border:none; background:transparent; color: var(--tn-text-muted); }`
     - `.tasknotes-plugin .task-group.is-collapsed .task-cards { display: none; }`
     - `.tasknotes-plugin .task-group-toggle .chevron { transition: transform var(--tn-transition-fast); }`
     - `.tasknotes-plugin .task-group.is-collapsed .chevron { transform: rotate(-90deg); }`

## Accessibility
- Toggle button has `aria-controls` pointing to the task list container id
- `aria-expanded` reflects state
- Header remains keyboard accessible; button is primary control

## Pseudocode (key parts)
- Load/save
  - `const prefs = viewStateManager.getViewPreferences(TASK_LIST_VIEW_TYPE) || {}`
  - `this.collapsedGroups = prefs.collapsedGroups || {}`
  - `setGroupCollapsed(k, g, v)`:
    - `this.collapsedGroups[k] = { ...(this.collapsedGroups[k] || {}), [g]: v }`
    - `viewStateManager.setViewPreferences(TASK_LIST_VIEW_TYPE, { ...prefs, collapsedGroups: this.collapsedGroups })`
- Render per group
  - Create header `h3` with a button (chevron) and the label/link.
  - Create the tasks container; if collapsed set `display:none` and add `is-collapsed` class on the group section.
  - Click handler on header (ignore clicks on `<a>`): toggle `is-collapsed`, update display and `aria-expanded`, and persist via `setGroupCollapsed`.

## Edge cases
- Grouping changes: collapsed sets are separated by `groupKey` so no clashes
- New groups appear: default expanded unless previously collapsed
- Empty groups are already skipped by renderer

## Testing approach (TDD-minded)
- Unit-test a small pure helper (or static methods) that merges and persists `collapsedGroups` into preferences:
  - `setGroupCollapsed` persists state correctly and is idempotent
  - `isGroupCollapsed` defaults to false, respects stored booleans
- UI integration/manual acceptance:
  - Toggle a few groups, switch to another grouping, return and confirm states persist
  - Verify link in project header still navigates and does not toggle

## Minimal change footprint
- One view file updated (TaskListView.ts)
- One stylesheet updated (task-list-view.css)
- No changes to services or data models beyond using existing ViewStateManager preferences API
- DOMReconciler usage unchanged

