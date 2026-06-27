# Local State OOM Safe Mode / Retention QA

Date: 2026-06-27
Branch: `codex/local-state-oom-safe-mode-retention`
Status: verified on branch

## Scope

This QA covers the hotfix for oversized browser local state causing Chrome renderer OOM during Image Cockpit startup.

The change must keep repository files, `codex-handoff/outbox`, `docs/qa`, and generated PNG files untouched. Reset actions only target Image Cockpit browser local state for the current origin.

## Startup Modes

- Normal startup: `/`
- Safe mode startup: `/?safe=1`
- Alternate safe mode startup: `/?skipStorage=1`
- Static reset page: `/reset-local-state.html`
- React reset route: `/?reset=1`

## Expected Behavior

- `?safe=1` and `?skipStorage=1` do not hydrate large history, frames, or animation library state.
- `navigator.storage.estimate()` runs before large IndexedDB state is read.
- 200 MB or more shows a warning path.
- 500 MB or more opens recovery before reading large state.
- 1 GB or more is treated as a hard block before reading large state.
- Reset UI requires user confirmation.
- Reset UI can clear history, frames, animation library, or all local Image Cockpit state.
- Pending Codex job state is included in the all-state reset.
- Retention caps preserve selected and adopted history items while trimming old non-adopted items.

## Automated Coverage

Completed commands:

```powershell
node --check scripts/ui-smoke.mjs
node --check scripts/release-audit.mjs
npm run typecheck
npm test
npm run build
npm run smoke
npm run release:audit
npm run ui:smoke
git diff --check
```

Additional smoke coverage:

- `assertSafeModeRecovery`
- `assertStoragePreflightRecovery`
- `assertResetLocalStatePage`
- `mockLargeStorage=1`
- `navigator.storage.estimate` mock at 600 MB

Notes:

- The commands were executed with the bundled Node runtime in this Codex Desktop environment.
- `npm run typecheck` was covered by the direct TypeScript command used by the project script.
- `npm test` passed 39 tests.
- `npm run build` completed with the existing Vite chunk-size warning only.
- `npm run ui:smoke` passed and included the safe mode, mocked 600 MB storage recovery, and static reset page checks.
- `git diff --check` passed with line-ending warnings only.

## Browser QA Log

| Case | URL | Viewport | Expected | Result |
| --- | --- | --- | --- | --- |
| Normal startup | `/` | desktop | App opens with empty or retained local state | passed: cockpit opened, canvas rendered, Japanese stored language was respected |
| Safe mode | `/?safe=1` | desktop | Recovery screen appears, large local state is skipped | passed: `Local state safe mode`, reset actions, runner status, and zero history cards confirmed |
| Skip storage alias | `/?skipStorage=1` | desktop | Same behavior as safe mode | passed: safe mode screen and reset actions confirmed |
| Mock large storage | `/?mockLargeStorage=1` | desktop / ui-smoke temporary profile | Recovery screen appears without OOM | passed in `ui-smoke`: `navigator.storage.estimate` mocked to 600 MB and recovery screen confirmed |
| Reset route | `/?reset=1` | desktop | Reset UI appears without reading large state | passed: clear history, clear frames, and no `codex-handoff/outbox` deletion text confirmed |
| Static reset page | `/reset-local-state.html` | desktop | Reset buttons clear only browser local state | passed: page, safe link, clear-all action, and no `codex-handoff/outbox` deletion text confirmed |
| Static reset operation | `/reset-local-state.html` | ui-smoke temporary profile | Reset clears Image Cockpit localStorage keys including pending Codex job | passed in `ui-smoke` |
| Retention | unit tests | n/a | selected/adopted history and protected frames are retained | passed in Vitest |


## Main Merge Gate

This branch remains confirmation-gated. Even after tests and browser QA pass, return to the owner before main merge.

main merge前にご主人確認へ戻す。
