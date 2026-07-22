# Single horizontal direction animation preset QA

Date: 2026-07-22
Branch: `codex/single-horizontal-direction`
Baseline: `origin/main` at `79a219c`

> Historical record: this side-only implementation was later superseded by [Selectable single-direction animation QA](./selectable-single-animation-direction.md), which keeps side as the default and adds the other four canonical choices.

## Scope

Animation Generation now exposes three direction presets in this order:

1. `5 directions`: front, front three-quarter, side, back three-quarter, back
2. `3 directions`: front, side, back
3. `1 direction`: side only

The default remains `5 directions`. Selecting `1 direction` immediately updates the working sheet contract to 8 columns x 1 row for the default 8-frame recipe. Motion Pilot is disabled because there are no remaining directions to expand. The API rejects single-direction tournament requests unless the sole direction is `side`.

## Browser evidence

The dedicated single-direction UI smoke verified:

- the three preset buttons render in a three-column control with 48 px minimum click targets;
- Fast with 5 directions explains that Best is required for Motion Pilot;
- `1 direction` visibly means `side` and synchronizes the canvas contract to 8 x 1;
- the browser submits exactly one Fast job with `spriteContext.directions = ["side"]`;
- the imported result renders one side preview plus one sprite-sheet preview;
- the final sprite sheet is 2048 x 256 px with one grid row.

The full UI smoke also passed after the change, covering the existing queue, image editing, animation review/timeline, effect animation, VFX composite, and export flows.

## Verification

- Bundled Node.js: `24.14.0`
- `node scripts/doctor.mjs`: passed
- `tsc --noEmit`: passed
- Vitest: 12 files, 186 tests passed
- Production build: passed
- `node scripts/smoke.mjs`: passed, including side-only completion/publish and front-only/Pilot rejection
- `node scripts/release-audit.mjs`: passed
- `IMAGE_COCKPIT_UI_SMOKE_ONLY_SINGLE_DIRECTION=1 node scripts/ui-smoke.mjs`: passed
- `node scripts/ui-smoke.mjs`: passed
- `git diff --check`: passed

## Review gate

The change remains on the feature branch for confirmation. It has not been merged into `main`.
