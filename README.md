# Image Cockpit for Codex Workflows

Private pre-release MVP for a local image production cockpit.

This project is unofficial and not affiliated with OpenAI. It is a local workspace for reviewing, annotating, comparing, correcting, and turning Codex-produced or locally imported images into production assets such as sprite sheets.

![Image Cockpit MVP demo](docs/demo/mvp-demo.gif)

## Product Boundary

Image Cockpit is designed to run on a local machine where Codex is installed. The app itself does not call OpenAI APIs and does not require an API key.

Instead, the cockpit writes local handoff jobs for Codex:

```text
codex-handoff/
  inbox/   # JSON jobs created by Image Cockpit
  assets/  # selected source images copied for a job
  outbox/  # images or metadata returned by Codex/user workflows
```

Codex, the user, or another local workflow can read the inbox job, create or revise assets, and place results in the outbox. Results can then be imported through the Local Inbox / Import flow.

When `IMAGE_COCKPIT_CODEX_AUTORUN=1`, the local handoff server will try to start `codex exec` after writing a job. The app still does not call OpenAI APIs directly; it only launches the locally installed Codex command. If Codex cannot be executed from the current Windows environment, the job remains in `codex-handoff/inbox/` for manual pickup and the UI unlocks instead of waiting forever.

The local API also exposes `GET /api/codex/runner` so the UI can show whether the configured Codex command is ready, disabled for manual handoff, or unavailable before a job is created.

## MVP Flow

- Choose a starting workflow from Guided Start: image generation, image editing, sprite sheet generation, or sprite sheet editing.
- Import local images or use the included original sample sprite sheet.
- Select history items and review them on the canvas.
- Draw annotations with brush, rectangle, or arrow tools.
- Add edit notes, then create a Codex handoff job from the prompt, selected image asset, annotations, workflow, grid, and sprite context.
- Image generation jobs stay prompt-only by default, while image editing jobs include the selected source image and annotations.
- Split a sheet into sprite frames with grid controls.
- Reorder frames in the timeline and edit action metadata.
- Run lightweight QC checks for size consistency, transparency, duplicates, and anchor placement.
- Export a PNG sprite sheet, frame ZIP, GIF, and sprite metadata JSON.

## Setup

```powershell
npm install
npm run dev:all
```

`npm run dev:all` starts both the local handoff API and the Vite app. If the default Vite port is busy, Vite will print the actual local URL.

You can still run the two processes separately:

```powershell
npm run dev:server
npm run dev
```

Optional handoff location:

```powershell
Copy-Item .env.example .env
# Set IMAGE_COCKPIT_HANDOFF_DIR to a local folder if you want jobs written elsewhere.
# Set IMAGE_COCKPIT_CODEX_COMMAND if Codex is installed under a custom executable path.
npm run dev:server
```

Codex autorun settings:

```text
IMAGE_COCKPIT_CODEX_AUTORUN=1       # 0 disables autorun and keeps manual handoff only
IMAGE_COCKPIT_CODEX_COMMAND=codex   # executable used for `codex exec`
IMAGE_COCKPIT_CODEX_SANDBOX=workspace-write
IMAGE_COCKPIT_CODEX_APPROVAL=never
```

Runner status and logs are written locally:

```text
codex-handoff/
  status/  # runner state per job
  logs/    # stdout/stderr from codex exec
```

Runner preflight can be checked directly:

```powershell
Invoke-RestMethod http://127.0.0.1:8787/api/codex/runner
```

## Verification

```powershell
npm run typecheck
npm test
npm run build
npm run smoke
```

## Review

Use `docs/review/mvp-review-report.md` for the private MVP review path, QA evidence, and known constraints.

## Release Candidate

- Changelog: `CHANGELOG.md`
- Release checklist: `docs/release/v0.1.0-checklist.md`
- License: `LICENSE`
- Contribution guide: `CONTRIBUTING.md`
- Security policy: `SECURITY.md`
- Code of conduct: `CODE_OF_CONDUCT.md`

## Roadmap

See `docs/roadmap/release-roadmap.md` for the path from the current private MVP to the first public release.

## Assets And Data

- No API key is required by this app.
- No direct OpenAI API requests are made by this app.
- Optional adapters for local tools can be added later.
- Generated outputs are user-controlled and imported/exported from the browser.
- Sample assets are original generated demo assets for this repository.
- No model weights are included.
- No API keys, tokens, or license-unclear sample assets should be committed.

## Demo

The current MVP demo GIF is `docs/demo/mvp-demo.gif`. See `docs/demo/mvp-demo-capture.md` for the capture plan. Current QA screenshots live under `docs/qa/`.
