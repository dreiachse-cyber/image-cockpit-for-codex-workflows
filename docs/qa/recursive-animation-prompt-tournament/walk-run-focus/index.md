# Walk / Run Focus Animation Tournament

Date: 2026-06-27 JST
Branch: `codex/walk-run-focused-animation-tournament`

## Scope

This pass follows `docs/作業指示書/023_walk_run_focused_animation_tournament_handoff.md` as the focused override for `022_recursive_animation_prompt_tournament_handoff.md`.

Only these presets were tested:

- `walk-cycle`
- `run-cycle`

No official sample, app prompt contract, or main-branch adoption was changed. Champion A remains the current official prompt/sample unless ご主人 explicitly approves a later adoption step.

## Source

- Browser-submitted source job: `codex-job-2026-06-26T19-18-24-935Z`
- UI result: failed status card, diagnostic `policy_or_safety`
- Actual built-in image generation output existed in the local Codex generated-images directory as `019f055e-7829-79f2-ad2a-ef2750e27db7/ig_02a04cc42f3f50dc016a3ed09d44f48191888c52f958a77746.png`
- QA source used for trials: `source-boy-adventurer-transparent.png`

The source failure is recorded as a workflow reliability issue: imagegen produced a real source PNG, but the runner exited before returning it through outbox. The generated image was manually rescued for this tournament and the failure remains in `run-log.json`.

## Challenger B Trials

| Preset | Trial | Job ID | Status | Mechanical QA | Browser QA | Tier |
| --- | --- | --- | --- | --- | --- | --- |
| `walk-cycle` | `walk-b-v1-trial-001` | `codex-job-2026-06-26T19-25-24-878Z` | completed | pass | pass | Probe |
| `walk-cycle` | `walk-b-v1-trial-002` | `codex-job-2026-06-26T19-25-24-990Z` | completed | pass | pass | Probe |
| `run-cycle` | `run-b-v1-trial-001` | `codex-job-2026-06-26T19-25-24-955Z` | completed | pass | pass | Probe |

All three trial jobs were run in parallel through the same local handoff server on port `8813`.

## Browser QA

- Browser target: `http://127.0.0.1:5193/docs/qa/recursive-animation-prompt-tournament/walk-run-focus/ab-gallery.html`
- Browser surface: Codex in-app browser
- Checks:
  - Gallery loaded over local HTTP.
  - 3 A/B sections rendered.
  - 6 sheet images rendered.
  - 6 GIF previews rendered.
  - Broken images: 0.
  - Console errors: 0.
  - Scale controls were clicked and verified: `scale-1` -> `scale-4`.
  - Candidate-local gallery redirect verified to `ab-gallery.html#walk-b-v1-trial-001`.
- Screenshot: `browser-gallery-4x.png`

## Decision Summary

Champion A stays for both `walk-cycle` and `run-cycle`.

Challenger B produced usable generated assets and passed mechanical/browser QA, but it did not reach Candidate tier. The run prompt also needed extra candidate selection and direction re-generation to avoid walk-like side/front-three-quarter output, so it is not stable enough for official replacement.

Next loop should keep the B prompt direction but run at least 3 walk trials and 3 run trials before considering a Candidate 5-run gate.
