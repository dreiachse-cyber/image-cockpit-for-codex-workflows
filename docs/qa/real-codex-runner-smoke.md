# Real Codex Runner Smoke

更新日: 2026-06-23 18:15 JST

## Scope

This verifies that Image Cockpit's local handoff server can launch the installed Codex CLI with the selected launch command, pass a handoff prompt over stdin, let Codex read the job JSON, write a result sidecar into outbox, and finish with exit code 0.

This smoke intentionally does not generate an image. It proves the real runner lifecycle, not image generation or image editing capability.

## Environment

- Branch: `codex/mvp-local-cockpit`
- Codex CLI: `C:\Users\nakaya\AppData\Local\OpenAI\Codex\bin\38dff8711e296435\codex.exe`
- Codex version observed earlier in the same review pass: `codex-cli 0.142.0`
- Runner command shape: `codex exec -c approval_policy="<approval>" --sandbox <sandbox> -`
- Sandbox: `workspace-write`
- Approval policy: `never`
- Handoff root: `codex-handoff/real-runner-smoke-1782206035351/`

## Result

- Runner preflight: `ready`
- Job id: `codex-job-2026-06-23T09-13-56-065Z`
- Runner state: `completed`
- Exit code: `0`
- Signal: `null`
- Outbox file: `codex-job-2026-06-23T09-13-56-065Z-runner-smoke.md`

Outbox sidecar content:

```markdown
# Runner Smoke

job id: codex-job-2026-06-23T09-13-56-065Z

runner smoke ok
```

## Regression Covered

The previous real runner attempt failed before Codex could process the job because the installed Codex CLI rejected the removed `--ask-for-approval` flag. The runner now uses the current Codex CLI shape, passing the approval policy through `-c approval_policy="<approval>"`.

## What This Does Not Prove

- It does not prove that the current Codex environment can generate or edit image pixels.
- It does not replace manual handoff as the fallback path for environments where `codex exec` is unavailable.
- It does not permit main merge, public visibility, tag creation, or a GitHub release without owner approval.
