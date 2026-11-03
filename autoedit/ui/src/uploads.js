// Upload manager that survives screen changes. Two files at a time, real byte progress.
import { uploadFile, SUPPORTED } from './api.js';

const state = {}; // projectId -> { total, done, skipped, current: {name, p}, queue: [] }
const subs = new Set();
const emit = () => subs.forEach((f) => f());

export function subscribeUploads(fn) { subs.add(fn); return () => subs.delete(fn); }
export function uploadState(projectId) { return state[projectId]; }

export function enqueueUploads(projectId, items) {
  const ok = items.filter((x) => SUPPORTED.test(x.file.name) && !x.file.name.startsWith('.'));
  const s = (state[projectId] ||= { total: 0, done: 0, skipped: 0, active: {}, queue: [], running: 0 });
  s.skipped += items.length - ok.length;
  s.total += ok.length;
  s.queue.push(...ok);
  emit();
  pump(projectId);
  return { accepted: ok.length, skipped: items.length - ok.length };
}

async function pump(projectId) {
  const s = state[projectId];
  while (s.running < 2 && s.queue.length) {
    const item = s.queue.shift();
    s.running++;
    const key = item.relPath;
    s.active[key] = 0;
    emit();
    const url = `/api/projects/${projectId}/media?name=${encodeURIComponent(item.file.name)}&relPath=${encodeURIComponent(item.relPath)}`;
    uploadFile(url, item.file, (p) => { s.active[key] = p; emit(); })
      .catch(() => { s.skipped++; })
      .finally(() => {
        delete s.active[key];
        s.running--;
        s.done++;
        if (s.done >= s.total && !s.queue.length && !s.running) setTimeout(() => { if (state[projectId]?.done >= state[projectId]?.total) { delete state[projectId]; emit(); } }, 1500);
        emit();
        pump(projectId);
      });
  }
}
