import { describe, expect, it } from "vitest";
import {
  animationGenerationProfileDefinition,
  shouldStartBalancedAdditionalCandidate,
  tournamentNeedsAllStartedCandidates,
  verifyUntargetedDirectionHashes
} from "./animationTournament";

function evaluation(overrides: Partial<Parameters<typeof shouldStartBalancedAdditionalCandidate>[0][number]> = {}) {
  return {
    ready: true,
    score: 90,
    warningCount: 0,
    ...overrides
  };
}

describe("animation tournament profiles", () => {
  it("starts Fast with one candidate and Best with all three", () => {
    expect(animationGenerationProfileDefinition("fast")).toMatchObject({ initialCandidates: 1, maximumCandidates: 1 });
    expect(animationGenerationProfileDefinition("balanced")).toMatchObject({ initialCandidates: 2, maximumCandidates: 3 });
    expect(animationGenerationProfileDefinition("best")).toMatchObject({ initialCandidates: 3, maximumCandidates: 3 });
  });

  it("keeps Balanced at two clean candidates when the score gap is clear", () => {
    expect(shouldStartBalancedAdditionalCandidate([evaluation({ score: 94 }), evaluation({ score: 82 })]))
      .toEqual({ startAdditionalCandidate: false, reason: "two clean candidates have a clear score gap" });
  });

  it.each([
    [[evaluation(), evaluation({ ready: false, error: "quality failed" })], "one initial candidate failed"],
    [[evaluation({ warningCount: 1 }), evaluation({ score: 78 })], "initial candidate has quality warnings"],
    [[evaluation({ score: 88 }), evaluation({ score: 84 })], "initial candidates are too close to call"]
  ])("adds candidate C for an uncertain Balanced result", (evaluations, reason) => {
    expect(shouldStartBalancedAdditionalCandidate(evaluations)).toEqual({ startAdditionalCandidate: true, reason });
  });

  it("makes Best wait for every started candidate", () => {
    expect(tournamentNeedsAllStartedCandidates("best", 3, 2)).toBe(true);
    expect(tournamentNeedsAllStartedCandidates("balanced", 3, 2)).toBe(false);
    expect(tournamentNeedsAllStartedCandidates("best", 3, 3)).toBe(false);
  });

  it("rejects a direction repair that changes an accepted untargeted direction", () => {
    expect(verifyUntargetedDirectionHashes(
      { front: "a", side: "b", back: "c" },
      { front: "a", side: "new", back: "changed" },
      ["side"]
    )).toEqual({ ok: false, changedDirections: ["back"] });
  });
});
