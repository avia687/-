// Background job system: persistent queue, real progress, cancel, auto-retry, resume after restart.
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { atomicWriteJson, readJsonSafe, newId } from './store.js';
import { CancelledError, friendly } from './errors.js';
import { log } from './log.js';

const MAX_ATTEMPTS = 2;

export class JobQueue extends EventEmitter {
  constructor(dataDir) {
    super();
    this.file = path.join(dataDir, 'jobs.json');
    this.handlers = new Map();
    this.jobs = (readJsonSafe(this.file) || []).filter((j) => Date.now() - Date.parse(j.createdAt) < 7 * 864e5);
    this.running = null;
    this.controllers = new Map();
    this.saveTimer = null;
  }

  register(type, handler) { this.handlers.set(type, handler); }

  /** Re-queue jobs that were interrupted by a crash/close. Call after handlers are registered. */
  resume() {
    for (const j of this.jobs) {
      if (j.status === 'running' || j.status === 'queued') {
        j.status = 'queued';
        j.resumed = true;
        log('info', 'job.resume', { id: j.id, type: j.type });
      }
    }
    this.persist();
    this.tick();
  }

  enqueue(type, projectId, params = {}) {
    // One active job per project+type: replace older queued duplicates.
    for (const j of this.jobs) {
      if (j.projectId === projectId && j.type === type && j.status === 'queued') j.status = 'cancelled';
    }
    const job = { id: newId('j_'), type, projectId, params, status: 'queued', progress: 0, stage: null, attempts: 0, error: null, createdAt: new Date().toISOString() };
    this.jobs.push(job);
    this.persist();
    this.emit('update', job);
    setImmediate(() => this.tick());
    return job;
  }

  get(id) { return this.jobs.find((j) => j.id === id); }
  forProject(projectId) { return this.jobs.filter((j) => j.projectId === projectId); }

  cancel(id) {
    const job = this.get(id);
    if (!job) return false;
    if (job.status === 'queued') { job.status = 'cancelled'; this.persist(); this.emit('update', job); return true; }
    if (job.status === 'running') { this.controllers.get(id)?.abort(); return true; }
    return false;
  }

  retry(id) {
    const job = this.get(id);
    if (!job || !['failed', 'cancelled'].includes(job.status)) return null;
    return this.enqueue(job.type, job.projectId, job.params);
  }

  persist() {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      atomicWriteJson(this.file, this.jobs.slice(-300)).catch((e) => log('error', 'jobs.persist', { error: String(e) }));
    }, 150);
  }

  async tick() {
    if (this.running) return;
    const job = this.jobs.find((j) => j.status === 'queued');
    if (!job) return;
    const handler = this.handlers.get(job.type);
    if (!handler) { job.status = 'failed'; job.error = { code: 'generic', message: 'Unknown job' }; return; }
    this.running = job;
    job.status = 'running';
    job.startedAt = new Date().toISOString();
    const ctrl = new AbortController();
    this.controllers.set(job.id, ctrl);
    this.emit('update', job);
    let lastEmit = 0;
    const ctx = {
      job,
      signal: ctrl.signal,
      attempt: job.attempts,
      /** stage = human-readable step key; progress 0..1 is REAL (measured), never invented. */
      progress: (progress, stage) => {
        if (stage !== undefined && stage !== job.stage) { job.stage = stage; lastEmit = 0; }
        if (progress !== undefined) job.progress = Math.max(0, Math.min(1, progress));
        const now = Date.now();
        if (now - lastEmit > 200) { lastEmit = now; this.emit('update', job); this.persist(); }
      },
    };
    try {
      job.attempts += 1;
      job.result = await handler(ctx);
      job.status = 'done';
      job.progress = 1;
    } catch (err) {
      if (err instanceof CancelledError || ctrl.signal.aborted) {
        job.status = 'cancelled';
      } else if (job.attempts < MAX_ATTEMPTS && err?.retryable !== false && err?.code !== 'noMedia') {
        log('warn', 'job.retry', { id: job.id, type: job.type, error: String(err?.message || err).slice(0, 2000) });
        job.status = 'queued';
        job.retrying = true;
      } else {
        job.status = 'failed';
        job.error = friendly(err);
        log('error', 'job.failed', { id: job.id, type: job.type, error: String(err?.stack || err).slice(0, 4000) });
      }
    } finally {
      job.finishedAt = new Date().toISOString();
      this.controllers.delete(job.id);
      this.running = null;
      this.persist();
      this.emit('update', job);
      setImmediate(() => this.tick());
    }
  }
}
