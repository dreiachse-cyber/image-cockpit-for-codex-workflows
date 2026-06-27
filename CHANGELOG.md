# Changelog

## Unreleased

No unreleased changes yet.

## v0.1.1 - 2026-06-27

Stability, recovery, and animation workflow update after the v0.1.0 public baseline.

### Added

- Prompt Examples modal with preview images, copy buttons, and one-click loading into Pixel Art Generation.
- Basic, profession-oriented, and monster prompt examples with generated preview assets.
- Pixel-art-to-animation workflow with selected source images, motion presets, 5-direction previews, GIF/WebP/sprite-sheet downloads, and direction-split artifact handling.
- Official animation preset coverage expanded to 16 sample sheets with QA galleries, transparency audits, mechanical QA artifacts, and direction GIFs.
- Local animation library pack import/export foundations.
- Public launch materials, refreshed README screenshots, current demo GIF, and X/Twitter launch copy.
- `POST /api/generate` local generation endpoint and optional real imagegen smoke through `npm run imagegen:smoke`.
- Public privacy guard in release audit and environment-neutral Codex CLI evidence paths in public docs.

### Changed

- The app opens directly into the working cockpit instead of a guided-start screen.
- Workflow controls, preview toolbar behavior, selected result previewing, and download behavior were simplified across Pixel Art Generation, Image Editing, and Animation Generation.
- Codex job status moved above the results list for easier scanning.
- Codex generation concurrency increased to 3 active jobs.
- Codex log cards now match the 3-job concurrency limit, with latest-line following and fullscreen log viewing.
- Animation final artifacts are kept out of editable image-source flows.
- Large history and frame state moved toward IndexedDB-backed persistence with lightweight localStorage summaries.

### Fixed

- Completed Codex job import failures now release the active job slot instead of leaving jobs stuck as running.
- Job completion and auto-import matching now use exact job IDs to avoid importing unrelated results.
- Stale Codex runner jobs are handled more gracefully.
- Direction-split imports now wait for usable manifests and verified artifacts instead of treating partial files as complete.
- Temporary, staging, contact-sheet, debug, work, and QA artifacts are filtered out from normal Local Inbox imports.
- Image Editing now keeps full-body source images visible, records source-image annotation coordinates, and reinforces no-crop / no-zoom handoff prompts.
- Static result previews, animation persistence, exports, chroma-key handling, and walk/run sample alignment were tightened.

### Recovery

- Added safe local recovery mode at `http://127.0.0.1:<port>/?safe=1`.
- Added static browser-state reset page at `http://127.0.0.1:<port>/reset-local-state.html`.
- Added storage preflight and a recovery screen for oversized Image Cockpit browser state.
- Reset and safe-mode routes clear or bypass only Image Cockpit browser-side state; they do not delete repository files or `codex-handoff/outbox` artifacts.

### Known limitations

- Image generation and image editing still depend on the local Codex/imagegen environment available to the user.
- Direct OpenAI API, ComfyUI, AUTOMATIC1111, Replicate, and other provider adapters are still not part of the shipped baseline.
- Advanced game-engine exporters, full background removal, and deeper sprite QC remain future work.
- Dev-supervisor repair controls and stronger duplicate bronze-candidate import prevention from 027/028 are not included in this v0.1.1 draft unless those branches are merged before the final tag approval.

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
