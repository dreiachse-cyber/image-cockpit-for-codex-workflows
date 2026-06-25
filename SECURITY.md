# Security Policy

## Supported Versions

The public baseline is `v0.1.0`. Security fixes target the current `main` branch first, then the next tagged release.

## Reporting A Vulnerability

Use GitHub's private vulnerability reporting when available. If it is not available, contact the project owner directly instead of opening a public issue with exploit details.

Please include:

- A short description of the issue.
- Steps to reproduce.
- Whether the issue exposes local files, secrets, generated assets, or handoff jobs.
- Any suggested mitigation.

## Security Boundaries

- The app is local-first and should not require an API key.
- The app should not call OpenAI APIs directly.
- Local handoff files may include user prompts, image references, selected source assets, annotations, and generated outputs.
- `codex-handoff/`, `.env`, downloaded assets, API keys, access tokens, and model weights should not be committed.
- Generated or imported assets should be treated as user-controlled content.

## Runner Notes

When `IMAGE_COCKPIT_CODEX_AUTORUN=1`, the local server attempts to launch the configured Codex command. If the command is unavailable, denied, or blocked, the runner should record `unavailable` and fall back to manual handoff instead of retrying indefinitely.
