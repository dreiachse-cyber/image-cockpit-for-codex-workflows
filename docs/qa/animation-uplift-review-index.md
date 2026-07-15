# Animation Uplift Review Index

branch: `codex/animation-uplift-sequence`
base / rollback checkpoint: `a69fc9f`

## Phase checkpoints

| Phase | commit | QA / evidence |
| --- | --- | --- |
| Phase 1 | `9a79c1c` | `docs/qa/animation-quality-gate-v2.md` |
| Phase 2 | `a9ebf60` | `docs/qa/resumable-adaptive-tournament.md` |
| Phase 3 | `62c44bf` | `docs/qa/motion-recipe-prompt-compiler.md` |
| Phase 4 | `1d6d5bb` | `docs/qa/motion-repertoire-variant-engine.md` |
| Phase 5 | `a20808e` | `docs/qa/animation-timeline-pack-v2.md` |
| Phase 6 | `b767cf7` | `docs/qa/animation-review-cockpit-uiux.md` |
| Phase 7 | `724fce1` | `docs/qa/vfx-composite-stage.md` |
| Phase 8 | final branch head | `docs/qa/animation-uplift-final-benchmark.md` / `.json` |

## Phase 8 real-browser evidence

- Standard Fast 5-direction trial IDs and job IDs: `docs/qa/animation-uplift-final-benchmark.json#standardTrials`。
- Standard coverage: 12新規tournaments、11 accepted、1 external ImageGen terminal failure、false success 0、stuck 0。
- Standard代表control: knight idle `anim-tournament_xpppgw_mrli0eb5`、small slime jump `anim-tournament_q9ciac_mrli0j0a`、floating fire attack `anim-tournament_4a12bv_mrli0h2f`。
- Pilot 1 knight idle: `anim-tournament_wkfk1f_mrlm1bw3`、A/B/C人間Review後にAを採用し残方向展開。
- Pilot 2 small slime jump: `anim-tournament_ex1iv5_mrlm2hr7`、A/B/C reject後に`anim-tournament_ex1iv5_mrlm2hr7-fallback`のBalanced Bをaccepted。
- Pilot 3 floating fire attack: `anim-tournament_tmtetw_mrlm5txi`、人間Reviewでhold後に`anim-tournament_tmtetw_mrlm5txi-fallback`のBalanced Bをaccepted。
- Review screenshots: `docs/qa/screenshots/motion-pilot-final/motion-pilot-off.png` / `motion-pilot-on.png`。
- Phase 7 VFX real jobs: slash `codex-job-2026-07-15T02-12-58-835Z-s2kptm`、hit `codex-job-2026-07-15T02-13-13-755Z-d7em2w`、magic `codex-job-2026-07-15T02-13-15-836Z-jawtdx`、projectile `codex-job-2026-07-15T02-19-45-202Z-jslhox`、impact `codex-job-2026-07-15T02-20-05-697Z-pgbfcf`。

## Final review routes

- final benchmark JSON: `docs/qa/animation-uplift-final-benchmark.json`
- VFX representative matrix: `docs/qa/vfx-composite-stage-matrix.json`
- Phase 6 calibration: `docs/qa/animation-review-calibration-sample.json`
- review URL: `http://127.0.0.1:5181/`。
- `origin/main...HEAD`は043継承差分を含み、`a69fc9f...HEAD`はAnimation Uplift新規差分として分けて確認する。
