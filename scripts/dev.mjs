import { spawn } from 'child_process';
import path from 'path';

const procs = [];

function runNode(script, args = []) {
  const p = spawn(process.execPath, [path.resolve(script), ...args], { stdio: 'inherit' });
  procs.push(p);
  p.on('exit', (code) => {
    if (code !== 0) {
      console.error(`[dev] ${script} exited with code ${code}`);
    }
  });
  return p;
}

// Start watchers in parallel
runNode('scripts/watch-css.mjs');
runNode('esbuild.config.mjs');

process.on('SIGINT', () => {
  for (const p of procs) {
    try { p.kill('SIGINT'); } catch {}
  }
  process.exit(0);
});

console.log('[dev] Started CSS watcher and TS bundler.');

