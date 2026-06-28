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

## Latest Real Browser Baseline

- Report: `docs/qa/animation-delivery-reliability/baseline-2026-06-28T15-38-38-466Z`
- Runner mode: `real`
- Trials: 1
- Passed: 1
- Browser delivery rate: 1.0
- False-success count: 0
- Stuck-running count: 0

This is the first recorded real-browser delivery pass for the standard Animation Generation flow in this reliability cycle. The run completed through the visible UI, result preview, export controls, and usable final outbox manifest/result artifacts.

Committed evidence keeps the lightweight trial JSON, summary JSON, report Markdown, and browser screenshots. The runtime `handoff/outbox` payloads from the successful real run were intentionally omitted from the repository because they are large generated intermediates; their result metadata remains captured in `browser-trials.json`.

## Changes Proven By This Baseline

- Added repeatable real-browser delivery smoke and baseline scripts.
- Covered real `Upload Pixel Art` source selection in the browser harness.
- Added browser-captured delivery metrics and failure text capture.
- Preserved green-path behavior with a 2/2 mock browser delivery baseline.
- Confirmed one real Codex/imagegen browser delivery pass end to end.
- Classified Codex runner usage-limit failures separately from policy, imagegen-unavailable, and missing-image failures.
- Added a usage-limit cooldown path so repeated Animation Generation attempts do not keep launching doomed Codex runs while capacity is known to be unavailable.
- Surfaced terminal runner diagnostics during standard animation tournament candidate evaluation before falling back to generic direction-split artifact errors.
- Collapsed identical tournament candidate failures into a short shared reason so users can read the real failure cause.

## SLO Status

The 90% delivery SLO is not proven yet. The current evidence is a strong functional improvement, but the real-browser sample size is still only 1. A future acceptance baseline should run enough real trials to make the rate meaningful and should continue to count false-success and stuck-running states as failures.

## Next Reliability Work

- Collect a larger real-browser baseline now that a real delivery pass is possible.
- Target the largest remaining real failure class from those repeated trials.
- Keep reflecting clearly improved changes before the 90% SLO is fully proven, because the current production experience starts from a very low reliability baseline.
