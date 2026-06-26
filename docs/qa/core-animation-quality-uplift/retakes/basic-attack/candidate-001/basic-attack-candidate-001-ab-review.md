# Basic Attack AB review

- Candidate: `candidate-001`
- Current A: `public/samples/basic-attack-sheet.png`
- Candidate B: `docs/qa/core-animation-quality-uplift/retakes/basic-attack/candidate-001/basic-attack-candidate-001-sheet.png`
- Raw candidate input: `docs/qa/core-animation-quality-uplift/retakes/basic-attack/candidate-001/source/imagegen-raw-sheet.png` (1586x992)
- Official replacement: false
- Decision: hold-current-candidate-needs-rework

## Decision

Candidate B improves body/sword consistency, but AB does not clear the mechanical bar because several frames touch cell edges after normalization. Keep current A for now and rework B with stricter padding.

## Mechanical comparison

| Metric | Current A | Candidate B |
| --- | ---: | ---: |
| Size | 2048x1280 | 2048x1280 |
| Alpha zero ratio | 0.806724 | 0.783581 |
| Min frame padding | 5 | 0 |
| Frames below 16px padding | 12 | 29 |
| Max center drift | 56 | 83 |
| Max bottom drift | 19 | 3 |
| Max height ratio | 1.127 | 1.062 |
| Max width ratio | 1.895 | 2.306 |
| Max detached components | 0 | 3 |

## Candidate wins

- Body scale and head size stay steadier across attack frames.
- Sword remains more consistently attached to the hand.
- Slash effects are less oversized than the current official sheet.

## Candidate risks

- The generated raw canvas was 1586x992, not the requested 2048x1280.
- The raw background needed magenta flood-fill cleanup.
- After normalization, more frames fall below the 16px safety padding target than the current official sheet.
- The current official sheet has a punchier hit effect, so gameplay readability should be judged in motion.

## QA artifacts

- Manifest: `docs/qa/core-animation-quality-uplift/retakes/basic-attack/candidate-001/basic-attack-candidate-001-manifest.json`
- Mechanical QA: `docs/qa/core-animation-quality-uplift/retakes/basic-attack/candidate-001/basic-attack-candidate-001-mechanical-qa.json`
- Grid QA: `docs/qa/core-animation-quality-uplift/retakes/basic-attack/candidate-001/basic-attack-candidate-001-grid-qa.png`
- Transparency/contact QA: `docs/qa/core-animation-quality-uplift/retakes/basic-attack/candidate-001/basic-attack-candidate-001-transparent-contact.png`
- Direction GIFs: `docs/qa/core-animation-quality-uplift/retakes/basic-attack/candidate-001/gifs/basic-attack-candidate-001-front.gif`, `docs/qa/core-animation-quality-uplift/retakes/basic-attack/candidate-001/gifs/basic-attack-candidate-001-front-three-quarter.gif`, `docs/qa/core-animation-quality-uplift/retakes/basic-attack/candidate-001/gifs/basic-attack-candidate-001-side.gif`, `docs/qa/core-animation-quality-uplift/retakes/basic-attack/candidate-001/gifs/basic-attack-candidate-001-back-three-quarter.gif`, `docs/qa/core-animation-quality-uplift/retakes/basic-attack/candidate-001/gifs/basic-attack-candidate-001-back.gif`
