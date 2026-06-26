# Basic Attack candidate-001 prompt

- Generated at: 2026-06-27T02:14:00+09:00
- Generated with: built-in image_gen
- Source job id: codex-job-2026-06-25T21-02-07-575Z
- Official replacement: false
- Source reference: `docs/qa/core-animation-quality-uplift/retakes/basic-attack/candidate-001/source/source-reference.png`
- Current AB baseline: `public/samples/basic-attack-sheet.png`

## Candidate prompt

```text
Create a production-quality pixel-art game sprite sheet candidate for the same young male hero character shown in the provided source reference. Use the current basic attack sheet only as an AB baseline to improve; do not simply copy it.

Animation: basic sword attack loop, 8 frames per direction, 5 directions. The motion should read clearly as: ready stance, wind-up, slash start, slash follow-through, impact accent, recovery, return to idle. Improve the baseline by keeping the body scale and head size consistent, keeping the sword attached to the hand, avoiding stretched arms, and keeping slash effects clean but not oversized.

Canvas and grid contract: one single rectangular sprite sheet, exact layout 2048x1280 if possible, 8 columns x 5 rows, each cell 256x256. Rows top-to-bottom: front, front-right diagonal, right side, back-right diagonal, back. Columns left-to-right: frames 1 through 8. Do not draw grid lines, labels, numbers, UI, captions, borders, or watermarks.

Character identity: keep the same anime JRPG young male hero: brown spiky hair, blue scarf and blue tunic, white trousers, brown boots and gloves, silver shoulder armor, blue cape, sword. Pixel-art style should match a polished JRPG sprite, crisp edges, readable silhouette, no photorealism.

Background: solid chroma key magenta #ff00ff behind every sprite, completely flat and uniform. No shadows, floor marks, gradients, transparency, UI, or decorative background.

Quality requirements: every frame must be centered inside its 256x256 cell, no cropped sword/body/cape, consistent proportions across all frames, five directions must be distinct and coherent, and attack effects should stay within the cell with at least 12 px safe padding. This is an AB-test candidate; prioritize body consistency and animation readability over flashy effects.
```
