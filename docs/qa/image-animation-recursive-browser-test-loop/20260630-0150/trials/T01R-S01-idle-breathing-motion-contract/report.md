# Animation Delivery Browser Smoke

Created: 2026-06-29T18:22:30.738Z

## Summary

- runnerMode: real
- browserUrl: http://127.0.0.1:60868/
- viewport: 1280x720
- totalTrials: 1
- passedTrials: 0
- browserDeliveryRate: 0
- falseSuccessCount: 0
- stuckRunningCount: 0

## Trial

- id: browser-delivery-2026-06-29T18-03-39-622Z
- resultStatus: fail
- sourceType: browser file upload from public prompt example
- sourceName: animation-delivery-source.png
- deliveredToHistory: false
- deliveredToPreview: false
- downloadableFinal: false
- outboxFinalPresent: false
- falseSuccess: false
- stuckRunning: false
- failureReason: not_delivered_to_history, not_delivered_to_preview, not_downloadable_final, outbox_final_missing; ui: Material quality gate failed 6月30日 03:22 • codex-job-2026-06-29T18-03-43-987Z-nojti3 Animation: idle / Locked animation preset: Idle Breathing. Preset motion (candidate 1/1) The completed Codex job returned outbox files, but the app could not import them. Reason: Animation quality gate failed: no history or final download item was added. All animation tournament candidates failed. candidate 1/1: Direction split QA failed: idle breathing motion too static across directions (2/5 re Retry suggestion: The candidate was not saved as a final result. Review diagnostics and regenerate the job. Retry import
- uiFailureText: Material quality gate failed 6月30日 03:22 • codex-job-2026-06-29T18-03-43-987Z-nojti3 Animation: idle / Locked animation preset: Idle Breathing. Preset motion (candidate 1/1) The completed Codex job returned outbox files, but the app could not import them. Reason: Animation quality gate failed: no history or final download item was added. All animation tournament candidates failed. candidate 1/1: Direction split QA failed: idle breathing motion too static across directions (2/5 re Retry suggestion: The candidate was not saved as a final result. Review diagnostics and regenerate the job. Retry import

## Artifacts

- screenshot: docs/qa/image-animation-recursive-browser-test-loop/20260630-0150/trials/T01R-S01-idle-breathing-motion-contract/browser-final-1280x720.png
- handoffDir: docs/qa/image-animation-recursive-browser-test-loop/20260630-0150/trials/T01R-S01-idle-breathing-motion-contract/handoff
- browser-trials.json
- delivery-rate-summary.json
