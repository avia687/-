// Internal observability: structured JSON-lines log for debugging.
// Never shown raw to the user. Secrets are redacted before writing.
import fs from 'node:fs';
import path from 'node:path';

let logFile = null;
const SECRET_RE = /(sk-[A-Za-z0-9_\-]{8,}|sk-ant-[A-Za-z0-9_\-]{8,}|IG[A-Za-z0-9]{20,}|EAA[A-Za-z0-9]{20,}|access_token=[^&\s"]+)/g;

export function initLog(dir) {
  fs.mkdirSync(dir, { recursive: true });
  logFile = path.join(dir, 'autoedit.log');
  try {
    // Simple rotation: keep the log under ~5MB.
    if (fs.existsSync(logFile) && fs.statSync(logFile).size > 5 * 1024 * 1024) {
      fs.renameSync(logFile, logFile + '.1');
    }
  } catch { /* ignore */ }
}

export function redact(value) {
  return String(value).replace(SECRET_RE, '[redacted]');
}

export function log(level, event, data = {}) {
  const line = redact(JSON.stringify({ t: new Date().toISOString(), level, event, ...data }));
  if (process.env.AUTOEDIT_DEBUG) console.log(line);
  if (!logFile) return;
  try { fs.appendFileSync(logFile, line + '\n'); } catch { /* never crash on logging */ }
}

/** Time an async stage and log its duration + outcome. */
export async function timed(event, data, fn) {
  const start = Date.now();
  try {
    const result = await fn();
    log('info', event, { ...data, ms: Date.now() - start, ok: true });
    return result;
  } catch (err) {
    log('error', event, { ...data, ms: Date.now() - start, ok: false, error: redact(err?.stack || err) });
    throw err;
  }
}
