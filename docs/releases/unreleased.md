# TaskNotes - Unreleased

<!--

**Added** for new features.
**Changed** for changes in existing functionality.
**Deprecated** for soon-to-be removed features.
**Removed** for now removed features.
**Fixed** for any bug fixes.
**Security** in case of vulnerabilities.

Always acknowledge contributors and those who report issues.

Example:

```
## Fixed

- (#768) Fixed calendar view appearing empty in week and day views due to invalid time configuration values
  - Added time validation in settings UI with proper error messages and debouncing
  - Prevents "Cannot read properties of null (reading 'years')" error from FullCalendar
  - Thanks to @userhandle for reporting and help debugging
```

When a change has user-facing documentation, include a canonical tasknotes.dev link:

```
## Added

- Added materialized occurrence notes for recurring tasks. See [Recurring Tasks](https://tasknotes.dev/features/recurring-tasks/#materialized-occurrence-notes) for setup and calendar behavior.
```

-->

> [!info] TaskNotes v5 beta
>
> [TaskNotes v5](https://github.com/callumalpass/tasknotes/releases) is available as an opt-in beta alongside TaskNotes 4.12. TaskNotes 4.12 remains the recommended stable release.
>
> The major change in v5 is support for portable TaskNotes collections. These collections can be used in both Obsidian and the [TaskNotes app](https://app.tasknotes.dev/), which is also available in beta, so the same tasks can be managed through either interface.
>
> TaskNotes collections are built on [mdbase](https://mdbase.dev/), a Markdown-native collection format. [mdbase Connect](https://mdbase.dev/connect/) provides the permissioned bridge that makes those collections available to the TaskNotes app. Your tasks remain ordinary Markdown files in your vault; mdbase adds a shared structure that compatible tools can understand.
>
> TaskNotes v5, mdbase Connect, and the TaskNotes app are all under active development. Please use a backed-up vault, expect some rough edges, and [report any problems you encounter](https://github.com/callumalpass/tasknotes/issues).

## Changed

- Public documentation is now published from the dedicated `tasknotes.dev`
  repository. Plugin release notes and internal documentation remain in this
  repository.
- Updated TaskNotes for Obsidian's current plugin-review and settings-search requirements.

## Fixed

- Kept interface elements in the correct window when TaskNotes views are used in Obsidian pop-out windows.
- Replaced unsafe browser dialogs and runtime HTML/style injection with Obsidian-native controls and packaged styles.
