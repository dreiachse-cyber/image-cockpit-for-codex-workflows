# Animation Delivery Browser Smoke

Created: 2026-06-29T19:27:35.755Z

## Summary

- runnerMode: real
- browserUrl: http://127.0.0.1:57903/
- viewport: 1280x720
- totalTrials: 1
- passedTrials: 0
- browserDeliveryRate: 0
- falseSuccessCount: 0
- stuckRunningCount: 0

## Trial

- id: browser-delivery-2026-06-29T19-15-39-879Z
- resultStatus: fail
- sourceType: browser file upload from public prompt example
- sourceName: animation-delivery-source.png
- deliveredToHistory: false
- deliveredToPreview: false
- downloadableFinal: false
- outboxFinalPresent: false
- falseSuccess: false
- stuckRunning: false
- failureReason: not_delivered_to_history, not_delivered_to_preview, not_downloadable_final, outbox_final_missing; ui: Material quality gate failed 6月30日 04:27 • codex-job-2026-06-29T19-15-43-739Z-0tgn8i Animation: walk / Locked animation preset: Walk Cycle. Preset motion det (candidate 1/1) The completed Codex job returned outbox files, but the app could not import them. Reason: Animation quality gate failed: no history or final download item was added. All animation tournament candidates failed. candidate 1/1: Direction split QA failed: front: motion too small (1.7% average frame change); back: Retry suggestion: The candidate was not saved as a final result. Review diagnostics and regenerate the job. Retry import
- uiFailureText: Material quality gate failed 6月30日 04:27 • codex-job-2026-06-29T19-15-43-739Z-0tgn8i Animation: walk / Locked animation preset: Walk Cycle. Preset motion det (candidate 1/1) The completed Codex job returned outbox files, but the app could not import them. Reason: Animation quality gate failed: no history or final download item was added. All animation tournament candidates failed. candidate 1/1: Direction split QA failed: front: motion too small (1.7% average frame change); back: Retry suggestion: The candidate was not saved as a final result. Review diagnostics and regenerate the job. Retry import

## Artifacts

- screenshot: docs/qa/image-animation-recursive-browser-test-loop/20260630-0150/trials/T03-S02-walk-cycle/browser-final-1280x720.png
- handoffDir: docs/qa/image-animation-recursive-browser-test-loop/20260630-0150/trials/T03-S02-walk-cycle/handoff
- browser-trials.json
- delivery-rate-summary.json
