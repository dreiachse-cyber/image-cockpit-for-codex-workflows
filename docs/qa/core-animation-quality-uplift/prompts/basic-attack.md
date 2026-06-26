# Basic Attack Prompt Contract

Generated: 2026-06-27T01:23:00+09:00

Status: Phase A proposal. No official sample replacement has been performed.

## Current Official Source

- Preset id: `basic-attack`
- Current sample: `public/samples/basic-attack-sheet.png`
- QA folder: `docs/qa/official-basic-attack/`
- Source job / evidence id: `codex-job-2026-06-25T21-02-07-575Z`
- Current score: 86 / 100
- Decision: needs-retake

## Uplift Prompt Contract

basic forward attack with ready pose, anticipation, wind-up, strike, clear impact pose, follow-through, recovery, small contained weapon or hand motion, readable attack direction, no large effects

Frame plan: 1 ready, 2 anticipation, 3 wind-up, 4 strike, 5 impact, 6 follow-through, 7 recover, 8 ready-ish end.

Sheet contract: 5 direction rows x 8 frame columns, exactly 256 x 256 px per cell, final sheet 2048 x 1280 px. Direction rows are front, front-three-quarter, side, back-three-quarter, back.

Direction contract: front faces camera; front-three-quarter is diagonal-front; side is strict profile; back-three-quarter is diagonal-back; back is true straight rear view with no eyes, nose, mouth, cheek, or looking-over-shoulder pose.

Cell contract: keep the full head, hair silhouette, hands, props, effects, and both feet inside each cell with 24 px padding whenever possible. Keep feet on a stable visual ground line and keep the character centered across frames.

Effect / prop contract: projectiles, shields, weapons, hand items, and magic effects must stay compact and inside their own cell. They must not hide the face, torso, feet, or action silhouette.

Negative constraints: no cropped head, missing feet, duplicated heads, body fragments, non-flat background, opaque background, guide residue, cell bleed, identity drift, direction mismatch, gore, readable text, UI symbols, labels, speech bubbles, or oversized effects.

## Phase A Issues

- minor / edge_contact / front / frames 2, 4: Minimum padding below 16px in front; min=11px.
- minor / edge_contact / front-three-quarter / frames 4: Minimum padding below 16px in front-three-quarter; min=10px.
- minor / edge_contact / side / frames 2, 3, 4, 5, 6: Minimum padding below 16px in side; min=5px.
- minor / edge_contact / back-three-quarter / frames 4, 5: Minimum padding below 16px in back-three-quarter; min=8px.
- minor / edge_contact / back / frames 4, 5: Minimum padding below 16px in back; min=10px.
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
