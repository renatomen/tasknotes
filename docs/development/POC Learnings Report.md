## Purpose and Scope

This document summarizes a proof of concept exploring integration between TaskNotes and Obsidian Bases. It covers work since commit a09f64bc6fbb0de19299e49508f0fcad9a0910dc (inclusive), focusing on:
- Objectives and rationale
- Architecture and integration strategy
- Implemented features across custom Bases views
- How data access/querying is delegated to Bases
- Layout customization (grouping, sorting, Task Card content)
- Learnings, opportunities, and risks ahead of a production implementation once official Bases APIs are available

Audience: developers considering a production version of this integration.

---

## Objectives

- Validate feasibility of TaskNotes views as first-class “custom views” inside Obsidian Bases:
  - Task List, Kanban, Agenda variants rendered within Bases panes
- Delegate data access and query semantics to Bases:
  - Use Bases’ native filtering/syntax to define the dataset
  - Consume the filtered result in TaskNotes rendering
- Assess how well Bases syntax and configuration can drive advanced UI composition:
  - Grouping, sorting, and search within the view
  - Customization of Task Card content/labels based on Bases-selected properties

---

## Architecture Overview

### High-level design
- Registration layer in TaskNotes registers Bases view factories when the experimental flag is enabled (enableBasesPOC).
- Each view has a factory that wires dependencies (DI-friendly) and returns a Bases-compatible view instance.
- Data delegation: the Bases view passes selected rows/items and configuration (filter, groupBy, sort, YAML opts) to TaskNotes components. TaskNotes does not fetch tasks itself for Bases panes.
- Presentation layer reuses TaskNotes UI:
  - Shared TaskCard component extended to consume Bases-driven label/suffix overrides and extra properties
  - Grouping/collapse model reuses GroupingUtils and persistent view-state mechanisms
  - Search is in-memory and scoped to rows provided by Bases

### Key modules (by concern)
- Registration
  - src/bases/registration.ts: Registers views with Bases: Task List, Kanban, Agenda
- View composition
  - src/bases/view-factory.ts: Task List factory, top controls (expand/collapse all), search
  - src/bases/kanban-view.ts: Kanban factory (grouped columns, DnD hooks)
  - src/bases/agenda-view.ts: Agenda factory (date-grouped sections with persisted collapse)
- Data helpers
  - src/bases/helpers.ts: Item-to-TaskInfo conversion, identification helpers
  - src/bases/group-by.ts: Normalize Bases groupBy config and drive grouping
  - src/bases/group-ordering.ts: Group header ordering driven by sort keys
  - src/bases/sorting.ts: getBasesSortComparator and coercion helpers for sorting
  - src/bases/search.ts: buildSearchIndex, filterTasksBySearch
- Shared UI adaptation
  - src/ui/TaskCard.ts: Extra rows and Bases label/suffix overrides
- Tests
  - tests/unit/bases/*.test.ts: grouping, sorting, search, factories, overrides
  - tests/unit/ui/TaskCard.bases-overrides.test.ts

---

## What Was Achieved

1. Feature-flagged Bases integration scaffold
   - Toggle enableBasesPOC adds new Bases-compatible views without impacting existing TaskNotes views.
   - Registers “TaskNotes Task List”, “TaskNotes Kanban”, and “TaskNotes Agenda” as Bases views.

2. Data delegation to Bases
   - Views accept items/rows and configuration from Bases rather than running TaskNotes’ own queries.
   - Sorting and grouping derive from Bases configuration (not TaskNotes filters).

3. Views implemented inside Bases
   - Task List
     - Group by Bases groupBy with persisted collapse state; expand/collapse all controls
     - Apply Bases sort to flat and grouped listings; group headers ordered by first sort key
     - Debounced in-memory search across path/title/aliases
   - Kanban
     - Column grouping driven by Bases groupBy
     - Drag-and-drop reordering hooks (status updates), sorting within columns per Bases sort
     - Search integration
   - Agenda
     - Date-grouped sections aligned with native Agenda design
     - Period-based ranges via Bases YAML (e.g., tasknotes.agenda.period, “week” handling)
     - Persisted collapse per day; unified search

4. Task Card customization via Bases-selected properties
   - Per-field label overrides and custom separators/suffixes via tokens parsed in bases/tasklist-rows.ts
   - Ability to suppress labels entirely and compose “extraPropertiesRows” specific to Bases views
   - Unit tests cover parser and rendering logic

5. State and UX parity with native TaskNotes
   - Chevron styles, collapse persistence, group controls aligned with existing Task List and Agenda patterns
   - Minimal duplication: reuses existing TaskNotes components and state management where feasible

---

## How Data Delegation Works

- Responsibility split:
  - Bases: data selection/filtering via Bases syntax and UI; groupBy, sort config, and YAML options attached to the view
  - TaskNotes: pure rendering and local interactions (group toggle, expand/collapse all, in-memory search, DnD column moves)
- Conversions:
  - Bases rows -> TaskInfo via createTaskInfoFromBasesData/identifyTaskNotesFromBasesData
- Sorting and grouping:
  - getBasesSortComparator applies Bases sort keys/types for item ordering
  - getBasesGroupByConfig normalizes scalar/array groupBy and provides “none” fallback
  - group headers ordered by first Bases sort key (direction-aware), else alphabetical
- Search:
  - buildSearchIndex/filterTasksBySearch run in-memory, scoped to provided items
- Agenda specifics:
  - Bases YAML option tasknotes.agenda.period and selectedDate/firstDay drive day range and grouping
  - Uses FilterService.getTasksForDate as a resilience fallback when dates are ambiguous

---

## Layout Customization and Card Content

- Bases can define which properties are displayed as extra Task Card rows
- Per-field overrides include:
  - tnLabel: override or hide label
  - tnSeparator: customize value suffix/separator
- MVP supports label toggles/suffixes without complex formatting; keeps code paths simple and testable
- Consistent “expand/collapse all”, chevrons, and count displays as in TaskNotes’ native views

---

## Learnings

- Feasibility
  - Embedding TaskNotes views inside Bases is viable with a light registration bridge and dependency injection.
  - Reusing TaskNotes’ UI components is effective; minimal duplication needed.
- Config-driven composition
  - Bases’ groupBy and sort can be mapped cleanly to TaskNotes grouping and comparators.
  - Agenda alignment requires additional YAML options; once normalized, parity is attainable.
- UX parity and persistence
  - Persisted collapse states and search integrate smoothly; users get familiar TaskNotes behaviors inside Bases.
- Extensibility
  - The parser for Bases-driven Task Card overrides offers a flexible path toward richer formatting later.

---

## Opportunities

- API alignment with official Bases APIs
  - Replace proof-of-concept typings with official interfaces
  - First-class events for DnD updates, selection changes, and view lifecycle hooks
- Declarative layout model
  - Expand overrides to support more formatting tokens (e.g., date formats, list joiners, conditional visibility)
  - Introduce per-group header formatting and aggregate badges
- Performance
  - Shared search index across panes; incremental updates from Bases change events
  - Virtualized lists/columns for large datasets
- Advanced grouping/sorting
  - Multi-level grouping, custom order definitions, pinned groups/columns
  - Type-aware comparators where Bases doesn’t provide them
- Interop
  - Cross-navigation: click-to-open Bases row, bidirectional selection sync
  - Saved views that bundle Bases filters with TaskNotes display presets

---

## Risks

- API instability
  - Current POC relies on inferred or provisional interfaces; breaking changes likely when official APIs ship.
- Responsibility boundaries
  - Clear contracts needed: what TaskNotes expects (shape of rows, events) vs what Bases guarantees.
- Data coherence
  - DnD or edits that update task state must round-trip cleanly to Bases; race conditions if events are not transactional.
- Performance for large vaults
  - In-memory search and non-virtualized rendering could degrade; must profile and optimize with real APIs.
- UX divergence
  - If Bases enforces controls that differ from TaskNotes, we’ll need a unified UX plan to avoid inconsistency.

---

## Suggested next steps for a production track

1. API contract
   - Draft TS interfaces for Bases view registration, row shape, events; validate with upcoming official APIs.
2. Hardening and tests
   - Expand unit/integration tests for DnD round-trips, selection synchronization, and agenda range edge cases.
3. Performance plan
   - Introduce virtualization and shared indexes; benchmark with 10k+ tasks.
4. Layout DSL evolution
   - Extend overrides to support conditional rendering, date/value formatting, and per-group templates.
5. Migration and fallback
   - Graceful disable when Bases is not installed; feature flag remains off by default until APIs stabilize.

---

## Appendix: Implemented features by commit (highlights)

- a09f64b: Bases Kanban view with grouping, DnD, search
- 7b3a4d4: Bases Agenda view with date grouping, search, collapse persistence
- 4b28662: Agenda alignment with native period-based ranges via YAML
- 26b675e: Initial Task List view and registration scaffolding; feature flag
- 09bf70f: groupBy normalization and integration; chevron parity; tests
- c0697c3: Bases sort applied to flat/grouped views; group header ordering
- ac1840b: Expand/Collapse All controls for groups
- f100faf: Debounced in-memory search for Task List
- 2386300: Task Card label/suffix overrides for Bases; parser+UI+tests

If you want, I can export this into a docs/development POC report or add a short README section.
