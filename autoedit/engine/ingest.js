// Media ingestion: accepts files and whole folders, classifies them, converts HEIC.
import path from 'node:path';
import fsp from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

export const EXT = {
  video: ['mp4', 'mov', 'avi', 'webm', 'mkv', 'm4v', '3gp', 'mts', 'm2ts'],
  audio: ['mp3', 'wav', 'm4a', 'aac', 'flac', 'ogg', 'opus'],
  image: ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'],
};

export function kindOf(name) {
  const ext = path.extname(name).slice(1).toLowerCase();
  for (const [kind, list] of Object.entries(EXT)) if (list.includes(ext)) return kind;
  return null;
}

const ROLE_HINTS = [
  { role: 'broll', re: /(^|[\/_\-\s])(b[\s_\-]?roll|broll|cutaway|insert|פוטג|בירול)/i },
  { role: 'music', re: /(^|[\/_\-\s])(music|song|track|bgm|מוזיקה|שיר)/i },
  { role: 'voice', re: /(^|[\/_\-\s])(voice|vo|voiceover|narration|קריינות|קול)([\/_\-\s.]|$)/i },
  { role: 'logo', re: /(^|[\/_\-\s])(logo|לוגו)/i },
  { role: 'aroll', re: /(^|[\/_\-\s])(a[\s_\-]?roll|aroll|talk|interview|camera1|cam1|ראיון)/i },
];

/** Role from folder/file names. Video roles may later be refined by analysis (speech → A-roll). */
export function roleHint(relPath, kind) {
  for (const { role, re } of ROLE_HINTS) if (re.test(relPath)) {
    if (role === 'music' && kind !== 'audio') continue;
    if (role === 'logo' && kind !== 'image') continue;
    return role;
  }
  if (kind === 'audio') return 'music';
  if (kind === 'image') return 'image';
  return null; // decided after analysis
}

/** Before/after hints are common for service businesses (cleaning, beauty, renovation). */
export function sequenceHint(relPath) {
  if (/(before|לפני)/i.test(relPath)) return 'before';
  if (/(after|אחרי|result|תוצאה)/i.test(relPath)) return 'after';
  return null;
}

export function safeFileName(name) {
  const base = path.basename(name).replace(/[^\p{L}\p{N}._\- ]+/gu, '_').slice(0, 120);
  return base || 'file';
}

/** HEIC/HEIF photos (iPhone) → JPG, since ffmpeg/Chromium can't read them reliably. */
export async function convertHeicIfNeeded(absPath) {
  const ext = path.extname(absPath).toLowerCase();
  if (ext !== '.heic' && ext !== '.heif') return absPath;
  const convert = require('heic-convert');
  const input = await fsp.readFile(absPath);
  const output = await convert({ buffer: input, format: 'JPEG', quality: 0.92 });
  const out = absPath.replace(/\.(heic|heif)$/i, '.jpg');
  await fsp.writeFile(out, Buffer.from(output));
  await fsp.rm(absPath, { force: true });
  return out;
}
