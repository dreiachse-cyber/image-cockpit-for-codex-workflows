# Official Animation Preset Next 5 QA

Date: 2026-06-26
Branch: `codex/official-animation-preset-next-5`

## Scope

This pass adds five pilot official animation presets:

- `ranged-attack`
- `skill-release`
- `knockback`
- `item-use`
- `talk`

All five samples are real Codex/imagegen generations. Each source job returned five direction PNG files, which were cleaned, normalized to 256x256 cells, composed into a 2048x1280 5-direction x 8-frame sprite sheet, and checked with grid QA.

## Stability Gate Note

The full 5-run stability gate from `015_official_animation_preset_next_5_handoff.md` was not completed in this pass because live Codex/imagegen jobs averaged roughly 8 to 13 minutes per two-job batch. Treat these as accepted pilot samples and prompt-contract candidates, not as statistically stable prompts yet.

For each preset below:

- Stability attempts: 1
- Structural pass: 1
- Structural fail: 0
- Full 5-run stability gate: pending

## Accepted Samples

| Preset | Job ID | Source image | Sheet | Mechanical QA | Visual QA |
| --- | --- | --- | --- | --- | --- |
| `ranged-attack` | `codex-job-2026-06-25T22-50-31-178Z` | `basic-androgynous-traveler.png` | `public/samples/ranged-attack-sheet.png` | pass | pass |
| `skill-release` | `codex-job-2026-06-25T23-05-13-732Z` | `forest-mage-idle.png` | `public/samples/skill-release-sheet.png` | pass | pass |
| `knockback` | `codex-job-2026-06-25T23-05-13-783Z` | `basic-young-male-hero.png` | `public/samples/knockback-sheet.png` | pass | pass |
| `item-use` | `codex-job-2026-06-25T23-15-35-242Z` | `basic-elder-female-herbalist.png` | `public/samples/item-use-sheet.png` | pass | pass |
| `talk` | `codex-job-2026-06-25T23-18-46-956Z` | `basic-small-village-child.png` | `public/samples/talk-sheet.png` | pass | pass |

## QA Artifacts

- `docs/qa/official-ranged-attack/ranged-attack-grid-qa.png`
- `docs/qa/official-ranged-attack/ranged-attack-mechanical-qa.json`
- `docs/qa/official-skill-release/skill-release-grid-qa.png`
- `docs/qa/official-skill-release/skill-release-mechanical-qa.json`
- `docs/qa/official-knockback/knockback-grid-qa.png`
- `docs/qa/official-knockback/knockback-mechanical-qa.json`
- `docs/qa/official-item-use/item-use-grid-qa.png`
- `docs/qa/official-item-use/item-use-mechanical-qa.json`
- `docs/qa/official-talk/talk-grid-qa.png`
- `docs/qa/official-talk/talk-mechanical-qa.json`

Each preset directory also contains five direction GIFs for visual review.

## Prompt Contract Revisions

Common contract changes:

- Required at least 24px of inner padding whenever possible.
- Explicitly constrained held items, projectiles, weapons, and effects to remain inside their own 256px cell.
- Strengthened rejection criteria for cropped head, cropped feet, duplicated heads, body fragments, non-flat background, and oversized effects.
- Kept the optional temporary cyan guide grid as a removable generation aid.

Preset-specific revisions:

- `ranged-attack`: projectile/effect must stay tiny and close to hand, bow, staff, weapon tip, or throw point.
- `skill-release`: explicitly separated from ranged weapon attack; no arrows, bullets, guns, bows, or thrown weapons unless part of the source identity.
- `knockback`: kept as a non-gory recoil, slide, stumble, and recovery action, distinct from hurt and downed.
- `item-use`: item stays hand-focused and compact; no ground pickup, readable text, UI icons, or large effects.
- `talk`: feet stay planted; no speech bubbles, text, punctuation, icons, hearts, emojis, attack, spell, jump, dance, item-use, or cheer semantics.

## Visual Findings

- `ranged-attack`: readable aim/release/recover motion. The raw front direction was slightly edge-heavy, but final cell normalization kept the accepted sheet inside the grid.
- `skill-release`: first generated skill attempt drifted toward ranged attack, so it was regenerated from the forest mage source with stricter no-ranged-weapon wording. Accepted result reads as compact magic/skill release.
- `knockback`: strong non-gory recoil and recovery. Side and diagonal rows show the backward force clearly.
- `item-use`: reads as a small bottle/herb item-use action without text or UI-like marks.
- `talk`: reads as a calm NPC talk/reaction loop through hand gestures, eyes, nods, and shoulders. Back rows remain true rear-facing.

## Known Follow-Ups

- Run the full 5-attempt stability gate per preset before calling these prompt contracts fully stable.
- If future generations leave faint guide residue, keep the cleanup pass that removes chroma/cyan guide pixels and long thin blue/purple guide-line components.
- Continue collecting rejected attempts and prompt fixes as the official animation library grows.
