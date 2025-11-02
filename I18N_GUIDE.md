# Internationalization (i18n) CI/CD System

This project uses an automated CI/CD system to ensure translation consistency and prevent missing translations from being deployed.

## 📋 Overview

The i18n system tracks:
- **Manifest**: Hashes of all English (source) strings
- **State**: Translation status for each locale
- **CI Enforcement**: Automatic verification in GitHub Actions

## 🚀 Quick Start

### For Developers

When you modify English strings in `src/i18n/resources/en.ts`:

```bash
# 1. Edit the English translation file
vim src/i18n/resources/en.ts

# 2. Update the manifest and state files
npm run i18n:sync

# 3. Commit all changes (including generated files)
git add src/i18n/resources/en.ts i18n.manifest.json i18n.state.json
git commit -m "feat: add new translation keys for feature X"
```

### For Translators

To translate strings to another language:

```bash
# 1. Check what needs translation
npm run i18n:verify

# 2. Edit the translation file (e.g., French)
vim src/i18n/resources/fr.ts

# 3. Update state to mark translations as current
npm run i18n:sync

# 4. Commit your changes
git add src/i18n/resources/fr.ts i18n.state.json
git commit -m "feat: add French translations for feature X"
```

## 📜 Available Commands

| Command | Purpose | When to Use |
|---------|---------|-------------|
| `npm run i18n:sync` | Update manifest and state files | After changing ANY translation files |
| `npm run i18n:verify` | Check for missing/stale translations | Before releasing (fails on issues) |
| `npm run i18n:status` | Show translation coverage summary | To check overall progress |
| `npm run i18n:check-usage` | Find translation keys used in code | To verify all keys in code exist in en.ts |
| `npm run i18n:generate-template <locale>` | Generate translation template | Creating/updating translations for a locale |

## 🔍 How It Works

### 1. Manifest File (`i18n.manifest.json`)
Contains SHA1 hashes of all English strings:
```json
{
  "common.appName": "6458145fdd07ad08ff52a2e72d531588936bdca6",
  "common.cancel": "77dfd2135f4db726c47299bb55be26f7f4525a46"
}
```

### 2. State File (`i18n.state.json`)
Tracks translation status for each locale:
```json
{
  "fr": {
    "common.appName": "6458145fdd07ad08ff52a2e72d531588936bdca6",  // ✅ Up-to-date
    "common.cancel": ""                                            // ❌ Missing
  }
}
```

### 3. CI/CD Enforcement
The GitHub Actions workflow automatically:
- Runs `npm run i18n:sync` on every PR/push
- Fails the build if manifest/state files are out of date
- Forces developers to commit synchronized files

## 🔄 Workflow Examples

### Adding a New English String

```bash
# 1. Add to en.ts
export const en = {
  common: {
    newFeature: 'My new feature'  // ← Add this
  }
}

# 2. Sync
npm run i18n:sync
# ✓ Generated manifest from "en.ts" with 1210 keys.
# ✓ Updated state for locales: fr.

# 3. Check status
npm run i18n:status
# fr: 99% translated, 0% stale  (1 new missing key)

# 4. Commit everything
git add src/i18n/resources/en.ts i18n.manifest.json i18n.state.json
git commit -m "feat: add newFeature translation key"
```

### Translating to French

```bash
# 1. See what needs translation
npm run i18n:verify
# ❌ Missing translations:
#   [fr] 1 missing keys:
#     - common.newFeature

# 2. Add French translation
# Edit fr.ts and add: newFeature: 'Ma nouvelle fonctionnalité'

# 3. Mark as current
npm run i18n:sync
# ✓ Updated state for locales: fr.

# 4. Verify completion
npm run i18n:verify
# ✅ All translations are up-to-date.

# 5. Commit
git add src/i18n/resources/fr.ts i18n.state.json
git commit -m "feat: add French translation for newFeature"
```

### When English String Changes

```bash
# 1. Modify existing English string
# Change "My new feature" → "My awesome feature"

# 2. Sync (this marks French as stale)
npm run i18n:sync

# 3. Check status
npm run i18n:verify
# ⚠️  Stale translations (source text changed):
#   [fr] 1 stale keys:
#     - common.newFeature

# 4. Update French translation
# Edit fr.ts: "Ma nouvelle fonctionnalité" → "Ma fonctionnalité géniale"

# 5. Mark as current
npm run i18n:sync

# 6. Commit all changes
git add src/i18n/resources/en.ts src/i18n/resources/fr.ts i18n.manifest.json i18n.state.json
git commit -m "feat: improve newFeature translation"
```

### Verifying Keys Used in Code

```bash
# 1. After adding new features, check if all translation keys exist
npm run i18n:check-usage

# Example output if keys are missing:
# ❌ Keys used in code but missing from en.ts:
#   - modals.newModal.title
#   - modals.newModal.save

# 2. Add missing keys to en.ts
# Edit src/i18n/resources/en.ts

# 3. Sync to update manifest
npm run i18n:sync

# 4. Verify all keys now exist
npm run i18n:check-usage
# ✅ All keys used in source code exist in en.ts

# 5. Optional: Run /translate-missing in Claude Code to auto-translate
# This will translate the new keys to all other locales
```

### Generating Translation Templates

```bash
# Generate a template for an existing locale (preserves existing translations)
npm run i18n:generate-template fr

# Output:
# ✅ Template generated: src/i18n/resources/fr.template.ts
# 📊 Statistics:
#   Total keys: 1540
#   Already translated: 1467
#   Need translation: 73

# The template will have:
# - Up-to-date translations preserved as-is
# - Missing translations marked as "TODO: English text"
# - Stale translations marked as "STALE: old translation" (English changed)

# Search for TODO to find what needs translation
grep "TODO:" src/i18n/resources/fr.template.ts

# Search for STALE to find outdated translations
grep "STALE:" src/i18n/resources/fr.template.ts

# Translate the TODO items, then replace the original file
mv src/i18n/resources/fr.template.ts src/i18n/resources/fr.ts

# Or create a new locale from scratch
npm run i18n:generate-template it
# All values will be "TODO: <English text>"
```

## 🛠️ Technical Details

### File Structure
```
├── scripts/i18n-manager.mjs     # Core management script
├── i18n.manifest.json           # Source string hashes
├── i18n.state.json              # Translation state tracking
├── src/i18n/resources/
│   ├── en.ts                    # English (source) translations
│   └── fr.ts                    # French translations
└── .github/workflows/test.yml   # CI/CD enforcement
```

### Translation Detection Logic

The system considers a translation:
- **Missing**: Key doesn't exist in translation file
- **Untranslated**: Value is identical to English source
- **Stale**: Source hash doesn't match state hash
- **Current**: Source hash matches state hash

### CI/CD Integration

The workflow step in `.github/workflows/test.yml`:
```yaml
- name: Check i18n manifest is up-to-date
  run: |
    npm run i18n:sync
    if [[ -n "$(git status --porcelain)" ]]; then
      echo "❌ Error: i18n files are out of date"
      exit 1
    fi
```

This ensures:
- No untranslated strings slip into production
- Translation state is always tracked
- Developers must explicitly acknowledge translation needs

### 4. Usage Verification (`npm run i18n:check-usage`)

Scans your source code to find all translation function calls and verifies the keys exist in `en.ts`.

**Detected Patterns:**
1. `t("key")` - Standalone function calls
2. `translate("key")` - Function parameter pattern
3. `this.t("key")` - Class method calls
4. `this.translate("key")` - Recommended class pattern
5. `plugin.i18n.translate("key")` - Direct service calls

**Example Output:**
```bash
$ npm run i18n:check-usage

Checking i18n key usage in source code...

📊 Found 1172 unique translation keys in source code

❌ Keys used in code but missing from en.ts:

  - modals.task.newField
  - settings.experimental.feature

2 missing key(s) found.
Add these keys to src/i18n/resources/en.ts and run "npm run i18n:sync".
```

**What it finds:**
- ✅ **~76% of keys** through static analysis
- ✅ All function calls with string literal keys
- ✅ Multi-line translation calls

**What it doesn't find:**
- ❌ Dynamically constructed keys (`` `common.${variable}` ``)
- ❌ Keys stored in variables
- ❌ Unused keys in `en.ts` (use manual review for cleanup)

**Use this to:**
- Catch typos in translation keys before runtime
- Ensure new features have translation keys in `en.ts`
- Identify keys used in code that need to be added to translations

## 🎯 Best Practices

### Translation Management

1. **Always run `npm run i18n:sync`** after modifying translation files
2. **Commit generated files** (`i18n.manifest.json`, `i18n.state.json`) with your changes
3. **Use descriptive keys** like `features.taskList.emptyState` instead of generic ones
4. **Group related translations** using nested objects for better organization
5. **Test locally** with `npm run i18n:verify` before pushing
6. **Run `npm run i18n:check-usage`** periodically to catch missing keys early

### Translation Usage in Code

**Recommended Pattern:** Use `this.translate()` for consistent, type-safe translations

```typescript
class MyComponent {
    private translate: (key: TranslationKey, vars?: Record<string, any>) => string;

    constructor(plugin: TaskNotesPlugin) {
        this.translate = plugin.i18n.translate.bind(plugin.i18n);
    }

    render() {
        // ✅ Recommended: Clear, type-safe, consistent
        return this.translate("modals.task.title");

        // ✅ Also acceptable: For interpolation
        return this.translate("modals.task.count", { count: 5 });
    }
}
```

**Alternative Patterns (also valid):**

```typescript
// For settings/functions where plugin is passed as parameter
function renderSettings(plugin: TaskNotesPlugin) {
    const translate = (key: TranslationKey) => plugin.i18n.translate(key);
    return translate("settings.general.title");
}

// For scoped prefixes (reduces repetition)
function renderCalendarSettings(plugin: TaskNotesPlugin) {
    const t = (key: string) =>
        plugin.i18n.translate(`views.calendar.settings.${key}`);

    return {
        events: t("events.showTasks"),  // → "views.calendar.settings.events.showTasks"
        layout: t("layout.weekStart"),  // → "views.calendar.settings.layout.weekStart"
    };
}
```

**What to Avoid:**

```typescript
// ❌ Avoid: Inconsistent naming (use 'translate' not 't' for main method)
this.t("key")  // Use this.translate() instead

// ❌ Avoid: Direct service calls (verbose, requires plugin reference)
this.plugin.i18n.translate("key")  // Use this.translate() instead
```

**Key Principles:**
- **Consistency**: Stick to one primary pattern (`this.translate()`)
- **Type Safety**: Always use `TranslationKey` type for keys
- **Scoped Helpers**: Use prefix helpers (like `const t = ...`) only when you have many keys with the same prefix
- **Descriptive Keys**: Use `modals.task.created` not `taskCreated`

## 🐛 Troubleshooting

**CI fails with "i18n files are out of date"**
```bash
npm run i18n:sync
git add i18n.manifest.json i18n.state.json
git commit -m "chore: update i18n manifest and state files"
```

**Runtime errors: "Translation key not found"**
```bash
# Find which keys are used in code but missing from en.ts
npm run i18n:check-usage

# Add the missing keys to src/i18n/resources/en.ts
# Then sync
npm run i18n:sync
```

**"Keys used in code but missing from en.ts"**
This means you're calling a translation function with a key that doesn't exist yet:
```typescript
// Your code:
this.translate("modals.newFeature.title")  // ❌ Key doesn't exist

// Solution: Add to src/i18n/resources/en.ts
export const en = {
  modals: {
    newFeature: {
      title: "New Feature Title"  // ✅ Add this
    }
  }
}
```

**"Could not load source locale" error**
- Check that `src/i18n/resources/en.ts` exists and has valid syntax
- Ensure the export follows the pattern: `export const en = { ... }`

**Wrong translation statistics**
- Run `npm run i18n:sync` to recalculate
- Check that translated strings are actually different from English

**Hook not running after editing translation files**
- Check that `.claude/settings.json` exists and contains the post-tool hook
- Verify you're editing files matching `src/i18n/resources/*.ts`
- Try restarting Claude Code CLI

## 📈 Translation Progress

Use these commands to track progress:

```bash
# Quick overview
npm run i18n:status

# Detailed missing/stale report
npm run i18n:verify

# After making changes
npm run i18n:sync

# Check for missing keys in code
npm run i18n:check-usage
```

## 🤖 Claude Code Integration

### Automated Translation with Hooks

The project includes Claude Code hooks that automatically sync translation files when you edit them:

**Location:** `.claude/settings.json`

When you edit any file in `src/i18n/resources/*.ts`, the hook automatically:
1. Runs `npm run i18n:sync` to update manifest and state files
2. Checks if translations are needed and reminds you

**Example workflow:**
```bash
# 1. You edit src/i18n/resources/en.ts
# Hook automatically runs: npm run i18n:sync
# Output:
#   ✓ i18n files synced
#   🌍 Translations needed. Run /translate-missing to update locales.

# 2. Run the slash command to auto-translate
/translate-missing

# 3. All locales are now updated with AI translations
```

### Slash Command: `/translate-missing`

**Location:** `.claude/commands/translate-missing.md`

This command automatically translates all missing and stale keys across all 7 locales (de, es, fr, ja, ru, zh).

**Features:**
- Preserves interpolation syntax (e.g., `{{variable}}`)
- Maintains consistent tone and style with existing translations
- Handles all locales in a single command
- Automatically runs `npm run i18n:sync` after completion

**Usage:**
```bash
# Just run the command - it handles everything
/translate-missing
```

**What it does:**
1. Runs `npm run i18n:verify` to find missing/stale keys
2. Translates each missing key to the target language
3. Updates all locale files
4. Runs `npm run i18n:sync` to mark translations as current
5. Verifies completion with `npm run i18n:verify`

---

This system ensures translation quality and consistency while making the workflow as smooth as possible for both developers and translators.