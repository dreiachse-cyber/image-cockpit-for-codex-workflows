# Animation Delivery Rollup

Created: 2026-06-28T21:10:04.751Z

## Gate

- runnerMode: real
- filters.createdAtFrom: none
- gateStatus: below_rate
- minTrials: 10
- minRate: 0.9
- totalTrials: 15
- passedTrials: 11
- failedTrials: 4
- browserDeliveryRate: 0.7333333333333333
- falseSuccessCount: 0
- stuckRunningCount: 0

## Baselines

- docs/qa/animation-delivery-reliability/baseline-2026-06-28T15-38-38-466Z: 1/1, rate=1
- docs/qa/animation-delivery-reliability/baseline-2026-06-28T16-31-30-892Z-real-batch3: 0/3, rate=0
- docs/qa/animation-delivery-reliability/baseline-2026-06-28T17-34-22-420Z-real-idle-profile: 0/1, rate=0
- docs/qa/animation-delivery-reliability/baseline-2026-06-28T17-57-43-118Z-real-idle-aggregate: 1/1, rate=1
- docs/qa/animation-delivery-reliability/baseline-2026-06-28T18-22-39-703Z-real-batch4-post-aggregate: 4/4, rate=1
- docs/qa/animation-delivery-reliability/baseline-2026-06-28T19-17-06-056Z-real-prompt-isolation: 1/1, rate=1
- docs/qa/animation-delivery-reliability/baseline-2026-06-29T05-03-46-530-real-slo-sample4-long-timeout: 4/4, rate=1

## Failure Classes

- not_delivered_to_history: 4
- not_delivered_to_preview: 4
- not_downloadable_final: 4
- outbox_final_missing: 4
