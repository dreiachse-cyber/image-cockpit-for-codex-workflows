# Settings / Recovery / Environment Report QA

Date: 2026-06-27
Branch: `codex/settings-recovery-report`

## Scope

031対応として、Settings導線、Recovery集約、Diagnostics、Environment Report、imagegen_unavailable時のplaceholder禁止を確認する。

## Acceptance Points

- Settings trigger is next to the language selector and opens General / Recovery / Diagnostics / Environment Report.
- Recovery keeps `?safe=1` and `/reset-local-state.html`, and gathers Recover Results, Dedupe History, Repair Cockpit, Diagnose, and local-state reset actions.
- Severe recovery routes can auto-open Settings, while dismissed Settings is not repeatedly reopened in the same browser session.
- Environment Report supports Copy Markdown, Copy JSON, and refresh, with imagegen smoke recorded as `not_run` until explicitly run.
- Environment Report omits prompts, full logs, `data:image` payloads, API keys, tokens, and local user home paths.
- Local procedural generation is reported separately from real Codex imagegen success.
- `imagegen_unavailable` blocked sidecars do not create placeholder, procedural, SVG, canvas, diagram, or geometric images.

## Verification Plan

Run before main merge / main merge前:

```text
npm run typecheck
npm test
npm run build
npm run smoke
npm run release:audit
npm run ui:smoke
git diff --check
```

Manual browser checkpoints:

- Open normal app, click Settings, verify all tabs and Copy Markdown / Copy JSON.
- Open `?safe=1`, verify Recovery Settings auto-opens and normal navigation remains available.
- Open `/reset-local-state.html`, verify the static reset page remains available.

## Evidence

- `scripts/doctor.mjs`: pass. Local runtime paths are intentionally not recorded here.
- `node_modules/typescript/bin/tsc --noEmit`: pass.
- `node_modules/vitest/vitest.mjs run`: pass, 3 files / 51 tests.
- `node_modules/typescript/bin/tsc -b` and `node_modules/vite/bin/vite.js build`: pass.
- `scripts/smoke.mjs`: pass, including `imagegen_unavailable` blocked sidecar without fake image output.
- `scripts/release-audit.mjs`: pass, including this QA doc and Settings / Recovery / Environment Report markers.
- `scripts/ui-smoke.mjs`: pass in browser automation, including Settings tabs, Copy Markdown / Copy JSON, `?safe=1` auto-open, `/reset-local-state.html`, and imagegen unavailable sidecar handling.
- `git diff --check`: pass before final staging, with line-ending warnings only.
