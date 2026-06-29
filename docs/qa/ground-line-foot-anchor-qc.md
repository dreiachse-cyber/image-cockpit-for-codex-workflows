# Ground Line / Foot Anchor QC

- Branch: `codex/ground-line-foot-anchor-qc`
- Commit: `0197c4f` (implementation and QA evidence commit; final pushed branch head is reported in the completion note)
- Date: 2026-06-29 JST
- Browser URL: `http://127.0.0.1:5275/`
- Viewport: 1280x720, devicePixelRatio 1.5
- Source: `ground-qc-source-basic-young-male-hero.png`

## Implementation Summary

- Added action-aware Animation Generation ground profiles:
  - `grounded-strict`: default grounded actions such as idle, guard, talk, walk.
  - `grounded-soft`: run, attack, ranged, skill, hurt, cheer.
  - `airborne-or-exempt`: jump, knockback, death/downed.
- Added prompt and runner notes that state the expected ground line / foot anchor contract before Codex imagegen runs.
- Normalized direction-split cells around the same footline and then validate foot contact after normalization.
- Added client QA failures/warnings for missing ground contact, foot-anchor drift, and narrow contact widths.
- Extended smoke/ui-smoke/release-audit coverage so the ground-contact band is exercised and remains auditable.

## Ground Profile And Thresholds

- Cell size: 256x256.
- Expected ground line: `round(256 * 0.9) = y=230`.
- Contact band: `y=226..238` (`groundLineY - 4` through `groundLineY + 8`).
- Minimum contact width: 8 px inside the band.
- Strict profile:
  - fail if every frame, or at least half the row, lacks contact.
  - warn if any smaller number of frames lacks contact.
  - warn if the foot anchor is more than 6 px outside the band.
  - fail if the foot anchor is more than 12 px outside the band.
- Soft profile:
  - fail if the row has zero contact frames, or fewer than 2 contact frames.
  - warn if the row has fewer than 3 contact frames.
  - warn if the foot anchor is more than 14 px outside the band.
  - fail if the foot anchor is more than 28 px outside the band.
- Airborne/exempt profile:
  - does not require constant contact.
  - warns only on very large anchor drift, above about 25% of cell height.

## Real Browser Trials

| # | Action | Profile | Winner job | Delivery | Browser screenshot | QC result | Visual result |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | idle | grounded-strict | `codex-job-2026-06-29T09-06-48-745Z-m1qn91` | manifest + five direction PNGs, API `quality=gold`, `stable=true`, UI frames ready | `docs/qa/assets/ground-qc-trial-01-idle-browser.png` | pass: all directions 8/8 contact frames, bottomY 230..230, max distance 0 | pass: stable feet, no visible bounce or sink |
| 2 | guard | grounded-strict | `codex-job-2026-06-29T09-38-08-238Z-mc2wen` | manifest + five direction PNGs, API `quality=gold`, `stable=true`, UI frames ready | `docs/qa/assets/ground-qc-trial-02-guard-browser.png` | pass: all directions 8/8 contact frames, bottomY 237..237 within band, max distance 0 | pass: grounded guard stance, no foot skating |
| 3 | run | grounded-soft | `codex-job-2026-06-29T10-03-02-189Z-8w054h` | manifest + five direction PNGs, API `quality=gold`, `stable=true`, UI frames ready after Vite restart/reload | `docs/qa/assets/ground-qc-trial-03-run-browser.png` | pass: 39/40 contact frames, one back-three-quarter airborne frame at bottomY 220, max distance 6 | pass: readable run cycle; the single lifted frame matches soft-profile airborne allowance |

## QC Detail

All measurements ignore the flat chroma green background and inspect the returned direction PNGs in `codex-handoff/outbox`.

| Trial | Direction | Contact frames | bottomY range | Max distance from band | Contact width median |
| --- | --- | ---: | --- | ---: | ---: |
| idle | front | 8/8 | 230..230 | 0 | 85.0 |
| idle | front three-quarter | 8/8 | 230..230 | 0 | 21.0 |
| idle | side | 8/8 | 230..230 | 0 | 32.0 |
| idle | back three-quarter | 8/8 | 230..230 | 0 | 35.5 |
| idle | back | 8/8 | 230..230 | 0 | 75.0 |
| guard | front | 8/8 | 237..237 | 0 | 119.0 |
| guard | front three-quarter | 8/8 | 237..237 | 0 | 111.5 |
| guard | side | 8/8 | 237..237 | 0 | 107.5 |
| guard | back three-quarter | 8/8 | 237..237 | 0 | 98.0 |
| guard | back | 8/8 | 237..237 | 0 | 94.0 |
| run | front | 8/8 | 229..229 | 0 | 21.0 |
| run | front three-quarter | 8/8 | 229..229 | 0 | 14.5 |
| run | side | 8/8 | 229..229 | 0 | 16.5 |
| run | back three-quarter | 7/8 | 220..229 | 6 | 27.0 |
| run | back | 8/8 | 229..229 | 0 | 22.0 |

## Failed Candidates And Fix Loop

- Trial 2 candidate `codex-job-2026-06-29T09-38-08-247Z-6w461y` failed at runner level. The other two candidates completed, and winner `mc2wen` delivered successfully.
- Trial 3 candidate `codex-job-2026-06-29T10-03-02-170Z-ya4ixd` failed during the later review/import path. Candidates `8w054h` and `w2wted` both produced server-verified gold manifests.
- During trial 3, Vite crashed with `EBUSY` while watching a transient tournament staging file. API and supervisor stayed healthy. I restarted only Vite through `POST /api/dev/restart-vite`, reloaded the browser, and confirmed UI import of `8w054h` with frames ready.
- No code change was needed after the real trial loop; the observed blocker was a dev-server watcher crash, not a ground-line QC failure.

## Verification

- `npm run doctor`: pass.
- `npm run typecheck`: pass.
- `npm test`: pass, 63 tests.
- `npm run build`: pass, existing Vite chunk-size warning only.
- `npm run smoke`: pass.
- `npm run release:audit`: pass.
- `npm run ui:smoke`: pass.
- `git diff --check`: pass.

## Final Judgment

Pass. The implemented QC matched the browser-visible results: two grounded-strict trials (`idle`, `guard`) stayed fully anchored, and one grounded-soft trial (`run`) delivered a stable run cycle with only an expected airborne frame. At least two outputs meet the foot-stability requirement, and all three accepted trials reached final delivery and browser preview.
