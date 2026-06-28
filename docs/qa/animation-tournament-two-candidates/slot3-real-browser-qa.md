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

## Follow-up: Usage Limit Diagnostic

Date: 2026-06-28 12:35-12:55 JST

Additional real browser observation:
- Slot3 UI still showed exactly 2 candidates for the Walk Cycle run.
- Candidate jobs:
  - `codex-job-2026-06-28T03-35-09-232Z-17ouce`
  - `codex-job-2026-06-28T03-35-09-251Z-rlydw5`
- Both job JSONs recorded `candidateCount: 2`.
- Both jobs failed before image generation because Codex returned:
  - `You've hit your usage limit. Upgrade to Plus to continue using Codex ... try again at Jul 28th, 2026 12:13 PM.`
- This is an external Codex runner usage-limit condition, not an animation-quality result and not a content policy failure.

Fix added:
- Added `usage_limit` as a first-class `CodexFailureKind`.
- Classify usage-limit text before the broad policy/safety classifier so `usage-policy` wording does not mislead the UI.
- Show a dedicated `Codex usage limit reached` failure card.
- Include `usage_limit` in server normalization, smoke coverage, UI smoke coverage, release audit markers, and warning-card styling.

Post-fix checks:
- Bundled Node `scripts/doctor.mjs`: pass
- Bundled Node `node_modules/typescript/bin/tsc --noEmit`: pass
- Bundled Node `node_modules/vitest/vitest.mjs run`: pass, 56 tests
- Bundled Node `scripts/smoke.mjs`: pass, includes `usage_limit`
- Bundled Node `scripts/release-audit.mjs`: pass
- Bundled Node `node_modules/typescript/bin/tsc -b` + `node_modules/vite/bin/vite.js build`: pass, existing Vite chunk-size warning only
- Bundled Node `scripts/ui-smoke.mjs`: pass on rerun; one immediately prior run hit the pre-existing Animation Generation source-card round-trip assertion, then passed without code changes
- `git diff --check`: pass, CRLF warnings only

Updated gate decision:
- Still do not merge to main yet.
- 2-candidate behavior is verified.
- Usage-limit misclassification is fixed and tested.
- Required real browser winner publish remains unverified because Codex image generation is currently blocked by the usage limit.
