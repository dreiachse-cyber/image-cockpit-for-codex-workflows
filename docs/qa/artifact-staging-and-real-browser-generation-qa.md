# Artifact staging and real browser generation QA

Date: 2026-06-27
Branch: `codex/artifact-staging-real-browser-generation-qa`
Status: QA passed / merge confirmation pending

## Scope

- Add server-verified artifact staging for standard direction-split animation jobs.
- Keep manifest-first and side-late artifacts pending instead of showing `Direction split import failed`.
- Publish final direction split artifacts through the server and rewrite the final manifest with `serverVerified: true`.
- Add Bronze fallback when direction split import/QC fails but raw direction images are available.
- Record real browser generation QA before requesting main merge.

## Logical QA

- `scripts/smoke.mjs` covers manifest-first direction split artifacts:
  - manifest + four direction PNGs are listed but `artifact.ready=false`.
  - missing `side` is reported as the waiting reason.
  - after `side.png` appears, the server rewrites `<jobId>-manifest.json` with `serverVerified: true`.
- `src/App.test.ts` covers:
  - partial direction files without a manifest stay waiting.
  - visible manifest + five direction images still wait when server artifact metadata is not verified.
  - verified server artifact metadata allows import.
- `scripts/ui-smoke.mjs` covers:
  - partial direction split recovery without a manifest.
  - manifest-first direction split recovery with `side.png` delayed.
  - completed incomplete direction split import failure still releases the active job slot.

## Commands

- `node --check scripts/smoke.mjs`: pass
- `node --check scripts/ui-smoke.mjs`: pass
- `node --check scripts/release-audit.mjs`: pass
- `tsc --noEmit`: pass
- `vitest run`: pass
- `scripts/smoke.mjs`: pass
- `scripts/release-audit.mjs`: pass
- `tsc -b`: pass
- `vite build`: pass, with the existing chunk-size warning
- `scripts/ui-smoke.mjs`: pass
- `git diff --check`: pass, with existing CRLF warnings only

## Real Browser Generation QA

Passed in the user's Chrome browser through the Codex Chrome extension.

- URL: `http://127.0.0.1:5192/`
- API: `http://127.0.0.1:8812/`
- Viewport: `1605x921`
- Source image job:
  - `codex-job-2026-06-26T18-33-48-565Z`
  - Workflow: Pixel Art Generation
  - Prompt: small forest mage pixel art character, full body, centered, transparent background preferred, flat magenta chroma key fallback, no text, no logo.
  - Result: `codex-job-2026-06-26T18-33-48-565Z.png`, `1254x1254`, imported into history and selected as the Animation Generation source.
- Animation job 1:
  - Preset: `Idle Breathing`
  - jobId: `codex-job-2026-06-26T18-38-55-870Z`
  - Result tier: Gold
  - Server artifact: `serverVerified: true`, `quality: gold`, no warnings, five direction PNGs plus rewritten manifest.
- Animation job 2:
  - Preset: `Walk Cycle`
  - jobId: `codex-job-2026-06-26T18-41-16-233Z`
  - Result tier: Gold
  - Server artifact: `serverVerified: true`, `quality: gold`, no warnings, five direction PNGs plus rewritten manifest.
- Animation job 3:
  - Preset: `Run Cycle`
  - jobId: `codex-job-2026-06-26T18-41-36-016Z`
  - Result tier: Gold
  - Server artifact: `serverVerified: true`, `quality: gold`, no warnings, five direction PNGs plus rewritten manifest.
- Results / preview / history state:
  - Chrome UI showed three imported direction-split animation sheets in Results:
    - `codex-job-2026-06-26T18-41-16-233Z-direction-split-animation-sheet.png`
    - `codex-job-2026-06-26T18-41-36-016Z-direction-split-animation-sheet.png`
    - `codex-job-2026-06-26T18-38-55-870Z-direction-split-animation-sheet.png`
  - Selected preview showed the Walk Cycle sheet at `2048x1280`, five direction GIF previews, sprite sheet preview, and `animation frames ready`.
  - Source image remained linked as `codex-job-2026-06-26T18-33-48-565Z.png`.
- Logs / failure notice state:
  - Chrome UI showed three completed job cards and `0/3` active jobs.
  - No `failed`, `失敗`, `Needs review`, or `確認が必要` notices were present.
  - Status toast: animation generated, `walk` added 40 frames, `direction-split manifest ok`.
  - Walk job encountered transient WebSocket reconnects, fell back to HTTPS, and completed successfully.
- Evidence:
  - Chrome extension screenshot emitted in the Codex thread at the final QA state.

This satisfies the real browser QA requirement with three independent real Codex / imagegen Animation Generation jobs returning Gold.

## Main Merge Gate

Do not merge this branch to `main` until real browser generation QA returns Gold, Silver, or Bronze and ご主人 confirms the merge.
