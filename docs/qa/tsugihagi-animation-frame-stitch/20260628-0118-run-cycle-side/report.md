# Tsugihagi Animation Frame Stitch Prototype

Date: 2026-06-27T16:24:15.974Z

Scope: one-direction run-cycle experiment, 10 imagegen candidate sheets, 8 frames each.

## Result

- Conclusion: not adopted; keep the best single candidate / existing method
- Selected score: 757.8
- Best single baseline: candidate-08 / 757.8
- Improvement: 0
- Selected candidate switches: 0
- Target normalized cell: 256x256
- Target character height: 174px

This is a first-pass one-direction experiment. It must not replace official animation presets or be merged to main without owner review.

## Artifacts

- Candidate manifest: `candidate-manifest.json`
- Frame scores: `frame-scores.json`
- Selected sequence: `selected-sequence.json`
- Tsugihagi sheet: `tsugihagi-run-cycle-side-sheet.png`
- Tsugihagi GIF: `tsugihagi-run-cycle-side.gif`
- Best single baseline sheet: `best-single-baseline-sheet.png`
- Best single baseline GIF: `best-single-baseline.gif`
- Browser comparison page: `index.html`

## Selected Sequence

| Frame | Candidate | Quality | Warnings |
| --- | --- | ---: | --- |
| 1 | candidate-08 | 98.21 | - |
| 2 | candidate-08 | 96.79 | - |
| 3 | candidate-08 | 98.22 | - |
| 4 | candidate-08 | 97.69 | - |
| 5 | candidate-08 | 95.71 | - |
| 6 | candidate-08 | 95.34 | - |
| 7 | candidate-08 | 95.32 | - |
| 8 | candidate-08 | 96 | - |

## Baseline

Best single candidate: candidate-08

| Frame | Quality | Warnings |
| --- | ---: | --- |
| 1 | 98.21 | - |
| 2 | 96.79 | - |
| 3 | 98.22 | - |
| 4 | 97.69 | - |
| 5 | 95.71 | - |
| 6 | 95.34 | - |
| 7 | 95.32 | - |
| 8 | 96 | - |

## Notes

- Input candidate count: 10
- Output directory: `docs\qa\tsugihagi-animation-frame-stitch\20260628-0118-run-cycle-side`
- The scoring model favors frame quality, stable bbox/footline, color continuity, silhouette continuity, and fewer sheet switches.
- A single successful run is treated as evidence only, not official preset adoption.
