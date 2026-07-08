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

- `npm run typecheck`: pass
- `npm test`: pass, 3 files / 62 tests
- `npm run build`: pass, existing Vite chunk-size warning only
- `npm run smoke`: pass
- `npm run release:audit`: pass
- `npm run ui:smoke`: pass
- `git diff --check`: pass, CRLF conversion warnings only

## Browser QA

In-app browser verified the local app at `http://127.0.0.1:5211/`.

- Japanese persisted UI was used for the manual check.
- The source-panel workflow tabs no longer split labels inside words.
- After a first browser pass found the tabs overlapping the Cockpit warning panel, the source-panel tabs were changed to a 2-column grid with explicit height and `nowrap`; hit testing then reached the button spans correctly.
- The Animation Generation tab became clickable after the tab layout fix.
- Direction selector rendered `5方向`, `3方向`, `1方向` with titles listing the requested directions.
- Direction selector state changed correctly: `3方向` became active, then `1方向` became active.
- Completion notification toggle changed from unchecked to checked and remained checked after reload.
- At 390px viewport width, workflow tab labels stayed `nowrap` with `clientHeight === scrollHeight` and `clientWidth === scrollWidth`. In this saved browser state, the mobile source panel sat below the visible viewport because of existing topbar/language content height, so desktop interaction is the acceptance interaction and mobile check is layout-only.

## Notes

- `public/samples/` remains bundled for README demo assets, release audit fixtures, and local import QA; the official Animation Library UI remains hidden.
- Sequential standard animation tournament now starts reserve candidates only when the current candidate is terminal and not clean, and finalizes with the best usable warning candidate only after reserves are exhausted.
