# Imagegen Handoff Smoke

Date: 2026-06-23

## Result

Prompt-only pixel art generation through the local Codex handoff was verified.

- Route: `Codex Handoff` -> `codex exec` -> `imagegen` skill / built-in `image_gen` -> `codex-handoff/outbox/`
- Job id: `codex-job-2026-06-23T11-04-53-618Z`
- Runner state: `completed`
- Exit code: `0`
- Output image: `codex-handoff/outbox/codex-job-2026-06-23T11-04-53-618Z-image-1.png`
- Output dimensions: `1254x1254`
- Output file size: `2,201,583 bytes`
- Summary sidecar: `codex-handoff/outbox/codex-job-2026-06-23T11-04-53-618Z-imagegen-summary.md`

The returned file was a real generated PNG, not the deterministic fallback PNG from `server/local-generator.ts`.

## Re-Run In This Implementation Thread

After routing `Pixel Art Generation` to `Codex Handoff`, the smoke was re-run through `npm run imagegen:smoke`.

- Job id: `codex-job-2026-06-23T11-26-50-963Z`
- Handoff dir: `codex-handoff/imagegen-smoke-20260623-202650/`
- Runner state: `completed`
- Exit code: `0`
- Output image: `codex-handoff/imagegen-smoke-20260623-202650/outbox/codex-job-2026-06-23T11-26-50-963Z-image.png`
- Output dimensions: `1254x1254`
- Output file size: `2,287,816 bytes`
- Summary sidecar: `codex-handoff/imagegen-smoke-20260623-202650/outbox/codex-job-2026-06-23T11-26-50-963Z-summary.json`
- Summary `generationMode`: `built-in image_gen`

The summary sidecar recorded that the accepted result matched the centered clockwork mushroom courier prompt, included the glowing blue satchel and rainy neon forest, and had no obvious readable text, logo, watermark, or numbers.

## Prompt Shape

The smoke prompt explicitly asked Codex to use the imagegen built-in image generation path and to avoid placeholders, SVGs, text, logos, and watermarks. The generated image reflected a complex pixel-art-inspired scene with a mascot, sprite-sheet workbench, UI panels, export crystals, and annotation marks.

## Product Decision

`Pixel Art Generation` should default to `Codex Handoff`, not the deterministic local generator. The local generator remains useful for fallback API smoke tests and development, but it is not the quality path for complex prompt generation.

## Follow-Up QA

Still unverified:

- `image-edit` workflow with a selected source asset
- annotation-guided image editing
- transparent PNG quality
- true sprite-sheet consistency from imagegen
- repeated long-running imagegen jobs

## Re-Run Command

Use this optional long-running smoke when a local Codex install with imagegen is available:

```powershell
npm run imagegen:smoke
```

This command is intentionally not part of CI.
