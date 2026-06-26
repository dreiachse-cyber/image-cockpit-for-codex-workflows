# Spell Cast Prompt Contract

Generated: 2026-06-27T01:23:00+09:00

Status: Phase A proposal. No official sample replacement has been performed.

## Current Official Source

- Preset id: `spell-cast`
- Current sample: `public/samples/spell-cast-sheet.png`
- QA folder: `docs/qa/official-spell-cast/`
- Source job / evidence id: `codex-job-2026-06-26T04-21-32-475Z`
- Current score: 94 / 100
- Decision: needs-retake

## Uplift Prompt Contract

spell cast animation with ready stance, raise hand or staff, magic charge, brighter charge, compact release, follow-through, settle, return ready, small contained effect

Frame plan: 1 ready, 2 raise hand/staff, 3 compact charge, 4 brighter charge, 5 release, 6 follow-through, 7 settle, 8 ready.

Sheet contract: 5 direction rows x 8 frame columns, exactly 256 x 256 px per cell, final sheet 2048 x 1280 px. Direction rows are front, front-three-quarter, side, back-three-quarter, back.

Direction contract: front faces camera; front-three-quarter is diagonal-front; side is strict profile; back-three-quarter is diagonal-back; back is true straight rear view with no eyes, nose, mouth, cheek, or looking-over-shoulder pose.

Cell contract: keep the full head, hair silhouette, hands, props, effects, and both feet inside each cell with 24 px padding whenever possible. Keep feet on a stable visual ground line and keep the character centered across frames.

Effect / prop contract: projectiles, shields, weapons, hand items, and magic effects must stay compact and inside their own cell. They must not hide the face, torso, feet, or action silhouette.

Negative constraints: no cropped head, missing feet, duplicated heads, body fragments, non-flat background, opaque background, guide residue, cell bleed, identity drift, direction mismatch, gore, readable text, UI symbols, labels, speech bubbles, or oversized effects.

## Phase A Issues

- polish / scale_drift / back-three-quarter / frames 1, 2, 3, 4, 5, 6, 7, 8: Height ratio is 1.104 in back-three-quarter.

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
