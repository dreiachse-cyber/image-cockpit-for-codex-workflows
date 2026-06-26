# Knockback Prompt Contract

Generated: 2026-06-27T01:23:00+09:00

Status: Phase A proposal. No official sample replacement has been performed.

## Current Official Source

- Preset id: `knockback`
- Current sample: `public/samples/knockback-sheet.png`
- QA folder: `docs/qa/official-knockback/`
- Source job / evidence id: `codex-job-2026-06-25T23-05-13-783Z`
- Current score: 94 / 100
- Decision: needs-retake

## Uplift Prompt Contract

non-gory knockback animation with neutral pose, impact recoil, lifted lean back, backward slide peak, stumble, regain footing, settle, ready pose

Frame plan: 1 ready, 2 impact starts, 3 lean back, 4 backward slide peak, 5 stumble, 6 regain footing, 7 settle, 8 ready.

Sheet contract: 5 direction rows x 8 frame columns, exactly 256 x 256 px per cell, final sheet 2048 x 1280 px. Direction rows are front, front-three-quarter, side, back-three-quarter, back.

Direction contract: front faces camera; front-three-quarter is diagonal-front; side is strict profile; back-three-quarter is diagonal-back; back is true straight rear view with no eyes, nose, mouth, cheek, or looking-over-shoulder pose.

Cell contract: keep the full head, hair silhouette, hands, props, effects, and both feet inside each cell with 24 px padding whenever possible. Keep feet on a stable visual ground line and keep the character centered across frames.

Effect / prop contract: projectiles, shields, weapons, hand items, and magic effects must stay compact and inside their own cell. They must not hide the face, torso, feet, or action silhouette.

Negative constraints: no cropped head, missing feet, duplicated heads, body fragments, non-flat background, opaque background, guide residue, cell bleed, identity drift, direction mismatch, gore, readable text, UI symbols, labels, speech bubbles, or oversized effects.

## Phase A Issues

- polish / edge_contact / front / frames 4, 5: Padding below preferred 24px in front; min=18px.
- polish / edge_contact / front-three-quarter / frames 3, 4, 5, 6: Padding below preferred 24px in front-three-quarter; min=18px.
- polish / edge_contact / side / frames 4: Padding below preferred 24px in side; min=18px.
- polish / edge_contact / back-three-quarter / frames 4: Padding below preferred 24px in back-three-quarter; min=18px.
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
