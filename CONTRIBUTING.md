# Contributing

Thanks for considering a contribution to Image Cockpit for Codex Workflows.

Forks, experiments, local patches, and write-ups are welcome.

Upstream pull requests are currently disabled or limited while the project direction is owner-curated. This keeps the public repository usable as an OSS reference without creating an ongoing PR review queue for the owner. If Issues are enabled, please use Issues for bug reports, usage notes, and small design discussions. Security reports must follow `SECURITY.md`.

## Product Boundary

- The app runs locally on a machine where Codex is installed.
- The app itself must not call OpenAI APIs directly.
- No API keys, access tokens, model weights, or license-unclear assets should be committed.
- Codex integration should go through local handoff files under `codex-handoff/` or through the local `codex exec` runner.

## Priority

The current public direction prioritizes three workflows:

1. Pixel art generation
2. Image editing
3. Animation generation from generated or uploaded pixel art

Sprite sheets are treated as an output of the animation flow. Design polish, additional adapters, engine-specific exports, and advanced sprite editing are welcome as fork experiments, but they should not make these three workflows harder to understand in the upstream project.

## Local Setup

```powershell
npm install
npm run dev:all
```

Run checks before publishing or sharing a local change:

```powershell
npm run typecheck
npm test
npm run build
npm run smoke
npm run release:audit
```

## Local Change Checklist

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
