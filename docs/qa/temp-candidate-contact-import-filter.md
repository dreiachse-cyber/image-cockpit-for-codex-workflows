# Temp Candidate Contact Import Filter QA

Branch: `codex/exclude-temp-candidate-contact-from-import`
Date: 2026-06-27

## Scope

This hotfix prevents temporary, QA, contact sheet, comparison, and debug images in `codex-handoff/outbox/` from being treated as normal Local Inbox / Import Latest results.

Primary regression case:

```text
codex-job-2026-06-26T19-08-42-957Z-candidate-contact.tmp.png
```

This file is a QA contact sheet, not a user-facing generation result. It must not become a history item such as `*_candidate-contact.tmp_transparent.png`.

## Implementation Notes

- Server-side `/api/codex/results` and individual `/api/codex/results/:name` imports reject temp / QA / contact / debug names through `shouldIgnoreOutboxResultName`.
- UI-side Import Latest defensively applies the same name filter before selecting job results, direction split candidates, hatch-pet candidates, or Bronze candidates.
- Handoff prompt text now tells child Codex jobs not to put `.tmp` files, contact sheets, comparison sheets, preview grids, AB galleries, or debug images in the outbox root.
- Existing history, frames, animation library entries, and outbox files are not deleted by this fix.

## Regression Fixtures

Ignored:

- `manual-candidate-contact.tmp.png`
- `manual-candidate-contact.tmp_transparent.png`
- `manual-contact-sheet.png`
- `manual-grid-qa.png`
- `manual-mechanical-qa.png`
- `manual-transparent-contact.png`
- `manual-debug-preview.png`
- `manual-preview-grid.png`
- `manual-ab-gallery.png`

Allowed:

- `manual-return.png`
- `<jobId>.png`
- `<jobId>-front.png`
- `<jobId>-front-three-quarter.png`
- `<jobId>-side.png`
- `<jobId>-back-three-quarter.png`
- `<jobId>-back.png`
- `<jobId>-manifest.json`

## Verification Log

2026-06-27 04:39 JST, slot1:

- `node --check scripts/smoke.mjs`: pass
- `node --check scripts/ui-smoke.mjs`: pass
- `node --check scripts/release-audit.mjs`: pass
- `npm run typecheck`: pass
- `npm test`: pass, 34 tests
- `npm run build`: pass
- `npm run smoke`: pass
- `npm run release:audit`: pass
- `npm run ui:smoke`: first run timed out during initial Vite/browser workspace load; immediate rerun passed
- `git diff --check`: pass

Browser/API confirmation, slot1:

- URL: `http://127.0.0.1:5201/`
- API target: `http://127.0.0.1:8801`
- Viewport: `1280x720`
- Fixture files placed in `slot1/codex-handoff/outbox/`:
  - `slot1-browser-return.png`
  - `slot1-browser-candidate-contact.tmp.png`
  - `slot1-browser-preview-grid.png`
  - `slot1-browser-debug-preview.png`
- Browser DOM loaded the Pixel Art Generation workspace in Japanese UI.
- Results/history text did not include `candidate-contact.tmp` or `preview-grid`.
- `/api/codex/results` listed `slot1-browser-return.png`.
- `/api/codex/results` did not list `slot1-browser-candidate-contact.tmp.png`, `slot1-browser-preview-grid.png`, or `slot1-browser-debug-preview.png`.
- Browser console errors: none.

## Notes

- A bad item already stored in a user's browser history may remain until manually removed.
- No cleanup of existing outbox files, localStorage, IndexedDB, history, frames, or animation library data was performed.
