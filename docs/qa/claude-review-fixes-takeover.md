# Claude/Fable Review Fixes Takeover QA

Date: 2026-07-08 JST
Branch: `codex/claude-review-fixes-takeover`
Slot: `slot1`

## Scope

- Took over `docs/作業指示書/043_claude_review_fixes_takeover_handoff.md`.
- Kept the branch confirmation-gated. No main merge was performed.
- Local verification URL: `http://127.0.0.1:5211/`
- Dev supervisor: `http://127.0.0.1:8792`
- API: `http://127.0.0.1:8791`

## Automated Verification

- `npm run doctor`: pass
- `npm run typecheck`: pass
- `npm test`: pass, 3 files / 65 tests
- `npm run build`: pass, existing Vite chunk-size warning only
- `npm run smoke`: pass
- `npm run release:audit`: pass
- `npm run ui:smoke`: pass
- `npm run imagegen:smoke`: pass, real Codex imagegen returned a 1254x1254 PNG
- `git diff --check`: pass, CRLF conversion warnings only

## Browser QA

In-app browser verified the local app at `http://127.0.0.1:5211/`.

- Japanese persisted UI was used for the manual check.
- The source-panel workflow tabs no longer split labels inside words.
- After a first browser pass found the tabs overlapping the Cockpit warning panel, the source-panel tabs were changed to a 2-column grid with explicit height and `nowrap`; hit testing then reached the button spans correctly.
- The Animation Generation tab became clickable after the tab layout fix.
- Direction selector rendered `5方向`, `3方向` with titles listing the requested directions.
- Direction selector state changed correctly: `3方向` became active, then `5方向` became active again.
- Completion notification toggle changed from unchecked to checked and remained checked after reload.
- At 390px viewport width, workflow tab labels stayed `nowrap` with `clientHeight === scrollHeight` and `clientWidth === scrollWidth`. In this saved browser state, the mobile source panel sat below the visible viewport because of existing topbar/language content height, so desktop interaction is the acceptance interaction and mobile check is layout-only.

## Notes

- `public/samples/` remains bundled for README demo assets, release audit fixtures, and local import QA; the official Animation Library UI remains hidden.
- Standard animation tournament starts all three candidates in parallel by default and compares the first usable candidates; the sequential path remains env-gated for diagnostics only.

## Follow-up: Cockpit Health and Manual Runner Visibility

After owner review at `http://127.0.0.1:5211/`, two OSS-facing workflow issues were reproduced and addressed:

- Recoverable old `codex-handoff/outbox/` results no longer turn Cockpit health into `Warning`; the health state stays `OK` and points reviewers to `Recover Results`.
- When `IMAGE_COCKPIT_CODEX_AUTORUN=0` or the runner reaches another terminal state immediately, the submitted job is still recorded in the Codex log panel instead of disappearing from the lower job/log area.

Added regression coverage in `src/App.test.ts`:

- `summarizeCockpitHealthStatus(true, [], 82)` returns `ok`, not `warning`.
- Cockpit route / supervisor mismatches still return `warning`.
- Missing API health still returns `broken`.

Live review URL verification at `http://127.0.0.1:5211/`:

- Cockpit health rendered `Cockpit: OK` with `3 outbox results available for Recover Results`; `Cockpit: Warning` was absent.
- Clicking `ピクセルアート生成` displayed a running Codex job and live stdout/stderr in the lower log panel.
- The mock runner completed and imported `codex-job-2026-07-08T06-55-15-178Z-2rr5hn.png` into the results list.

## Follow-up: Mock Runner Guard and Real Imagegen Verification

After owner review showed green placeholder-like outputs, the review server was confirmed to be running a local mock runner (`review-mock-runner.mjs`) through `node.exe`; those results were not real imagegen results.

Implemented an OSS-facing guard:

- Mock/test runners are detected from command / arg / mock env markers.
- A mock runner is refused as `unavailable` unless `IMAGE_COCKPIT_ALLOW_MOCK_RUNNER=1` is set explicitly.
- Job creation with an unapproved mock runner returns a runner diagnostic and does not spawn the mock process or create fake outbox images.
- Automated smoke tests set `IMAGE_COCKPIT_ALLOW_MOCK_RUNNER=1` only where mock lifecycle wiring is intentional.

Live review URL was restarted with the real Codex runner:

- URL: `http://127.0.0.1:5211/`
- API: `8791`
- Supervisor: `8792`
- Handoff: `.dev-logs/review-handoff-real`
- Runner health: `mode=codex`, `mockRunnerAllowed=false`
- Browser health panel: `Cockpit: OK`; no `Cockpit: Warning`; no `mock/test` runner label.

Real imagegen smoke evidence:

- Job: `codex-job-2026-07-08T07-08-13-530Z-3rbu6x`
- Image: `.dev-logs/real-imagegen-smoke-after-mock-guard/outbox/codex-job-2026-07-08T07-08-13-530Z-3rbu6x-pixel-art-asset.png`
- Dimensions: `1254x1254`
- Exit code: `0`

## Follow-up: Parallel Animation Default and Direction Presets

After owner review found a standard animation run still unfinished after 31 minutes, the branch was adjusted for the OSS default path:

- Standard animation tournament now defaults to `parallel`, starting the three configured candidates together unless `VITE_STANDARD_ANIMATION_TOURNAMENT_MODE=sequential` is explicitly set.
- The direction selector now exposes only `5方向` and `3方向`; the low-value `1方向` option was removed from UI copy, preset state, UI smoke, and release audit expectations.
- Release audit now checks the parallel default / 3+5 direction preset markers and fails if the removed `1 direction` UI marker is reintroduced.
- Existing sequential tournament code remains available behind the env flag for future diagnostics, but it is no longer the default user path.

Verification:

- `npm run typecheck`: pass
- `npm test`: pass, 3 files / 65 tests
- `npm run release:audit`: pass
- `npm run smoke`: pass
- `npm run build`: pass, existing Vite chunk-size warning only
- `git diff --check`: pass, CRLF conversion warnings only
- `npm run ui:smoke`: first run hit the existing source-card timing assertion; immediate retry passed

## Follow-up: Direction Preset Layout

After the `1方向` option was removed, the direction preset segmented control still used the generic 3-column grid and left an empty-looking slot. The direction preset control now has its own 2-column grid so `5方向` and `3方向` fill the control evenly.

Verification:

- `npm run typecheck`: pass
- `npm test`: pass, 3 files / 65 tests
- `npm run release:audit`: pass
- `git diff --check`: pass, CRLF conversion warnings only
- `npm run ui:smoke`: pass
