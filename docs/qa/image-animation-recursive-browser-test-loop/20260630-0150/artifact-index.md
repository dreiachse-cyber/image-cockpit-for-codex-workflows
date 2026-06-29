# Artifact Index

Base: `docs/qa/image-animation-recursive-browser-test-loop/20260630-0150`

## Source Images

| Source | Status | Rank | Notes | Image |
| --- | --- | --- | --- | --- |
| S01-human-hero | pass | visual-review | source_generation_pass | docs/qa/image-animation-recursive-browser-test-loop/20260630-0150/sources/S01-human-hero/S01-human-hero.png |
| S02-small-character | pass | visual-review | source_generation_pass | docs/qa/image-animation-recursive-browser-test-loop/20260630-0150/sources/S02-small-character/S02-small-character.png |
| S03-robed-mage | pass | visual-review | source_generation_pass | docs/qa/image-animation-recursive-browser-test-loop/20260630-0150/sources/S03-robed-mage/S03-robed-mage.png |
| S04-long-weapon | pass | visual-review | source_generation_pass, runner_no_image_returned_false_negative_fixed, chroma_edge_remnant_minor | docs/qa/image-animation-recursive-browser-test-loop/20260630-0150/sources/S04-long-weapon/S04-long-weapon.png |
| S05-shield-wide | pass | visual-review | source_generation_pass_after_child_retry, source_checkerboard_baked_background_recovered, chroma_edge_remnant_minor | docs/qa/image-animation-recursive-browser-test-loop/20260630-0150/sources/S05-shield-wide/S05-shield-wide.png |
| S06-mascot-dragon | pass | visual-review | source_generation_pass_after_timestamp_retry, source_path_detection_unstable_recovered, runner_no_image_returned_false_negative_fixed | docs/qa/image-animation-recursive-browser-test-loop/20260630-0150/sources/S06-mascot-dragon/S06-mascot-dragon.png |

## Animation Trials

| Trial | Source | Preset | Status | Rank | Failure Tags |
| --- | --- | --- | --- | --- | --- |
| T01-S01-idle-breathing | S01 | idle-breathing | fail | failed | motion_too_static_idle, quality_gate_blocked_history_delivery, quality_gate_blocked_preview_delivery, quality_gate_blocked_download |
| T01R-S01-idle-breathing-motion-contract | S01 | idle-breathing | fail | failed | motion_too_static_idle, quality_gate_blocked_history_delivery, quality_gate_blocked_preview_delivery, quality_gate_blocked_download |
| T01RR-S01-idle-breathing-threshold | S01 | idle-breathing | pass | silver-or-better | - |
| T02-S01-run-cycle | S01 | run-cycle | fail | failed | standard_motion_gate_false_positive_back_run, quality_gate_blocked_history_delivery, quality_gate_blocked_preview_delivery, quality_gate_blocked_download |
| T02R-S01-run-cycle-standard-threshold | S01 | run-cycle | pass | silver-or-better | - |
| T03-S02-walk-cycle | S02 | walk-cycle | fail | failed | small_source_walk_motion_too_subtle, quality_gate_blocked_history_delivery, quality_gate_blocked_preview_delivery, quality_gate_blocked_download |
| T04-S02-talk-emote | S02 | talk | pass | silver-or-better | - |
| T05-S03-spell-cast | S03 | spell-cast | pass | silver-or-better | - |
| T06-S04-basic-attack | S04 | basic-attack | pass | silver-or-better | - |
| T07-S05-guard-block | S05 | guard-block | pass | silver-or-better | - |
| T08-S06-jump-hop | S06 | jump-hop | pass | silver-or-better | - |
| T09-S06-hurt-reaction | S06 | hurt-reaction | pass | silver-or-better | - |

## Commit Scope

Heavy local handoff artifacts under `handoff/` are intentionally ignored by `.gitignore`. Public QA files keep summary JSON, Markdown reports, source PNGs, and browser screenshots.

## Verification

See `verification.md` for the static checks, unit tests, build, smoke, release audit, and real browser UI smoke run after fixes.
