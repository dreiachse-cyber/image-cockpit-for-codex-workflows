# Animation Tournament 2 Candidates - slot3 QA

Date: 2026-06-28 JST
Branch: `codex/animation-tournament-two-candidates`
URL: `http://localhost:5203/`
API: `http://127.0.0.1:8803/api/health`

## Static Checks

- `npm run doctor`: pass
- `npm run typecheck`: pass
- `npm test`: pass, 56 tests
- `npm run build`: pass, existing Vite chunk-size warning only
- `npm run smoke`: pass
- `npm run release:audit`: pass
- `npm run ui:smoke`: pass
- `git diff --check`: pass, CRLF warnings only

## Browser Real Run

Source setup:
- Opened `http://localhost:5203/` in the Codex in-app browser.
- Pixel Art real Codex job `codex-job-2026-06-28T02-56-13-635Z-o1onj2` exited 0 but status first recorded `no_image_returned`.
- A returned source image later appeared in root outbox as `codex-job-2026-06-28T02-56-13-635Z-o1onj2-forest-mage.png`.
- Used the UI `結果を再取り込み` action to import source candidates and selected a 1024x1024 source image for Animation Generation.

Animation tournament run:
- Clicked `アニメーション生成`.
- Immediately after start, UI showed exactly 2 Codex job rows.
- UI showed `Active 2/3`.
- UI showed `candidate 1/2` and `candidate 2/2`.
- UI did not show `candidate 3/`.
- Job JSONs recorded `candidateCount: 2` and `hiddenOutbox: true` for both candidates.

Candidate jobs:
- `codex-job-2026-06-28T03-01-55-614Z-cw4axi`: completed, exit 0, candidate 1/2
- `codex-job-2026-06-28T03-01-55-853Z-ws9w9d`: completed, exit 0, candidate 2/2
- Hidden tournament dir: `codex-handoff/outbox/.tournaments/anim-tournament_5zomiq_mqx7dd55/`
- Hidden candidate dirs: 2

Result:
- Failed quality gate; no winner was imported into history.
- UI failure reason: all animation tournament candidates failed, with candidate 1/2 reporting `Direction split QA failed: back three-quarter: motion too small`.
- `historyItems` stayed at 13 after the tournament.
- `codexJobRows` returned to 0.
- Screenshot: `docs/qa/animation-tournament-two-candidates/slot3-real-browser-failed-quality-gate.png`

## Gate Decision

Do not merge to main yet.

The implementation and automated smoke checks confirm that the third standard-animation runner/status/log/hidden outbox is no longer created. However, the required real browser winner publish flow did not pass because the real generated candidates failed the existing quality gate.
