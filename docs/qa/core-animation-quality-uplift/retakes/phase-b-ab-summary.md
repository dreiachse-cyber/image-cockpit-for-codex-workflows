# Core Animation Retake AB Summary

- Generated at: 2026-06-27T02:14:00+09:00
- Phase: B
- Official replacement: false
- Scope: jump-hop, basic-attack, ranged-attack

No `public/samples/*-sheet.png`, prompt contract, or Animation modal adoption path was changed.

| Preset | AB decision | Official replacement | A min padding | B min padding | A frames <16px | B frames <16px | Review |
| --- | --- | --- | ---: | ---: | ---: | ---: | --- |
| Jump / Hop | hold-current-candidate-needs-rework | false | 9 | 0 | 6 | 39 | `docs/qa/core-animation-quality-uplift/retakes/jump-hop/candidate-001/jump-hop-candidate-001-ab-review.md` |
| Basic Attack | hold-current-candidate-needs-rework | false | 5 | 0 | 12 | 29 | `docs/qa/core-animation-quality-uplift/retakes/basic-attack/candidate-001/basic-attack-candidate-001-ab-review.md` |
| Ranged Attack | reject-candidate-keep-current | false | 12 | 0 | 3 | 33 | `docs/qa/core-animation-quality-uplift/retakes/ranged-attack/candidate-001/ranged-attack-candidate-001-ab-review.md` |

## Notes

- `jump-hop` and `basic-attack` have useful visual ideas, but candidate B did not beat current A on sheet-safety metrics.
- `ranged-attack` candidate B is rejected for now; keep current A.
- All candidates were generated as 1586x992 raw sheets and normalized to the 2048x1280 sheet contract for AB review.
