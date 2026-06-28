# Running Job Progress Indicator QA

Date: 2026-06-29
Branch: `codex/running-job-progress-indicator`
Slot: slot5

## Scope

- Add a running progress indicator to the right-column Codex job shelf.
- Add the same running progress indicator to Codex log cards.
- Add a compact progress indicator to the fullscreen Codex log header.
- Cover Pixel Art Generation, Image Editing, and Animation Generation jobs through the shared Codex job queue UI.

## Browser QA

- URL: `http://127.0.0.1:5215/`
- API: `http://127.0.0.1:8815/`
- Browser path: Chrome headless through `scripts/ui-smoke.mjs`
- User-like action path: click `Generate Pixel Art`, run the mock Codex runner, observe running job shelf / log panel / fullscreen logs.

Confirmed by UI smoke:

- `.history-panel .codex-job-row .codex-progress-meter.state-running` appears while a job is running.
- `.codex-log-card .codex-progress-meter.state-running` appears while a job is running.
- `.codex-log-panel.fullscreen .codex-log-header .codex-progress-meter.compact.state-running` appears in fullscreen logs.
- Progress fill is visible and partial, not full completion.
- Progress copy shows elapsed time.
- Progress copy does not show a fake percent label.
- Fullscreen header progress sits at the bottom of the header.
- Codex queue still drains after completed results.
- Completed log cards remain visible after the running job shelf disappears.

## Validation

- `node --check scripts/ui-smoke.mjs`: passed
- `tsc --noEmit`: passed
- `vitest run`: 58 passed
- `tsc -b && vite build`: passed, with existing Vite chunk size warning
- `scripts/smoke.mjs`: passed
- `scripts/release-audit.mjs`: passed
- `scripts/ui-smoke.mjs`: passed
- `git diff --check`: passed

## Notes

- The progress bar is elapsed-time based and intentionally never displays a numeric percent.
- The visual fill caps below complete so an unfinished job does not look done.
- `prefers-reduced-motion: reduce` disables shimmer animation and leaves a static striped fill.
