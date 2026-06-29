# Animation Source Selection Guard QA

Date: 2026-06-29
Branch: `codex/animation-source-selection-guard`
App: Image Cockpit for Codex Workflows v0.1.2

## Summary

The identity-collapse issue was reproduced as a source-selection problem: generated animation outputs could be selected as the next animation source. The fix prevents generated animation artifacts from becoming animation sources while still allowing normal imported body images.

## Code Guard

- `isAnimationSource()` now rejects generated animation result history items.
- Generated animation result detection covers:
  - `*-direction-split-animation-sheet.png`
  - `direction-split:*` outbox import keys
  - `animation-sheet:*` outbox import keys
  - `bronze-candidate:*` outbox import keys
- Animation job creation has an explicit defensive guard that refuses generated animation results as body sources.
- Selecting a generated animation result in the animation workflow shows a Japanese warning and does not overwrite the retained body source.

## Browser QA

Real browser target:

- App: `http://127.0.0.1:5246/`
- API: `http://127.0.0.1:8846/api/health`
- Supervisor: `http://127.0.0.1:8856/api/dev/health`
- Handoff root: `tmp/source-selection-guard-handoff`
- Temporary viewport: `1280x1200`, reset after QA

Outbox fixtures were recovered through the visible UI:

- Valid body source: `body-basic-small-village-child.png`
- Invalid generated animation result: `codex-job-prev-direction-split-animation-sheet.png`

Observed results:

| Step | Browser action | Result |
| --- | --- | --- |
| 1 | Clicked `結果を再取り込み` in the browser UI | Both fixtures imported into history. |
| 2 | Switched to `アニメーションの生成` while generated sheet was selected | No animation source was selected; app requested a source body. |
| 3 | Clicked generated animation result in animation workflow | Warning shown: generated animation results cannot be used as the next body source. |
| 4 | Selected valid body source, then clicked generated animation result | The left source panel retained `body-basic-small-village-child.png`. |
| 5 | Clicked `アニメーション生成` while preview showed the invalid generated sheet | Job creation used the retained body source, not the previewed generated sheet. Runner-disabled status was recorded as an external block, not quality failure. |

Evidence files:

- `tmp/source-selection-guard-browser-qa/01-invalid-animation-result-rejected.png`
- `tmp/source-selection-guard-browser-qa/02-valid-source-retained-after-invalid-selection.png`
- `tmp/source-selection-guard-browser-qa/03-generate-uses-retained-source-runner-blocked.png`
- `tmp/source-selection-guard-browser-qa/browser-qa-summary.json`
- `tmp/source-selection-guard-browser-qa/latest-generated-job.json`

Generated job checked:

- Job id: `codex-job-2026-06-29T07-25-59-446Z-gpbqg6`
- `selectedImage.name`: `body-basic-small-village-child.png`
- `selectedImage.source`: `inbox`
- Prompt includes valid body filename: yes
- Prompt includes invalid generated sheet filename: no

## Verification

Passed before main reflection:

- `tsc --noEmit`
- `vitest run`
- `scripts/doctor.mjs`
- `scripts/smoke.mjs`
- `scripts/release-audit.mjs`
- `tsc -b`
- `vite build`

## Notes

The browser showed `Codex autorun is disabled` when `Generate Animation` was clicked. This is expected for the QA server and is categorized as an external runner block, not a generation quality failure.
