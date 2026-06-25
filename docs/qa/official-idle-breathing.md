# Official Idle Breathing Preset QA

Date: 2026-06-25

## Source

- Built-in image generation output id: `019ef1ff-b668-7400-8bf3-d8ffcff8f989`
- Raw generated sheet size: `1586 x 992`
- Final bundled sheet: `public/samples/idle-breathing-sheet.png`
- Final bundled sheet size: `2048 x 1280`
- Layout: `5 rows x 8 columns`, `256 x 256 px` cells
- Playback: normal loop, 8 source frames

## Cleanup

- Temporary chroma background removed.
- Temporary cyan guide grid removed.
- Residual green/cyan edge pixels removed before QA previews.

## Visual QA

- Grid overlay: `docs/qa/official-idle-breathing/idle-breathing-grid-qa.png`
- Front GIF: `docs/qa/official-idle-breathing/idle-breathing-front.gif`
- Front three-quarter GIF: `docs/qa/official-idle-breathing/idle-breathing-front-three-quarter.gif`
- Side GIF: `docs/qa/official-idle-breathing/idle-breathing-side.gif`
- Back three-quarter GIF: `docs/qa/official-idle-breathing/idle-breathing-back-three-quarter.gif`
- Back GIF: `docs/qa/official-idle-breathing/idle-breathing-back.gif`

## Result

Accepted as the first official animation preset. Motion is intentionally subtle and reads as planted idle breathing rather than walk/run/hop. The true back row is readable as rear-facing, and all directions remain inside the 256 px cells after normalization.
