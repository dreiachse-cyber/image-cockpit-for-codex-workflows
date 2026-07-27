# Animal, Chibi, and Beastfolk Prompt Preset QA

## Scope

- Date: 2026-07-28 JST
- Branch: `codex/animal-chibi-beastfolk-presets`
- Base: `origin/main` at `5a2fe656a9fa50ef3da9a63a6a880640cdb53bfb`
- Added presets: 30 total
  - Animals: 10
  - Chibi Boys: 5
  - Chibi Girls: 5
  - Beastfolk: 10

## Preview generation

- Mode: built-in ImageGen, one initial generation call per preview asset, plus one focused rabbit retake after visual review
- Style references:
  - Animals: `public/prompt-examples/monster-baby-dragon.png`
  - Chibi Boys: `public/prompt-examples/basic-two-head-chibi-knight.png`
  - Chibi Girls: `public/prompt-examples/basic-two-head-chibi-healer.png`
  - Beastfolk: `public/prompt-examples/monster-young-minotaur.png`
- Output contract: one full-body centered subject, animation-ready silhouette, no cast shadow, transparent background preferred, flat chroma fallback
- Chroma cleanup: the supplied `remove_chroma_key.py` helper was used after generation
- Color-sensitive exceptions: the pink-afro dancer and red-panda beastfolk used hard-key magenta removal to preserve subject colors

## Post-processing

- Final format: 1254 × 1254 RGBA PNG
- Subject fit: alpha bounds centered to within 0.5 px on both axes with at least 32 px padding; oversized subjects were nearest-neighbor scaled to fit within 1000 px
- Debris cleanup: disconnected alpha components of 16 px or fewer were removed
- Removed stray pixels: 1,165 total across the normalization, final cleanup, and recentering passes
- Raw ImageGen outputs are retained under ignored local working storage at `tmp/prompt-presets/raw/`

## Mechanical QA

All 30 assets pass the following checks:

- dimensions are at least 1024 × 1024
- alpha transparency exists
- all four corners are transparent
- subject padding is at least 32 px
- no subject pixel touches an image edge
- no disconnected tiny alpha debris remains
- visible alpha bounds are centered within 1 px on both axes

Machine-readable results: [`asset-qc.json`](./asset-qc.json)

Visual overview (local QA evidence, intentionally ignored by the repository): `docs/qa/prompt-examples/animal-chibi-beastfolk-presets/contact-sheet.png`

## Visual review

- Animal silhouettes remain immediately distinguishable across dog, cat, red panda, fox, rabbit, panda, lion, tiger, wolf, and bear
- Chibi boy and chibi girl variants differ by hair silhouette, palette, outfit, and role while keeping the existing two-head-tall house style
- Beastfolk previews are animal-headed bipeds rather than humans with decorative ears, covering wolf, cat, fox, rabbit, tiger, lion, bear, red panda, deer, and goat
- The pink-afro preview was reprocessed after detecting chroma despill, then visually rechecked with its intended hair color preserved
- The rabbit was retaken after review so two front paws and two hind paws remain distinctly visible
- Deer and goat prompt wording was aligned with their fur-covered paw-hands while retaining cloven hoof feet

## Automated verification

- `node --check scripts/release-audit.mjs`: passed
- `node --check scripts/ui-smoke.mjs`: passed
- `tsc --noEmit`: passed
- `vitest run`: 12 files / 227 tests passed
- `node scripts/doctor.mjs`: passed with no hard setup failures
- `node scripts/release-audit.mjs`: passed
- `node scripts/smoke.mjs`: passed
- `git diff --check`: passed
- production build (`tsc -b` + `vite build`): passed; 1,608 modules transformed
- full browser UI smoke: passed in 328.2 seconds, including 137 loaded prompt previews, 10 Animals, 5 Chibi Boys, 5 Chibi Girls, 10 Beastfolk, English and Japanese labels, and representative Use Prompt behavior

The first UI-smoke attempt exposed a stale test phrase for the dog after its final design changed to a Shiba-like mixed breed. The expectation was aligned with the shipped prompt and the complete smoke suite then passed.

A later full-suite attempt reached the unrelated existing Motion Browser autofocus assertion during a timing fluctuation. No product change was made; an unchanged rerun passed the autofocus check and completed the full suite.
