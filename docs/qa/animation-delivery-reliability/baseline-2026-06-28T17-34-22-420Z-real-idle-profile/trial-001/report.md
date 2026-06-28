# Animation Delivery Browser Smoke

Created: 2026-06-28T17:53:09.006Z

## Summary

- runnerMode: real
- browserUrl: http://127.0.0.1:53777/
- viewport: 1280x720
- totalTrials: 1
- passedTrials: 0
- browserDeliveryRate: 0
- falseSuccessCount: 0
- stuckRunningCount: 0

## Trial

- id: browser-delivery-2026-06-28T17-34-22-569Z
- resultStatus: fail
- sourceType: browser file upload from public prompt example
- sourceName: animation-delivery-source.png
- deliveredToHistory: false
- deliveredToPreview: false
- downloadableFinal: false
- outboxFinalPresent: false
- falseSuccess: false
- stuckRunning: false
- failureReason: not_delivered_to_history, not_delivered_to_preview, not_downloadable_final, outbox_final_missing; ui: Material quality gate failed 6月29日 02:53 • codex-job-2026-06-28T17-34-26-123Z-4ek1f0 Animation: idle / Locked animation preset: Idle Breathing. Preset motion (candidate 1/3) The completed Codex job returned outbox files, but the app could not import them. Reason: Animation quality gate failed: no history or final download item was added. All animation tournament candidates failed. candidate 1/3: Direction split QA failed: front: idle breathing motion too small (1.2% average frame Retry suggestion: The candidate was not saved as a final result. Review diagnostics and regenerate the job. Retry import
- uiFailureText: Material quality gate failed 6月29日 02:53 • codex-job-2026-06-28T17-34-26-123Z-4ek1f0 Animation: idle / Locked animation preset: Idle Breathing. Preset motion (candidate 1/3) The completed Codex job returned outbox files, but the app could not import them. Reason: Animation quality gate failed: no history or final download item was added. All animation tournament candidates failed. candidate 1/3: Direction split QA failed: front: idle breathing motion too small (1.2% average frame Retry suggestion: The candidate was not saved as a final result. Review diagnostics and regenerate the job. Retry import

## Artifacts

- screenshot: docs/qa/animation-delivery-reliability/baseline-2026-06-28T17-34-22-420Z-real-idle-profile/trial-001/browser-final-1280x720.png
- handoffDir: docs/qa/animation-delivery-reliability/baseline-2026-06-28T17-34-22-420Z-real-idle-profile/trial-001/handoff
- browser-trials.json
- delivery-rate-summary.json
