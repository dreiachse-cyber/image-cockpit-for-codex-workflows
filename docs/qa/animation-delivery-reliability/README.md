# Animation Delivery Reliability QA

This folder records browser-driven Animation Generation delivery trials.

The primary metric is not whether a logical test passed or whether files exist in `codex-handoff/outbox`.
The primary metric is whether a user-like browser flow delivers a usable animation into:

- the `Upload Pixel Art` source-selection path
- success history
- central preview
- download options
- root outbox final artifacts

Use:

```powershell
npm run animation:delivery
```

By default, the script runs the real browser flow with a mock runner so the UI delivery contract can be checked quickly.
For real Codex/imagegen delivery trials, run:

```powershell
$env:IMAGE_COCKPIT_ANIMATION_DELIVERY_RUNNER='real'
$env:IMAGE_COCKPIT_ANIMATION_DELIVERY_TIMEOUT_MS='900000'
npm run animation:delivery
```

Each run writes:

- `report.md`
- `browser-trials.json`
- `delivery-rate-summary.json`
- `browser-final-1280x720.png`

A trial is a pass only when the browser flow delivers a silver-or-better final result to history, preview, download, and root outbox without false success.

For repeated baseline runs, use:

```powershell
$env:IMAGE_COCKPIT_ANIMATION_DELIVERY_TRIALS='3'
npm run animation:baseline
```

`animation:baseline` keeps the committed evidence lightweight by pruning each trial's runtime `handoff/` directory after reading its result metadata. Set `IMAGE_COCKPIT_ANIMATION_DELIVERY_KEEP_HANDOFF=1` when you need the full generated outbox payload for debugging.

For real-run baselines where failures are expected and should still be recorded:

```powershell
$env:IMAGE_COCKPIT_ANIMATION_DELIVERY_RUNNER='real'
$env:IMAGE_COCKPIT_ANIMATION_DELIVERY_TRIALS='1'
$env:IMAGE_COCKPIT_ANIMATION_DELIVERY_MIN_RATE='0'
npm run animation:baseline
```

To evaluate the accumulated real-browser delivery SLO across recorded baselines:

```powershell
npm run animation:rollup
```

By default, `animation:rollup` checks real-run baselines against `minTrials=10` and `minRate=0.9`. It writes `delivery-rollup-real.json` and `delivery-rollup-real.md`, and it exits non-zero while evidence is still insufficient or the observed delivery rate is below the SLO.
