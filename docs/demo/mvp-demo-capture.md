# Demo Capture Plan

Current GIF: `docs/demo/mvp-demo.gif`

Current README screenshots can be refreshed with:

```powershell
npm run capture:readme
```

The capture script starts a temporary local API and Vite app, uses an isolated Chrome/Edge profile, seeds safe demo data, and writes:

- `docs/demo/readme/pixel-art-generation.png`
- `docs/demo/readme/prompt-examples-modal.png`
- `docs/demo/readme/image-editing.png`
- `docs/demo/readme/animation-generation.png`

Retake the short GIF after major UI changes:

1. Start the API server with `npm run dev:server`.
2. Start the Vite app with `npm run dev`.
3. Open the printed local URL.
4. Show the Pixel Art Generation / Image Editing / Animation Generation tabs.
5. Show a generated pixel-art result in the shared preview.
6. Add edit notes and a numbered rectangular region, create a Codex handoff job, and confirm JSON plus selected image assets appear under `codex-handoff/inbox/` and `codex-handoff/assets/`.
7. If `codex exec` is available, show `codex-handoff/status/` and `codex-handoff/logs/`. If not, show the unavailable status and manual handoff fallback.
8. Place a returned image under `codex-handoff/outbox/`, then click `Import Latest` to import the latest result.
9. Generate an animation from a selected pixel-art source.
10. Show five-direction GIF previews and the composed sprite sheet.
11. Export the sprite sheet, frame ZIP, GIF, WebP, and animation pack.

Do not replace the README GIF link unless the new file has been rendered and checked locally.
