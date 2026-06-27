# Animation Result Rescue Hotfix QA

- Date: 2026-06-28 02:32 JST
- Branch: `codex/animation-result-quality-gate-quarantine`
- Scope: follow-up hotfix after live animation generation showed too many user-visible failures.

## Problem Observed

The quality gate correctly prevented broken animation candidates from becoming history/download items, but the user experience looked like repeated generation failure because:

- root outbox files/manifests could appear before the producer finished normalization.
- a client-written `quality-failed` manifest could keep blocking a job even after newer candidate files appeared.
- bbox width/height variation from otherwise usable motion frames was treated as a hard failure.
- standard animation jobs could run concurrently, increasing the chance that Codex/imagegen output discovery crossed job boundaries.

## Changes Verified

- Standard direction-split animation jobs now have a dedicated active limit of 1 while the global Codex handoff limit remains 3.
- Direction-split artifact inspection prefers the newest candidate files and newest manifest, including staging updates.
- Stale client quality gates are ignored when newer direction candidates exist.
- Old client quality gates that only report bbox width/height variation are rechecked under the current QA policy.
- 2:1 direction images with non-exact dimensions are normalized to the expected 4x2 grid before cell extraction.
- Bbox variation is now a warning unless it is extreme.

## Verification

- `node node_modules/typescript/bin/tsc --noEmit`: pass
- `node node_modules/vitest/vitest.mjs run`: pass, 55 tests
- `node scripts/smoke.mjs`: pass
- `node node_modules/typescript/bin/tsc -b`: pass
- `node node_modules/vite/bin/vite.js build`: pass
- `node scripts/release-audit.mjs`: pass
- `node scripts/ui-smoke.mjs`: pass
- Browser check: `http://localhost:5203/` loaded with no console errors.

## Live Recheck

After restarting the slot3 API with the hotfix, the four live animation jobs from the user session were reclassified as `usable-final`:

- `codex-job-2026-06-27T16-53-21-506Z`
- `codex-job-2026-06-27T16-53-44-435Z`
- `codex-job-2026-06-27T16-56-30-286Z`
- `codex-job-2026-06-27T17-06-36-982Z`

The previously blocked `16-56-30` job was recovered because its persisted failure was bbox-variation-only, which is now a warning-level QA signal.

## Follow-up Recommendation

Implement a proper best-of-3 standard animation mode later: run up to three sequential candidate sheets for one user request, score each candidate through the same quality gate, publish only the best final artifact, and keep rejected candidates in diagnostics.
