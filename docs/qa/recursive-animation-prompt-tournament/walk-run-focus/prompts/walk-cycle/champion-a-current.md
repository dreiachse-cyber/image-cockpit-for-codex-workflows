# walk-cycle Champion A current prompt

Champion A is the current app prompt contract in `src/App.tsx` on main head `346121f`.

## Base prompt

8-frame walk cycle with alternating left and right foot contact, clear passing poses under the body, modest stride length, stable ground contact, opposite arm swing, subtle torso bob, full-body side-readable motion

## Existing contract lines

- Walking gait must be visible in every row, especially front three-quarter, side, and back three-quarter.
- Use the 8 generated source frames as one complete walk loop, not a ping-pong half-cycle.
- Frame plan: frame 1 left foot forward / right foot back contact; frame 2 body settles downward over the planted foot; frame 3 passing pose with both feet close under the hips and the rear foot lifting; frame 4 right foot reaches forward with toe-first contact about to happen; frame 5 right foot forward / left foot back contact; frame 6 body settles downward over the planted foot; frame 7 passing pose with both feet close under the hips and the rear foot lifting; frame 8 left foot reaches forward and reconnects cleanly into frame 1.
- For side and diagonal rows, the visible front foot must alternate left-right-left-right across the row; frame 1 and frame 5 must be clearly different contact silhouettes, not only mirrored clothing sway.
- Keep the walk slower and more grounded than running: no airborne frame, no long leap, no strong forward lean, and at least one foot must stay visually near the ground in every frame.
- Show knee bend and toe contact on contact frames, show the rear foot lifting on passing frames, and keep the feet on a stable ground line without skating.
- Arms swing opposite the legs, the torso has a subtle walk bob, and hair or clothing secondary motion must support the gait rather than replace visible leg movement.

## Current A notes

- Official mechanical QA has zero errors and zero warnings.
- Visual risk label for this tournament: `walk-front-depth-subtle`.
- Conservative rule: A stays champion unless Challenger B is clearly stronger across generated trials and browser QA.
