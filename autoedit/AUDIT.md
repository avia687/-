# AutoEdit — Audit, Architecture & Roadmap

## 1. Audit (start state)
No AutoEdit code existed anywhere reachable (this repo held barbershop / FlipAI / BizOS / restaurant apps;
other repos and the Lovable workspace held unrelated projects). Decision (confirmed by owner): build from scratch
in `autoedit/`, Windows first. Nothing existing was modified.

## 2. Architecture
```
Electron shell (electron/main.cjs) ── OS-encrypted secrets, opens window, localhost only
        │
Local server (server/server.js) ── REST + live progress (SSE) + media streaming
        │
Engine (engine/)
  store.js      projects on disk, atomic writes + .bak, autosave, versions, crash recovery
  jobs.js       background queue: real progress, cancel, auto-retry, resume after restart
  ingest.js     files/folders, role hints (broll/music/voice/logo/before/after), HEIC→JPG
  analysis.js   measured: silence, loudness, blur, exposure, motion, scenes, black/frozen, dupes, beats
  transcribe.js speech→words (OpenAI key), fillers/repeats/pauses, cached by fingerprint
  director.js   AI Director → Edit Decision List (every shot has a reason); speech / montage / before-after
  captions.js   RTL/LTR styled captions, word highlight, emphasis, safe zones
  render.js     EDL → one ffmpeg graph: fit, zoom/push, color looks, transitions, voice chain, ducking, SFX, loudness
  sfx.js        sound effects synthesized locally (no licensing risk)
  qc.js         inspects the rendered file; auto-fixes black/frozen/loudness; final score
  nlEdit.js     Hebrew/English requests → typed edit ops (offline); ai.js maps free text with Claude
  instagram.js  official OAuth, real insights only, Content DNA with confidence, coach
UI (ui/) React — Home, Setup, Processing, Review (3 styles, chat edits, versions), Export, Projects, Settings, Onboarding
```

## 3. Status
| Area | State |
|---|---|
| Upload files + folders, project system, autosave, recovery | Working, tested |
| Media analysis + clip scores | Working (all numbers measured) |
| AI Director / EDL / hook / B-roll / motion / transitions / SFX | Working (local rules); Claude used for free-text requests when key set |
| Render, preview → final, export presets (Reel/TikTok/Shorts/YouTube/1080p/4K) | Working |
| QC + auto-fix + final score | Working |
| Captions (Hebrew RTL / English) | Working when a transcription key is set |
| Natural-language editing, 3 versions, undo/redo/restore | Working |
| Music + beat sync + ducking | Working with the user's own music |
| Instagram OAuth / insights / Content DNA / coach | Built; needs a one-time Meta app (not testable without an account) |
| Windows installer | Built by CI (`.github/workflows/autoedit-windows.yml`) |

## 4. Known limits / next phases
1. Face/object detection (face-aware reframing, face-avoiding captions) — not built yet; captions use safe zones.
2. Licensed music/stock library — none bundled (only the user's own files).
3. Pro mode timeline is a read-only view of the edit decisions; direct timeline editing is next.
4. Local (offline) transcription option (Whisper on-device) to remove the API-key dependency.
5. Hardware video encoding (NVENC/QSV) for faster 4K exports.
6. Code signing for the installer (removes the Windows SmartScreen warning).

## 5. Tests
- `npm test` — 36 unit tests (director, NL edits, captions, DNA, store integrity, encryption, render graph).
- `node tests/smoke-engine.mjs <media>` — headless: 10 videos + photos + music → Reel 30s Viral → export.
- `node tests/e2e.mjs <media>` — real browser: onboarding → folder upload → Create → chat edit → undo/redo → export.
