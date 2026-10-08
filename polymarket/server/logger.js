// Minimal structured logger with levels: debug < info < warn < error.
// Emits `[LEVEL] message {context}` lines. Errors can also be persisted to the
// DB via error_logs (see db/repo.js), but this module stays dependency-free so
// it can be used from anywhere, including before the DB is initialised.
import { config } from './config.js';

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const threshold = LEVELS[config.logLevel] ?? LEVELS.info;

function emit(level, msg, ctx) {
  if (LEVELS[level] < threshold) return;
  const ts = new Date().toISOString();
  let line = `[${level.toUpperCase()}] ${ts} ${msg}`;
  if (ctx && Object.keys(ctx).length) {
    try {
      line += ' ' + JSON.stringify(ctx);
    } catch {
      line += ' [uncontextualizable]';
    }
  }
  const stream = level === 'error' || level === 'warn' ? process.stderr : process.stdout;
  stream.write(line + '\n');
}

export const logger = {
  debug: (msg, ctx) => emit('debug', msg, ctx),
  info: (msg, ctx) => emit('info', msg, ctx),
  warn: (msg, ctx) => emit('warn', msg, ctx),
  error: (msg, ctx) => emit('error', msg, ctx),
};

export default logger;
