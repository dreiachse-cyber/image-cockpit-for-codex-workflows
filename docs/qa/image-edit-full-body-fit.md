# Image Editing Full-Body Fit QA

Date: 2026-06-27

## Scope

This QA note covers the Image Editing full-body fit fix:

- The edit canvas keeps the whole selected image visible with `object-fit: contain`.
- `annotationContext.annotations` carries the original canvas rectangle plus `imageRectNormalized` and `imageRectPixels` source-image rectangles.
- The handoff prompt and runner notes preserve the original canvas size and aspect ratio.
- The edit contract says not to zoom, crop, or reframe into a portrait/detail shot.
- The full character should remain visible, including head, hair, hands, equipment, and both feet.
- Transparency should be preserved when present; otherwise a flat chroma fallback is allowed.

## Automated Coverage

Executed checks in this implementation thread:

- `npm test`: passed. Validates the portrait full-body source fit math and canvas-to-source annotation coordinate conversion.
- `npm run smoke`: passed. Validates the server keeps `imageRectNormalized` / `imageRectPixels` in the handoff job JSON and includes the no-crop notes.
- `npm run ui:smoke`: passed. Uploads a tall full-body PNG fixture, creates an Image Editing job while the Codex log panel is visible, and checks that the canvas/result preview, workspace, download panel, and Codex log panel do not overlap.
- `npm run release:audit`: passed. Validates the guard markers for the fit math, source-image coordinates, no-crop prompt contract, UI smoke, and this QA note.

## Real Imagegen Editing

Real imagegen editing was not run in this implementation QA path. The automated smoke uses a local mock Codex runner so the test can deterministically inspect the handoff JSON, log-panel layout, transparent result import, and download flow without spending image-generation time or depending on an interactive image editing backend.

Manual follow-up remains useful before a release tag:

1. Upload a tall full-body character with transparent background.
2. Keep the Codex log panel visible.
3. Select a small numbered region, add an edit comment, and run Image Editing through a real imagegen-capable Codex environment.
4. Confirm the returned image keeps the original aspect ratio, preserves transparency or uses a flat chroma fallback, and shows the full character including both feet.
