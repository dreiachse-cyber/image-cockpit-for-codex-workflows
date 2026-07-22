# Selectable single-direction animation QA

Date: 2026-07-22
Branch: `codex/selectable-single-animation-direction`
Baseline: `3da4181` (`codex/experimental-16-20-frame-animation`)

## Scope

Animation Generation keeps the existing `5 directions`, `3 directions`, and `1 direction` presets. Choosing `1 direction` now reveals a second selector in canonical order:

1. front
2. front three-quarter
3. side
4. back three-quarter
5. back

Side remains the initial single-direction choice, and the overall Animation Generation default remains `5 directions`. Changing the single direction immediately preserves the one-row working-sheet contract and updates the direction used by generation, preview, history restoration, manifests, exports, and Animation Pack reuse.

## Contracts

- `1 direction` submits exactly one canonical direction; the API accepts each of the five choices and continues to reject unsupported direction names.
- Motion Pilot remains unavailable whenever exactly one direction is selected because there are no remaining directions to expand.
- Scale-reference prompt wording follows the selected direction instead of assuming side.
- Imported history and Animation Pack v1/v2 data restore both the `1 direction` preset and its exact direction.
- The UI keeps side as a safe fallback if persisted or imported state contains an unsupported single-direction value.
- The five choice buttons remain keyboard accessible, expose their selected state, retain 48 px minimum targets, and fit without horizontal overflow at 390 px width.

## 16f / 20f compatibility

The selected direction does not change the frame-grid contract. A single direction uses one final-sheet row at every supported frame budget:

| Frame budget | Raw direction grid | Final sheet grid | Final size at 256 px cells |
| --- | --- | --- | --- |
| 16f | 4 x 4 | 16 x 1 | 4096 x 256 px |
| 20f | 4 x 5 | 20 x 1 | 5120 x 256 px |

The manifest and Animation Pack preserve `framesPerDirection`, the selected direction, and the 4 x 4 or 4 x 5 raw direction grid. Switching back to three or five directions restores their corresponding final-sheet row count without changing the remembered single-direction choice.

## Automated coverage

- Unit coverage resolves all five canonical choices, the default-side fallback, multi-direction preset isolation, direction-specific scale references, and the generic single-direction Motion Pilot guard.
- Server smoke coverage registers and publishes arbitrary canonical single-direction tournaments while retaining 20f manifest and one-row sheet assertions.
- Dedicated browser coverage checks selector order, default side, a non-side 20f generation, preview/manifest/Pack direction persistence, Japanese and English labels, keyboard state, and the 390 x 844 layout.
- Release audit rejects the retired side-only API/UI wording and requires the selectable single-direction contract.

## Verification

- Bundled Node.js 24.14.0 doctor: passed.
- TypeScript project build: passed.
- Vitest: 12 files, 203 tests passed.
- Production build: passed with the existing chunk-size warning only.
- Server smoke: passed, including all five canonical single-direction registrations and the `back three-quarter` 20f publish contract.
- Release audit: passed.
- Dedicated single-direction UI smoke: passed in 33.2 seconds, including exact history restoration.
- Full UI smoke: passed in 314.6 seconds.

## Review gate

This change remains on the feature branch for confirmation and has not been merged into `main`.
