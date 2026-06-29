# Image Animation Recursive Browser Test Loop Report

## Summary

- Source images generated in real browser Pixel Art Generation: 6/6 usable.
- Real browser Animation Generation trials: 12.
- Passed: 8; failed: 4; delivery rate: 66.7%.
- False success count: 0.
- Stuck running count: 0.
- Source coverage: S01, S02, S03, S04, S05, S06.
- Preset coverage: basic-attack, guard-block, hurt-reaction, idle-breathing, jump-hop, run-cycle, spell-cast, talk, walk-cycle.

## Result Matrix

| Trial | Source | Preset | Status | Notes |
| --- | --- | --- | --- | --- |
| T01-S01-idle-breathing | S01 | idle-breathing | fail | motion_too_static_idle, quality_gate_blocked_history_delivery, quality_gate_blocked_preview_delivery, quality_gate_blocked_download |
| T01R-S01-idle-breathing-motion-contract | S01 | idle-breathing | fail | motion_too_static_idle, quality_gate_blocked_history_delivery, quality_gate_blocked_preview_delivery, quality_gate_blocked_download |
| T01RR-S01-idle-breathing-threshold | S01 | idle-breathing | pass | delivered to history/preview/download |
| T02-S01-run-cycle | S01 | run-cycle | fail | standard_motion_gate_false_positive_back_run, quality_gate_blocked_history_delivery, quality_gate_blocked_preview_delivery, quality_gate_blocked_download |
| T02R-S01-run-cycle-standard-threshold | S01 | run-cycle | pass | delivered to history/preview/download |
| T03-S02-walk-cycle | S02 | walk-cycle | fail | small_source_walk_motion_too_subtle, quality_gate_blocked_history_delivery, quality_gate_blocked_preview_delivery, quality_gate_blocked_download |
| T04-S02-talk-emote | S02 | talk | pass | delivered to history/preview/download |
| T05-S03-spell-cast | S03 | spell-cast | pass | delivered to history/preview/download |
| T06-S04-basic-attack | S04 | basic-attack | pass | delivered to history/preview/download |
| T07-S05-guard-block | S05 | guard-block | pass | delivered to history/preview/download |
| T08-S06-jump-hop | S06 | jump-hop | pass | delivered to history/preview/download |
| T09-S06-hurt-reaction | S06 | hurt-reaction | pass | delivered to history/preview/download |

## Key Outcomes

- Two fix cycles were completed and retested with the same source/preset pair.
- Quality-gated failures did not leak into success history or downloadable finals.
- Later trials across talk, spell-cast, basic-attack, guard-block, jump-hop, and hurt-reaction passed browser delivery.
- T03 remains a classified small-source walk-cycle motion issue for a future cycle.

## Files

- `source-images.json`
- `browser-trials.json`
- `success-rate-summary.json`
- `failure-taxonomy.md`
- `fix-cycles.md`
- `artifact-index.md`
- `verification.md`
