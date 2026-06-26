# Core Animation Quality Uplift - Phase A Audit

Generated: 2026-06-27T01:23:00+09:00

This folder is the first quality uplift loop for the 16 official core animation presets. It does not replace official sample PNG/GIF files, prompt contracts in `src/App.tsx`, or the Animation selection modal.

## Summary

- Presets inventoried: 16
- Current official sample replacements in this branch: 0
- Scores >= 85 with no blocker: 16 / 16
- Blocker issues: 0
- Major issues: 0
- Prompt stability gate: pending for every preset. Current samples are real generations, but this phase did not run the required 5-attempt stability loop.

## Generated Files

- `core-animation-inventory.json`
- `core-animation-issues.json`
- `issues-by-preset.md`
- `core-animation-scorecard.json`
- `scorecard.md`
- `retake-log.json`
- `before-after-gallery.html`
- `visual-review.md`
- `prompts/<preset-id>.md`

## Retake Priority

| rank | preset | score | decision | reason |
| ---: | --- | ---: | --- | --- |
| 1 | `jump-hop` | 88 | needs-retake | high-value/high-risk core action should get early multi-run stability retake; current sample also has padding polish below the preferred 24px contract |
| 2 | `basic-attack` | 86 | needs-retake | high-value/high-risk core action should get early multi-run stability retake; current sample also has padding polish below the preferred 24px contract |
| 3 | `ranged-attack` | 87 | needs-retake | high-value/high-risk core action should get early multi-run stability retake; current sample also has padding polish below the preferred 24px contract |
| 4 | `death-downed` | 93 | needs-retake | high-value/high-risk core action should get early multi-run stability retake |
| 5 | `run-cycle` | 96 | needs-retake | high-value/high-risk core action should get early multi-run stability retake |
| 6 | `skill-release` | 95 | needs-retake | high-value/high-risk core action should get early multi-run stability retake |
| 7 | `knockback` | 94 | needs-retake | high-value/high-risk core action should get early multi-run stability retake; current sample also has padding polish below the preferred 24px contract |
| 8 | `walk-cycle` | 98 | needs-retake | high-value/high-risk core action should get early multi-run stability retake |

## Gate

This is confirmation-gated work. Future changes that replace `public/samples/*-sheet.png`, official prompt contracts, or the UI-selected official animation assets must return to ご主人 before main merge.
