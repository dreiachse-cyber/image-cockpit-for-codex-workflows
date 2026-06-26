# Ranged Attack Prompt Contract

Generated: 2026-06-27T01:23:00+09:00

Status: Phase A proposal. No official sample replacement has been performed.

## Current Official Source

- Preset id: `ranged-attack`
- Current sample: `public/samples/ranged-attack-sheet.png`
- QA folder: `docs/qa/official-ranged-attack/`
- Source job / evidence id: `codex-job-2026-06-26T04-20-29-885Z`
- Current score: 87 / 100
- Decision: needs-retake

## Uplift Prompt Contract

ranged attack animation with ready pose, aim, draw or charge, release, tiny projectile or spark close to the hand or weapon tip, follow-through, recover, ready pose, compact forward shot

Frame plan: 1 ready, 2 aim, 3 draw/charge, 4 release, 5 tiny projectile, 6 follow-through, 7 recover, 8 ready.

Sheet contract: 5 direction rows x 8 frame columns, exactly 256 x 256 px per cell, final sheet 2048 x 1280 px. Direction rows are front, front-three-quarter, side, back-three-quarter, back.

Direction contract: front faces camera; front-three-quarter is diagonal-front; side is strict profile; back-three-quarter is diagonal-back; back is true straight rear view with no eyes, nose, mouth, cheek, or looking-over-shoulder pose.

Cell contract: keep the full head, hair silhouette, hands, props, effects, and both feet inside each cell with 24 px padding whenever possible. Keep feet on a stable visual ground line and keep the character centered across frames.

Effect / prop contract: projectiles, shields, weapons, hand items, and magic effects must stay compact and inside their own cell. They must not hide the face, torso, feet, or action silhouette.

Negative constraints: no cropped head, missing feet, duplicated heads, body fragments, non-flat background, opaque background, guide residue, cell bleed, identity drift, direction mismatch, gore, readable text, UI symbols, labels, speech bubbles, or oversized effects.

## Phase A Issues

- minor / edge_contact / front / frames 4: Minimum padding below 16px in front; min=12px.
- polish / edge_contact / front-three-quarter / frames 5, 6, 7, 8: Padding below preferred 24px in front-three-quarter; min=22px.
- polish / edge_contact / side / frames 5, 6, 7, 8: Padding below preferred 24px in side; min=18px.
- polish / anchor_drift / side / frames 1, 2, 3, 4, 5, 6, 7, 8: Center drift is 70px in side.
- minor / edge_contact / back-three-quarter / frames 5: Minimum padding below 16px in back-three-quarter; min=15px.
- polish / anchor_drift / back-three-quarter / frames 1, 2, 3, 4, 5, 6, 7, 8: Center drift is 58px in back-three-quarter.
- minor / edge_contact / back / frames 4: Minimum padding below 16px in back; min=14px.
- polish / action_structure_bad / all / frames 1, 2, 3, 4, 5, 6, 7, 8: High-structure action should be first in the multi-run stability retake queue even when the current sample passes structural QA.

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
