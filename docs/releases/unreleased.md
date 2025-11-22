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

-->

## Fixed

- (#1203) Fixed autocomplete dropdown being clipped inside NLP field boundaries
	- Configure CodeMirror tooltips to render in document.body instead of constrained editor container
	- Prevents suggestion dropdown from being hidden when it extends beyond the NLP field height
	- Thanks to @Andrei-Ioda for reporting
- (#1172) Fixed task lists and checkboxes rendering incorrectly in task details editor
	- Remove padding-left override on `.cm-line` to allow CodeMirror decorations (checkboxes, indentation) to render properly
	- Content padding is now handled by `.cm-content` while `.cm-line` uses natural spacing
	- Thanks to @nightroman for reporting
