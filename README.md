# Image Cockpit for Codex Workflows

Private pre-release MVP for a local image production cockpit.

This project is unofficial and not affiliated with OpenAI. It is a local workspace for reviewing, annotating, comparing, correcting, and turning generated or imported images into production assets such as sprite sheets.

## MVP Flow

- Import local images or use the included original sample sprite sheet.
- Select history items and review them on the canvas.
- Draw annotations with brush, rectangle, or arrow tools.
- Split a sheet into sprite frames with grid controls.
- Reorder frames in the timeline and edit action metadata.
- Run lightweight QC checks for size consistency, transparency, duplicates, and anchor placement.
- Export a PNG sprite sheet, frame ZIP, GIF, and sprite metadata JSON.

## OpenAI Images Provider

OpenAI Images is optional and disabled unless the local API server has `OPENAI_API_KEY`.

The MVP uses the Images API generation endpoint through a local Node server and defaults to `gpt-image-2` via `OPENAI_IMAGE_MODEL`. The implementation was checked against the official OpenAI image generation guide and Images API reference on 2026-06-23:

- https://developers.openai.com/api/docs/guides/image-generation
- https://developers.openai.com/api/reference/resources/images/methods/generate/
- https://developers.openai.com/api/docs/models/gpt-image-2

Never commit API keys. Use environment variables only.

## Setup

```powershell
npm install
npm run dev:server
npm run dev
```

If the default Vite port is busy, Vite will print the actual local URL.

For OpenAI generation:

```powershell
Copy-Item .env.example .env
# Set OPENAI_API_KEY in .env or in your shell environment.
npm run dev:server
```

## Verification

```powershell
npm run typecheck
npm test
npm run build
```

## Assets And Data

- Bring your own API key.
- Optional adapters for local tools can be added later.
- Generated outputs are user-controlled and exported from the browser.
- Sample assets are original generated demo assets for this repository.
- No model weights are included.
- No API keys, tokens, or license-unclear sample assets should be committed.

## Demo

The demo GIF is not committed yet. See `docs/demo/mvp-demo-capture.md` for the capture plan.

