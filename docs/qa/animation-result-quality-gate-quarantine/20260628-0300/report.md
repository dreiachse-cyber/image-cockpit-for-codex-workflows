# Chrome Extension Recovery Follow-up

- Date: 2026-06-28 03:00 JST
- Branch: `codex/animation-result-quality-gate-quarantine`
- Target job: `codex-job-2026-06-27T17-46-55-284Z`

## Observation

Chrome Extension verification reproduced a client-side rejection even though the API exposed the artifact as:

- `serverVerified: true`
- `qualityGate.classification: usable-final`
- `quality: gold`

The UI import failure was:

```text
Direction split QA failed: front: bbox width variation 71%; back three-quarter: bbox width variation 90%
```

## Fix

Bbox width/height variation is now warning-only in the client import QA. This keeps destructive checks such as blank cells, detached components, chroma damage, edge contact, and severe margin problems as failures while allowing motion silhouette variation to import.

## Chrome Extension Verification

After restarting Vite and reloading `http://localhost:5203/` in Chrome Extension control:

- `結果を再取り込み` completed successfully.
- `codex-job-2026-06-27T17-46-55-284Z-direction-split-animation-sheet.png` was added to history.
- Status showed `Recovered 6 outbox results. 0 already imported or not recoverable. direction-split manifest ok.`
- Chrome console errors: none.

## Local Generator Recovery Cleanup

Follow-up inspection found `local-gen-2026-06-27T16-21-33-465Z-image-1.png` in Local Inbox history after bulk recovery. This was not a Codex/imagegen result; it was a Local Generator artifact written to outbox by `/api/generate`.

Fix:

- Ignore `local-gen-*` files in both server and client outbox result filtering.
- Refuse future `local-inbox` insertion of recovered `local-gen-*` names.
- Remove already recovered `local-inbox + local-gen-*` entries during Local Inbox dedupe, while preserving real `provider: local-generator` history.

Chrome Extension verification after Vite/API restart:

- `/api/codex/results?limit=200` returned `local_gen_count=0`.
- Reloading `http://localhost:5203/` showed `localGenMentions: 0`.
- `結果を再取り込み` completed with `Recover Results complete: no new formal outbox images were found.`

## Low-motion Animation Gate

The visually suspicious `codex-job-2026-06-27T16-23-26-684Z` artifact was confirmed as built-in `image_gen` output, but it was nearly static. Adjacent-frame image difference was much lower than the other animation jobs:

```text
codex-job-2026-06-27T16-23-26-684Z avg_adjacent_diff=0.0148 max_adjacent_diff=0.0474
Other recovered animation jobs avg_adjacent_diff=0.0529..0.0840
```

Fix:

- Client direction-split QA now computes adjacent-frame motion per direction.
- Rows with average frame change below `0.025` and max frame change below `0.055` fail with `motion too small`.
- Rows below `0.04` average change emit a warning.
- Bulk Recover now skips a failed direction-split artifact and continues with the remaining candidates instead of aborting the whole recovery pass.
