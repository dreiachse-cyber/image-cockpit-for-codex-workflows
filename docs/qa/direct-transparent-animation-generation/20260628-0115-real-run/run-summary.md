# Direct Transparent Animation Generation Experiment Run

Source image: `forest-mage-idle.png`

Raw runner handoff/log folders were omitted from the committed QA artifact. Selected outputs are copied into label directories in this folder.

| Label | Job ID | Background mode | Runner state | Alpha | Visual | Adoption candidate | Results |
| --- | --- | --- | --- | --- | --- | --- | --- |
| baseline-chroma-key | codex-job-2026-06-27T16-17-01-671Z | chroma-key | completed | PASS | pass | no | codex-job-2026-06-27T16-17-01-671Z-manifest.json<br>codex-job-2026-06-27T16-17-01-671Z-back.png<br>codex-job-2026-06-27T16-17-01-671Z-back-three-quarter.png<br>codex-job-2026-06-27T16-17-01-671Z-side.png<br>codex-job-2026-06-27T16-17-01-671Z-front-three-quarter.png<br>codex-job-2026-06-27T16-17-01-671Z-front.png |
| direct-transparent-a-empty-alpha | codex-job-2026-06-27T16-25-23-584Z | direct-transparent | completed | n/a | n/a | no | blocked sidecar only |
| direct-transparent-b-no-checkerboard | codex-job-2026-06-27T16-28-44-549Z | direct-transparent | completed | PASS | fail-silhouette | no | codex-job-2026-06-27T16-28-44-549Z-manifest.json<br>codex-job-2026-06-27T16-28-44-549Z-back.png<br>codex-job-2026-06-27T16-28-44-549Z-back-three-quarter.png<br>codex-job-2026-06-27T16-28-44-549Z-side.png<br>codex-job-2026-06-27T16-28-44-549Z-front-three-quarter.png<br>codex-job-2026-06-27T16-28-44-549Z-front.png |
| direct-transparent-c-alpha-contract | codex-job-2026-06-27T16-40-58-676Z | direct-transparent | completed | PASS | pass | yes | codex-job-2026-06-27T16-40-58-676Z-manifest.json<br>codex-job-2026-06-27T16-40-58-676Z-back.png<br>codex-job-2026-06-27T16-40-58-676Z-back-three-quarter.png<br>codex-job-2026-06-27T16-40-58-676Z-side.png<br>codex-job-2026-06-27T16-40-58-676Z-front-three-quarter.png<br>codex-job-2026-06-27T16-40-58-676Z-front.png |
| direct-transparent-d-color-preserve | codex-job-2026-06-27T17-02-26-534Z | direct-transparent | completed | PASS | pass | yes | codex-job-2026-06-27T17-02-26-534Z-manifest.json<br>codex-job-2026-06-27T17-02-26-534Z-back.png<br>codex-job-2026-06-27T17-02-26-534Z-back-three-quarter.png<br>codex-job-2026-06-27T17-02-26-534Z-side.png<br>codex-job-2026-06-27T17-02-26-534Z-front-three-quarter.png<br>codex-job-2026-06-27T17-02-26-534Z-front.png |
