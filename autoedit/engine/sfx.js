// Sound effects synthesized locally by ffmpeg — AutoEdit owns them, so there is no licensing risk.
import path from 'node:path';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import { runFfmpeg } from './ffmpeg.js';

const RECIPES = {
  // Filtered pink noise with a rising-then-falling low-pass sweep and a stereo swell.
  whoosh: ['-f', 'lavfi', '-i', 'anoisesrc=d=0.7:c=pink:a=0.6:r=48000',
    '-af', "asendcmd=c='0.0 lowpass f 300;0.08 lowpass f 600;0.16 lowpass f 1200;0.24 lowpass f 2600;0.32 lowpass f 4200;0.40 lowpass f 2400;0.50 lowpass f 1000;0.60 lowpass f 500',lowpass=f=300,highpass=f=120,afade=t=in:d=0.32:curve=exp,afade=t=out:st=0.34:d=0.36:curve=qsin,volume=1.6,aformat=channel_layouts=stereo"],
  pop: ['-f', 'lavfi', '-i', "aevalsrc='0.8*sin(2*PI*(900-3000*t)*t)*exp(-38*t)':d=0.14:s=48000", '-af', 'aformat=channel_layouts=stereo'],
  hit: ['-f', 'lavfi', '-i', "aevalsrc='0.9*sin(2*PI*(95-120*t)*t)*exp(-5*t)+0.25*(random(0)*2-1)*exp(-40*t)':d=0.7:s=48000", '-af', 'lowpass=f=2500,aformat=channel_layouts=stereo'],
  click: ['-f', 'lavfi', '-i', "aevalsrc='0.6*sin(2*PI*2400*t)*exp(-120*t)':d=0.05:s=48000", '-af', 'aformat=channel_layouts=stereo'],
  rise: ['-f', 'lavfi', '-i', "aevalsrc='0.35*sin(2*PI*(200*t+400*t*t))*min(1,t/1.2)':d=1.4:s=48000", '-af', 'afade=t=out:st=1.25:d=0.15,aformat=channel_layouts=stereo'],
};
export const SFX_TYPES = Object.keys(RECIPES);

export async function ensureSfx(dir, types, { signal } = {}) {
  const out = {};
  const wanted = [...new Set(types)].filter((t) => RECIPES[t]);
  if (!wanted.length) return out;
  await fsp.mkdir(dir, { recursive: true });
  for (const t of wanted) {
    const file = path.join(dir, `${t}.wav`);
    if (!fs.existsSync(file)) {
      await runFfmpeg([...RECIPES[t], '-c:a', 'pcm_s16le', `${t}.tmp.wav`], { signal, cwd: dir });
      await fsp.rename(path.join(dir, `${t}.tmp.wav`), file);
    }
    out[t] = file;
  }
  return out;
}
