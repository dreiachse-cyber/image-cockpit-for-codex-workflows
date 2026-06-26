# Jump / Hop AB review

- Candidate: `candidate-001`
- Current A: `public/samples/jump-hop-sheet.png`
- Candidate B: `docs/qa/core-animation-quality-uplift/retakes/jump-hop/candidate-001/jump-hop-candidate-001-sheet.png`
- Raw candidate input: `docs/qa/core-animation-quality-uplift/retakes/jump-hop/candidate-001/source/imagegen-raw-sheet.png` (1586x992)
- Official replacement: false
- Decision: hold-current-candidate-needs-rework

## Decision

Candidate B has nice visual consistency, but AB fails the sheet-safety bar: the raw canvas was the wrong size and the normalized sheet has multiple frames touching cell edges. Keep current A and rework before any replacement review.

## Mechanical comparison

| Metric | Current A | Candidate B |
| --- | ---: | ---: |
| Size | 2048x1280 | 2048x1280 |
| Alpha zero ratio | 0.813871 | 0.781065 |
| Min frame padding | 9 | 0 |
| Frames below 16px padding | 6 | 39 |
| Max center drift | 77 | 156 |
| Max bottom drift | 73 | 21 |
| Max height ratio | 1.362 | 1.636 |
| Max width ratio | 1.276 | 3.2 |
| Max detached components | 0 | 3 |

## Candidate wins

- The midair poses are visually clean and keep the source character identity.
- Less extreme frame-to-frame size change than the current official sheet.
- All five directions remain readable and keep the source character identity.

## Candidate risks

- The generated raw canvas was 1586x992, not the requested 2048x1280.
- The raw background was magenta with mild gradient noise, so cleanup was required.
- After normalization, many frames have below-16px padding and some touch the cell edge.
- The current official sheet still has a stronger squash/landing accent in some views.

## QA artifacts

- Manifest: `docs/qa/core-animation-quality-uplift/retakes/jump-hop/candidate-001/jump-hop-candidate-001-manifest.json`
- Mechanical QA: `docs/qa/core-animation-quality-uplift/retakes/jump-hop/candidate-001/jump-hop-candidate-001-mechanical-qa.json`
- Grid QA: `docs/qa/core-animation-quality-uplift/retakes/jump-hop/candidate-001/jump-hop-candidate-001-grid-qa.png`
- Transparency/contact QA: `docs/qa/core-animation-quality-uplift/retakes/jump-hop/candidate-001/jump-hop-candidate-001-transparent-contact.png`
- Direction GIFs: `docs/qa/core-animation-quality-uplift/retakes/jump-hop/candidate-001/gifs/jump-hop-candidate-001-front.gif`, `docs/qa/core-animation-quality-uplift/retakes/jump-hop/candidate-001/gifs/jump-hop-candidate-001-front-three-quarter.gif`, `docs/qa/core-animation-quality-uplift/retakes/jump-hop/candidate-001/gifs/jump-hop-candidate-001-side.gif`, `docs/qa/core-animation-quality-uplift/retakes/jump-hop/candidate-001/gifs/jump-hop-candidate-001-back-three-quarter.gif`, `docs/qa/core-animation-quality-uplift/retakes/jump-hop/candidate-001/gifs/jump-hop-candidate-001-back.gif`
