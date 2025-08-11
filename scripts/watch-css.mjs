import { watch } from 'fs';
import { spawn } from 'child_process';
import path from 'path';

// Simple debounce helper
function debounce(fn, delay = 150) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), delay);
  };
}

function runBuildCSS() {
  const p = spawn(process.execPath, [path.resolve('build-css.mjs')], { stdio: 'inherit' });
  p.on('exit', (code) => {
    if (code !== 0) {
      // Keep watcher alive but log error
      console.error(`[watch-css] build-css exited with code ${code}`);
    }
  });
}

// Initial build
runBuildCSS();

// Watch styles directory for changes
const stylesDir = path.resolve('styles');

try {
  const onChange = debounce((event, filename) => {
    if (!filename) return;
    if (!filename.toLowerCase().endsWith('.css')) return;
    console.log(`[watch-css] Detected change in ${filename}. Rebuilding styles.css...`);
    runBuildCSS();
  }, 200);

  const watcher = watch(stylesDir, { recursive: true }, (event, filename) => {
    onChange(event, filename);
  });

  process.on('SIGINT', () => {
    watcher.close();
    process.exit(0);
  });

  console.log('[watch-css] Watching styles/**/*.css for changes...');
} catch (err) {
  console.error('[watch-css] Failed to start watcher:', err);
  process.exit(1);
}

