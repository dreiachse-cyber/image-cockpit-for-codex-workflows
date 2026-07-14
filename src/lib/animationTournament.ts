import type { AnimationQualityReportV2 } from "../types";

export type AnimationGenerationProfile = "fast" | "balanced" | "best";

export interface AnimationGenerationProfileDefinition {
  id: AnimationGenerationProfile;
  label: string;
  initialCandidates: number;
  maximumCandidates: number;
  qualityPriority: "speed" | "balanced" | "quality";
  description: string;
}

export interface AnimationTournamentEvaluationSummary {
  ready: boolean;
  score: number;
  warningCount: number;
  animationQuality?: AnimationQualityReportV2;
  error?: string;
}

export interface AdaptiveCandidateDecision {
  startAdditionalCandidate: boolean;
  reason: string;
}

export const ANIMATION_GENERATION_PROFILES: Record<AnimationGenerationProfile, AnimationGenerationProfileDefinition> = {
  fast: {
    id: "fast",
    label: "Fast",
    initialCandidates: 1,
    maximumCandidates: 1,
    qualityPriority: "speed",
    description: "1 candidate. Prefer time and lower usage; retry or Repair manually on failure."
  },
  balanced: {
    id: "balanced",
    label: "Balanced",
    initialCandidates: 2,
    maximumCandidates: 3,
    qualityPriority: "balanced",
    description: "Start 2 candidates and add candidate C only when quality is uncertain."
  },
  best: {
    id: "best",
    label: "Best",
    initialCandidates: 3,
    maximumCandidates: 3,
    qualityPriority: "quality",
    description: "Run and compare all 3 candidates before choosing the winner."
  }
};

const BALANCED_MIN_IDENTITY_SCORE = 82;
const BALANCED_CLEAR_SCORE_GAP = 8;
const BALANCED_LOW_SCORE = 76;

export function animationGenerationProfileDefinition(profile: AnimationGenerationProfile) {
  return ANIMATION_GENERATION_PROFILES[profile];
}

export function shouldStartBalancedAdditionalCandidate(
  evaluations: readonly AnimationTournamentEvaluationSummary[]
): AdaptiveCandidateDecision {
  if (evaluations.length < 2) {
    return { startAdditionalCandidate: false, reason: "waiting for both initial candidates" };
  }

  const initial = evaluations.slice(0, 2);
  const failed = initial.filter((evaluation) => !evaluation.ready);
  if (failed.length > 0) {
    return {
      startAdditionalCandidate: true,
      reason: failed.length === 2 ? "both initial candidates failed" : "one initial candidate failed"
    };
  }

  if (initial.some((evaluation) => evaluation.warningCount > 0 || evaluation.animationQuality?.shadowDecision.wouldBlock)) {
    return { startAdditionalCandidate: true, reason: "initial candidate has quality warnings" };
  }

  const identityScores = initial
    .map((evaluation) => evaluation.animationQuality?.identityScore)
    .filter((value): value is number => typeof value === "number");
  if (identityScores.some((score) => score < BALANCED_MIN_IDENTITY_SCORE)) {
    return { startAdditionalCandidate: true, reason: "identity score is below the balanced threshold" };
  }

  const scores = initial.map((evaluation) => evaluation.score).sort((left, right) => right - left);
  if (scores.every((score) => score < BALANCED_LOW_SCORE)) {
    return { startAdditionalCandidate: true, reason: "both initial candidates have low scores" };
  }
  if (Math.abs(scores[0] - scores[1]) < BALANCED_CLEAR_SCORE_GAP) {
    return { startAdditionalCandidate: true, reason: "initial candidates are too close to call" };
  }

  return { startAdditionalCandidate: false, reason: "two clean candidates have a clear score gap" };
}

export function tournamentNeedsAllStartedCandidates(
  profile: AnimationGenerationProfile,
  startedCandidateCount: number,
  terminalCandidateCount: number
) {
  return profile === "best" && startedCandidateCount > terminalCandidateCount;
}

export function verifyUntargetedDirectionHashes(
  before: Readonly<Record<string, string>>,
  after: Readonly<Record<string, string>>,
  repairedDirections: readonly string[]
) {
  const repaired = new Set(repairedDirections);
  const changed = Object.keys(before).filter((direction) => !repaired.has(direction) && before[direction] !== after[direction]);
  return { ok: changed.length === 0, changedDirections: changed };
}
