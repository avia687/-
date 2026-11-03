import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

/** Resolve the data root. Electron passes app.getPath('userData'); dev/tests use env or ~/.autoedit. */
export function resolveDataDir(explicit) {
  const dir = explicit || process.env.AUTOEDIT_DATA || path.join(os.homedir(), '.autoedit');
  for (const sub of ['projects', 'logs', 'cache', 'brand', 'tmp']) {
    fs.mkdirSync(path.join(dir, sub), { recursive: true });
  }
  return dir;
}
