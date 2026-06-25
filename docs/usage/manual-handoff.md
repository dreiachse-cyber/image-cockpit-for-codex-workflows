# Manual Handoff Guide

Use this path when the local server cannot launch `codex exec`, or when you want to review every file exchange by hand.

Image Cockpit itself does not call OpenAI APIs directly. It writes local job files, then imports image files that are placed back into the local outbox.

## 1. Check The Local Setup

```powershell
npm run doctor
```

If the Codex runner reports `spawn EPERM`, `unavailable`, or another launch warning, manual handoff is still usable as long as the handoff folders are writable.

To make manual mode explicit:

```powershell
Copy-Item .env.example .env
```

Then set:

```text
IMAGE_COCKPIT_CODEX_AUTORUN=0
```

## 2. Start Image Cockpit

```powershell
npm run dev:all
```

Open the local Vite URL printed in the terminal.

## 3. Create A Handoff Job

1. Choose the Pixel Art Generation, Image Editing, or Animation Generation tab.
2. Fill in the prompt, edit notes, or animation preset fields required by that workflow.
3. For image editing, select numbered rectangular regions on the canvas and add comments for each region.
4. For animation generation, choose or upload a pixel-art source and select a validated motion preset.
5. Click the workflow generation button.

The local server writes a JSON job under:

```text
codex-handoff/inbox/
```

For image editing jobs, selected source images are copied under:

```text
codex-handoff/assets/
```

## 4. Process The Job Manually

Open the newest JSON file in `codex-handoff/inbox/`.

Important fields:

- `workflowMode`: `image-generate`, `image-edit`, or `sprite-generate` (`sprite-generate` is the internal handoff name for Animation Generation)
- `prompt`, `negativePrompt`, and `jobNotes`
- `selectedImage.assetPath` for image editing jobs
- `annotationContext.annotations` for canvas markup
- `spriteContext` for animation / sprite-sheet jobs
- `returnTo.outboxDir` for the required result location

Use Codex or another local image workflow outside the app to create or edit the image. Do not put API keys, tokens, model weights, or license-unclear files into the repository.

## 5. Return The Result

Place the final image file in:

```text
codex-handoff/outbox/
```

Supported import formats:

- `.png`
- `.webp`
- `.jpg` / `.jpeg`
- `.gif`

Non-image notes can live next to the image for your own reference, but Image Cockpit imports image files only.

If Codex or imagegen cannot return an image because of safety checks, usage-policy checks, unavailable imagegen capability, or runner failure, do not create a placeholder image. Write a small blocker sidecar such as `<jobId>-blocked.json` in `codex-handoff/outbox/`. Image Cockpit will show a failure notice in Results and keep the queue moving.

## 6. Import Through Local Inbox

In the app, use the local results import path or reload the workspace to bring returned outbox images back into the cockpit. The current UI also polls pending local Codex jobs and imports matching returned images automatically when the runner is available.

From there you can:

- keep editing the image,
- use it as an animation source,
- review generated direction GIFs and sprite sheets,
- export PNG stills, animation GIF/WebP previews, sprite sheets, frame ZIPs, or animation packs.

## Troubleshooting

- If no image appears, confirm the file is under `codex-handoff/outbox/` and uses a supported image extension.
- If the job button stays locked, check `codex-handoff/status/` for the job state and use Local Inbox after placing a newer image in the outbox.
- If autorun should be retried later, set `IMAGE_COCKPIT_CODEX_AUTORUN=1` and configure `IMAGE_COCKPIT_CODEX_COMMAND` to a runnable Codex executable path.
