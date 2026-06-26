# run-cycle Champion A current prompt

Champion A is the current app prompt contract in `src/App.tsx` on main head `346121f`.

## Base prompt

run cycle half-cycle with the left foot traveling from back to front and the right foot traveling from front to back, legs far apart then approaching, feet-together passing moment, legs separating into the opposite stride, forward torso lean, strong opposite arm drive, full-body side-readable motion

## Existing contract lines

- Running gait must be visible in every row, especially front three-quarter, side, and back three-quarter.
- Use the 8 generated source frames as one half-cycle, not a complete two-step loop: the left foot must travel from back to front while the right foot travels from front to back.
- The app will append the same 8 source frames in reverse order during GIF/WebP playback to create a 16-frame ping-pong run cycle, so do not squeeze both left-front and right-front halves into the 8 source frames.
- The 8 source frames must express five clear gait phases: legs far apart, legs approaching, feet together under the body, legs starting to separate with the opposite foot taking the lead, and legs far apart again in the opposite stride.
- Source frame plan: frame 1 left foot far back / right foot far front extended stride; frame 2 the stride narrows and both feet move toward the body center; frame 3 both feet are close together directly under the hips, knees bent, one foot just passing the other; frame 4 the feet overlap or cross at the body center with the left foot beginning to pass in front; frame 5 the legs start separating again and the left foot is clearly taking the lead; frame 6 left foot reaches forward while the right foot pushes back; frame 7 left foot extended forward / right foot back airborne stride; frame 8 clean endpoint with left foot fully forward and right foot fully back.
- For side and diagonal rows, frames 3 and 4 are mandatory feet-together / crossover passing frames. The reversed playback will create the matching opposite-foot passing frames. Do not skip the feet-together moment, do not hide it behind clothing, and do not replace it with only open-leg airborne stride poses.
- The leading foot must visibly change from right-front at frame 1 to left-front at frame 8; do not keep the same leg in front, do not make a walking shuffle, and do not make a sliding pose cycle.
- Add a clear forward torso lean, stronger opposite arm drive than walking, longer stride length, and a small vertical bounce while keeping the character centered inside each cell.

## Current A notes

- Official mechanical QA has zero errors and zero warnings.
- Visual risk label for this tournament: `run-halfcycle-crossover-risk`.
- Conservative rule: A stays champion unless Challenger B is clearly stronger across generated trials and browser QA.
