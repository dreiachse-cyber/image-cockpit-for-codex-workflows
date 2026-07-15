import { describe, expect, it } from "vitest";
import {
  decideMotionPilotReview,
  motionPilotMeetsAdoptionGate,
  summarizeAnimationBenchmark,
  theoreticalMotionPilotDirectionOutputs,
  theoreticalStandardDirectionOutputs,
  type AnimationBenchmarkTrial
} from "./motionPilot";

const trial = (overrides: Partial<AnimationBenchmarkTrial> = {}): AnimationBenchmarkTrial => ({
  id: "trial",
  regime: "pilot",
  profile: "best",
  directionCount: 5,
  candidateJobs: 4,
  directionOutputs: 7,
  elapsedMs: 1000,
  retryCount: 0,
  repairCount: 0,
  falseSuccess: false,
  stuck: false,
  qualityRank: "gold",
  dimensionScore: 100,
  identityScore: 90,
  directionConsistency: 90,
  motionReadability: 90,
  contactScore: 90,
  humanDecisionMs: 400,
  manualActions: 3,
  usableFinal: true,
  ...overrides
});

describe("Motion Pilot Tournament", () => {
  it("reduces the theoretical 5-direction and 3-direction output counts", () => {
    expect(theoreticalStandardDirectionOutputs(5)).toBe(15);
    expect(theoreticalMotionPilotDirectionOutputs(5)).toBe(7);
    expect(theoreticalStandardDirectionOutputs(3)).toBe(9);
    expect(theoreticalMotionPilotDirectionOutputs(3)).toBe(5);
  });

  it("keeps a clean score leader behind the human review gate", () => {
    expect(decideMotionPilotReview([
      { jobId: "a", ready: true, score: 94, warningCount: 0, identityScore: 91 },
      { jobId: "b", ready: true, score: 84, warningCount: 2, identityScore: 90 },
      { jobId: "c", ready: true, score: 80, warningCount: 1, identityScore: 79 }
    ])).toEqual({ action: "review", reason: "clean pilot leader is ready for human review", leadingJobId: "a" });
  });

  it.each([
    [[{ jobId: "a", ready: true, score: 90, warningCount: 1 }, { jobId: "b", ready: true, score: 80, warningCount: 0 }, { jobId: "c", ready: false, score: 0, warningCount: 0 }], "leading pilot candidate has quality warnings"],
    [[{ jobId: "a", ready: true, score: 90, warningCount: 0 }, { jobId: "b", ready: true, score: 87, warningCount: 0 }, { jobId: "c", ready: true, score: 86, warningCount: 0 }], "pilot candidates are too close to call"]
  ])("falls back when pilot evidence is unsafe", (evaluations, reason) => {
    expect(decideMotionPilotReview(evaluations)).toMatchObject({ action: "fallback", reason });
  });

  it("summarizes trial-level evidence and keeps adoption conservative", () => {
    const pilot = summarizeAnimationBenchmark([trial(), trial({ elapsedMs: 1200 })]);
    const standard = summarizeAnimationBenchmark([
      trial({ regime: "standard", candidateJobs: 3, directionOutputs: 15, elapsedMs: 1400, identityScore: 89 }),
      trial({ regime: "standard", candidateJobs: 3, directionOutputs: 15, elapsedMs: 1500, identityScore: 89 })
    ]);
    expect(pilot).toMatchObject({ trials: 2, usableFinals: 2, falseSuccesses: 0, stuck: 0, averageDirectionOutputs: 7 });
    expect(motionPilotMeetsAdoptionGate(pilot, standard)).toEqual({
      adopt: true,
      outputsReduced: true,
      timeAcceptable: true,
      identityPreserved: true,
      directionConsistencyPreserved: true,
      terminalSafety: true
    });
    expect(motionPilotMeetsAdoptionGate(summarizeAnimationBenchmark([trial({ falseSuccess: true })]), standard).adopt).toBe(false);
    expect(motionPilotMeetsAdoptionGate(summarizeAnimationBenchmark([trial({ directionConsistency: 70 })]), standard).adopt).toBe(false);
  });
});
