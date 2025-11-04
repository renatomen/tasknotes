# i18n-state-manager

i18n-state-manager is a translation management tool developed for TaskNotes and published as an open-source npm package. It addresses a limitation common to most translation tools: the inability to detect when translations become outdated after source text changes.

## Purpose

Traditional translation tools can identify missing translations but cannot determine if existing translations correspond to the current source text. When English text changes from "Save task" to "Save task changes", other languages continue displaying translations of the original text. i18n-state-manager solves this by tracking the relationship between source text and translations using cryptographic hashes.

## How It Works

The tool maintains two files:

**Manifest** (`i18n.manifest.json`)

Contains SHA1 hashes of all source language strings. When source text changes, its hash changes.

**State** (`i18n.state.json`)

Records the source hash each translation was created against. By comparing manifest hashes with state hashes, the tool determines whether translations are current, missing, or stale.

A translation is considered:

- **Current**: Source hash in manifest matches the hash recorded in state
- **Missing**: No translation exists for the key
- **Stale**: Source hash has changed since the translation was created

## Integration with TaskNotes

TaskNotes uses i18n-state-manager to manage translations across seven languages. The tool runs in continuous integration to prevent deployment of incomplete or outdated translations.

Available commands:

- `i18n-state sync` – Update manifest and state files after changing translations
- `i18n-state verify` – Check for missing or stale translations (fails on issues)
- `i18n-state status` – Display translation coverage statistics
- `i18n-state check-usage` – Verify all translation keys used in code exist in source locale
- `i18n-state find-unused` – Identify translation keys not referenced in code
- `i18n-state check-duplicates` – Detect duplicate translation keys
- `i18n-state generate-template` – Create translation file templates with markers for missing or stale entries

Configuration is stored in `i18n-state.config.json`, which defines the source locale, file locations, and patterns for detecting translation function calls in code.

## Requirements

The tool requires Node.js 16 or later. Commands that scan code (`check-usage`, `find-unused`) require ripgrep to be installed.

## Development History

i18n-state-manager was created during TaskNotes development to address translation drift as the codebase evolved. After proving effective for TaskNotes, it was extracted as a standalone tool to benefit other projects facing similar challenges.

## Installation

```bash
npm install -D i18n-state-manager
```

