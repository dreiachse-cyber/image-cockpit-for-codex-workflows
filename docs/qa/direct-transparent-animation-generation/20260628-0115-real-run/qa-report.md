# Direct Transparent Animation Generation QA Report

## Summary

- Baseline chroma-key run succeeded and produced five 1024x512 direction PNGs.
- Direct transparent variant A did not produce usable alpha output and returned a blocked sidecar instead of a fake success.
- Direct transparent variant B produced real alpha, but visual quality is poor because the sprite became a black silhouette/mask.
- Direct transparent variants C and D produced real alpha and preserved usable full-color sprite detail.
- Direct transparent stays behind the hidden `animationBackgroundMode=direct-transparent` mode; default remains chroma-key.

## Alpha And Visual QA

| Label | Job ID | Alpha | Visual | Adoption candidate | Near transparent ratio | Edge opaque ratio | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| baseline-chroma-key | codex-job-2026-06-27T16-17-01-671Z | PASS | pass | no | 0.671-0.773 | 0.000-0.006 | reference chroma-key baseline after green removal |
| direct-transparent-b-no-checkerboard | codex-job-2026-06-27T16-28-44-549Z | PASS | fail-silhouette | no | 0.658-0.764 | 0.000-0.000 | alpha-pass but visual quality is poor: black silhouette/mask-like output<br>frame 0 possible internal transparent hole: 937px |
| direct-transparent-c-alpha-contract | codex-job-2026-06-27T16-40-58-676Z | PASS | pass | yes | 0.613-0.696 | 0.001-0.028 | alpha-pass and visual quality is usable/full color<br>145 opaque chroma-green-like pixels remain<br>90 opaque chroma-green-like pixels remain<br>215 opaque chroma-green-like pixels remain<br>35 opaque chroma-green-like pixels remain |
| direct-transparent-d-color-preserve | codex-job-2026-06-27T17-02-26-534Z | PASS | pass | yes | 0.639-0.692 | 0.000-0.000 | alpha-pass and visual quality is usable/full color<br>905 opaque chroma-green-like pixels remain<br>434 opaque chroma-green-like pixels remain<br>468 opaque chroma-green-like pixels remain<br>580 opaque chroma-green-like pixels remain<br>160 opaque chroma-green-like pixels remain |

## Artifacts

- `comparison.html` contains the browser comparison view.
- `browser-comparison.png` is the captured browser QA summary screenshot.
- `browser-direct-d.png` is the captured browser screenshot for the direct transparent D sheet.
- `alpha-qa.json` contains per-direction alpha statistics and pass/fail details.
- `baseline-chroma-key/composed-sheet.png` is the chroma-key baseline after green removal.
- `direct-transparent-c-alpha-contract/composed-sheet.png` and `direct-transparent-d-color-preserve/composed-sheet.png` retain direct alpha output and usable color detail.
- Each label directory contains raw direction PNGs, processed PNGs, and checkerboard GIFs.

## Browser QA

- URL: `http://127.0.0.1:59138/comparison.html`
- Viewport: 1280x720
- Result: 24 images loaded, 0 broken images, 0 console errors.
- Checked: baseline sheet, direct transparent sheets, GIF comparison table, direct A blocked sidecar.

## Decision

Direct transparent generation is viable as an opt-in experiment because C and D both produced usable alpha plus full-color sprite detail. It should not replace chroma-key as the default yet, because A failed to produce native alpha and B passed alpha while failing visual quality.
