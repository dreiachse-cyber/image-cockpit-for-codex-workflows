# Ranged Attack candidate-001 prompt

- Generated at: 2026-06-27T02:14:00+09:00
- Generated with: built-in image_gen
- Source job id: codex-job-2026-06-26T04-20-29-885Z
- Official replacement: false
- Source reference: `docs/qa/core-animation-quality-uplift/retakes/ranged-attack/candidate-001/source/source-reference.png`
- Current AB baseline: `public/samples/ranged-attack-sheet.png`

## Candidate prompt

```text
Create a production-quality pixel-art game sprite sheet candidate for the same androgynous traveler / ranged attacker character shown in the provided source reference. Use the current ranged attack sheet only as an AB baseline to improve; do not simply copy it.

Animation: ranged attack loop with a small hand crossbow or compact magical launcher, 8 frames per direction, 5 directions. The motion should read clearly as: idle ready, raise/aim, aim hold, fire flash/projectile start, recoil, lower weapon, recover, return to idle. Improve the baseline only if possible by keeping the character identity and proportions extremely consistent, keeping the weapon connected to the hands, and making the firing moment clearer without big distracting effects.

Canvas and grid contract: one single rectangular sprite sheet, exact layout 2048x1280 if possible, 8 columns x 5 rows, each cell 256x256. Rows top-to-bottom: front, front-right diagonal, right side, back-right diagonal, back. Columns left-to-right: frames 1 through 8. Do not draw grid lines, labels, numbers, UI, captions, borders, or watermarks.

Character identity: keep the same traveler: short dark gray hair, soft androgynous face, tan-beige long coat with worn hem, dark scarf, brown backpack, belt pouches, brown boots, muted practical fantasy palette. Pixel-art style should match a polished JRPG sprite, crisp edges, readable silhouette, no photorealism.

Background: solid chroma key magenta #ff00ff behind every sprite, completely flat and uniform. No shadows, floor marks, gradients, transparency, UI, or decorative background.

Quality requirements: every frame must be centered inside its 256x256 cell, no cropped hands/weapon/projectile/backpack, consistent proportions across all frames, five directions must be distinct and coherent, and firing spark/projectile should remain small and inside the cell with safe padding. This is an AB-test candidate; if improvements conflict with character fidelity, prioritize fidelity and clean layout.
```
