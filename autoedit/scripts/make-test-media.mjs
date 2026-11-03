// Generates a realistic test shoot (10 videos + photos + music) with ffmpeg, for automated tests.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { FFMPEG } from '../engine/ffmpeg.js';

const out = process.argv[2] || 'test-media';
const ff = (args) => execFileSync(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', ...args]);
for (const d of ['talking', 'broll', 'before', 'after', 'music']) fs.mkdirSync(path.join(out, d), { recursive: true });

// Speech-like audio: voiced syllables with natural pauses + one long dead gap.
const speech = (dur, seed) => `aevalsrc='0.35*sin(2*PI*(160+${seed * 7}+30*sin(2*PI*0.7*t))*t)*(0.55+0.45*sin(2*PI*3.3*t))*between(mod(t,${3.2 + seed * 0.3}),0,${2.5 + seed * 0.2})*if(between(t,${dur * 0.5},${dur * 0.5 + 1.6}),0,1)+0.004*(random(0)-0.5)':s=48000:d=${dur}`;
const talk = (name, dur, seed, size = '1080x1920') => ff(['-f', 'lavfi', '-i', `testsrc2=s=${size}:r=30:d=${dur}`, '-f', 'lavfi', '-i', speech(dur, seed),
  '-vf', `hue=h=${seed * 40},drawbox=x=iw*0.3:y=ih*0.25:w=iw*0.4:h=ih*0.3:color=0xF0C8A0@0.9:t=fill`, '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '23', '-c:a', 'aac', '-shortest', path.join(out, 'talking', name)]);
talk('talk_1.mp4', 18, 1);
talk('talk_2.mp4', 14, 2);
talk('talk_3_landscape.mp4', 12, 3, '1920x1080');

const broll = (name, src, dur, extra = []) => ff(['-f', 'lavfi', '-i', src.replace('DUR', dur), '-f', 'lavfi', '-i', `anoisesrc=d=${dur}:c=brown:a=0.02:r=48000`, ...extra, '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '23', '-c:a', 'aac', '-shortest', path.join(out, 'broll', name)]);
broll('broll_city.mp4', 'mandelbrot=s=1920x1080:r=30,trim=duration=DUR', 7);
broll('broll_life.mp4', 'life=s=1080x1920:r=30:mold=10:ratio=0.1:death_color=#202040:life_color=#F0A040,scale=1080:1920,trim=duration=DUR', 6);
broll('broll_cells.mp4', 'cellauto=s=1920x1080:r=30:rule=110,trim=duration=DUR', 6);
broll('broll_gradient.mp4', 'gradients=s=1080x1920:r=30:speed=0.02,trim=duration=DUR', 8);
broll('broll_dark.mp4', 'color=c=black:s=1080x1920:r=30:d=DUR', 4); // unusable: should be skipped
broll('broll_static.mp4', 'testsrc=s=1080x1920:r=30:d=DUR,select=eq(n\\,0),loop=-1:1', 6); // frozen picture
fs.copyFileSync(path.join(out, 'broll', 'broll_city.mp4'), path.join(out, 'broll', 'broll_city_copy.mp4')); // duplicate

ff(['-f', 'lavfi', '-i', 'testsrc2=s=1600x1200', '-frames:v', '1', '-vf', 'eq=brightness=-0.25:saturation=0.4', path.join(out, 'before', 'sofa_before.jpg')]);
ff(['-f', 'lavfi', '-i', 'testsrc2=s=1600x1200', '-frames:v', '1', '-vf', 'eq=brightness=0.05:saturation=1.4', path.join(out, 'after', 'sofa_after.jpg')]);
// 120 BPM beat: kick every 0.5s + hats.
ff(['-f', 'lavfi', '-i', "aevalsrc='0.8*sin(2*PI*(60+90*exp(-30*mod(t,0.5)))*mod(t,0.5))*exp(-9*mod(t,0.5))+0.08*(random(0)-0.5)*exp(-60*mod(t+0.25,0.5))+0.15*sin(2*PI*220*t)*0.3':s=44100:d=40", '-c:a', 'libmp3lame', '-b:a', '160k', path.join(out, 'music', 'track_120bpm.mp3')]);
console.log('test media written to', out);
