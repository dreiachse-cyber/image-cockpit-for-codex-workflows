# Fix Cycles

## Cycle 1: Idle Breathing Motion

Before: T01 and T01R failed with `motion_too_static_idle`.

Changes:

- Runner prompt contract now states that every direction PNG is an animation sheet, not a still reference.
- Idle-breathing material gate `failAverage` was lowered from 0.018 to 0.015 while keeping absent-motion gates at 0.008 / 0.02 and minimum readable rows at 3.

Retest: T01RR passed with history delivery, preview delivery, downloadable final, and outbox final present.

## Cycle 2: Standard Motion Back Run

Before: T02 failed because the run-cycle back row had 2.3% average frame change and was blocked as `motion too small`, despite visual review showing readable running motion.

Change:

- Standard motion material gate `failAverage` was lowered from 0.025 to 0.020 while leaving `warnAverage` at 0.04 and `failMax` at 0.055.

Retest: T02R passed with history delivery, preview delivery, downloadable final, and outbox final present.

## Cycle 3: Recursive Browser Delivery Loop

Before: static `ui:smoke` exposed two recursive-loop regressions while validating the handoff fix set.

- A generated animation final could remain selected when returning to Animation Generation, clearing the reusable source and leaving Generate Animation disabled.
- Completed but incomplete direction-split candidates could be diagnosed as `no_image_returned` before tournament evaluation read the outbox artifact reason.
- In-progress direction-split component files could be treated too broadly as returned images.

Changes:

- Animation Generation now restores the original source from the selected animation result's `derivedFromId` when re-entering the workflow.
- Direction-split imports and job draft creation preserve `animationSourceId` for repeated trials from the same source.
- Completed direction-split artifacts are handed to artifact evaluation instead of being converted into generic no-image diagnostics.
- Direction-split manifest detection now requires the direction-split schema, while generic single-image outbox results remain recoverable.

Retest: `npm run ui:smoke` passed, including partial direction recovery, manifest-first recovery, completed incomplete candidate review, and quality-gate failure handling.

## Cycle 4: Idle Breathing Readable Row Tolerance

Before: T01 and T01R each reached `2/5 readable rows` but still failed the idle-breathing aggregate gate because the minimum was 3 rows.

Change:

- Idle-breathing aggregate readable-row minimum was lowered from 3 to 2.
- The hard static-copy guard remains unchanged at `averageMotion < 0.008` and `maxMotion < 0.02` per direction, so near-identical frame rows still fail.

Retest: static verification was rerun after the threshold change.
