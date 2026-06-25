# Changelog

## Unreleased

### Added

- Pixel art generation now routes to local Codex handoff so `codex exec` can use imagegen / built-in `image_gen` for real prompt-only images.
- Built-in local procedural PNG generator kept as a fallback/dev verification path.
- Pixel-art-to-animation generation workflow that requires an uploaded or selected pixel-art source, then creates an animation sheet and immediate timeline frames.
- Three-tab workspace focused on pixel art generation, image editing, and animation generation.
- Prompt Examples modal opened from directly below the Pixel Art Prompt field, with copy buttons and one-click loading into Pixel Art Generation.
- Pixel Art Generation / Image Editing / Animation Generation tabs and a preset-driven Animation Generation flow with source selection, motion selection, generation, and animated GIF / animated WebP / sprite sheet downloads.
- Public-launch documentation, X launch copy, and a pull request policy that keeps forks welcome while upstream PR intake is disabled or limited.
- `POST /api/generate` local generation endpoint and smoke coverage that checks generated PNG dimensions.
- Optional real imagegen smoke through `npm run imagegen:smoke`.
- Public privacy guard in release audit, plus environment-neutral Codex CLI evidence paths in public docs.

### Notes

- The built-in generator is local and deterministic so fallback image routes and animation generation can run end-to-end without external services. Pixel art image quality depends on the local Codex imagegen path.

## 0.1.0 - 2026-06-23

First public local-first Image Cockpit release.

### Added

- Workspace tabs for pixel art generation, image editing, and animation generation.
- Local-only Codex handoff through `codex-handoff/inbox/`, `assets/`, `outbox/`, `status/`, and `logs/`.
- Optional `codex exec` runner launched by the local server when `IMAGE_COCKPIT_CODEX_AUTORUN=1`.
- Optional JSON arg overrides for Codex runner wrappers and smoke coverage for a mock autorun runner reaching completed state.
- Windows Codex command diagnostics and automatic preference for the terminal-runnable `%LOCALAPPDATA%\OpenAI\Codex\bin\...\codex.exe` CLI when the WindowsApps desktop shim is also present.
- Current Codex CLI runner args using `-c approval_policy="<approval>"` instead of the removed `--ask-for-approval` flag.
- Real no-image `codex exec` runner smoke confirming the installed Codex CLI can complete a local handoff job and write a Markdown sidecar to outbox.
- Re-runnable real Codex runner smoke through `npm run codex:smoke`.
- Owner-review local sweep through `npm run review:local`, running verify, browser UI smoke, and real no-image Codex runner smoke in sequence.
- Pending-job lock so the Codex job button cannot create duplicate handoff jobs while waiting for a result.
- Orphaned pending Codex jobs with missing runner status now unlock instead of waiting forever.
- Handoff job context including workflow mode, edit notes, selected image asset, annotations, grid, and sprite context.
- Smoke coverage for sprite generation and sprite editing handoff payloads.
- Local Inbox import for returned outbox images.
- Visible `Import Latest` action in the simplified workflow screen for manual handoff returns.
- Simplified local-file workflows avoid duplicate `Import File` actions.
- Desktop and mobile QA screenshots for the simplified image generation screen with `Import Latest` visible.
- Manual handoff Browser QA screenshot showing an outbox return imported through `Import Latest`.
- Smoke coverage for Local Inbox outbox listing and data URL import.
- Smoke coverage for runner preflight `ready`, autorun `running -> completed`, and mock outbox PNG import.
- Canvas annotation tools for select, brush, rectangle, and arrow.
- Grid split into sprite frames, frame timeline editing, frame size controls, anchor controls, chroma key cleanup, and PNG / ZIP / GIF / metadata exports.
- Japanese / English language selector, with core workflow panel labels, canvas controls, sprite controls, and export actions following the selected language.
- Desktop and mobile QA screenshots plus MVP review report.
- MVP demo GIF linked from README.
- Release audit script for local-first boundaries, required docs, workflow IDs, and tracked-file safety checks.
- v0.1.0 release notes for the public OSS baseline.
- v0.1.0 owner review guide with the short path through `review:local`, manual workflow review, and approval gates.
- v0.1.0 final audit mapping the completion definition and explicit user requirements to concrete evidence and remaining approval gates.
- GitHub Actions CI workflow for the same `npm run verify` release-check path.
- One-command local verification through `npm run verify`.
- Browser UI smoke through `npm run ui:smoke`, covering workspace tabs, main actions, language switching, prompt examples, animation presets, and download flows.
- Local doctor script for required files, handoff folder writability, and Codex command availability.
- Manual handoff guide for inbox / assets / outbox workflows when `codex exec` is unavailable.
- Manual handoff status copy now points users back to `Import Latest` after returning an outbox image.
- v0.1.0 acceptance evidence mapping the public baseline workflows, local-first boundary, manual handoff path, and release gates to review artifacts.
- v0.1.0 owner decision record separating local-first baseline acceptance from owner approval gates for merge, public visibility, tag, and release.

### Notes

- The app itself does not call OpenAI APIs directly and does not require an API key.
- Repository visibility is public for v0.1.0; upstream pull request intake is disabled or limited while the direction is owner-curated.
- In the current Windows test environment, the WindowsApps Codex desktop shim cannot be launched as a subprocess, while the terminal-runnable `%LOCALAPPDATA%\OpenAI\Codex\bin\...\codex.exe` path passes runner preflight and no-image runner completion. Image generation/editing availability still depends on the Codex environment.
