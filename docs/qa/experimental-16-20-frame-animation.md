# Experimental 16f / 20f Animation Generation QA

Date: 2026-07-22
Branch: `codex/experimental-16-20-frame-animation`
Baseline: `1e57f67` (`codex/single-horizontal-direction`)

## Scope

Animation Generation now offers six Motion Recipe frame budgets: 4f, 6f, 8f, 12f, 16f, and 20f. The existing 8f default is unchanged. The existing 4f / 6f / 8f / 12f choices remain Stable; only 16f / 20f are labeled Experimental.

The direction-image contracts are 4 columns x 4 rows for 16f and 4 columns x 5 rows for 20f. The final game sheet continues to use one row per requested direction and one column per animation frame. A 20f side-only result is therefore 20 columns x 1 row and 5120x256 px with the standard 256 px cell. A five-direction 20f sheet can reach 5120x1280 px, so the UI warns about longer generation, larger outputs, and engine texture limits.

The update applies only to Animation Generation. Effect Animation frame choices are unchanged. Frame rate semantics are also unchanged, so choosing more frames lengthens the current playback unless the user later changes FPS in the timeline.

## Implementation evidence

- Motion Recipe types, compiler metadata, server normalization, runner instructions, manifests, and Animation Pack v1/v2 accept 16f and 20f.
- The compiler uses version `1.2.0`, preserves 8f as the default, and the frame-budget classifier marks only 16f / 20f as Experimental.
- The six frame buttons use a responsive 3 x 2 layout with 48 px minimum targets at desktop and 390 px width.
- Japanese accessible names and 11 px Experimental labels keep the new status understandable beyond visual color alone.
- Local procedural generation now preserves selected direction and Motion Recipe metadata instead of falling back to 8f downstream.
- Animation Pack Import -> Use preserves directions, Motion Recipe frame budget, and Pack v2 timeline metadata instead of falling back to 8f.
- The UI smoke mock produces all 20 cells with chroma-safe character colors, preventing lower-row fixtures from being mistaken for magenta background residue.

## Browser evidence

The dedicated maximum-path browser smoke verified:

- the ordered 4f / 6f / 8f / 12f / 16f / 20f selector and unchanged 8f default;
- unbadged Stable choices on 4f / 6f / 8f / 12f and Experimental labels only on 16f / 20f;
- 16f updates the five-direction working contract to 16 columns x 5 rows;
- 20f updates it to 20 columns x 5 rows and keeps the warning visible;
- the 390 x 844 layout remains 3 columns x 2 rows without horizontal overflow;
- selecting 1 direction changes the contract to 20 columns x 1 row and submits exactly `directions = ["side"]`;
- the mock runner publishes a 4 x 5 direction image and preserves `framesPerDirection = 20` in the job and manifest;
- the imported 20f side-only sheet renders one side preview plus one final 5120x256 px sheet.
- switching back to five directions generates 100 frames, five previews, and one 5120x1280 px final sheet;
- the five-direction 20f result completes an Animation Pack ZIP export through the real browser UI.

The full browser smoke passed afterward, covering existing queue recovery, image editing, standard animation generation, Animation Review, Timeline, Effect Animation, VFX Composite, downloads, and pack flows.

## Verification

- Bundled Node.js: `24.14.0`
- Script syntax checks: passed
- `node scripts/doctor.mjs`: passed
- `tsc --noEmit`: passed
- Vitest: 12 files, 200 tests passed
- Production build: passed with the existing chunk-size warning only
- `node scripts/smoke.mjs`: passed, including 20f server/job/manifest coverage
- `node scripts/release-audit.mjs`: passed
- `IMAGE_COCKPIT_UI_SMOKE_ONLY_SINGLE_DIRECTION=1 node scripts/ui-smoke.mjs`: passed in 23.3 seconds, including side-only and five-direction 20f generation plus Pack export
- `node scripts/ui-smoke.mjs`: passed in 302.6 seconds
- `git diff --check`: passed

## Review gate

This experimental change remains on its feature branch for confirmation and has not been merged into `main`.
