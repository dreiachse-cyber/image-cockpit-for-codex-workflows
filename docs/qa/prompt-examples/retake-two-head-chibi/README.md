# Two-Head Chibi Prompt Asset Retake

Date: 2026-07-02

## Why

The first two-head chibi preview assets were cut from one 3x3 imagegen contact sheet. That saved time, but several previews had low-quality artifacts: small foot debris, uneven padding, and risk of cropped head or top accessories.

This retake uses one built-in imagegen prompt per character.

## Method

- Generate nine characters individually with built-in imagegen.
- Use a flat `#FF00FF` chroma-key background for every raw source.
- Require a single isolated character, not a sheet.
- Require at least 15% flat background space above the head and below the feet.
- Remove chroma key locally, drop tiny detached debris components, and fit each result to a centered 512x512 transparent PNG.
- Replace the public prompt example preview PNGs.
- Strengthen the stored prompt text and negative prompt to avoid cropped heads, cropped hats, edge touching, detached debris, and loose pixels near the feet.

## Files

- `raw-01-knight.png` through `raw-09-dragon-tamer.png`: original built-in imagegen outputs copied from the Codex generated image cache.
- `transparent-01-knight.png` through `transparent-09-dragon-tamer.png`: final transparent 512x512 previews, mirrored to `public/prompt-examples/`.
- `retake-contact-sheet.png`: visual review contact sheet.
- `browser-prompt-modal-1280x720.png`: browser QA screenshot for the prompt example modal.
- `browser-chibi-cards-1280x720.png`: browser QA screenshot showing the retaken chibi cards in the modal.
- `retake-qc.json`: per-asset alpha, component, bbox, and margin metrics.

## QC Summary

| Asset | Source size | Final bbox | Margins L/T/R/B | Kept components | Removed tiny debris area | Edge touch |
| --- | --- | --- | --- | --- | --- | --- |
| knight | 1254x1254 | 120,66,392,446 | 120 / 66 / 120 / 66 | 1/7 | 8 px | no |
| mage | 1254x1254 | 108,66,404,446 | 108 / 66 / 108 / 66 | 1/5 | 9 px | no |
| archer | 1254x1254 | 150,66,362,446 | 150 / 66 / 150 / 66 | 1/7 | 6 px | no |
| healer | 1254x1254 | 116,66,396,446 | 116 / 66 / 116 / 66 | 1/5 | 5 px | no |
| ninja | 1254x1254 | 140,66,372,446 | 140 / 66 / 140 / 66 | 1/5 | 6 px | no |
| alchemist | 1254x1254 | 152,66,359,446 | 152 / 66 / 153 / 66 | 1/2 | 1 px | no |
| pirate | 1254x1254 | 122,66,389,446 | 122 / 66 / 123 / 66 | 1/6 | 8 px | no |
| robot | 1024x1536 | 151,66,360,446 | 151 / 66 / 152 / 66 | 1/2 | 1 px | no |
| dragon-tamer | 1254x1254 | 169,66,343,446 | 169 / 66 / 169 / 66 | 1/3 | 2 px | no |

## Visual Result

Manual visual review of `retake-contact-sheet.png`:

- No obvious foot debris remains.
- No head, hat, horns, antenna, or feet are cropped.
- The nine previews are centered and consistently padded.
- The result is a clear upgrade over the 3x3 contact-sheet cutout approach.
- Browser QA on `http://127.0.0.1:5283/` confirmed 87 prompt cards, 87 loaded preview images, 9 loaded two-head chibi images, and 0 broken images.
