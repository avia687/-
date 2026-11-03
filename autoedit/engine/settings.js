// App settings + encrypted secrets (API keys, OAuth tokens). Secrets never leave this module in plain form
// except to the engine code that calls the external service.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { atomicWriteJson, readJsonSafe } from './store.js';

export const DEFAULT_SETTINGS = {
  lang: 'he',
  onboardingDone: false,
  mode: 'beginner',
  brand: { name: '', colors: ['#111111', '#ffffff'], logo: null, logoMode: 'off', cta: '', font: 'Heebo', watermark: false },
  export: { defaultPreset: 'reel', folder: null },
  privacy: { sendTranscriptsToAI: true, keepProxies: true },
  flags: { llmDirector: true, captions: true, instagram: true },
  profile: { styles: {}, edits: {} },
};

/** Fallback encryptor (dev / non-Electron): AES-256-GCM with a per-install random key file. */
export function fileKeyCipher(dataDir) {
  const keyFile = path.join(dataDir, '.key');
  if (!fs.existsSync(keyFile)) fs.writeFileSync(keyFile, crypto.randomBytes(32), { mode: 0o600 });
  const key = fs.readFileSync(keyFile);
  return {
    kind: 'aes-file',
    encrypt(text) {
      const iv = crypto.randomBytes(12);
      const c = crypto.createCipheriv('aes-256-gcm', key, iv);
      const enc = Buffer.concat([c.update(text, 'utf8'), c.final()]);
      return Buffer.concat([iv, c.getAuthTag(), enc]).toString('base64');
    },
    decrypt(b64) {
      const buf = Buffer.from(b64, 'base64');
      const d = crypto.createDecipheriv('aes-256-gcm', key, buf.subarray(0, 12));
      d.setAuthTag(buf.subarray(12, 28));
      return Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString('utf8');
    },
  };
}

export class Settings {
  constructor(dataDir, cipher) {
    this.file = path.join(dataDir, 'settings.json');
    this.secretsFile = path.join(dataDir, 'secrets.json');
    this.cipher = cipher || fileKeyCipher(dataDir);
    const saved = readJsonSafe(this.file) || {};
    this.data = deepMerge(structuredClone(DEFAULT_SETTINGS), saved);
    this.secrets = readJsonSafe(this.secretsFile) || {};
  }
  get() { return this.data; }
  async update(patch) {
    this.data = deepMerge(this.data, patch);
    await atomicWriteJson(this.file, this.data);
    return this.data;
  }
  async setSecret(name, value) {
    if (value) this.secrets[name] = this.cipher.encrypt(String(value));
    else delete this.secrets[name];
    await atomicWriteJson(this.secretsFile, this.secrets);
  }
  getSecret(name) {
    const v = this.secrets[name];
    if (!v) return null;
    try { return this.cipher.decrypt(v); } catch { return null; }
  }
  /** What the UI may know: only whether a secret exists, plus a masked hint. */
  secretStatus() {
    const out = {};
    for (const k of Object.keys(this.secrets)) {
      const v = this.getSecret(k);
      out[k] = v ? { set: true, hint: `••••${v.slice(-4)}` } : { set: false };
    }
    return out;
  }
}

function deepMerge(a, b) {
  if (!b || typeof b !== 'object' || Array.isArray(b)) return b === undefined ? a : b;
  const out = { ...(a || {}) };
  for (const [k, v] of Object.entries(b)) {
    out[k] = v && typeof v === 'object' && !Array.isArray(v) ? deepMerge(out[k], v) : v;
  }
  return out;
}
