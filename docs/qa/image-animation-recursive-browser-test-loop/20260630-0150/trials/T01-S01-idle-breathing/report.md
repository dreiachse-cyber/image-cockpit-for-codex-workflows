# Animation Delivery Browser Smoke

Created: 2026-06-29T18:00:38.565Z

## Summary

- runnerMode: real
- browserUrl: http://127.0.0.1:53685/
- viewport: 1280x720
- totalTrials: 1
- passedTrials: 0
- browserDeliveryRate: 0
- falseSuccessCount: 0
- stuckRunningCount: 0

## Trial

- id: browser-delivery-2026-06-29T17-43-38-304Z
- resultStatus: fail
- sourceType: browser file upload from public prompt example
- sourceName: animation-delivery-source.png
- deliveredToHistory: false
- deliveredToPreview: false
- downloadableFinal: false
- outboxFinalPresent: false
- falseSuccess: false
- stuckRunning: false
- failureReason: not_delivered_to_history, not_delivered_to_preview, not_downloadable_final, outbox_final_missing; ui: Material quality gate failed 6月30日 03:00 • codex-job-2026-06-29T17-43-41-675Z-02ewpz Animation: idle / Locked animation preset: Idle Breathing. Preset motion (candidate 1/1) The completed Codex job returned outbox files, but the app could not import them. Reason: Animation quality gate failed: no history or final download item was added. All animation tournament candidates failed. candidate 1/1: Direction split QA failed: idle breathing motion too static across directions (2/5 re Retry suggestion: The candidate was not saved as a final result. Review diagnostics and regenerate the job. Retry import
- uiFailureText: Material quality gate failed 6月30日 03:00 • codex-job-2026-06-29T17-43-41-675Z-02ewpz Animation: idle / Locked animation preset: Idle Breathing. Preset motion (candidate 1/1) The completed Codex job returned outbox files, but the app could not import them. Reason: Animation quality gate failed: no history or final download item was added. All animation tournament candidates failed. candidate 1/1: Direction split QA failed: idle breathing motion too static across directions (2/5 re Retry suggestion: The candidate was not saved as a final result. Review diagnostics and regenerate the job. Retry import

## Artifacts

- screenshot: docs/qa/image-animation-recursive-browser-test-loop/20260630-0150/trials/T01-S01-idle-breathing/browser-final-1280x720.png
- handoffDir: docs/qa/image-animation-recursive-browser-test-loop/20260630-0150/trials/T01-S01-idle-breathing/handoff
- browser-trials.json
- delivery-rate-summary.json
