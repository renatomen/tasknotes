import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execSync } from 'child_process';

// --- Configuration ---
const SOURCE_LOCALE = 'en';
const RESOURCES_DIR = path.resolve('src/i18n/resources');
const MANIFEST_PATH = path.resolve('i18n.manifest.json');
const STATE_PATH = path.resolve('i18n.state.json');

// --- Helper Functions ---

/** Flattens a nested translation object into a single-level key-value map. */
function flatten(tree, prefix = '') {
    const entries = {};
    for (const [key, value] of Object.entries(tree)) {
        const fullKey = prefix ? `${prefix}.${key}` : key;
        if (typeof value === 'string') {
            entries[fullKey] = value;
        } else if (value && typeof value === 'object' && !Array.isArray(value)) {
            Object.assign(entries, flatten(value, fullKey));
        }
    }
    return entries;
}

/** Hashes a string using SHA1. */
function hash(str) {
    return crypto.createHash('sha1').update(str, 'utf8').digest('hex');
}

/** Dynamically imports a .ts file by converting it to a temporary .mjs file. */
async function loadLocaleModule(locale) {
    const filePath = path.join(RESOURCES_DIR, `${locale}.ts`);

    if (!fs.existsSync(filePath)) {
        throw new Error(`Locale file not found: ${filePath}`);
    }

    // Read the TypeScript file
    let content = fs.readFileSync(filePath, 'utf8');

    // Remove imports (they won't work in our simple conversion)
    content = content.replace(/^import\s+.*?;$/gm, '');

    // Remove type exports at the end
    content = content.replace(/export\s+type\s+.*?;$/gm, '');

    // Convert TypeScript export to ES module format that Node can import
    // Replace "export const locale = {" with "export default {"
    content = content.replace(
        new RegExp(`export\\s+const\\s+${locale}\\s*:\\s*\\w+\\s*=\\s*`, 'g'),
        'export default '
    );

    // Also handle the case without type annotation
    content = content.replace(
        new RegExp(`export\\s+const\\s+${locale}\\s*=\\s*`, 'g'),
        'export default '
    );

    // Write to temporary .mjs file
    const tempPath = path.join(RESOURCES_DIR, `.${locale}.temp.mjs`);
    fs.writeFileSync(tempPath, content);

    try {
        // Import the temporary file with cache busting - need absolute path with file:// protocol
        const absolutePath = path.resolve(tempPath);
        const module = await import(`file://${absolutePath}?v=${Date.now()}`);
        return module.default;
    } finally {
        // Clean up temporary file
        if (fs.existsSync(tempPath)) {
            fs.unlinkSync(tempPath);
        }
    }
}

/** Loads and flattens a locale file. */
async function getLocaleMap(locale) {
    try {
        const module = await loadLocaleModule(locale);
        return flatten(module);
    } catch (error) {
        console.error(`Error loading locale "${locale}":`, error.message);
        return {};
    }
}

/** Safely reads a JSON file. */
function loadJson(filePath) {
    if (!fs.existsSync(filePath)) return {};
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (error) {
        console.error(`Error parsing JSON file ${filePath}:`, error.message);
        return {};
    }
}

/** Writes a JSON file with standardized formatting. */
function saveJson(filePath, data) {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
}

/** Gets all available locale files. */
function getAvailableLocales() {
    if (!fs.existsSync(RESOURCES_DIR)) {
        console.error(`Resources directory not found: ${RESOURCES_DIR}`);
        return [];
    }

    return fs.readdirSync(RESOURCES_DIR)
        .filter(file => file.endsWith('.ts') && !file.startsWith('.'))
        .map(file => path.basename(file, '.ts'));
}

// --- Commands ---

function normalizeStateEntry(entry) {
    if (!entry) {
        return { source: '', translation: '' };
    }

    if (typeof entry === 'string') {
        return { source: entry, translation: '' };
    }

    if (typeof entry === 'object') {
        return {
            source: entry.source ?? '',
            translation: entry.translation ?? ''
        };
    }

    return { source: '', translation: '' };
}

/** `sync`: Updates manifest and state files. */
async function sync() {
    console.log('Syncing i18n files...');

    // 1. Update Manifest from source locale
    const sourceMap = await getLocaleMap(SOURCE_LOCALE);
    if (Object.keys(sourceMap).length === 0) {
        console.error(`❌ Error: Could not load source locale "${SOURCE_LOCALE}". Check that the file exists and exports valid data.`);
        process.exit(1);
    }

    const newManifest = {};
    for (const key in sourceMap) {
        newManifest[key] = hash(sourceMap[key]);
    }
    saveJson(MANIFEST_PATH, newManifest);
    console.log(`✓ Generated manifest from "${SOURCE_LOCALE}.ts" with ${Object.keys(newManifest).length} keys.`);

    // 2. Update State file for all other locales
    const allLocales = getAvailableLocales();
    const otherLocales = allLocales.filter(l => l !== SOURCE_LOCALE);

    if (otherLocales.length === 0) {
        console.log('ℹ️  No other locale files found. Only manifest updated.');
        return;
    }

    const currentState = loadJson(STATE_PATH);
    const newState = {};

    for (const locale of otherLocales) {
        console.log(`Processing locale: ${locale}`);
        newState[locale] = {};
        const translationMap = await getLocaleMap(locale);

        for (const key in newManifest) {
            const sourceHash = newManifest[key];
            const translatedValue = translationMap[key];

            if (translatedValue === undefined) {
                // Key is missing from translation file
                newState[locale][key] = null;
                continue;
            }

            const translationHash = hash(translatedValue);
            const previousEntry = normalizeStateEntry(currentState[locale]?.[key]);

            let confirmedSource = previousEntry.source;

            if (previousEntry.source === sourceHash) {
                confirmedSource = sourceHash;
            } else if (previousEntry.translation && previousEntry.translation !== translationHash) {
                confirmedSource = sourceHash;
            } else if (!previousEntry.source) {
                confirmedSource = sourceHash;
            }

            newState[locale][key] = {
                source: confirmedSource,
                translation: translationHash
            };
        }
    }
    saveJson(STATE_PATH, newState);
    console.log(`✓ Updated state for locales: ${otherLocales.join(', ')}.`);
    console.log('\nSync complete. Review and commit the updated i18n files.');
}

/** `verify`: Checks for stale or missing translations. */
async function verify() {
    console.log('Verifying i18n status...');
    const manifest = loadJson(MANIFEST_PATH);
    const state = loadJson(STATE_PATH);

    if (Object.keys(manifest).length === 0) {
        console.error('❌ Error: No manifest found. Run "npm run i18n:sync" first.');
        process.exit(1);
    }

    const staleTranslations = [];
    const missingTranslations = [];
    const localeStats = {};

    for (const locale in state) {
        localeStats[locale] = { total: 0, translated: 0, stale: 0 };

        for (const key in manifest) {
            const sourceHash = manifest[key];
            const entry = normalizeStateEntry(state[locale]?.[key]);

            localeStats[locale].total++;

            if (!state[locale]?.[key] || !entry.translation) {
                missingTranslations.push({ locale, key });
            } else if (entry.source !== sourceHash) {
                staleTranslations.push({ locale, key });
                localeStats[locale].stale++;
            } else {
                localeStats[locale].translated++;
            }
        }
    }

    // Print statistics
    console.log('\n📊 Translation Statistics:');
    for (const [locale, stats] of Object.entries(localeStats)) {
        const percentage = Math.round((stats.translated / stats.total) * 100);
        console.log(`  ${locale}: ${stats.translated}/${stats.total} (${percentage}%) up-to-date, ${stats.stale} stale`);
    }

    const hasIssues = staleTranslations.length > 0 || missingTranslations.length > 0;

    if (missingTranslations.length > 0) {
        console.error('\n❌ Missing translations:');
        const byLocale = {};
        missingTranslations.forEach(({ locale, key }) => {
            if (!byLocale[locale]) byLocale[locale] = [];
            byLocale[locale].push(key);
        });

        for (const [locale, keys] of Object.entries(byLocale)) {
            console.error(`  [${locale}] ${keys.length} missing keys:`);
            keys.forEach(key => console.error(`    - ${key}`));
        }
    }

    if (staleTranslations.length > 0) {
        console.error('\n⚠️  Stale translations (source text changed):');
        const byLocale = {};
        staleTranslations.forEach(({ locale, key }) => {
            if (!byLocale[locale]) byLocale[locale] = [];
            byLocale[locale].push(key);
        });

        for (const [locale, keys] of Object.entries(byLocale)) {
            console.error(`  [${locale}] ${keys.length} stale keys:`);
            keys.forEach(key => console.error(`    - ${key}`));
        }
    }

    if (!hasIssues) {
        console.log('\n✅ All translations are up-to-date.');
        process.exit(0);
    } else {
        console.error(`\nPlease update translations and run 'npm run i18n:sync' to mark them as current.`);
        process.exit(1);
    }
}

/** `check-duplicates`: Checks for duplicate keys in translation files */
async function checkDuplicates() {
    console.log('Checking for duplicate translation keys...\n');

    const allLocales = getAvailableLocales();
    let foundDuplicates = false;

    for (const locale of allLocales) {
        console.log(`Checking ${locale}.ts...`);

        const filePath = path.join(RESOURCES_DIR, `${locale}.ts`);
        const content = fs.readFileSync(filePath, 'utf8');

        // Find all string keys in the file (e.g., "key": "value")
        // This regex looks for quoted keys in object notation
        const keyPattern = /["']([a-zA-Z0-9_.]+)["']\s*:/g;
        const keys = [];
        let match;

        while ((match = keyPattern.exec(content)) !== null) {
            keys.push(match[1]);
        }

        // Find duplicates
        const keyCounts = {};
        keys.forEach(key => {
            keyCounts[key] = (keyCounts[key] || 0) + 1;
        });

        const duplicates = Object.entries(keyCounts)
            .filter(([_, count]) => count > 1)
            .map(([key, count]) => ({ key, count }));

        if (duplicates.length > 0) {
            foundDuplicates = true;
            console.log(`  ❌ Found ${duplicates.length} duplicate key(s):`);
            duplicates.forEach(({ key, count }) => {
                console.log(`    - "${key}" appears ${count} times`);
            });
        } else {
            console.log(`  ✅ No duplicates found`);
        }
        console.log('');
    }

    if (foundDuplicates) {
        console.error('\n❌ Duplicate keys found! This will cause issues.');
        console.error('Please remove duplicate keys from the translation files.');
        process.exit(1);
    } else {
        console.log('✅ No duplicate keys found in any locale!');
    }
}

/** `status`: Shows a summary of translation status without failing. */
async function status() {
    console.log('Translation Status Report');
    console.log('========================');

    const manifest = loadJson(MANIFEST_PATH);
    const state = loadJson(STATE_PATH);

    if (Object.keys(manifest).length === 0) {
        console.log('No manifest found. Run "npm run i18n:sync" to generate.');
        return;
    }

    console.log(`Source locale: ${SOURCE_LOCALE}`);
    console.log(`Total keys: ${Object.keys(manifest).length}`);

    if (Object.keys(state).length === 0) {
        console.log('No translation state found. Run "npm run i18n:sync" to generate.');
        return;
    }

    console.log('\nTranslation Coverage:');
    for (const locale in state) {
        let translated = 0;
        let stale = 0;
        const total = Object.keys(manifest).length;

        for (const key in manifest) {
            const sourceHash = manifest[key];
            const entry = normalizeStateEntry(state[locale]?.[key]);

            if (entry.translation) {
                if (entry.source === sourceHash) {
                    translated++;
                } else {
                    stale++;
                }
            }
        }

        const percentage = Math.round((translated / total) * 100);
        const stalePercentage = Math.round((stale / total) * 100);
        console.log(`  ${locale}: ${percentage}% translated, ${stalePercentage}% stale`);
    }
}

/** `find-unused`: Finds translation keys in en.ts that are not used in the source code */
async function findUnused() {
    console.log('Finding unused translation keys...\n');

    const manifest = loadJson(MANIFEST_PATH);

    if (Object.keys(manifest).length === 0) {
        console.error('❌ Error: No manifest found. Run "npm run i18n:sync" first.');
        process.exit(1);
    }

    // Get all keys from manifest
    const allKeys = Object.keys(manifest);

    // Find all translation function calls in the codebase
    const patterns = [
        `rg --no-filename --no-heading --no-line-number '\\bt\\(["\\x27]([^"\\x27]+)["\\x27]\\)' -o -r '\$1' src/`,
        `rg --no-filename --no-heading --no-line-number 'i18n\\.translate\\(["\\x27]([^"\\x27]+)["\\x27]' -o -r '\$1' src/`,
        `rg --no-filename --no-heading --no-line-number 'this\\.t\\(["\\x27]([^"\\x27]+)["\\x27]' -o -r '\$1' src/`,
        `rg --no-filename --no-heading --no-line-number 'this\\.translate\\(["\\x27]([^"\\x27]+)["\\x27]' -o -r '\$1' src/`,
        `rg --no-filename --no-heading --no-line-number '\\btranslate\\(["\\x27]([^"\\x27]+)["\\x27]' -o -r '\$1' src/`
    ];

    const usedKeys = new Set();

    for (const pattern of patterns) {
        try {
            const output = execSync(pattern, { encoding: 'utf8', shell: '/bin/bash' });
            output.trim().split('\n').filter(Boolean).forEach(key => usedKeys.add(key));
        } catch (error) {
            // No matches is fine
        }
    }

    // Find keys in manifest but not used in source
    const unusedKeys = allKeys.filter(key => !usedKeys.has(key));

    console.log(`📊 Statistics:`);
    console.log(`  Total keys in en.ts: ${allKeys.length}`);
    console.log(`  Keys found in source code: ${usedKeys.size}`);
    console.log(`  Potentially unused keys: ${unusedKeys.length}`);
    console.log(`  Coverage: ${Math.round((usedKeys.size / allKeys.length) * 100)}%\n`);

    if (unusedKeys.length > 0) {
        console.log('⚠️  Potentially unused keys (not found in source code):\n');

        // Group by prefix for easier reading
        const grouped = {};
        unusedKeys.forEach(key => {
            const prefix = key.split('.')[0];
            if (!grouped[prefix]) grouped[prefix] = [];
            grouped[prefix].push(key);
        });

        for (const [prefix, keys] of Object.entries(grouped).sort()) {
            console.log(`[${prefix}] ${keys.length} keys:`);
            keys.forEach(key => console.log(`  - ${key}`));
            console.log('');
        }

        console.log('⚠️  Note: These keys might be:');
        console.log('  - Dynamically constructed (e.g., `common.weekdays.${day}`)');
        console.log('  - Used in external files or configurations');
        console.log('  - Reserved for future features');
        console.log('  - Truly unused and can be removed');
        console.log('\nManually review before deleting!');
    } else {
        console.log('✅ All keys in en.ts are used in source code!');
    }
}

/** `check-usage`: Finds translation calls in source code and checks if keys exist in en.ts */
async function checkUsage() {
    console.log('Checking i18n key usage in source code...\n');

    const manifest = loadJson(MANIFEST_PATH);

    if (Object.keys(manifest).length === 0) {
        console.error('❌ Error: No manifest found. Run "npm run i18n:sync" first.');
        process.exit(1);
    }

    // Find all translation function calls in the codebase using ripgrep
    // Matches: t("key"), translate("key"), this.t("key"), this.translate("key"), and plugin.i18n.translate("key")
    let grepOutput1 = '';
    let grepOutput2 = '';
    let grepOutput3 = '';
    let grepOutput4 = '';
    let grepOutput5 = '';

    try {
        // Pattern 1: t("key") - standalone function
        grepOutput1 = execSync(
            `rg --no-filename --no-heading --no-line-number '\\bt\\(["\\x27]([^"\\x27]+)["\\x27]\\)' -o -r '\$1' src/`,
            { encoding: 'utf8', shell: '/bin/bash' }
        );
    } catch (error) {
        if (error.status !== 1) throw error;
        // No matches is fine
    }

    try {
        // Pattern 2: plugin.i18n.translate("key") or i18n.translate("key")
        grepOutput2 = execSync(
            `rg --no-filename --no-heading --no-line-number 'i18n\\.translate\\(["\\x27]([^"\\x27]+)["\\x27]' -o -r '\$1' src/`,
            { encoding: 'utf8', shell: '/bin/bash' }
        );
    } catch (error) {
        if (error.status !== 1) throw error;
        // No matches is fine
    }

    try {
        // Pattern 3: this.t("key")
        grepOutput3 = execSync(
            `rg --no-filename --no-heading --no-line-number 'this\\.t\\(["\\x27]([^"\\x27]+)["\\x27]' -o -r '\$1' src/`,
            { encoding: 'utf8', shell: '/bin/bash' }
        );
    } catch (error) {
        if (error.status !== 1) throw error;
        // No matches is fine
    }

    try {
        // Pattern 4: this.translate("key")
        grepOutput4 = execSync(
            `rg --no-filename --no-heading --no-line-number 'this\\.translate\\(["\\x27]([^"\\x27]+)["\\x27]' -o -r '\$1' src/`,
            { encoding: 'utf8', shell: '/bin/bash' }
        );
    } catch (error) {
        if (error.status !== 1) throw error;
        // No matches is fine
    }

    try {
        // Pattern 5: translate("key") - standalone function (used in settings)
        grepOutput5 = execSync(
            `rg --no-filename --no-heading --no-line-number '\\btranslate\\(["\\x27]([^"\\x27]+)["\\x27]' -o -r '\$1' src/`,
            { encoding: 'utf8', shell: '/bin/bash' }
        );
    } catch (error) {
        if (error.status !== 1) throw error;
        // No matches is fine
    }

    const allMatches = [...grepOutput1.split('\n'), ...grepOutput2.split('\n'), ...grepOutput3.split('\n'), ...grepOutput4.split('\n'), ...grepOutput5.split('\n')].filter(Boolean);

    if (allMatches.length === 0) {
        console.log('✅ No translation function calls found in source code.');
        return;
    }

    const uniqueKeys = [...new Set(allMatches)];

    console.log(`📊 Found ${uniqueKeys.length} unique translation keys in source code\n`);

    const missingKeys = [];

    for (const key of uniqueKeys) {
        if (!manifest[key]) {
            missingKeys.push(key);
        }
    }

    if (missingKeys.length > 0) {
        console.error('❌ Keys used in code but missing from en.ts:\n');
        missingKeys.forEach(key => console.error(`  - ${key}`));
        console.error(`\n${missingKeys.length} missing key(s) found.`);
        console.error('Add these keys to src/i18n/resources/en.ts and run "npm run i18n:sync".');
        process.exit(1);
    } else {
        console.log('✅ All keys used in source code exist in en.ts');
    }
}

// --- Main Execution ---
const command = process.argv[2];

(async () => {
    try {
        if (command === 'sync') {
            await sync();
        } else if (command === 'verify') {
            await verify();
        } else if (command === 'status') {
            await status();
        } else if (command === 'check-usage') {
            await checkUsage();
        } else if (command === 'find-unused') {
            await findUnused();
        } else if (command === 'check-duplicates') {
            await checkDuplicates();
        } else {
            console.error(`Unknown command: ${command}`);
            console.error('Available commands:');
            console.error('  sync             - Update manifest and state files');
            console.error('  verify           - Check for missing or stale translations (fails on issues)');
            console.error('  status           - Show translation status summary (non-failing)');
            console.error('  check-usage      - Find t() calls in code and verify keys exist in en.ts');
            console.error('  find-unused      - Find keys in en.ts that are not used in source code');
            console.error('  check-duplicates - Check for duplicate keys in translation files');
            process.exit(1);
        }
    } catch (error) {
        console.error('❌ Script failed:', error.message);
        if (process.env.NODE_ENV === 'development') {
            console.error(error.stack);
        }
        process.exit(1);
    }
})();
