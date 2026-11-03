// Project store: one folder per project, crash-safe atomic JSON writes, autosave, versions.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import { log } from './log.js';

export const SCHEMA_VERSION = 1;

export function newId(prefix = '') {
  return prefix + crypto.randomBytes(6).toString('hex');
}

/** Atomic write: tmp file → fsync → keep .bak of previous → rename. Survives crashes mid-write. */
export async function atomicWriteJson(file, data) {
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  const fh = await fsp.open(tmp, 'w');
  try {
    await fh.writeFile(JSON.stringify(data, null, 1));
    await fh.sync();
  } finally {
    await fh.close();
  }
  if (fs.existsSync(file)) {
    try { await fsp.copyFile(file, file + '.bak'); } catch { /* best effort */ }
  }
  await fsp.rename(tmp, file);
}

export function readJsonSafe(file) {
  for (const candidate of [file, file + '.bak']) {
    try {
      if (fs.existsSync(candidate)) return JSON.parse(fs.readFileSync(candidate, 'utf8'));
    } catch (err) {
      log('warn', 'store.corrupt_json', { file: candidate, error: String(err) });
    }
  }
  return null;
}

export function defaultProject({ name, goal = 'auto', platform = 'instagram', style = 'viral', targetDuration = 30 } = {}) {
  const now = new Date().toISOString();
  return {
    schemaVersion: SCHEMA_VERSION,
    id: newId('p_'),
    name: name || 'Untitled video',
    createdAt: now,
    updatedAt: now,
    goal,
    platform,
    style,
    targetDuration,
    status: 'draft',
    media: [],
    transcripts: {},
    story: null,
    versions: [],
    currentVersionId: null,
    redo: [],
    exportSettings: { preset: 'reel' },
    aiDecisions: [],
    pipeline: null,
    instagramInsights: null,
    preferences: {},
    exports: [],
  };
}

export class ProjectStore extends EventEmitter {
  constructor(dataDir) {
    super();
    this.root = path.join(dataDir, 'projects');
    fs.mkdirSync(this.root, { recursive: true });
    this.cache = new Map();
    this.locks = new Map();
  }

  dir(id) {
    if (!/^p_[a-f0-9]{12}$/.test(id)) throw new Error('bad project id');
    return path.join(this.root, id);
  }
  file(id) { return path.join(this.dir(id), 'project.json'); }

  async create(opts) {
    const p = defaultProject(opts);
    for (const sub of ['media', 'cache', 'renders', 'exports']) {
      await fsp.mkdir(path.join(this.dir(p.id), sub), { recursive: true });
    }
    await atomicWriteJson(this.file(p.id), p);
    this.cache.set(p.id, p);
    this.emit('change', p.id);
    return p;
  }

  get(id) {
    if (this.cache.has(id)) return this.cache.get(id);
    const p = readJsonSafe(this.file(id));
    if (p) this.cache.set(id, p);
    return p;
  }

  list() {
    const out = [];
    for (const name of fs.readdirSync(this.root)) {
      if (!/^p_[a-f0-9]{12}$/.test(name)) continue;
      const p = this.get(name);
      if (p) out.push(p);
    }
    return out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  /** Serialized read-modify-write. fn may mutate the draft and/or return a value. */
  async update(id, fn) {
    const prev = this.locks.get(id) || Promise.resolve();
    let result;
    const next = prev.catch(() => {}).then(async () => {
      const p = this.get(id);
      if (!p) throw new Error('project not found');
      const draft = structuredClone(p);
      result = await fn(draft);
      draft.updatedAt = new Date().toISOString();
      await atomicWriteJson(this.file(id), draft);
      this.cache.set(id, draft);
      this.emit('change', id);
    });
    this.locks.set(id, next);
    await next;
    return result;
  }

  async remove(id) {
    await fsp.rm(this.dir(id), { recursive: true, force: true });
    this.cache.delete(id);
    this.emit('change', id);
  }

  async duplicate(id, newName) {
    const src = this.get(id);
    if (!src) throw new Error('project not found');
    const copy = structuredClone(src);
    copy.id = newId('p_');
    copy.name = newName || `${src.name} (copy)`;
    copy.createdAt = copy.updatedAt = new Date().toISOString();
    copy.pipeline = null;
    if (copy.status !== 'ready') copy.status = copy.media.length ? 'draft' : 'draft';
    await fsp.cp(this.dir(id), this.dir(copy.id), { recursive: true });
    await atomicWriteJson(this.file(copy.id), copy);
    this.cache.set(copy.id, copy);
    this.emit('change', copy.id);
    return copy;
  }

  /** Absolute path for a project-relative path, refusing escapes. */
  resolve(id, rel) {
    const base = this.dir(id);
    const abs = path.resolve(base, rel);
    if (!abs.startsWith(base + path.sep)) throw new Error('path escape');
    return abs;
  }
}
