# Walk Cycle Prompt Contract

Generated: 2026-06-27T01:23:00+09:00

Status: Phase A proposal. No official sample replacement has been performed.

## Current Official Source

- Preset id: `walk-cycle`
- Current sample: `public/samples/walk-cycle-sheet.png`
- QA folder: `docs/qa/official-walk-cycle/`
- Source job / evidence id: `pilot-official-walk-cycle`
- Current score: 98 / 100
- Decision: needs-retake

## Uplift Prompt Contract

8-frame walk cycle with alternating left and right foot contact, clear passing poses under the body, modest stride length, stable ground contact, opposite arm swing, subtle torso bob, full-body side-readable motion

Frame plan: 1 left contact, 2 down, 3 passing, 4 right reach, 5 right contact, 6 down, 7 passing, 8 left reach into loop.

Sheet contract: 5 direction rows x 8 frame columns, exactly 256 x 256 px per cell, final sheet 2048 x 1280 px. Direction rows are front, front-three-quarter, side, back-three-quarter, back.

Direction contract: front faces camera; front-three-quarter is diagonal-front; side is strict profile; back-three-quarter is diagonal-back; back is true straight rear view with no eyes, nose, mouth, cheek, or looking-over-shoulder pose.

Cell contract: keep the full head, hair silhouette, hands, props, effects, and both feet inside each cell with 24 px padding whenever possible. Keep feet on a stable visual ground line and keep the character centered across frames.

Effect / prop contract: projectiles, shields, weapons, hand items, and magic effects must stay compact and inside their own cell. They must not hide the face, torso, feet, or action silhouette.

Negative constraints: no cropped head, missing feet, duplicated heads, body fragments, non-flat background, opaque background, guide residue, cell bleed, identity drift, direction mismatch, gore, readable text, UI symbols, labels, speech bubbles, or oversized effects.

## Phase A Issues

- No phase-a issue labels.

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
