# run-cycle Challenger B v1 prompt

Challenger B is an experiment prompt for the walk/run focused tournament. It is not adopted into `src/App.tsx` in this branch.

## Hypothesis

Champion A already passes structure, but a run prompt can collapse into either a walking shuffle or a repeated open-leg pose. B makes the half-cycle key poses stricter: max extension, narrowing, crossover, lead-foot switch, and final max extension with a different leading foot.

## Base prompt

8-frame running half-cycle for ping-pong playback, clear forward lean, strong arm pump, long stride, one visible flight-like extended stride, mandatory feet-together crossover at mid-cycle, leading foot changes from right-front to left-front, stable body scale, full feet visible, stable center

## Additional contract lines

- Generate exactly 8 source frames as one half-cycle. The app will reverse these frames for playback, so do not draw a complete two-step cycle in the 8 source frames.
- Frame 1: maximum extension with right foot far forward and left foot far back, strong forward lean, opposite arm drive.
- Frame 2: stride narrows; both feet travel toward the body center while the body rises slightly.
- Frame 3: feet close under the hips, knees bent, one foot just passing the other; this is the first mandatory crossover frame.
- Frame 4: tight crossover under the torso with the left foot visibly starting to pass in front; legs must not stay wide open.
- Frame 5: left foot has taken the lead and the legs start separating again; this must not duplicate frame 3 or frame 4.
- Frame 6: left foot reaches forward, right foot pushes back, arms switch clearly.
- Frame 7: maximum extension or flight-like stride with left foot forward and right foot back; a small air gap is acceptable for running.
- Frame 8: clean endpoint with left foot fully forward and right foot fully back, similar energy to frame 1 but opposite lead, bridging cleanly through reversed playback.
- In front and back rows, show the lead-foot switch with shoe depth, knee overlap, and arm pump so the run does not read as a walk.
- In side and diagonal rows, frames 3 and 4 must visibly close the legs under the hips before the opposite stride opens.
- Keep the character centered in each cell; do not translate the whole body across the cell to fake speed.

## Negative cues

Avoid walking shuffle, skipped crossover, only open-leg frames, same leg leading through all frames, foot skating, duplicated frame 1/frame 8, hidden shoes, excessive crop, and body scale drift.
