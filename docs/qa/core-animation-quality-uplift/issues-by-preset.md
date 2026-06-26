# Core Animation Issues By Preset

Generated: 2026-06-27T01:23:00+09:00

Severity follows the 018 handoff: blocker, major, minor, polish.

## Idle Breathing (`idle-breathing`)

Score: 92 / 100

Decision: keep-current

| severity | label | direction | frames | evidence |
| --- | --- | --- | --- | --- |
| polish | edge_contact | front | 1, 2, 3, 4, 5, 6, 7, 8 | Padding below preferred 24px in front; min=21px. |
| polish | edge_contact | front-three-quarter | 1, 2, 3, 4, 5, 6, 7, 8 | Padding below preferred 24px in front-three-quarter; min=22px. |
| polish | edge_contact | side | 1, 2, 3, 4, 5, 6, 7, 8 | Padding below preferred 24px in side; min=18px. |
| polish | edge_contact | back-three-quarter | 1, 2, 3, 4, 5, 6, 7, 8 | Padding below preferred 24px in back-three-quarter; min=17px. |
| minor | cropped_body | back-three-quarter | 1, 2, 3, 4, 5, 6, 7, 8 | Top margin is tight in back-three-quarter; minTop=17px. |
| minor | edge_contact | back | 1, 2, 3, 4, 5, 6, 7, 8 | Minimum padding below 16px in back; min=13px. |
| minor | cropped_body | back | 1, 2, 3, 4, 5, 6, 7, 8 | Top margin is tight in back; minTop=13px. |

## Walk Cycle (`walk-cycle`)

Score: 98 / 100

Decision: needs-retake

| severity | label | direction | frames | evidence |
| --- | --- | --- | --- | --- |
| none | - | - | - | No issue labels from phase-a audit. |


## Run Cycle (`run-cycle`)

Score: 96 / 100

Decision: needs-retake

| severity | label | direction | frames | evidence |
| --- | --- | --- | --- | --- |
| none | - | - | - | No issue labels from phase-a audit. |


## Basic Attack (`basic-attack`)

Score: 86 / 100

Decision: needs-retake

| severity | label | direction | frames | evidence |
| --- | --- | --- | --- | --- |
| minor | edge_contact | front | 2, 4 | Minimum padding below 16px in front; min=11px. |
| minor | edge_contact | front-three-quarter | 4 | Minimum padding below 16px in front-three-quarter; min=10px. |
| minor | edge_contact | side | 2, 3, 4, 5, 6 | Minimum padding below 16px in side; min=5px. |
| minor | edge_contact | back-three-quarter | 4, 5 | Minimum padding below 16px in back-three-quarter; min=8px. |
| minor | edge_contact | back | 4, 5 | Minimum padding below 16px in back; min=10px. |
| polish | action_structure_bad | all | 1, 2, 3, 4, 5, 6, 7, 8 | High-structure action should be first in the multi-run stability retake queue even when the current sample passes structural QA. |

## Hurt Reaction (`hurt-reaction`)

Score: 97 / 100

Decision: keep-current

| severity | label | direction | frames | evidence |
| --- | --- | --- | --- | --- |
| polish | edge_contact | front | 3, 4 | Padding below preferred 24px in front; min=22px. |
| polish | edge_contact | front-three-quarter | 3, 4 | Padding below preferred 24px in front-three-quarter; min=17px. |

## Death / Downed (`death-downed`)

Score: 93 / 100

Decision: needs-retake

| severity | label | direction | frames | evidence |
| --- | --- | --- | --- | --- |
| minor | scale_drift | back-three-quarter | 1, 2, 3, 4, 5, 6, 7, 8 | Height ratio is 2.46 in back-three-quarter. |

## Spell Cast (`spell-cast`)

Score: 94 / 100

Decision: needs-retake

| severity | label | direction | frames | evidence |
| --- | --- | --- | --- | --- |
| polish | scale_drift | back-three-quarter | 1, 2, 3, 4, 5, 6, 7, 8 | Height ratio is 1.104 in back-three-quarter. |

## Jump / Hop (`jump-hop`)

Score: 88 / 100

Decision: needs-retake

| severity | label | direction | frames | evidence |
| --- | --- | --- | --- | --- |
| minor | edge_contact | front | 5 | Minimum padding below 16px in front; min=12px. |
| minor | cropped_body | front | 5 | Top margin is tight in front; minTop=12px. |
| minor | edge_contact | front-three-quarter | 5 | Minimum padding below 16px in front-three-quarter; min=12px. |
| minor | cropped_body | front-three-quarter | 5 | Top margin is tight in front-three-quarter; minTop=12px. |
| polish | anchor_drift | front-three-quarter | 1, 2, 3, 4, 5, 6, 7, 8 | Bottom anchor drift is 59px in front-three-quarter. |
| minor | edge_contact | side | 5, 6 | Minimum padding below 16px in side; min=13px. |
| minor | cropped_body | side | 5, 6 | Top margin is tight in side; minTop=13px. |
| polish | anchor_drift | side | 1, 2, 3, 4, 5, 6, 7, 8 | Center drift is 77px in side. |
| polish | anchor_drift | side | 1, 2, 3, 4, 5, 6, 7, 8 | Bottom anchor drift is 73px in side. |
| minor | edge_contact | back-three-quarter | 5 | Minimum padding below 16px in back-three-quarter; min=9px. |
| minor | cropped_body | back-three-quarter | 5 | Top margin is tight in back-three-quarter; minTop=9px. |
| polish | anchor_drift | back-three-quarter | 1, 2, 3, 4, 5, 6, 7, 8 | Bottom anchor drift is 59px in back-three-quarter. |
| minor | edge_contact | back | 5 | Minimum padding below 16px in back; min=12px. |
| minor | cropped_body | back | 5 | Top margin is tight in back; minTop=12px. |

## Guard / Block (`guard-block`)

Score: 98 / 100

Decision: keep-current

| severity | label | direction | frames | evidence |
| --- | --- | --- | --- | --- |
| none | - | - | - | No issue labels from phase-a audit. |


## Victory Cheer (`victory-cheer`)

Score: 95 / 100

Decision: keep-current

| severity | label | direction | frames | evidence |
| --- | --- | --- | --- | --- |
| polish | scale_drift | front | 1, 2, 3, 4, 5, 6, 7, 8 | Height ratio is 1.162 in front. |
| minor | scale_drift | front-three-quarter | 1, 2, 3, 4, 5, 6, 7, 8 | Height ratio is 1.222 in front-three-quarter. |
| polish | scale_drift | back-three-quarter | 1, 2, 3, 4, 5, 6, 7, 8 | Height ratio is 1.179 in back-three-quarter. |
| polish | scale_drift | back | 1, 2, 3, 4, 5, 6, 7, 8 | Height ratio is 1.107 in back. |

## Interact / Pickup (`interact-pickup`)

Score: 98 / 100

Decision: keep-current

| severity | label | direction | frames | evidence |
| --- | --- | --- | --- | --- |
| none | - | - | - | No issue labels from phase-a audit. |


## Ranged Attack (`ranged-attack`)

Score: 87 / 100

Decision: needs-retake

| severity | label | direction | frames | evidence |
| --- | --- | --- | --- | --- |
| minor | edge_contact | front | 4 | Minimum padding below 16px in front; min=12px. |
| polish | edge_contact | front-three-quarter | 5, 6, 7, 8 | Padding below preferred 24px in front-three-quarter; min=22px. |
| polish | edge_contact | side | 5, 6, 7, 8 | Padding below preferred 24px in side; min=18px. |
| polish | anchor_drift | side | 1, 2, 3, 4, 5, 6, 7, 8 | Center drift is 70px in side. |
| minor | edge_contact | back-three-quarter | 5 | Minimum padding below 16px in back-three-quarter; min=15px. |
| polish | anchor_drift | back-three-quarter | 1, 2, 3, 4, 5, 6, 7, 8 | Center drift is 58px in back-three-quarter. |
| minor | edge_contact | back | 4 | Minimum padding below 16px in back; min=14px. |
| polish | action_structure_bad | all | 1, 2, 3, 4, 5, 6, 7, 8 | High-structure action should be first in the multi-run stability retake queue even when the current sample passes structural QA. |

## Skill Release (`skill-release`)

Score: 95 / 100

Decision: needs-retake

| severity | label | direction | frames | evidence |
| --- | --- | --- | --- | --- |
| polish | action_structure_bad | all | 1, 2, 3, 4, 5, 6, 7, 8 | High-structure action should be first in the multi-run stability retake queue even when the current sample passes structural QA. |

## Knockback (`knockback`)

Score: 94 / 100

Decision: needs-retake

| severity | label | direction | frames | evidence |
| --- | --- | --- | --- | --- |
| polish | edge_contact | front | 4, 5 | Padding below preferred 24px in front; min=18px. |
| polish | edge_contact | front-three-quarter | 3, 4, 5, 6 | Padding below preferred 24px in front-three-quarter; min=18px. |
| polish | edge_contact | side | 4 | Padding below preferred 24px in side; min=18px. |
| polish | edge_contact | back-three-quarter | 4 | Padding below preferred 24px in back-three-quarter; min=18px. |
| polish | action_structure_bad | all | 1, 2, 3, 4, 5, 6, 7, 8 | High-structure action should be first in the multi-run stability retake queue even when the current sample passes structural QA. |

## Item Use (`item-use`)

Score: 96 / 100

Decision: keep-current

| severity | label | direction | frames | evidence |
| --- | --- | --- | --- | --- |
| polish | edge_contact | front-three-quarter | 1, 2, 3, 4, 5, 6, 7, 8 | Padding below preferred 24px in front-three-quarter; min=22px. |
| polish | edge_contact | back | 1, 2, 3, 4, 5, 6, 7, 8 | Padding below preferred 24px in back; min=23px. |

## Talk / NPC Reaction (`talk`)

Score: 98 / 100

Decision: keep-current

| severity | label | direction | frames | evidence |
| --- | --- | --- | --- | --- |
| none | - | - | - | No issue labels from phase-a audit. |
