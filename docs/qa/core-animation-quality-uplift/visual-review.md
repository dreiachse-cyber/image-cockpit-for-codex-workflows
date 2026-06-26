# Core Animation Visual Review

Generated: 2026-06-27T01:23:00+09:00

This phase builds a review surface from the existing real-generation official assets. It does not include new retake generations.

## Review Method

- Checked required official sample sheets and QA folders for all 16 presets.
- Re-read existing mechanical QA and transparency audit.
- Decoded each `public/samples/*-sheet.png` to measure alpha, frame bbox, padding, center drift, bottom anchor drift, and scale drift.
- Built `before-after-gallery.html` for side-by-side future retake comparison. In Phase A the after column is intentionally pending.

## Findings

| preset | score | visual review status | next action |
| --- | ---: | --- | --- |
| `idle-breathing` | 92 | 7 label(s), blockers 0, majors 0 | current sample passes but has padding polish below the preferred 24px contract |
| `walk-cycle` | 98 | 0 label(s), blockers 0, majors 0 | high-value/high-risk core action should get early multi-run stability retake |
| `run-cycle` | 96 | 0 label(s), blockers 0, majors 0 | high-value/high-risk core action should get early multi-run stability retake |
| `basic-attack` | 86 | 6 label(s), blockers 0, majors 0 | high-value/high-risk core action should get early multi-run stability retake; current sample also has padding polish below the preferred 24px contract |
| `hurt-reaction` | 97 | 2 label(s), blockers 0, majors 0 | current sample passes but has padding polish below the preferred 24px contract |
| `death-downed` | 93 | 1 label(s), blockers 0, majors 0 | high-value/high-risk core action should get early multi-run stability retake |
| `spell-cast` | 94 | 1 label(s), blockers 0, majors 0 | high-value/high-risk core action should get early multi-run stability retake |
| `jump-hop` | 88 | 14 label(s), blockers 0, majors 0 | high-value/high-risk core action should get early multi-run stability retake; current sample also has padding polish below the preferred 24px contract |
| `guard-block` | 98 | 0 label(s), blockers 0, majors 0 | keep current for now; run stability gate after higher-risk presets |
| `victory-cheer` | 95 | 4 label(s), blockers 0, majors 0 | keep current for now; run stability gate after higher-risk presets |
| `interact-pickup` | 98 | 0 label(s), blockers 0, majors 0 | keep current for now; run stability gate after higher-risk presets |
| `ranged-attack` | 87 | 8 label(s), blockers 0, majors 0 | high-value/high-risk core action should get early multi-run stability retake; current sample also has padding polish below the preferred 24px contract |
| `skill-release` | 95 | 1 label(s), blockers 0, majors 0 | high-value/high-risk core action should get early multi-run stability retake |
| `knockback` | 94 | 5 label(s), blockers 0, majors 0 | high-value/high-risk core action should get early multi-run stability retake; current sample also has padding polish below the preferred 24px contract |
| `item-use` | 96 | 2 label(s), blockers 0, majors 0 | current sample passes but has padding polish below the preferred 24px contract |
| `talk` | 98 | 0 label(s), blockers 0, majors 0 | keep current for now; run stability gate after higher-risk presets |

## Human Review Checklist

- Open `before-after-gallery.html`.
- Watch five GIFs per preset at normal size.
- Check the sheet at 1x / 2x / 4x.
- For loops, compare frame 8 back to frame 1.
- For non-loops, confirm anticipation, impact or peak, follow-through, and recovery.
- Before any official replacement, add the retake candidate and rerun this script so the scorecard and gallery show both current and candidate assets.
