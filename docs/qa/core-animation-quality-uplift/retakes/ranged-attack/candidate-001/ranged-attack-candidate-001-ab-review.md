# Ranged Attack AB review

- Candidate: `candidate-001`
- Current A: `public/samples/ranged-attack-sheet.png`
- Candidate B: `docs/qa/core-animation-quality-uplift/retakes/ranged-attack/candidate-001/ranged-attack-candidate-001-sheet.png`
- Raw candidate input: `docs/qa/core-animation-quality-uplift/retakes/ranged-attack/candidate-001/source/imagegen-raw-sheet.png` (1586x992)
- Official replacement: false
- Decision: reject-candidate-keep-current

## Decision

Candidate B is mechanically usable after cleanup, but it does not beat the current official ranged sheet on character fidelity or attack readability. Keep current.

## Mechanical comparison

| Metric | Current A | Candidate B |
| --- | ---: | ---: |
| Size | 2048x1280 | 2048x1280 |
| Alpha zero ratio | 0.800759 | 0.766702 |
| Min frame padding | 12 | 0 |
| Frames below 16px padding | 3 | 33 |
| Max center drift | 70 | 51 |
| Max bottom drift | 21 | 3 |
| Max height ratio | 1.083 | 1.307 |
| Max width ratio | 2.125 | 2.521 |
| Max detached components | 1 | 1 |

## Candidate wins

- Candidate B has tidy spacing and a readable projectile moment.
- The five direction rows remain coherent after normalization.

## Candidate risks

- The candidate simplifies the traveler silhouette and loses some of the official sheet's source-character fidelity.
- The firing motion has less pose contrast than the current official sheet.
- The generated raw canvas and background both needed normalization, with no clear quality win to justify replacement.

## QA artifacts

- Manifest: `docs/qa/core-animation-quality-uplift/retakes/ranged-attack/candidate-001/ranged-attack-candidate-001-manifest.json`
- Mechanical QA: `docs/qa/core-animation-quality-uplift/retakes/ranged-attack/candidate-001/ranged-attack-candidate-001-mechanical-qa.json`
- Grid QA: `docs/qa/core-animation-quality-uplift/retakes/ranged-attack/candidate-001/ranged-attack-candidate-001-grid-qa.png`
- Transparency/contact QA: `docs/qa/core-animation-quality-uplift/retakes/ranged-attack/candidate-001/ranged-attack-candidate-001-transparent-contact.png`
- Direction GIFs: `docs/qa/core-animation-quality-uplift/retakes/ranged-attack/candidate-001/gifs/ranged-attack-candidate-001-front.gif`, `docs/qa/core-animation-quality-uplift/retakes/ranged-attack/candidate-001/gifs/ranged-attack-candidate-001-front-three-quarter.gif`, `docs/qa/core-animation-quality-uplift/retakes/ranged-attack/candidate-001/gifs/ranged-attack-candidate-001-side.gif`, `docs/qa/core-animation-quality-uplift/retakes/ranged-attack/candidate-001/gifs/ranged-attack-candidate-001-back-three-quarter.gif`, `docs/qa/core-animation-quality-uplift/retakes/ranged-attack/candidate-001/gifs/ranged-attack-candidate-001-back.gif`
