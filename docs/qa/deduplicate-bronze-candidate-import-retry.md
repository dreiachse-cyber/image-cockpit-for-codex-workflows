# Bronze candidate import dedupe QA

Date: 2026-06-27
Branch: `codex/cockpit-health-and-import-dedupe`

## Scope

- Add `HistoryItem.outboxImportKey` for stable Local Inbox imports.
- Dedupe Local Inbox history by `outboxImportKey` and by exact duplicate `name + size + dataUrl`.
- Treat `bronze candidate` imports as one per Codex job.
- Keep automatic `Retry import` recovery gated by outbox snapshot changes through `lastOutboxFingerprint`.
- Add IndexedDB exact duplicate cleanup for polluted `image-cockpit-local-state` history.

## Safety Notes

- No files are removed from `codex-handoff/outbox`.
- No repo artifacts, official samples, QA outputs, or prompt contracts are deleted.
- Exact duplicate cleanup is limited to `provider === "local-inbox"` entries.
- Frame `sourceId` references are remapped when a duplicate history ID is removed.
- User imports and distinct generated images are not deduped unless they are exact Local Inbox duplicates.

## Verification Log

Final run in this branch used bundled Node direct equivalents for the npm scripts.

- PASS: `vitest run` covered duplicate `outboxImportKey`, one bronze candidate per job, exact Local Inbox duplicate cleanup, frame `sourceId` remapping, final direction-split manifest after bronze candidate, and outbox fingerprint changes.
- PASS: `scripts/ui-smoke.mjs` verified the `Recover Results` and `Dedupe History` controls in the browser flow and exercised Codex failure recovery paths.
- PASS: `scripts/smoke.mjs` verified outbox filtering still ignores temp, QA, debug, contact sheet, preview-grid, and work-in-progress files.
- PASS: `tsc --noEmit`, `tsc -b && vite build`, `scripts/release-audit.mjs`, and `git diff --check`.

## Browser And Recovery QA

- PASS: Hydration dedupes Local Inbox history before rendering and remaps duplicate frame source IDs.
- PASS: `Dedupe History` runs the persisted cleanup path for polluted local state without requiring outbox file deletion.
- PASS: Automatic `Retry import` is gated by `lastOutboxFingerprint`, so the same unchanged bronze candidate snapshot is not imported repeatedly.
- PASS: A later completed direction-split manifest is allowed after an earlier bronze candidate import and is deduped by its own stable manifest key.
- PASS: `Recover Results` imports eligible unimported formal PNG outbox results while preserving outbox files.
- NOTE: Codex in-app browser webview attach timed out during this QA pass, so UI assertions above come from the deterministic headless Chrome smoke test and direct storage/unit coverage.

## Residual Risk

- The dedupe routine intentionally avoids fuzzy image matching.
- Different Local Inbox images with the same filename but different data URLs are retained.
