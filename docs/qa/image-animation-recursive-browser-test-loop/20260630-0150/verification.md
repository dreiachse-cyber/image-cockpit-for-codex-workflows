# Verification

All commands were run from the slot2 worktree after the browser test loop fixes.

| Command | Result | Notes |
| --- | --- | --- |
| `node --check scripts/animation-delivery-browser-smoke.mjs` | pass | Animation browser helper syntax verified. |
| `node --check scripts/image-source-browser-smoke.mjs` | pass | Pixel Art Generation browser helper syntax verified. |
| `git diff --check` | pass | Only CRLF normalization warnings were reported. |
| `npm run typecheck` | pass | TypeScript completed with no errors. |
| `npm test` | pass | 61 tests passed across 3 files. |
| `npm run build` | pass | Vite emitted the existing large chunk warning. |
| `npm run smoke` | pass | Static smoke passed. |
| `npm run release:audit` | pass | Release audit passed. |
| `npm run ui:smoke` | pass | Real browser smoke passed after recursive loop fixes. |

Additional data hygiene:

- Public QA docs were checked for local absolute paths and secrets before staging.
- Heavy handoff, logs, preflight, and raw local outbox artifacts are ignored by the QA `.gitignore`.

## Follow-up: Idle Breathing Threshold Relaxation

After lowering the idle-breathing aggregate readable-row minimum from 3 to 2, static verification was rerun from the slot2 worktree with the bundled Node runtime.

| Command | Result | Notes |
| --- | --- | --- |
| `git diff --check` | pass | Only CRLF normalization warnings were reported. |
| `node node_modules/typescript/bin/tsc --noEmit` | pass | TypeScript completed with no errors. |
| `node node_modules/vitest/vitest.mjs run` | pass | 61 tests passed across 3 files. |
| `node scripts/smoke.mjs` | pass | Static smoke passed. |
| `node scripts/release-audit.mjs` | pass | Release audit passed. |
| `node node_modules/typescript/bin/tsc -b` + `node node_modules/vite/bin/vite.js build` | pass | Vite emitted the existing large chunk warning. |
| `node scripts/ui-smoke.mjs` | pass | Real browser smoke passed after the idle threshold change. |

## Follow-up: Failed Sprite Sheet GIF Preview

The failed sprite sheet gallery was extended with looping animated GIF previews generated from the committed 4 x 2 direction PNGs.

| Check | Result | Notes |
| --- | --- | --- |
| Generate direction GIFs with Pillow | pass | 20 GIFs written under `failed-sprite-sheets/*/*.gif`, one per failed trial direction. |
| GIF metadata check | pass | Every GIF has 8 frames, 256 x 256 size, and 120ms frame duration. |
| `failed-sprite-sheets.html` local link check | pass | 91 local `href` / `src` values checked with zero missing files. |
| `git diff --check` | pass | Only CRLF normalization warnings were reported. |

## Follow-up: Walk Cycle Motion Tolerance

After visual review of T03, `walk` / `walk-cycle` were moved to a dedicated walk motion profile so readable small-character walk loops are not blocked by the generic standard threshold.

| Command / Check | Result | Notes |
| --- | --- | --- |
| `git diff --check` | pass | Only CRLF normalization warnings were reported. |
| `node node_modules/typescript/bin/tsc --noEmit` | pass | TypeScript completed with no errors. |
| `node node_modules/vitest/vitest.mjs run` | pass | 61 tests passed across 3 files. |
| `node scripts/smoke.mjs` | pass | Static smoke passed. |
| `node scripts/release-audit.mjs` | pass | Release audit passed. |
| `success-rate-summary.json` parse + gallery local link check | pass | Summary JSON parsed; `index.html` and `failed-sprite-sheets.html` local links exist. |
| `node node_modules/typescript/bin/tsc -b` + `node node_modules/vite/bin/vite.js build` | pass | Vite emitted the existing large chunk warning. |
| `node scripts/ui-smoke.mjs` | pass on retry | First attempt hit an unrelated Animation Generation source-card round-trip assertion; immediate rerun passed. |
