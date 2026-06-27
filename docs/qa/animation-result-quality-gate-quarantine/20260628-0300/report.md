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
