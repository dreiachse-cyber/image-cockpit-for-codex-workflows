# Failure Taxonomy

## Counts

- `quality_gate_blocked_history_delivery`: 4
- `quality_gate_blocked_preview_delivery`: 4
- `quality_gate_blocked_download`: 4
- `motion_too_static_idle`: 2
- `standard_motion_gate_false_positive_back_run`: 1
- `small_source_walk_motion_too_subtle`: 1

## Categories

- `motion_too_static_idle`: idle-breathing rows had too few readable moving directions. Observed in T01 and T01R.
- `standard_motion_gate_false_positive_back_run`: run-cycle back row had readable motion but average frame-change was below the previous standard threshold. Observed in T02 and fixed by T02R.
- `small_source_walk_motion_too_subtle`: small source + walk-cycle produced front/back motion below the standard gate. Observed in T03 and left as a classified generation-quality failure for the next cycle.
- `quality_gate_blocked_history_delivery`, `quality_gate_blocked_preview_delivery`, `quality_gate_blocked_download`: expected downstream consequences when the material quality gate blocks a candidate. These did not create false success entries.

## Source Generation Notes

- S05 first generation included a baked checkerboard-like background and was recovered by child retry.
- S06 first path detection was unstable and recovered by timestamp retry.
- S04/S06 exposed a single-image generic manifest false negative in runner status; server-side generic image detection was fixed.
- S04/S05 retained minor chroma-edge remnants but were usable as animation sources.
