import type { AnimationQualityReportV2 } from "../types";
import { evaluateBestFirstQualifiedCandidate } from "./animationTournamentGate";
export {
  BEST_FIRST_QUALIFIED_MIN_IDENTITY_SCORE,
  BEST_FIRST_QUALIFIED_MIN_SCORE,
  evaluateBestFirstQualifiedCandidate
} from "./animationTournamentGate";
export type {
  BestFirstQualifiedCandidateSummary,
  BestFirstQualifiedDecision
} from "./animationTournamentGate";

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

export interface RankedAnimationTournamentEvaluation extends AnimationTournamentEvaluationSummary {
  candidateIndex: number;
}

export interface BestSmartRaceInput {
  terminalEvaluations: readonly RankedAnimationTournamentEvaluation[];
  remainingCandidateActive: boolean;
  activeCandidateCount?: number;
  expectedCandidateCount?: number;
}

export interface BestSmartRaceDecision {
  action: "wait" | "first-qualified" | "early-accept" | "full-compare";
  reason: string;
  winnerCandidateIndex?: number;
}

export interface AdaptiveCandidateDecision {
  startAdditionalCandidate: boolean;
  reason: string;
}

export interface AnimationInitialCandidateAdmissionInput {
  initialCandidateCount: number;
  activeRunnerCount: number;
  reservedRunnerCount?: number;
  maxActiveRunnerCount?: number;
}

export interface AnimationInitialCandidateAdmissionPlan {
  allowed: boolean;
  requiredSlots: number;
  occupiedSlots: number;
  availableSlots: number;
  candidateIndices: number[];
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
    description: "Start 3 candidates; accept the first strict-gate pass, otherwise use Smart Race after 2 or compare all 3."
  }
};

const BALANCED_MIN_IDENTITY_SCORE = 82;
const BALANCED_CLEAR_SCORE_GAP = 8;
const BALANCED_LOW_SCORE = 76;
const BEST_SMART_RACE_MIN_SCORE = 3000;
const BEST_SMART_RACE_MIN_SCORE_GAP = 50;
const BEST_SMART_RACE_MIN_IDENTITY_SCORE = 82;
const BEST_SMART_RACE_CANDIDATE_COUNT = 3;

export function animationGenerationProfileDefinition(profile: AnimationGenerationProfile) {
  return ANIMATION_GENERATION_PROFILES[profile];
}

export function planAnimationInitialCandidateAdmission(
  input: AnimationInitialCandidateAdmissionInput
): AnimationInitialCandidateAdmissionPlan {
  const maxActiveRunnerCount = Math.max(1, Math.floor(input.maxActiveRunnerCount ?? 3));
  const requiredSlots = Math.min(maxActiveRunnerCount, Math.max(1, Math.floor(input.initialCandidateCount)));
  const occupiedSlots = Math.min(
    maxActiveRunnerCount,
    Math.max(0, Math.floor(input.activeRunnerCount)) + Math.max(0, Math.floor(input.reservedRunnerCount ?? 0))
  );
  const availableSlots = Math.max(0, maxActiveRunnerCount - occupiedSlots);
  const allowed = occupiedSlots === 0 && requiredSlots <= availableSlots;
  return {
    allowed,
    requiredSlots,
    occupiedSlots,
    availableSlots,
    candidateIndices: allowed ? Array.from({ length: requiredSlots }, (_, index) => index) : []
  };
}

export function rankAnimationTournamentEvaluations<T extends RankedAnimationTournamentEvaluation>(
  evaluations: readonly T[]
) {
  return evaluations.slice().sort((left, right) => {
    const scoreOrder = right.score - left.score;
    if (scoreOrder !== 0) return scoreOrder;

    const warningOrder = left.warningCount - right.warningCount;
    if (warningOrder !== 0) return warningOrder;

    const leftIdentity = left.animationQuality?.identityScore ?? Number.NEGATIVE_INFINITY;
    const rightIdentity = right.animationQuality?.identityScore ?? Number.NEGATIVE_INFINITY;
    const identityOrder = rightIdentity - leftIdentity;
    if (identityOrder !== 0) return identityOrder;

    return left.candidateIndex - right.candidateIndex;
  });
}

export function decideBestSmartRace(input: BestSmartRaceInput): BestSmartRaceDecision {
  const expectedCandidateCount = input.expectedCandidateCount ?? BEST_SMART_RACE_CANDIDATE_COUNT;
  if (input.terminalEvaluations.length >= expectedCandidateCount) {
    return { action: "full-compare", reason: "all Best candidates are terminal" };
  }

  const expectedActiveCandidateCount = Math.max(0, expectedCandidateCount - input.terminalEvaluations.length);
  const activeCandidateCount = input.activeCandidateCount ??
    (input.remainingCandidateActive ? expectedActiveCandidateCount : 0);

  if (input.terminalEvaluations.length === 1) {
    if (activeCandidateCount !== expectedActiveCandidateCount) {
      return { action: "wait", reason: "not every remaining Best candidate is still active" };
    }
    const candidate = input.terminalEvaluations[0];
    const soloDecision = evaluateBestFirstQualifiedCandidate({
      ready: candidate.ready,
      score: candidate.score,
      warningCount: candidate.warningCount,
      identityScore: candidate.animationQuality?.identityScore,
      shadowWouldBlock: candidate.animationQuality?.shadowDecision.wouldBlock
    });
    if (!soloDecision.qualified) {
      return { action: "wait", reason: soloDecision.reason };
    }
    return {
      action: "first-qualified",
      reason: soloDecision.reason,
      winnerCandidateIndex: candidate.candidateIndex
    };
  }

  if (input.terminalEvaluations.length < 2) {
    return { action: "wait", reason: "waiting for the first terminal Best candidate" };
  }

  if (!input.remainingCandidateActive || activeCandidateCount !== expectedActiveCandidateCount) {
    return { action: "wait", reason: "the remaining Best candidate is not active" };
  }

  const firstTwo = input.terminalEvaluations.slice(0, 2);
  if (firstTwo.some((evaluation) => !evaluation.ready)) {
    return { action: "wait", reason: "a terminal Best candidate failed" };
  }

  const ranked = rankAnimationTournamentEvaluations(firstTwo);
  const leader = ranked[0];
  const runnerUp = ranked[1];
  if (!leader || !runnerUp) {
    return { action: "wait", reason: "waiting for two comparable Best candidates" };
  }

  if (leader.score < BEST_SMART_RACE_MIN_SCORE) {
    return { action: "wait", reason: "leading Best candidate score is below the Smart Race threshold" };
  }

  if (leader.score - runnerUp.score < BEST_SMART_RACE_MIN_SCORE_GAP) {
    return { action: "wait", reason: "Best candidates are too close for Smart Race" };
  }

  if (
    typeof leader.animationQuality?.identityScore !== "number" ||
    leader.animationQuality.identityScore < BEST_SMART_RACE_MIN_IDENTITY_SCORE
  ) {
    return { action: "wait", reason: "leading Best candidate identity is below the Smart Race threshold" };
  }

  if (leader.animationQuality.shadowDecision.wouldBlock !== false) {
    return { action: "wait", reason: "leading Best candidate has a shadow quality block" };
  }

  return {
    action: "early-accept",
    reason: "two ready Best candidates have a clear Smart Race winner",
    winnerCandidateIndex: leader.candidateIndex
  };
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
