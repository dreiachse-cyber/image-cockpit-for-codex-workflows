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

1. Choose `1. Image Generation` or `2. Image Editing` from Guided Start.
2. Fill in the prompt and notes.
3. For image editing, draw any needed annotations on the canvas.
4. Click `Create Codex Job`.

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

- `workflowMode`: `image-generate`, `image-edit`, `sprite-generate`, or `sprite-edit`
- `prompt`, `negativePrompt`, and `jobNotes`
- `selectedImage.assetPath` for image editing jobs
- `annotationContext.annotations` for canvas markup
- `spriteContext` for sprite sheet jobs
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

In the app, click `Import Latest` to bring the returned image back into the cockpit. The button is visible in the simple workflow screen even when the provider list is hidden.

From there you can:

- keep editing the image,
- split a sheet into sprite frames,
- adjust frame order, size, anchors, and chroma key cleanup,
- export PNG sheet, ZIP frames, GIF, or JSON metadata.

## Troubleshooting

- If no image appears, confirm the file is under `codex-handoff/outbox/` and uses a supported image extension.
- If the job button stays locked, check `codex-handoff/status/` for the job state and use Local Inbox after placing a newer image in the outbox.
- If autorun should be retried later, set `IMAGE_COCKPIT_CODEX_AUTORUN=1` and configure `IMAGE_COCKPIT_CODEX_COMMAND` to a runnable Codex executable path.
