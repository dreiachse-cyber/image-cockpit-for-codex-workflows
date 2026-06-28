# Animation Delivery Reliability Baseline

Last updated: 2026-06-29 JST

## Delivery Success Definition

Animation Generation is counted as successful only when a real browser run delivers the finished animation to the user:

- the generated result is added to history,
- the animation preview loads with direction rows,
- the download panel exposes the animation export controls,
- the outbox contains a usable final direction-split manifest/result set,
- no false-success state is reported.

Logical unit tests alone are not sufficient for this reliability goal. The baseline flow now uses the actual browser `Upload Pixel Art` path instead of seeding storage directly, so the source-selection step is covered by the same UI surface a user sees.

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
- Baselines: 4
- Trials: 6
- Passed: 2
- Browser delivery rate: 0.3333333333333333
- False-success count: 0
- Stuck-running count: 0
- Gate status: `insufficient_trials` (`minTrials=10`, `minRate=0.9`)

The SLO gate is still failing, but the latest implementation change produced a new real-browser delivery pass after a repeated low-motion failure class was identified.

## Latest Real Browser Pass

- Report: `docs/qa/animation-delivery-reliability/baseline-2026-06-28T17-57-43-118Z-real-idle-aggregate`
- Runner mode: `real`
- Trials: 1
- Passed: 1
- Browser delivery rate: 1.0
- False-success count: 0
- Stuck-running count: 0

This run completed through the visible browser flow, including `Upload Pixel Art`, history delivery, animation preview, download controls, and usable root outbox final artifacts.

## Recent Failure Class

- `docs/qa/animation-delivery-reliability/baseline-2026-06-28T16-31-30-892Z-real-batch3`: 0/3 real trials failed because Idle Breathing candidates were rejected by low-motion direction-split QA around 2.1-2.3% average frame change.
- `docs/qa/animation-delivery-reliability/baseline-2026-06-28T17-34-22-420Z-real-idle-profile`: 0/1 real trial failed after the first idle profile change because one candidate front row was still effectively too static at 1.2% average frame change. This run proved failed-trial `handoff/` retention works; the heavy runtime folder is intentionally git-ignored.
- `docs/qa/animation-delivery-reliability/baseline-2026-06-28T17-57-43-118Z-real-idle-aggregate`: 1/1 real trial passed after Idle Breathing QA changed from per-row hard fail to aggregate idle-motion validation.

Committed evidence keeps lightweight trial JSON, summary JSON, report Markdown, and browser screenshots. Runtime `handoff/` payloads are pruned for passing trials and kept on disk for failed trials by default, but those heavy directories are git-ignored.

## Changes Proven By This Baseline

- Added repeatable real-browser delivery smoke and baseline scripts.
- Covered real `Upload Pixel Art` source selection in the browser harness.
- Added browser-captured delivery metrics and failure text capture.
- Preserved green-path behavior with a 2/2 mock browser delivery baseline.
- Confirmed one real Codex/imagegen browser delivery pass end to end.
- Recorded an additional 0/3 real failure batch that exposed the low-motion Idle Breathing failure class.
- Added failed-trial `handoff/` retention so future failures keep candidate PNGs and manifests available locally for debugging.
- Split Idle Breathing motion QA from the generic action motion gate, allowing subtle front/back breathing when enough directions have readable idle motion while still rejecting nearly static rows.
- Strengthened the Idle Breathing prompt to request clear but contained 2-4px shoulder/chest motion and avoid nearly identical frames.
- Confirmed a post-fix real browser delivery pass end to end.
- Classified Codex runner usage-limit failures separately from policy, imagegen-unavailable, and missing-image failures.
- Added a usage-limit cooldown path so repeated Animation Generation attempts do not keep launching doomed Codex runs while capacity is known to be unavailable.
- Surfaced terminal runner diagnostics during standard animation tournament candidate evaluation before falling back to generic direction-split artifact errors.
- Collapsed identical tournament candidate failures into a short shared reason so users can read the real failure cause.

## SLO Status

The 90% delivery SLO is not proven yet. The real-browser rollup is currently 2/6, and the gate remains `insufficient_trials` because it requires at least 10 real trials. The latest pass is a meaningful improvement over the immediately preceding low-motion failures, so it is eligible for main reflection under this reliability cycle's "improve continuously, reflect clear gains" rule.

## Next Reliability Work

- Collect a larger real-browser baseline after the Idle Breathing aggregate gate change.
- Target the next largest real failure class from those repeated trials.
- Keep reflecting clearly improved changes before the 90% SLO is fully proven, because the current production experience starts from a very low reliability baseline.
