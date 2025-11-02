#!/usr/bin/env node

/**
 * Refactors translation function calls to use consistent patterns:
 *
 * Goal: Standardize on two patterns:
 * 1. `this.translate()` for all class methods
 * 2. Scoped helpers like `const t = (key) => plugin.i18n.translate(\`prefix.${key}\`)` for specific contexts
 *
 * Transformations:
 * - `this.t("key")` → `this.translate("key")`
 * - Keeps: `this.translate()`, standalone `translate()`, and scoped `t()` helpers
 *
 * Run with: node scripts/refactor-i18n-calls.mjs [--dry-run]
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const DRY_RUN = process.argv.includes('--dry-run');
const SRC_DIR = 'src';

console.log('🔄 i18n Translation Call Refactoring');
console.log('=====================================');
console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no changes will be made)' : 'LIVE (files will be modified)'}`);
console.log('');

// Statistics
let stats = {
    filesScanned: 0,
    filesModified: 0,
    transformations: {
        'this.t() → this.translate()': 0,
    }
};

/**
 * Find all TypeScript files that might contain translation calls
 */
function findTypeScriptFiles() {
    try {
        const output = execSync(
            `find ${SRC_DIR} -type f -name "*.ts" ! -path "*/i18n/resources/*"`,
            { encoding: 'utf8' }
        );
        return output.trim().split('\n').filter(Boolean);
    } catch (error) {
        console.error('Error finding TypeScript files:', error.message);
        return [];
    }
}

/**
 * Check if a file contains `this.t(` calls
 */
function fileContainsThisT(content) {
    return /this\.t\(/.test(content);
}

/**
 * Refactor `this.t(` to `this.translate(`
 * Only transforms if it's clearly a method call pattern
 */
function refactorThisT(content) {
    let modified = content;
    let transformCount = 0;

    // Pattern: this.t("key") or this.t('key') or this.t(`key`)
    // Captures the opening quote/backtick, the key, and the closing quote/backtick
    const pattern = /\bthis\.t\((["`'])([^"`']+)\1/g;

    modified = modified.replace(pattern, (match, quote, key) => {
        transformCount++;
        return `this.translate(${quote}${key}${quote}`;
    });

    // Also handle multi-line cases with parameters
    // this.t("key", { param: value })
    const multiLinePattern = /\bthis\.t\(/g;

    if (multiLinePattern.test(modified)) {
        // More conservative replacement for complex cases
        modified = modified.replace(/\bthis\.t\(/g, (match) => {
            transformCount++;
            return 'this.translate(';
        });
    }

    return { modified, transformCount };
}

/**
 * Update the property definition from `private t:` to `private translate:`
 */
function refactorPropertyDefinition(content) {
    let modified = content;
    let transformCount = 0;

    // Pattern: private t: (key: TranslationKey...
    // or: private t = (key: TranslationKey...
    const propertyPattern = /private\s+t\s*:\s*\(key:\s*TranslationKey/g;

    modified = modified.replace(propertyPattern, (match) => {
        transformCount++;
        return 'private translate: (key: TranslationKey';
    });

    return { modified, transformCount };
}

/**
 * Process a single file
 */
function processFile(filePath) {
    stats.filesScanned++;

    const content = fs.readFileSync(filePath, 'utf8');

    // Skip if file doesn't contain this.t(
    if (!fileContainsThisT(content)) {
        return;
    }

    let modified = content;
    let totalTransforms = 0;

    // Transform this.t() calls
    const result1 = refactorThisT(modified);
    modified = result1.modified;
    totalTransforms += result1.transformCount;

    // Transform property definitions
    const result2 = refactorPropertyDefinition(modified);
    modified = result2.modified;
    totalTransforms += result2.transformCount;

    if (totalTransforms === 0) {
        return;
    }

    stats.filesModified++;
    stats.transformations['this.t() → this.translate()'] += totalTransforms;

    console.log(`📝 ${filePath}: ${totalTransforms} transformation(s)`);

    if (!DRY_RUN) {
        fs.writeFileSync(filePath, modified, 'utf8');
    }
}

/**
 * Main execution
 */
function main() {
    console.log('🔍 Scanning for TypeScript files...\n');

    const files = findTypeScriptFiles();
    console.log(`Found ${files.length} TypeScript files to scan\n`);

    for (const file of files) {
        try {
            processFile(file);
        } catch (error) {
            console.error(`❌ Error processing ${file}:`, error.message);
        }
    }

    console.log('\n✅ Refactoring Complete!');
    console.log('========================');
    console.log(`Files scanned: ${stats.filesScanned}`);
    console.log(`Files modified: ${stats.filesModified}`);
    console.log('\nTransformations:');
    for (const [type, count] of Object.entries(stats.transformations)) {
        console.log(`  ${type}: ${count}`);
    }

    if (DRY_RUN) {
        console.log('\n⚠️  DRY RUN MODE - No files were actually modified');
        console.log('Run without --dry-run to apply changes');
    } else {
        console.log('\n📋 Next steps:');
        console.log('  1. Review changes: git diff');
        console.log('  2. Run tests: npm test');
        console.log('  3. Run type check: npm run typecheck');
        console.log('  4. If all looks good: git add . && git commit -m "refactor: standardize translation function calls to this.translate()"');
    }
}

// Run the script
main();
