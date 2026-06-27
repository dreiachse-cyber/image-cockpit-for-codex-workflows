# Cockpit health repair supervisor QA

Date: 2026-06-27
Branch: `codex/cockpit-health-and-import-dedupe`

## Scope

- Add `/api/health` for Image Cockpit API identity checks.
- Add dev-only supervisor endpoints: `/api/dev/health`, `/api/dev/repair`, `/api/dev/restart-vite`, `/api/dev/restart-api`, `/api/dev/restart-all`.
- Add UI Cockpit health panel with `Cockpit: OK / Warning / Broken / Repairing`.
- Add fixed UI actions: `診断`, `結果を再取り込み`, `Cockpitを修復`.
- Keep repair restricted to loopback browser requests and fixed dev operations.

## Safety Notes

- The dev supervisor listens on `127.0.0.1` only.
- UI repair does not accept arbitrary commands, paths, or ports from the browser.
- Repair does not delete repo files, `codex-handoff/outbox`, status files, logs, generated images, or QA artifacts.
- `restart-api` checks status JSON files and skips API restart when a running Codex job is present.
- Default `Cockpitを修復` starts API if missing and restarts Vite with `IMAGE_COCKPIT_API_TARGET=http://127.0.0.1:<apiPort>`.

## Verification Log

Final run in this branch used bundled Node direct equivalents for the npm scripts.

- PASS: `node --check scripts/dev-all.mjs`
- PASS: `node --check scripts/dev-supervisor.mjs`
- PASS: `node --check scripts/ui-smoke.mjs`
- PASS: `node --check scripts/release-audit.mjs`
- PASS: `tsc --noEmit`
- PASS: `vitest run` (`3` files, `48` tests)
- PASS: `tsc -b && vite build` (standard Vite chunk-size warning only)
- PASS: `scripts/smoke.mjs`
- PASS: `scripts/release-audit.mjs`
- PASS: `scripts/ui-smoke.mjs`
- PASS: `git diff --check` (line-ending warnings only)

## Browser And Local Dev QA

- PASS: `scripts/ui-smoke.mjs` loads the app in headless Chrome and verifies the Cockpit health panel plus `Recover Results`, `Dedupe History`, `Diagnose`, and `Repair Cockpit` controls.
- PASS: Manual dev supervisor launch on unique ports (`8833` supervisor, `8834` API, `5234` Vite) reported `/api/dev/health` role `supervisor`, running API/Vite children, and no mismatches.
- PASS: `/api/health` through both API and Vite proxy returned `app: "image-cockpit"` and role `api`; handoff directories were readable.
- PASS: `/api/codex/results?limit=200` returned filtered outbox results through the Vite proxy.
- PASS: `POST /api/dev/repair` completed with action `repair`, restarted Vite, rechecked health, and did not delete outbox files.
- PASS: A fake BOM-prefixed running status JSON made `POST /api/dev/restart-api` return `409` with `skipped: true`, confirming running-job protection.
- NOTE: Codex in-app browser webview attach timed out during this QA pass, so UI assertions above come from the deterministic headless Chrome smoke test and direct HTTP checks.

## Residual Risk

- Package builds do not use the dev supervisor.
- Browser repair is intentionally limited to local development process alignment.
