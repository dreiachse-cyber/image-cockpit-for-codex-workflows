# Effect Animation MVP QA

Date: 2026-06-30

## Branch / Slot

- Branch: `codex/effect-animation-mvp`
- Commit: branch head for this QA pass; exact hash is recorded in `request-status.md` after push
- Slot: `slot2`
- Local QA URL: `http://127.0.0.1:62166/`
- Viewport: `1280x720`
- Browser path: headless Chrome/Edge through `scripts/ui-smoke.mjs`

## Scope

Implemented the `Effect Animation` workflow as a fourth workspace mode beside Pixel Art Generation, Image Editing, and Animation Generation. The MVP covers category/type/style/palette controls, frame/canvas/layout/loop/anchor controls, prompt and negative prompt generation, Codex handoff payloads, effect result import, GIF/sheet/timeline preview, quality rank, history labeling, and download modal exports.

The browser QA used the app UI and local API with the deterministic ui-smoke Codex runner. It verifies the real browser interaction, job queue, outbox import, preview, QC, and export paths without calling an external image model.

## UI Changes

- Added `Effect Animation` to the workflow selector.
- Added category cards for Slash Arc, Hit Spark, Magic Cast, Projectile, and Impact.
- Added type/style/palette selectors, frame count, canvas size, sheet layout, loop mode, anchor, and preview background switch.
- Added effect-specific result preview: GIF preview, sheet preview, frame timeline, quality strip, and history card metadata.
- Added effect export options in the shared download modal: Effect GIF, Sheet PNG, Frames ZIP, Metadata JSON, and Effect Pack ZIP.
- Effect results are treated as final export assets in Image Editing and cannot expose numbered edit regions.

## Handoff Payload

Effect jobs use `workflowMode: "effect-animation"` and include `effectContext` with category, type, style, palette, frame count, frame size, layout, loop mode, fps, anchor, blend mode, and prompt contract. Server-side runner notes require transparent PNG sprite sheets, no baked checkerboard, no text/watermark/frame numbers, visible temporal progression, and metadata/GIF sidecar output when available.

## Metadata / QC

Effect history items carry `effectAnimation` metadata:

- `kind: "effect-animation"`
- category/type/style/colorPalette
- frameCount/frameSize/layout/loopMode/fps/anchor/blendMode
- background/alphaPremultiplied
- qualityRank/warnings/sourceJobId/artifacts

QC checks frame count, frame size, sheet layout, alpha transparency, checkerboard/matte risk, cell bounds, duplicate/static frames, and failed/debug artifact exclusion. `gold` and `silver` are downloadable; `bronze`, `failed`, and `blocked` are not treated as final success.

## Browser Trials

| Category | Type | Job id | Result file | Rank | Warning / failure | Screenshot |
| --- | --- | --- | --- | --- | --- | --- |
| Slash Arc | crescent slash | `codex-job-2026-06-30T13-37-06-996Z-jt01lr` | `slash-arc-crescent-slash-8f-codex-job-2026-06-30T13-37-06-996Z-jt01lr-effect-sheet.png` | gold | none | `docs/qa/effect-animation-mvp/ui-smoke-effect-animation-slash-arc-1280x720.png` |
| Hit Spark | burst spark | `codex-job-2026-06-30T13-37-12-654Z-gcbotq` | `hit-spark-burst-spark-8f-codex-job-2026-06-30T13-37-12-654Z-gcbotq-effect-sheet.png` | gold | none | `docs/qa/effect-animation-mvp/ui-smoke-effect-animation-hit-spark-1280x720.png` |
| Magic Cast | magic circle | `codex-job-2026-06-30T13-37-18-227Z-a20yj8` | `magic-cast-magic-circle-8f-codex-job-2026-06-30T13-37-18-227Z-a20yj8-effect-sheet.png` | gold | none | `docs/qa/effect-animation-mvp/ui-smoke-effect-animation-magic-cast-1280x720.png` |
| Projectile | energy bolt | `codex-job-2026-06-30T13-37-23-846Z-y4fbz4` | `projectile-energy-bolt-8f-codex-job-2026-06-30T13-37-23-846Z-y4fbz4-effect-sheet.png` | gold | none | `docs/qa/effect-animation-mvp/ui-smoke-effect-animation-projectile-1280x720.png` |
| Impact | small explosion | `codex-job-2026-06-30T13-37-29-515Z-ja7azd` | `impact-small-explosion-8f-codex-job-2026-06-30T13-37-29-515Z-ja7azd-effect-sheet.png` | gold | none | `docs/qa/effect-animation-mvp/ui-smoke-effect-animation-impact-1280x720.png` |

Each trial created a UI job, showed a running/completed job card, imported the final sheet into history, rendered the sheet preview, rendered the GIF preview, rendered 8 timeline frames, and showed `GOLD` with no QC warnings.

## Download Check

The Effect Animation download modal exposed and clicked all MVP export options:

- Effect GIF
- Sheet PNG
- Frames ZIP
- Metadata JSON
- Effect Pack ZIP

No legacy PNG-only, Animated WebP, or Animation Pack options appeared for effect results.

## Desktop / Mobile

- Desktop viewport `1280x720`: verified by full `npm run ui:smoke` and effect-only screenshot QA.
- Mobile/responsive behavior: `npm run ui:smoke` covers responsive log/fullscreen checks and workflow tab wrapping; the workflow tabs now use a 2x2 layout inside the source panel to keep localized labels within height limits.

## Evidence Files

- `docs/qa/effect-animation-mvp/ui-smoke-effect-animation-1280x720.png`
- `docs/qa/effect-animation-mvp/ui-smoke-effect-animation-slash-arc-1280x720.png`
- `docs/qa/effect-animation-mvp/ui-smoke-effect-animation-hit-spark-1280x720.png`
- `docs/qa/effect-animation-mvp/ui-smoke-effect-animation-magic-cast-1280x720.png`
- `docs/qa/effect-animation-mvp/ui-smoke-effect-animation-projectile-1280x720.png`
- `docs/qa/effect-animation-mvp/ui-smoke-effect-animation-impact-1280x720.png`
- `docs/qa/effect-animation-mvp/ui-smoke-effect-result-not-editable-1280x720.png`

## Follow-up Items

- Character overlay preview is not included in this MVP.
- Godot, Unity, and Phaser exports are not included beyond portable metadata/effect pack output.
- External image-model generation was not exercised in this QA pass; the deterministic local runner was used for repeatable browser and export verification.
