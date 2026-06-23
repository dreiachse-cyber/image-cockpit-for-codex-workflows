# Changelog

## 0.1.0-rc.1 - 2026-06-23

Private release candidate for the first local Image Cockpit MVP.

### Added

- Guided Start with four workflows: image generation, image editing, sprite sheet generation, and sprite sheet editing.
- Local-only Codex handoff through `codex-handoff/inbox/`, `assets/`, `outbox/`, `status/`, and `logs/`.
- Optional `codex exec` runner launched by the local server when `IMAGE_COCKPIT_CODEX_AUTORUN=1`.
- Pending-job lock so the Codex job button cannot create duplicate handoff jobs while waiting for a result.
- Handoff job context including workflow mode, edit notes, selected image asset, annotations, grid, and sprite context.
- Local Inbox import for returned outbox images.
- Smoke coverage for Local Inbox outbox listing and data URL import.
- Canvas annotation tools for select, brush, rectangle, and arrow.
- Grid split into sprite frames, frame timeline editing, frame size controls, anchor controls, chroma key cleanup, and PNG / ZIP / GIF / metadata exports.
- Japanese / English language selector.
- Desktop and mobile QA screenshots plus MVP review report.
- MVP demo GIF linked from README.
- Release audit script for local-first boundaries, required docs, workflow IDs, and tracked-file safety checks.

### Notes

- The app itself does not call OpenAI APIs directly and does not require an API key.
- Repository visibility remains private until owner approval for the first public release.
- In the current Windows test environment, launching the installed Codex executable returns `spawn EPERM`; the runner records this as `unavailable` and falls back to manual handoff.
