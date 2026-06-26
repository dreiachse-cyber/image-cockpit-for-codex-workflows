# Jump / Hop Prompt Contract

Generated: 2026-06-27T01:23:00+09:00

Status: Phase A proposal. No official sample replacement has been performed.

## Current Official Source

- Preset id: `jump-hop`
- Current sample: `public/samples/jump-hop-sheet.png`
- QA folder: `docs/qa/official-jump-hop/`
- Source job / evidence id: `codex-job-2026-06-25T21-33-50-977Z`
- Current score: 88 / 100
- Decision: needs-retake

## Uplift Prompt Contract

small in-place jump hop with crouch, push-off, rising, apex, falling, landing, squash settle, ready pose, stable landing baseline, generous top padding

Frame plan: 1 ready, 2 crouch, 3 push-off, 4 rising, 5 apex, 6 falling, 7 landing squash, 8 settle.

Sheet contract: 5 direction rows x 8 frame columns, exactly 256 x 256 px per cell, final sheet 2048 x 1280 px. Direction rows are front, front-three-quarter, side, back-three-quarter, back.

Direction contract: front faces camera; front-three-quarter is diagonal-front; side is strict profile; back-three-quarter is diagonal-back; back is true straight rear view with no eyes, nose, mouth, cheek, or looking-over-shoulder pose.

Cell contract: keep the full head, hair silhouette, hands, props, effects, and both feet inside each cell with 24 px padding whenever possible. Keep feet on a stable visual ground line and keep the character centered across frames.

Effect / prop contract: projectiles, shields, weapons, hand items, and magic effects must stay compact and inside their own cell. They must not hide the face, torso, feet, or action silhouette.

Negative constraints: no cropped head, missing feet, duplicated heads, body fragments, non-flat background, opaque background, guide residue, cell bleed, identity drift, direction mismatch, gore, readable text, UI symbols, labels, speech bubbles, or oversized effects.

## Phase A Issues

- minor / edge_contact / front / frames 5: Minimum padding below 16px in front; min=12px.
- minor / cropped_body / front / frames 5: Top margin is tight in front; minTop=12px.
- minor / edge_contact / front-three-quarter / frames 5: Minimum padding below 16px in front-three-quarter; min=12px.
- minor / cropped_body / front-three-quarter / frames 5: Top margin is tight in front-three-quarter; minTop=12px.
- polish / anchor_drift / front-three-quarter / frames 1, 2, 3, 4, 5, 6, 7, 8: Bottom anchor drift is 59px in front-three-quarter.
- minor / edge_contact / side / frames 5, 6: Minimum padding below 16px in side; min=13px.
- minor / cropped_body / side / frames 5, 6: Top margin is tight in side; minTop=13px.
- polish / anchor_drift / side / frames 1, 2, 3, 4, 5, 6, 7, 8: Center drift is 77px in side.
- polish / anchor_drift / side / frames 1, 2, 3, 4, 5, 6, 7, 8: Bottom anchor drift is 73px in side.
- minor / edge_contact / back-three-quarter / frames 5: Minimum padding below 16px in back-three-quarter; min=9px.
- minor / cropped_body / back-three-quarter / frames 5: Top margin is tight in back-three-quarter; minTop=9px.
- polish / anchor_drift / back-three-quarter / frames 1, 2, 3, 4, 5, 6, 7, 8: Bottom anchor drift is 59px in back-three-quarter.
- minor / edge_contact / back / frames 5: Minimum padding below 16px in back; min=12px.
- minor / cropped_body / back / frames 5: Top margin is tight in back; minTop=12px.

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
