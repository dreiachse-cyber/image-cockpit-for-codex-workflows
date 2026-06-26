# Jump / Hop candidate-001 prompt

- Generated at: 2026-06-27T02:14:00+09:00
- Generated with: built-in image_gen
- Source job id: codex-job-2026-06-25T21-33-50-977Z
- Official replacement: false
- Source reference: `docs/qa/core-animation-quality-uplift/retakes/jump-hop/candidate-001/source/source-reference.png`
- Current AB baseline: `public/samples/jump-hop-sheet.png`

## Candidate prompt

```text
Create a production-quality pixel-art game sprite sheet candidate for the same girl adventurer character shown in the provided source reference. Use the current jump/hop sheet only as a structural baseline to improve, not as a tracing target.

Animation: jump / hop loop, 8 frames per direction, 5 directions. The motion should read clearly: anticipation crouch, upward lift, apex hang, descent, landing squash, recover. Improve the current baseline by keeping the character scale more consistent between frames, leaving safe padding at the jump apex, and avoiding feet/hair/weapon cropping.

Canvas and grid contract: one single rectangular sprite sheet, exact layout 2048x1280 if possible, 8 columns x 5 rows, each cell 256x256. Rows top-to-bottom: front, front-right diagonal, right side, back-right diagonal, back. Columns left-to-right: frames 1 through 8. Do not draw grid lines, labels, numbers, UI, captions, borders, or watermarks.

Character identity: keep the same young adventurer girl: brown ponytail with red ribbon, green cape, cream blouse, blue skirt, brown boots, small sword/dagger. Pixel art style should match a polished JRPG sprite, crisp edges, readable silhouette, no photorealism.

Background: solid chroma key magenta #ff00ff behind every sprite, completely flat and uniform. No shadows, effects, gradients, transparency, outlines outside the sprite, or colored floor marks.

Quality requirements: every frame must be centered inside its 256x256 cell, no cropped body parts, consistent proportions across all frames, five directions must be distinct and coherent, and the back rows must show the cape and ponytail from behind. This is an AB-test candidate; prioritize clean animation readability over extra decoration.
```
