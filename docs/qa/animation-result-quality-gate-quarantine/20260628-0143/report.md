# Animation Result Quality Gate Quarantine QA

- Branch: `codex/animation-result-quality-gate-quarantine`
- QA time: 2026-06-28 01:43 JST
- Dev URL: `http://localhost:5203/`
- API: `http://127.0.0.1:8803/`

## Scope

Implemented and verified the result quality gate for Animation Generation so unusable direction-split outputs are not imported into success history and are not exposed as final downloads.

## Fixture Coverage

- Normal returned image remains `usable-final`.
- `bronze-candidate` is listed for diagnostics but marked `quarantined-candidate`, with `historyAllowed=false` and `downloadAllowed=false`.
- Server-verified complete direction split starts as `usable-final`.
- Client QA failure can now be written back to the direction-split manifest and is returned by `/api/codex/results` as `quality-failed`.

## Real Browser Run

- Started a real Animation Generation job from `local-gen-2026-06-27T16-21-33-465Z-image-1.png`.
- Job `codex-job-2026-06-27T16-23-26-684Z` completed with five direction PNGs plus manifest.
- Browser-side QA rejected the candidate with: `front: bbox width variation 71%`.
- UI showed `素材品質チェックで弾かれました`.
- No success history item or final download item was added for the rejected animation.
- After quality-gate writeback and reload, the app showed Cockpit OK with no `1 unimported` warning.

## Evidence

- `browser-no-unimported-after-quality-failed-reload.png`
- `classification-summary.json`

## Verification Commands

- `node --check server/index.ts`
- `node --check scripts/smoke.mjs`
- `node --check scripts/ui-smoke.mjs`
- `node node_modules/typescript/bin/tsc -b`
- `node node_modules/vitest/vitest.mjs run`
- `node scripts/smoke.mjs`
- `node node_modules/vite/bin/vite.js build`
- `node scripts/release-audit.mjs`
- `node scripts/ui-smoke.mjs`
- `git diff --check`

## Notes

- The real run used an actual Codex/imagegen job and took about nine minutes.
- The resulting rejected direction files remain in outbox for diagnostics, but their manifest now carries `qualityGate.classification=quality-failed`.
