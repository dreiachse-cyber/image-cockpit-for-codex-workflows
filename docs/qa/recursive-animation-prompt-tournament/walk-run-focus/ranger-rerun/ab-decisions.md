# Ranger Same-Source A/B Decisions

## Prompt Change Summary

Challenger B differs from Champion A in four main ways:

- It pins exact frame roles instead of describing the gait mostly at a higher level.
- It requires stronger shoe/foot depth in front and back rows.
- It adds stricter planted-foot language for walking.
- It adds stricter crossover and lead-foot-switch language for running.

## walk-cycle

Decision: keep Champion A for now.

Evidence:

- A reads more like a grounded walk on the ranger source.
- B improves leg separation, but several frames read closer to a jog because stride length and limb spread are too strong.
- B's front and diagonal rows are more energetic, but the requested preset is a walk, not a run.

Next hypothesis:

- Walk B2 was generated from that hypothesis.
- B2 reduces the jog-like energy, but it also loses some visible gait energy.
- The next useful prompt should start from A and add only a very small shoe-depth cue.

## walk-cycle B2

Decision: do not adopt B2 as the official walk prompt.

Evidence:

- B2 is calmer than B v1 and no longer reads as strongly like a jog.
- B2's front and back rows can read close to idle or very subtle shuffling.
- A still has the best balance of walk energy and groundedness on this source.

Next hypothesis:

- Keep A as the champion.
- Try an A-plus-depth prompt only if the next round is needed.
- Avoid large frame-role changes for walk unless a new source shows a clear A failure.

## run-cycle

Decision: promote B v1 as the better run prompt hypothesis.

Evidence:

- B shows a clearer side-row run silhouette with stronger lean and wider stride.
- B keeps the runner centered while making motion more readable.
- A is valid, but the run energy is less distinct from a fast walk in comparison.

Next hypothesis:

- Run B v1 should get a 3-source Candidate gate before official adoption.
- Keep the strict crossover and lead-foot-switch wording.
- Watch front/back rows for over-compressed legs under cloak-heavy outfits.
