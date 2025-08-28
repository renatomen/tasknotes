import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

// Resolve local override first via env, then scripts/local default
const resolveLocalScript = () => {
  const envPath = process.env.TASKNOTES_COPY_SCRIPT;
  if (envPath && fs.existsSync(envPath)) return envPath;
  const localDefault = path.resolve(process.cwd(), 'scripts/local/copy-files.local.mjs');
  if (fs.existsSync(localDefault)) return localDefault;
  return null;
};

const local = resolveLocalScript();
if (!local) {
  console.log('[copy-files] No local script found; skipping.');
  process.exit(0);
}

try {
  const url = pathToFileURL(local).href;
  const mod = await import(url);
  if (typeof mod.default === 'function') {
    await mod.default();
  } else if (typeof mod.run === 'function') {
    await mod.run();
  } else {
    // Try named export fallback for compatibility
    const maybe = mod?.copyFiles || mod?.main;
    if (typeof maybe === 'function') await maybe();
    else console.log('[copy-files] Loaded local module has no default/run export, nothing to do.');
  }
} catch (err) {
  console.error('[copy-files] Failed to run local script:', err?.message || err);
  process.exit(1);
}

