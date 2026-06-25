# Demo Capture Plan

Current GIF: `docs/demo/mvp-demo.gif`

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
