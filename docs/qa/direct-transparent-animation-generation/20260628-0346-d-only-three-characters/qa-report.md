# Direct Transparent D Additional Character QA

## Summary

- D prompt was rerun on three additional source characters: young male hero, young female ninja, and baby dragon.
- Young female ninja produced direct transparent RGBA direction PNGs and passed alpha checks.
- Young male hero and baby dragon produced only opaque RGB/checkerboard preview images through the available built-in path, so the runner correctly returned blocked sidecars instead of fake successes.
- This supports D as the best visual prompt among successful direct-transparent outputs, but also confirms direct native alpha is still unreliable across characters/providers and should remain opt-in.

## Results

| Character | Job ID | Status | Near transparent ratio | Edge opaque ratio | Notes |
| --- | --- | --- | --- | --- | --- |
| Basic Young Male Hero | codex-job-2026-06-27T18-48-08-090Z | blocked | --- | --- | Built-in image generation produced an RGB image with a drawn transparency preview instead of native alpha, so the direct-transparent sprite contract could not be satisfied. |
| Profession Young Female Ninja | codex-job-2026-06-27T18-51-29-686Z | alpha-pass | 0.7469-0.8196 | 0.0374-0.0518 | alpha-pass; full-color detail requires visual review in comparison.html |
| Monster Baby Dragon | codex-job-2026-06-27T19-02-13-046Z | blocked | --- | --- | The available built-in image generation path produced opaque RGB PNGs instead of direct transparent alpha sprites, so the direct-transparent contract could not be satisfied. |

## Browser QA

- URL: `http://127.0.0.1:64718/comparison.html`
- Viewport: 1280x720
- Result: 9 images loaded, 0 broken images, 0 console errors.
- Screenshots: `browser-summary.png`, `browser-ninja-sheet.png`.
