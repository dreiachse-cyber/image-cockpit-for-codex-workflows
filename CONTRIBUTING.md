# Contributing

Thanks for considering a contribution to Image Cockpit for Codex Workflows.

This repository is still a private pre-release candidate. Until the first public release is approved, changes should stay on the `codex/mvp-local-cockpit` branch or another review branch and must not be merged to `main` without owner approval.

## Product Boundary

- The app runs locally on a machine where Codex is installed.
- The app itself must not call OpenAI APIs directly.
- No API keys, access tokens, model weights, or license-unclear assets should be committed.
- Codex integration should go through local handoff files under `codex-handoff/` or through the local `codex exec` runner.

## Priority

The first release prioritizes four workflows:

1. Image generation
2. Image editing
3. Sprite sheet generation
4. Sprite sheet editing

Design polish and additional adapters are welcome later, but they should not make these four workflows harder to understand.

## Local Setup

```powershell
npm install
npm run dev:all
```

Run checks before proposing a change:

```powershell
npm run typecheck
npm test
npm run build
npm run smoke
npm run release:audit
```

## Pull Request Checklist

- Keep changes focused on one behavior or doc update.
- Update README, roadmap, review notes, or release checklist when behavior changes.
- Include screenshots for visible UI changes under `docs/qa/`.
- Keep generated outputs, secrets, and local handoff artifacts out of commits.
- Confirm the app still has no direct OpenAI API dependency.

## Commit Style

Use short imperative commit messages, for example:

```text
Add runner preflight status
Separate workflow handoff payloads
```
