# Changelog

## 0.1.0-rc.1 - 2026-06-23

Private release candidate for the first local Image Cockpit MVP.

### Added

- Guided Start with four workflows: image generation, image editing, sprite sheet generation, and sprite sheet editing.
- Local-only Codex handoff through `codex-handoff/inbox/`, `assets/`, `outbox/`, `status/`, and `logs/`.
- Optional `codex exec` runner launched by the local server when `IMAGE_COCKPIT_CODEX_AUTORUN=1`.
- Optional JSON arg overrides for Codex runner wrappers and smoke coverage for a mock autorun runner reaching completed state.
- Windows Codex command diagnostics and automatic preference for the terminal-runnable `%LOCALAPPDATA%\OpenAI\Codex\bin\...\codex.exe` CLI when the WindowsApps desktop shim is also present.
- Current Codex CLI runner args using `-c approval_policy="<approval>"` instead of the removed `--ask-for-approval` flag.
- Real no-image `codex exec` runner smoke confirming the installed Codex CLI can complete a local handoff job and write a Markdown sidecar to outbox.
- Re-runnable real Codex runner smoke through `npm run codex:smoke`.
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
- v0.1.0 release notes draft for the first public release approval gate.
- GitHub Actions CI workflow for the same `npm run verify` release-check path.
- One-command local verification through `npm run verify`.
- Browser UI smoke through `npm run ui:smoke`, covering Guided Start, all four workflow routes, main actions, language switching, and core sprite-edit controls.
- Local doctor script for required files, handoff folder writability, and Codex command availability.
- Manual handoff guide for inbox / assets / outbox workflows when `codex exec` is unavailable.
- Manual handoff status copy now points users back to `Import Latest` after returning an outbox image.
- v0.1.0 acceptance evidence mapping the four primary workflows, local-first boundary, manual handoff path, and release gates to review artifacts.
- v0.1.0 owner decision record separating private-MVP acceptance from owner approval gates for merge, public visibility, tag, and release.

### Notes

- The app itself does not call OpenAI APIs directly and does not require an API key.
- Repository visibility remains private until owner approval for the first public release.
- In the current Windows test environment, the WindowsApps Codex desktop shim cannot be launched as a subprocess, while the terminal-runnable `%LOCALAPPDATA%\OpenAI\Codex\bin\...\codex.exe` path passes runner preflight and no-image runner completion. Image generation/editing availability still depends on the Codex environment.
