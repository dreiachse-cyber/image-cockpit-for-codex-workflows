# Idle Breathing Prompt Contract

Generated: 2026-06-27T01:23:00+09:00

Status: Phase A proposal. No official sample replacement has been performed.

## Current Official Source

- Preset id: `idle-breathing`
- Current sample: `public/samples/idle-breathing-sheet.png`
- QA folder: `docs/qa/official-idle-breathing/`
- Source job / evidence id: `019ef1ff-b668-7400-8bf3-d8ffcff8f989`
- Current score: 92 / 100
- Decision: keep-current

## Uplift Prompt Contract

idle breathing ready stance with planted feet, subtle inhale and exhale, tiny shoulder and chest rise, delayed hair, hood, clothing, and backpack follow-through, stable center, stable foot baseline, no walking, no stepping, no hopping

Frame plan: 1 neutral ready, 2 inhale, 3 secondary motion follows, 4 top of breath, 5 exhale, 6 settle, 7 return, 8 bridge to frame 1.

Sheet contract: 5 direction rows x 8 frame columns, exactly 256 x 256 px per cell, final sheet 2048 x 1280 px. Direction rows are front, front-three-quarter, side, back-three-quarter, back.

Direction contract: front faces camera; front-three-quarter is diagonal-front; side is strict profile; back-three-quarter is diagonal-back; back is true straight rear view with no eyes, nose, mouth, cheek, or looking-over-shoulder pose.

Cell contract: keep the full head, hair silhouette, hands, props, effects, and both feet inside each cell with 24 px padding whenever possible. Keep feet on a stable visual ground line and keep the character centered across frames.

Effect / prop contract: projectiles, shields, weapons, hand items, and magic effects must stay compact and inside their own cell. They must not hide the face, torso, feet, or action silhouette.

Negative constraints: no cropped head, missing feet, duplicated heads, body fragments, non-flat background, opaque background, guide residue, cell bleed, identity drift, direction mismatch, gore, readable text, UI symbols, labels, speech bubbles, or oversized effects.

## Phase A Issues

- polish / edge_contact / front / frames 1, 2, 3, 4, 5, 6, 7, 8: Padding below preferred 24px in front; min=21px.
- polish / edge_contact / front-three-quarter / frames 1, 2, 3, 4, 5, 6, 7, 8: Padding below preferred 24px in front-three-quarter; min=22px.
- polish / edge_contact / side / frames 1, 2, 3, 4, 5, 6, 7, 8: Padding below preferred 24px in side; min=18px.
- polish / edge_contact / back-three-quarter / frames 1, 2, 3, 4, 5, 6, 7, 8: Padding below preferred 24px in back-three-quarter; min=17px.
- minor / cropped_body / back-three-quarter / frames 1, 2, 3, 4, 5, 6, 7, 8: Top margin is tight in back-three-quarter; minTop=17px.
- minor / edge_contact / back / frames 1, 2, 3, 4, 5, 6, 7, 8: Minimum padding below 16px in back; min=13px.
- minor / cropped_body / back / frames 1, 2, 3, 4, 5, 6, 7, 8: Top margin is tight in back; minTop=13px.

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
