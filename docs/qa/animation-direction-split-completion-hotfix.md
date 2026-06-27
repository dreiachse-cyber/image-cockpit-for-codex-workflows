# Animation Direction Split Completion Hotfix QA

Date: 2026-06-27
Branch: `codex/animation-direction-split-completion-hotfix`

## Scope

032 hotfix for Animation Generation direction split recovery.

The target issue is a completed Codex job where outbox contains a verified `image-cockpit.direction-split-animation.v1` manifest plus five raw direction PNG files, but the user can end up seeing or downloading a single raw direction sheet such as `*-front.png` instead of the final 5-direction x 8-frame animation sheet.

## Expected Behavior

- A ready manifest plus all five direction images can be imported without a pending job.
- Recover Results restores the final `*-direction-split-animation-sheet.png`.
- Generic latest-image import excludes raw direction component files such as `*-front.png`.
- The final selected result is a 2048x1280 sheet for 256px cells, not a 1024x512 raw direction file.
- Re-running recovery for the same job does not duplicate the final sheet.
- QA failure still creates an import failure / review notice instead of treating raw direction PNG as success.

## Verification Plan

Run before main merge / main merge前:

```text
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

The Codex Desktop bundled Node runtime is used for local commands in this environment.

## Browser Evidence

- `node --check scripts/ui-smoke.mjs`: pass.
- `node --check scripts/release-audit.mjs`: pass.
- `node_modules/typescript/bin/tsc --noEmit`: pass.
- `node_modules/vitest/vitest.mjs run`: pass, 3 files / 53 tests.
- `node_modules/typescript/bin/tsc -b` and `node_modules/vite/bin/vite.js build`: pass.
- `scripts/smoke.mjs`: pass.
- `scripts/release-audit.mjs`: pass.
- `git diff --check`: pass, with line-ending warnings only.
- `scripts/ui-smoke.mjs`: pass in browser automation.
- Detached fixture wrote a verified direction split manifest plus five raw `1024x512` direction PNGs into outbox with no pending job.
- `Recover Results` imported `codex-job-ui-smoke-detached-direction-split-direction-split-animation-sheet.png`.
- The selected preview was the final `2048x1280` 5-direction x 8-frame sheet, not `*-front.png`.
- The Download modal exposed animation exports for the final sheet and did not expose the plain PNG path for a raw direction component.
- A second `Recover Results` run did not duplicate the final sheet.
- Existing pending-job direction split browser checks still passed: partial direction split, manifest-first recovery, and completed import failure / review candidate.
