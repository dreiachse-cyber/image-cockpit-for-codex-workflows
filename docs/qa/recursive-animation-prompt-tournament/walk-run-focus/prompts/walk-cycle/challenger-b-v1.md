# walk-cycle Challenger B v1 prompt

Challenger B is an experiment prompt for the walk/run focused tournament. It is not adopted into `src/App.tsx` in this branch.

## Hypothesis

Champion A already passes structure, but front and back rows can still read as a mild shuffle because foot depth is subtle. B adds stronger foot-depth cues, mandatory contact silhouettes, and a stable planted-foot beat without making the walk look like a run.

## Base prompt

8-frame grounded walk cycle with visible left-right foot alternation, two distinct contact poses, two passing poses, heel-to-toe contact, knee bend, small hip shift, opposite arm swing, stable body scale, full feet visible, stable ground line, no airborne stride

## Additional contract lines

- Use the 8 generated source frames as one complete normal walk loop. Do not make a ping-pong half-cycle.
- Frame 1: left foot forward flat contact, right foot back toe contact, left arm back and right arm forward.
- Frame 2: body weight settles over the left planted foot; the left foot remains visually planted and does not slide.
- Frame 3: passing pose with both feet close under the hips, rear heel lifting, knees bent.
- Frame 4: right foot reaches forward with a small heel-first or toe-first contact shape; no airborne gap.
- Frame 5: right foot forward flat contact, left foot back toe contact, the silhouette must be clearly different from frame 1.
- Frame 6: body weight settles over the right planted foot; the right foot remains visually planted and does not slide.
- Frame 7: second passing pose with both feet close under the hips, rear heel lifting, knees bent.
- Frame 8: left foot reaches forward and bridges cleanly into frame 1 without duplicating frame 1 exactly.
- In front and back rows, show foot depth using visible shoe offset, one shoe slightly larger or lower for the forward foot, and the other shoe tucked behind. Do not hide both legs under the shorts.
- In side and diagonal rows, keep at least one sole or toe visually touching the same ground line in every frame. No flight frame.
- The torso bob is small and secondary; the gait must be readable from leg and foot shapes first.
- Keep stride length modest and slower than the run preset. No forward lean stronger than a casual walk.

## Negative cues

Avoid skating feet, mirrored clothing-only motion, hidden knees, tiny shuffling steps, airborne running poses, duplicated frame 1/frame 5 silhouettes, cropped shoes, and body scale drift.
