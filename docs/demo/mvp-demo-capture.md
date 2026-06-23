# MVP Demo Capture Plan

Current GIF: `docs/demo/mvp-demo.gif`

Retake the short GIF after major UI changes:

1. Start the API server with `npm run dev:server`.
2. Start the Vite app with `npm run dev`.
3. Open the printed local URL.
4. Show the Guided Start screen and choose a workflow.
5. Show the default sample sheet in the cockpit.
6. Add edit notes, draw one annotation, create a Codex handoff job, and confirm JSON plus selected image assets appear under `codex-handoff/inbox/` and `codex-handoff/assets/`.
7. If `codex exec` is available, show `codex-handoff/status/` and `codex-handoff/logs/`. If not, show the unavailable status and manual handoff fallback.
8. Place a returned image under `codex-handoff/outbox/`, switch to Local Inbox, and import the latest result.
9. Use `Split Grid` to populate the timeline.
10. In Sprite Edit, adjust frame size, anchor, and chroma key transparency.
11. Export the sprite sheet, frame ZIP, GIF, and metadata JSON.

Do not replace the README GIF link unless the new file has been rendered and checked locally.
