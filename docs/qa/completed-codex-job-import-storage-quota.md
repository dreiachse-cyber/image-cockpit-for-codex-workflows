# Completed Codex job import / storage quota QA

Date: 2026-06-26
Branch: `codex/completed-job-import-storage-quota-fix`

## Reproduction Target

- completed + outboxあり + import失敗:
  - runner status is `completed`.
  - outbox contains job-prefixed direction split files and a manifest.
  - one required direction file is missing or import/QA fails.
- localStorage容量超過:
  - `image-cockpit.v3.history` / `image-cockpit.v3.frames` should not be rewritten as full data URL mirrors.
  - history and frames are saved to IndexedDB first.
  - after IndexedDB save succeeds, old localStorage mirrors are cleared and only lightweight summaries remain.

## Fix Summary

- `pollForReturnedImages` now attempts a job-scoped import with explicit background error propagation.
- A completed runner status without a diagnostic no longer leaves the job row in `running` forever when import does not succeed.
- Standard direction split jobs surface `Direction split import failed` with job id and a short reason such as missing directions.
- Failed imports release the Codex active slot and add a visible failure card. Outbox files are not deleted.
- `saveHistory()` and `saveFrames()` now use IndexedDB as the primary store and avoid writing large history/frame bodies back to localStorage.

## Regression Coverage

- Unit tests:
  - `shouldReportCompletedCodexImportFailure`
  - `summarizeCodexImportFailureReason`
- UI smoke:
  - `assertCompletedDirectionSplitImportFailure`
  - mock runner marker: `mock-direction-split-import-failure.flag`
  - expected result: active job row count returns to 0, no broken history item is added, and a `Direction split import failed` card is shown.
- Release audit:
  - guards completed import failure markers in `src/App.tsx`, `src/App.test.ts`, `scripts/ui-smoke.mjs`, and this QA document.
  - guards history/frame storage quota markers in `src/lib/storage.ts`.

## Verification Log

- `node --check scripts/ui-smoke.mjs`: pass
- `node --check scripts/release-audit.mjs`: pass
- `tsc --noEmit`: pass
- `vitest run`: pass
- `tsc -b`: pass
- `vite build`: pass
- `scripts/smoke.mjs`: pass
- `scripts/release-audit.mjs`: pass
- `scripts/ui-smoke.mjs`: pass
- `git diff --check`: pass

## Notes

- The two real observed jobs remain useful manual evidence:
  - `codex-job-2026-06-26T05-20-52-972Z`
  - `codex-job-2026-06-26T05-21-05-568Z`
- This fix does not delete user history, frames, animation library data, or outbox files.
- Existing large localStorage history/frame mirrors are removed only after the corresponding IndexedDB save succeeds.
