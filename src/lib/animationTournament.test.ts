import { describe, expect, it } from "vitest";
import {
  animationGenerationProfileDefinition,
  BEST_FIRST_QUALIFIED_MIN_IDENTITY_SCORE,
  BEST_FIRST_QUALIFIED_MIN_SCORE,
  decideBestSmartRace,
  evaluateBestFirstQualifiedCandidate,
  planAnimationInitialCandidateAdmission,
  rankAnimationTournamentEvaluations,
  shouldStartBalancedAdditionalCandidate,
  tournamentNeedsAllStartedCandidates,
  verifyUntargetedDirectionHashes
} from "./animationTournament";
import type { AnimationQualityReportV2 } from "../types";

function evaluation(overrides: Partial<Parameters<typeof shouldStartBalancedAdditionalCandidate>[0][number]> = {}) {
  return {
    ready: true,
    score: 90,
    warningCount: 0,
    ...overrides
  };
}

function quality(identityScore = 83, wouldBlock = false) {
  return {
    identityScore,
    shadowDecision: { wouldBlock }
  } as AnimationQualityReportV2;
}

function rankedEvaluation(
  candidateIndex: number,
  overrides: Partial<Parameters<typeof rankAnimationTournamentEvaluations>[0][number]> = {}
) {
  return {
    candidateIndex,
    ready: true,
    score: 3200,
    warningCount: 0,
    animationQuality: quality(),
    ...overrides
  };
}

describe("animation tournament profiles", () => {
  it("starts Fast with one candidate and Best with all three", () => {
    expect(animationGenerationProfileDefinition("fast")).toMatchObject({ initialCandidates: 1, maximumCandidates: 1 });
    expect(animationGenerationProfileDefinition("balanced")).toMatchObject({ initialCandidates: 2, maximumCandidates: 3 });
    expect(animationGenerationProfileDefinition("best")).toMatchObject({ initialCandidates: 3, maximumCandidates: 3 });
  });

  it("admits an initial candidate wave only while the runner pool is completely idle", () => {
    expect(planAnimationInitialCandidateAdmission({
      initialCandidateCount: 3,
      activeRunnerCount: 0
    })).toEqual({
      allowed: true,
      requiredSlots: 3,
      occupiedSlots: 0,
      availableSlots: 3,
      candidateIndices: [0, 1, 2]
    });

    for (const activeRunnerCount of [1, 2, 3]) {
      expect(planAnimationInitialCandidateAdmission({
        initialCandidateCount: 3,
        activeRunnerCount
      })).toMatchObject({
        allowed: false,
        requiredSlots: 3,
        occupiedSlots: activeRunnerCount,
        availableSlots: 3 - activeRunnerCount,
        candidateIndices: []
      });
    }
  });

  it("treats a pending local reservation as occupied and keeps smaller profile waves exclusive", () => {
    expect(planAnimationInitialCandidateAdmission({
      initialCandidateCount: 3,
      activeRunnerCount: 0,
      reservedRunnerCount: 1
    }).allowed).toBe(false);
    expect(planAnimationInitialCandidateAdmission({
      initialCandidateCount: 2,
      activeRunnerCount: 1
    }).candidateIndices).toEqual([]);
    expect(planAnimationInitialCandidateAdmission({
      initialCandidateCount: 1,
      activeRunnerCount: 0
    }).candidateIndices).toEqual([0]);
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

  it("accepts the first completed Best candidate only through the strict solo gate", () => {
    expect(decideBestSmartRace({
      terminalEvaluations: [
        rankedEvaluation(1, {
          score: BEST_FIRST_QUALIFIED_MIN_SCORE,
          warningCount: 0,
          animationQuality: quality(BEST_FIRST_QUALIFIED_MIN_IDENTITY_SCORE, false)
        })
      ],
      remainingCandidateActive: true,
      activeCandidateCount: 2
    })).toEqual({
      action: "first-qualified",
      reason: "first completed Best candidate passed the strict solo gate",
      winnerCandidateIndex: 1
    });
  });

  it.each([
    {
      name: "not every requested direction passed",
      evaluation: rankedEvaluation(0, { ready: false })
    },
    {
      name: "a warning remains",
      evaluation: rankedEvaluation(0, { score: 3400, warningCount: 1, animationQuality: quality(90, false) })
    },
    {
      name: "the score is below the strict threshold",
      evaluation: rankedEvaluation(0, { score: BEST_FIRST_QUALIFIED_MIN_SCORE - 1, animationQuality: quality(90, false) })
    },
    {
      name: "identity is below the strict threshold",
      evaluation: rankedEvaluation(0, {
        score: 3400,
        animationQuality: quality(BEST_FIRST_QUALIFIED_MIN_IDENTITY_SCORE - 0.01, false)
      })
    },
    {
      name: "a shadow block remains",
      evaluation: rankedEvaluation(0, { score: 3400, animationQuality: quality(90, true) })
    }
  ])("waits for the second candidate when $name", ({ evaluation }) => {
    expect(decideBestSmartRace({
      terminalEvaluations: [evaluation],
      remainingCandidateActive: true,
      activeCandidateCount: 2
    }).action).toBe("wait");
  });

  it("does not solo-accept when one of the two remaining candidates is no longer active", () => {
    expect(decideBestSmartRace({
      terminalEvaluations: [
        rankedEvaluation(0, { score: 3400, animationQuality: quality(90, false) })
      ],
      remainingCandidateActive: true,
      activeCandidateCount: 1
    })).toEqual({
      action: "wait",
      reason: "not every remaining Best candidate is still active"
    });
  });

  it("exposes the strict solo gate reasons independently of tournament timing", () => {
    expect(evaluateBestFirstQualifiedCandidate({
      ready: true,
      score: 3400,
      warningCount: 0,
      identityScore: 90,
      shadowWouldBlock: false
    })).toEqual({
      qualified: true,
      reason: "first completed Best candidate passed the strict solo gate"
    });
  });

  it("early-accepts a clear Best winner after two ready candidates finish", () => {
    expect(decideBestSmartRace({
      terminalEvaluations: [
        rankedEvaluation(2, { score: 3000, animationQuality: quality(82, false) }),
        rankedEvaluation(0, { score: 3050, animationQuality: quality(82, false) })
      ],
      remainingCandidateActive: true
    })).toEqual({
      action: "early-accept",
      reason: "two ready Best candidates have a clear Smart Race winner",
      winnerCandidateIndex: 0
    });
  });

  it("reproduces the measured C-over-B Smart Race decision at an exact 50-point gap", () => {
    expect(decideBestSmartRace({
      terminalEvaluations: [
        rankedEvaluation(1, {
          score: 3275,
          warningCount: 5,
          animationQuality: quality(82.04, true)
        }),
        rankedEvaluation(2, {
          score: 3325,
          warningCount: 3,
          animationQuality: quality(83.96, false)
        })
      ],
      remainingCandidateActive: true
    })).toMatchObject({
      action: "early-accept",
      winnerCandidateIndex: 2
    });
  });

  it.each([
    {
      name: "only one candidate is terminal",
      terminalEvaluations: [rankedEvaluation(0, { score: 3050 })],
      remainingCandidateActive: true
    },
    {
      name: "the third candidate is not active",
      terminalEvaluations: [rankedEvaluation(0, { score: 3050 }), rankedEvaluation(1, { score: 3000 })],
      remainingCandidateActive: false
    },
    {
      name: "one of the first two candidates failed",
      terminalEvaluations: [
        rankedEvaluation(0, { score: 3050 }),
        rankedEvaluation(1, { ready: false, score: 0, error: "generation failed" })
      ],
      remainingCandidateActive: true
    },
    {
      name: "the leader score is below 3000",
      terminalEvaluations: [rankedEvaluation(0, { score: 2999 }), rankedEvaluation(1, { score: 2900 })],
      remainingCandidateActive: true
    },
    {
      name: "the score gap is below 50",
      terminalEvaluations: [rankedEvaluation(0, { score: 3050 }), rankedEvaluation(1, { score: 3001 })],
      remainingCandidateActive: true
    },
    {
      name: "the leader identity is below 82",
      terminalEvaluations: [
        rankedEvaluation(0, { score: 3050, animationQuality: quality(81, false) }),
        rankedEvaluation(1, { score: 3000 })
      ],
      remainingCandidateActive: true
    },
    {
      name: "the leader identity is unavailable",
      terminalEvaluations: [
        rankedEvaluation(0, { score: 3050, animationQuality: undefined }),
        rankedEvaluation(1, { score: 3000 })
      ],
      remainingCandidateActive: true
    },
    {
      name: "the leader has a shadow block",
      terminalEvaluations: [
        rankedEvaluation(0, { score: 3050, animationQuality: quality(90, true) }),
        rankedEvaluation(1, { score: 3000 })
      ],
      remainingCandidateActive: true
    }
  ])("waits when $name", ({ terminalEvaluations, remainingCandidateActive }) => {
    expect(decideBestSmartRace({ terminalEvaluations, remainingCandidateActive }).action).toBe("wait");
  });

  it("uses full comparison once all three Best candidates are terminal", () => {
    expect(decideBestSmartRace({
      terminalEvaluations: [
        rankedEvaluation(0, { score: 3300 }),
        rankedEvaluation(1, { ready: false, score: 0 }),
        rankedEvaluation(2, { score: 3200 })
      ],
      remainingCandidateActive: false
    })).toEqual({ action: "full-compare", reason: "all Best candidates are terminal" });
  });

  it("ranks deterministically by score, warnings, identity, then candidate index", () => {
    const evaluations = [
      rankedEvaluation(3, { score: 3200, warningCount: 2, animationQuality: quality(99) }),
      rankedEvaluation(2, { score: 3200, warningCount: 1, animationQuality: quality(80) }),
      rankedEvaluation(1, { score: 3200, warningCount: 1, animationQuality: quality(90) }),
      rankedEvaluation(0, { score: 3200, warningCount: 1, animationQuality: quality(90) }),
      rankedEvaluation(4, { score: 3300, warningCount: 99, animationQuality: quality(1) })
    ];

    expect(rankAnimationTournamentEvaluations(evaluations).map((candidate) => candidate.candidateIndex))
      .toEqual([4, 0, 1, 2, 3]);
    expect(evaluations.map((candidate) => candidate.candidateIndex)).toEqual([3, 2, 1, 0, 4]);
  });

  it("rejects a direction repair that changes an accepted untargeted direction", () => {
    expect(verifyUntargetedDirectionHashes(
      { front: "a", side: "b", back: "c" },
      { front: "a", side: "new", back: "changed" },
      ["side"]
    )).toEqual({ ok: false, changedDirections: ["back"] });
  });
});
