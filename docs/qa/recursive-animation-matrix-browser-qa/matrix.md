# Recursive Animation Matrix Browser QA - Test Matrix

Started: 2026-06-29 10:17 JST

Branch: `codex/recursive-animation-matrix-browser-qa`
Slot: `slot6`
Browser URL: `http://127.0.0.1:5226/`
API URL: `http://127.0.0.1:8826/`
Handoff root: `docs/qa/recursive-animation-matrix-browser-qa/runtime-handoff/`

## Method

- Use Image Cockpit through the real Codex in-app browser UI.
- Prepare each body image by copying an existing `public/prompt-examples/*.png` source into the QA outbox, then importing it via the UI `Recover Results` action while the Animation Generation tab is active.
- Choose the official animation preset from the UI `Choose Animation` modal.
- Click the UI `Generate Animation` button for every body x preset combination.
- Record job IDs, runner logs, outbox artifacts, browser screenshots, and result classification for every combination.
- Stop the matrix if a usage limit or similar external capacity block appears; record it as `external_block`, not as a quality failure.

## Planned Trials

| Trial | Body category | Source image | Preset category | Official preset | Purpose |
| --- | --- | --- | --- | --- | --- |
| T01 | Human male | `basic-young-male-hero.png` | idle | Idle Breathing | Baseline male + low motion. |
| T02 | Human male | `basic-young-male-hero.png` | run | Run Cycle | Baseline male + high leg motion. |
| T03 | Human female | `basic-young-female-hero.png` | walk | Walk Cycle | Baseline female + gait stability. |
| T04 | Weapon | `profession-young-male-sword-fighter.png` | attack | Basic Attack | Weapon/prop crossing and hit pose. |
| T05 | Chibi/small | `basic-small-village-child.png` | talk/react | Talk / NPC Reaction | Small body + subtle social loop. |
| T06 | Chibi/small | `basic-small-village-child.png` | damage/hurt | Hurt Reaction | Small body + recoil readability. |
| T07 | Robe/mantle | `basic-hooded-mysterious-figure.png` | cast | Spell Cast | Robe/hood + compact effect. |
| T08 | Robe/mantle | `basic-hooded-mysterious-figure.png` | death/down | Death / Downed | Robe/hood + downed pose containment. |
| T09 | Human female / weapon-like ninja | `profession-young-female-ninja.png` | attack | Basic Attack | Slim silhouette + fast attack. |
| T10 | Large hat/hair/complex outline | `profession-young-female-witch.png` | jump | Jump / Hop | Hat/hair top padding and vertical motion. |
