#!/usr/bin/env bash
# מריץ את כל בדיקות הקבלה. דורש Playwright גלובלי: PW=$(npm root -g)/playwright
set -e
cd "$(dirname "$0")/.."
export PW=${PW:-$(npm root -g)/playwright}
node build.mjs
for t in "regress.cjs web" "regress.cjs artifact" stageC.cjs stageF.cjs stageBA.cjs stageE.cjs stageD.cjs stageG.cjs stageH.cjs; do
  echo "== $t"; node tests/$t | tail -1
done
