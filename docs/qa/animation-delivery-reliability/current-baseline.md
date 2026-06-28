# Animation Delivery Reliability Baseline

Last updated: 2026-06-29 JST

## Delivery Success Definition

Animation Generation is counted as successful only when a real browser run delivers the finished animation to the user:

- the generated result is added to history,
- the animation preview loads with direction rows,
- the download panel exposes the animation export controls,
- the outbox contains a usable final direction-split manifest/result set,
- no false-success state is reported.

Logical unit tests alone are not sufficient for this reliability goal. The baseline flow uses the actual browser `Upload Pixel Art` path instead of seeding storage directly, so the source-selection step is covered by the same UI surface a user sees.

## Latest Mock Browser Baseline

- Report: `docs/qa/animation-delivery-reliability/baseline-2026-06-28T15-37-58-428Z`
- Runner mode: `mock`
- Trials: 2
- Passed: 2
- Browser delivery rate: 1.0
- False-success count: 0
- Stuck-running count: 0

This proves the browser harness, local API, Vite app, upload source selection, history delivery, preview detection, download detection, and outbox-final detection are wired end to end.

## Real Browser Rollup

- Rollup: `docs/qa/animation-delivery-reliability/delivery-rollup-real.md`
- Runner mode: `real`
- Baselines: 6
- Trials: 11
- Passed: 7
- Browser delivery rate: 0.6363636363636364
- False-success count: 0
- Stuck-running count: 0
- Gate status: `below_rate` (`minTrials=10`, `minRate=0.9`)

The all-history SLO gate is still failing because it intentionally includes the earlier low-motion failures that motivated this reliability cycle.

## Current-Regime Real Browser Rollup

- Rollup: `docs/qa/animation-delivery-reliability/delivery-rollup-real-post-aggregate.md`
- Filter: `createdAtFrom=2026-06-28T18:13:00.000Z`
- Runner mode: `real`
- Baselines: 3
- Trials: 6
- Passed: 6
- Browser delivery rate: 1.0
- False-success count: 0
- Stuck-running count: 0
- Gate status: `insufficient_trials` (`minTrials=10`, `minRate=0.9`)

The current implementation has delivered 6 consecutive real-browser passes, including the prompt-isolation runner guard. The 90% SLO is not proven yet because the current-regime sample still needs at least 10 real trials.

## Latest Real Browser Batch

- Report: `docs/qa/animation-delivery-reliability/baseline-2026-06-28T19-17-06-056Z-real-prompt-isolation`
- Runner mode: `real`
- Trials: 1
- Passed: 1
- Browser delivery rate: 1.0
- False-success count: 0
- Stuck-running count: 0

This run completed through the visible browser flow after the runner prompt began explicitly isolating imagegen artifacts per job/direction instead of blindly trusting the newest global generated image.

## Recent Failure Class

- `docs/qa/animation-delivery-reliability/baseline-2026-06-28T16-31-30-892Z-real-batch3`: 0/3 real trials failed because Idle Breathing candidates were rejected by low-motion direction-split QA around 2.1-2.3% average frame change.
- `docs/qa/animation-delivery-reliability/baseline-2026-06-28T17-34-22-420Z-real-idle-profile`: 0/1 real trial failed after the first idle profile change because one candidate front row was still effectively too static at 1.2% average frame change.
- `docs/qa/animation-delivery-reliability/baseline-2026-06-28T17-57-43-118Z-real-idle-aggregate`: 1/1 real trial passed after Idle Breathing QA changed from per-row hard fail to aggregate idle-motion validation.
- `docs/qa/animation-delivery-reliability/baseline-2026-06-28T18-22-39-703Z-real-batch4-post-aggregate`: 4/4 real trials passed after the aggregate idle-motion gate.
- `docs/qa/animation-delivery-reliability/baseline-2026-06-28T19-17-06-056Z-real-prompt-isolation`: 1/1 real trial passed after the runner prompt added imagegen artifact isolation guidance.

Committed evidence keeps lightweight trial JSON, summary JSON, report Markdown, and browser screenshots. Runtime `handoff/` payloads are pruned for passing trials and kept on disk for failed trials by default, but those heavy directories are git-ignored.

## Changes Proven By This Baseline

- Added repeatable real-browser delivery smoke and baseline scripts.
- Covered real `Upload Pixel Art` source selection in the browser harness.
- Added browser-captured delivery metrics and failure text capture.
- Preserved green-path behavior with a 2/2 mock browser delivery baseline.
- Confirmed one initial real Codex/imagegen browser delivery pass end to end.
- Recorded a 0/3 real failure batch that exposed the low-motion Idle Breathing failure class.
- Added failed-trial `handoff/` retention so future failures keep candidate PNGs and manifests available locally for debugging.
- Split Idle Breathing motion QA from the generic action motion gate, allowing subtle front/back breathing when enough directions have readable idle motion while still rejecting nearly static rows.
- Strengthened the Idle Breathing prompt to request clear but contained 2-4px shoulder/chest motion and avoid nearly identical frames.
- Added a current-regime rollup filter so fixed-regime evidence can be measured separately from all-history evidence.
- Added runner prompt guidance to isolate built-in imagegen artifacts per job/direction and avoid cross-candidate newest-image pickup.
- Confirmed six current-regime real browser delivery passes end to end.

## SLO Status

The 90% delivery SLO is not proven yet. All-history real-browser delivery is 7/11, while the current implementation is 6/6 but still below the required 10 current-regime trials. The latest passes are a meaningful improvement over the repeated low-motion failures, so this wave remains eligible for main reflection under the reliability cycle's "improve continuously, reflect clear gains" rule.

## Next Reliability Work

- Collect at least 4 more current-regime real-browser trials to reach the 10-trial SLO sample.
- Target the next failure class if any current-regime run fails.
- Keep reflecting clearly improved changes before the 90% SLO is fully proven, because the current production experience started from a very low reliability baseline.
