# Ranger Same-Source Walk / Run A/B Rerun

Date: 2026-06-27 JST
Branch: `codex/walk-run-focused-animation-tournament`

## Why This Rerun Exists

The earlier walk/run Challenger B looked meaningfully stronger than the conservative decision. This rerun changes the source body and generates A and B from the same new ranger source, so prompt behavior can be compared without source-character bias.

## Prompt Difference Summary

- Champion A describes the gait at a higher level and keeps the current app contract wording.
- Challenger B pins individual frame events more tightly.
- Walk B adds explicit planted-foot beats, front/back shoe-depth offsets, and no-flight constraints.
- Run B adds a stricter half-cycle: max extension, narrowing, mandatory crossover, lead-foot switch, and opposite-lead endpoint.
- Walk B2 keeps B's front/back shoe-depth idea but caps stride length, knee lift, torso bob, and forward lean so the motion stays closer to a calm field-map walk.

## Jobs

| Preset | Variant | Trial | Job ID | Server manifest |
| --- | --- | --- | --- | --- |
| `walk-cycle` | A current | `walk-a-current-ranger-001` | `codex-job-2026-06-27T00-13-16-952Z` | gold |
| `walk-cycle` | B v1 | `walk-b-v1-ranger-001` | `codex-job-2026-06-27T00-13-16-909Z` | gold |
| `walk-cycle` | B2 | `walk-b-v2-ranger-001` | `codex-job-2026-06-27T00-57-14-622Z` | gold |
| `run-cycle` | A current | `run-a-current-ranger-001` | `codex-job-2026-06-27T00-13-16-936Z` | gold |
| `run-cycle` | B v1 | `run-b-v1-ranger-001` | `codex-job-2026-06-27T00-25-51-214Z` | gold |

## Browser QA

- Browser target: `http://127.0.0.1:5194/docs/qa/recursive-animation-prompt-tournament/walk-run-focus/ranger-rerun/ab-gallery.html`
- Browser surface: Codex in-app browser
- Sections: 3
- Source images: 1
- Sheet images: 6
- GIF comparison images: 30 total, 10 per comparison section
- Broken images: 0
- Console errors: 0
- Default `scale-2` layout keeps all 10 GIF cards for each comparison section on one row at 1280px viewport.
- Scale control verified: `scale-4`
- Screenshot: `browser-ranger-gallery-b2-1280-4x.png`

## Decision Summary

- `walk-cycle`: A current is still the better official walk candidate for this source. B has stronger leg separation, but it over-amplifies the walk into a jog/run-like read in several front and diagonal frames.
- `walk-cycle B2`: B2 successfully reduces the jog/run-like energy, but the front/back rows can now feel too static. It is useful as a prompt boundary, not an official replacement.
- `run-cycle`: B v1 is the stronger candidate for this source. It gives clearer forward lean, stride extension, and direction-readable running silhouettes than A.
- Overall: B is not a universal replacement yet, but the run-specific B changes are promising enough for the next Candidate gate. Walk should stay on A for now; a future B3 should start from A and add only very small foot-depth cues.

## Review File

Open `ab-gallery.html`. Each comparison section shows two grid sheets plus ten GIFs: A/B for all five directions.
