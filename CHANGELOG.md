# Changelog

## Unreleased

No unreleased changes yet.

## v0.1.4 - 2026-07-01

Experimental Effect Animation MVP release after v0.1.3.

### Added

- Added the Effect Animation workflow with Slash Arc, Hit Spark, Magic Cast, Projectile, and Impact categories.
- Added effect controls for type, style, palette, frame count, canvas size, sheet layout, loop mode, anchor, and preview background.
- Added effect-specific preview surfaces for transparent sheet review, looping GIF preview, frame timeline, quality rank, and history metadata.
- Added effect export options for Effect GIF, Effect APNG / Animated APNG, Sheet PNG, Frames ZIP, Metadata JSON, and Effect Pack ZIP.
- Added QA evidence for deterministic browser trials and real Codex/imagegen trials across all five MVP categories.

### Changed

- The Vite watcher now handles the new effect workflow files without losing the local dev-server session during iteration.
- Effect result cards are compact, showing the category and rank/frame/size summary instead of long sheet filenames and metadata.
- Download and history handling now treats effect results as final export assets while keeping image-edit numbered regions disabled for them.

### Verification

- v0.1.4 release prep tracks package/app/API version `0.1.4`.
- Effect Animation QA passed five-category browser coverage, real imagegen import coverage, GIF loop preview checks, Animated APNG export checks, and compact Effect result card screenshot checks.
- The app still does not call OpenAI APIs directly, and no model weights, API keys, tokens, generated handoff folders, or license-unclear assets are included.

## v0.1.3 - 2026-06-30

Recursive animation QA and review-gallery update after v0.1.2.

### Added

- Recursive browser-test QA artifacts for the animation matrix under `docs/qa/image-animation-recursive-browser-test-loop/20260630-0150/`.
- Source and trial overview gallery at `index.html`, plus failed sprite review gallery at `failed-sprite-sheets.html`.
- Animated GIF previews for failed 5-direction sprite rows so rejected candidates can be reviewed frame-by-frame.
- Recursive source restoration and rerun coverage for repeated animation trials from the same generated source image.

### Changed

- Animation preset identity prompts and runner contracts now stress that generated direction PNGs are animation sheets, not still references.
- Idle Breathing quality gates now accept readable subtle breathing across two directions while keeping hard static-copy guards.
- Run Cycle and Walk Cycle motion checks use calibrated thresholds so readable back-run and small-character walk loops are not blocked by generic motion gates.
- Generated-output rights are documented more clearly for local Codex/imagegen handoff workflows.

### Fixed

- Animation Generation restores the original source when returning from an animation result, keeping repeat trials enabled.
- Direction-split and generic single-image outbox detection now preserve useful diagnostics instead of collapsing recoverable outputs into no-image failures.
- The recursive QA loop no longer records false successes for quality-gated failed animation candidates.

### Verification

- v0.1.3 release prep tracks package/app/API version `0.1.3`.
- Recursive animation QA verification passed typecheck, tests, build, smoke, release audit, and browser UI smoke after the threshold fixes.
- The failed sprite gallery local-link and GIF metadata checks passed.

## v0.1.2 - 2026-06-29

Animation delivery reliability and operator-feedback update after v0.1.1.

### Added

- Animation delivery browser smoke, baseline, and rollup scripts for measuring real browser delivery success.
- QA evidence for animation delivery reliability, including current-regime rollups and long-timeout real browser trials.
- Running Codex job progress indicators in the right job panel, compact log cards, and fullscreen log header.
- Settings recovery environment reporting for user-copyable diagnostics.

### Changed

- Standard animation generation now quarantines low-quality candidate artifacts instead of importing debug, raw, bronze, contact-sheet, or partial outputs as final results.
- Animation tournament handling adopts the first two usable candidates for AB scoring and publishes only the winning final artifact.
- Animation delivery waits longer for real Codex/imagegen runs before treating jobs as stale, reducing false failures on slow but successful jobs.
- Recovery and import filters are stricter about detached direction-split outputs, local-generator artifacts, and stale intermediate files.

### Fixed

- Detached direction-split outputs can be recovered into final sheets when manifest and direction PNGs are available.
- Completed Codex jobs with hidden or staged animation artifacts no longer leave the UI in misleading success/running states.
- Animation results with chroma, transparency, bbox, or motion-quality problems are blocked from normal history/download flows until they pass the quality gate.
- The UI now shows motion progress for long-running jobs without pretending the job is complete.

### Verification

- v0.1.2 release prep tracks package/app/API version `0.1.2`.
- Current-regime animation delivery rollup reached the documented delivery SLO before release prep.
- Browser UI smoke covers the running-job progress indicator with a mock runner.

## v0.1.1 - 2026-06-27

Stability, recovery, and animation workflow update after the v0.1.0 public baseline.

### Added

- Prompt Examples modal with preview images, copy buttons, and one-click loading into Pixel Art Generation.
- Basic, profession-oriented, and monster prompt examples with generated preview assets.
- Pixel-art-to-animation workflow with selected source images, motion presets, 5-direction previews, GIF/WebP/sprite-sheet downloads, and direction-split artifact handling.
- Official animation preset coverage expanded to 16 sample sheets with QA galleries, transparency audits, mechanical QA artifacts, and direction GIFs.
- Cockpit health diagnostics and loopback-only dev supervisor repair actions for local API/Vite target mismatches.
- Recover Results and Local Inbox dedupe controls for outbox imports and polluted browser history.
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
- Local Inbox imports now use stable import keys and exact duplicate cleanup, preventing unchanged bronze-candidate snapshots from being imported repeatedly.
- Dev supervisor repair skips API restart when a running Codex job is present.
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
- The dev supervisor is limited to local development repair operations and is not part of packaged builds.

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
