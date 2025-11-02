import fs from 'fs';
import path from 'path';

const RESOURCES_DIR = path.resolve('src/i18n/resources');
const MANIFEST_PATH = path.resolve('i18n.manifest.json');
const STATE_PATH = path.resolve('i18n.state.json');

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

async function loadLocaleModule(locale) {
    const filePath = path.join(RESOURCES_DIR, `${locale}.ts`);
    let content = fs.readFileSync(filePath, 'utf8');
    content = content.replace(/^import\s+.*?;$/gm, '');
    content = content.replace(/export\s+type\s+.*?;$/gm, '');
    content = content.replace(
        new RegExp(`export\\s+const\\s+${locale}\\s*:\\s*\\w+\\s*=\\s*`, 'g'),
        'export default '
    );
    content = content.replace(
        new RegExp(`export\\s+const\\s+${locale}\\s*=\\s*`, 'g'),
        'export default '
    );
    const tempPath = path.join(RESOURCES_DIR, `.${locale}.temp.mjs`);
    fs.writeFileSync(tempPath, content);
    try {
        const absolutePath = path.resolve(tempPath);
        const module = await import(`file://${absolutePath}?v=${Date.now()}`);
        return module.default;
    } finally {
        if (fs.existsSync(tempPath)) {
            fs.unlinkSync(tempPath);
        }
    }
}

async function getLocaleMap(locale) {
    const module = await loadLocaleModule(locale);
    return flatten(module);
}

const locale = process.argv[2];
if (!locale) {
    console.error('Usage: node export-missing.mjs <locale>');
    process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
const state = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
const enMap = await getLocaleMap('en');
const targetMap = await getLocaleMap(locale);

const missing = [];
for (const key in manifest) {
    const entry = state[locale]?.[key];
    if (!entry || !entry.translation) {
        missing.push({ key, value: enMap[key] });
    }
}

console.log(JSON.stringify(missing, null, 2));
