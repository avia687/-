---
name: shorts-analysis
description: Analyze why a YouTube Short succeeds or fails, and give concrete improvements for the user's engraving/gift videos (@gentleman.originals). Use when the user sends a youtube.com/shorts link or asks to analyze a video.
---

# Shorts analysis

Answer in Hebrew, short, most useful info first.

## 1. Get the data
Run `python3 -I .claude/skills/shorts-analysis/fetch.py <url>`.
- Requires `youtube.com` / `www.youtube.com` in the environment's allowed domains.
- yt-dlp is blocked by YouTube's bot check, so the video itself can't be downloaded. Only public stats are available. For edit analysis (hook, cuts, pacing), ask the user to upload the file.

## 2. Benchmarks (from analyzed videos)
| Metric | Weak | Good |
|---|---|---|
| Likes / views | < 1.5% | 2–5% |
| Comments / views | — | viral videos are often only 0.005–0.01%; comments are not what drives reach |

Driver of reach = watch-through (retention), not comments.

## 3. Checklist
1. **Title creates a question** that is answered only at the end ("How did they film...?", "What happens if...?").
2. **Understood without language** (visual result) → global reach.
3. **Number/extreme in title** ("$10,000", "3 seconds").
4. **Result/reaction in the first second**, then the process.
5. **Not an ad**: story first, product in the background.
6. No list of hashtags as the title; 1–2 in the description.

## 4. Output
Stats table → why it works / doesn't (3 bullets) → 3 concrete changes for the user's next engraving/gift Short.

## Log of analyzed videos
| Channel | Title | Views | Likes % | Lesson |
|---|---|---|---|---|
| @gentleman.originals (user) | הפתעה לאמא + 6 hashtags | 263K / 3 days | 1.3% | Good topic, weak title, feels like an ad |
| @zackdfilms | How They Filmed An Invisible Man In Snow 🤔 | 30.9M / 13 days | 2.2% | Curiosity question title |
| @Mrwhosetheboss | $10,000 Power Washer vs Fruit | 50.1M / ~4 months | 2.3% | "X vs Y" + price + visual payoff |

Append each new analyzed video to this log.
