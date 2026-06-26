# Item Use Prompt Contract

Generated: 2026-06-27T01:23:00+09:00

Status: Phase A proposal. No official sample replacement has been performed.

## Current Official Source

- Preset id: `item-use`
- Current sample: `public/samples/item-use-sheet.png`
- QA folder: `docs/qa/official-item-use/`
- Source job / evidence id: `codex-job-2026-06-25T23-15-35-242Z`
- Current score: 96 / 100
- Decision: keep-current

## Uplift Prompt Contract

item use animation with ready pose, draw small item, lift or use item near hand, tiny effect or read beat, finish, put item away, settle, ready pose

Frame plan: 1 ready, 2 draw item, 3 lift/present, 4 use/read/drink, 5 tiny effect/read beat, 6 put away, 7 settle, 8 ready.

Sheet contract: 5 direction rows x 8 frame columns, exactly 256 x 256 px per cell, final sheet 2048 x 1280 px. Direction rows are front, front-three-quarter, side, back-three-quarter, back.

Direction contract: front faces camera; front-three-quarter is diagonal-front; side is strict profile; back-three-quarter is diagonal-back; back is true straight rear view with no eyes, nose, mouth, cheek, or looking-over-shoulder pose.

Cell contract: keep the full head, hair silhouette, hands, props, effects, and both feet inside each cell with 24 px padding whenever possible. Keep feet on a stable visual ground line and keep the character centered across frames.

Effect / prop contract: projectiles, shields, weapons, hand items, and magic effects must stay compact and inside their own cell. They must not hide the face, torso, feet, or action silhouette.

Negative constraints: no cropped head, missing feet, duplicated heads, body fragments, non-flat background, opaque background, guide residue, cell bleed, identity drift, direction mismatch, gore, readable text, UI symbols, labels, speech bubbles, or oversized effects.

## Phase A Issues

- polish / edge_contact / front-three-quarter / frames 1, 2, 3, 4, 5, 6, 7, 8: Padding below preferred 24px in front-three-quarter; min=22px.
- polish / edge_contact / back / frames 1, 2, 3, 4, 5, 6, 7, 8: Padding below preferred 24px in back; min=23px.

## Future Retake Fields

- Seed: TBD by real generation job.
- Job id: TBD.
- Outbox path: TBD.
- Direction manifest: TBD.
- Raw direction PNG x5: TBD.
- Candidate sheet: TBD.
- Candidate QA: TBD.
- Before / after result: TBD.
- Adoption decision: not run in Phase A.

Official replacement remains gated by ご主人 confirmation before main merge.
