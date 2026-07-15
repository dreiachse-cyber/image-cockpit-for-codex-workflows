import type { AnimationGenerationProfile } from "./animationTournament";

export interface MotionPilotEvaluation {
  jobId: string;
  ready: boolean;
  score: number;
  warningCount: number;
  identityScore?: number;
}

export interface MotionPilotAdoptionDecision {
  action: "review" | "fallback";
  reason: string;
  leadingJobId?: string;
}

export interface AnimationBenchmarkTrial {
  id: string;
  regime: "baseline" | "standard" | "pilot" | "pilot-fallback";
  profile: AnimationGenerationProfile;
  directionCount: 3 | 5;
  candidateJobs: number;
  directionOutputs: number;
  elapsedMs: number;
  retryCount: number;
  repairCount: number;
  falseSuccess: boolean;
  stuck: boolean;
  qualityRank: "gold" | "silver" | "bronze" | "failed";
  dimensionScore: number;
  identityScore: number;
  directionConsistency: number;
  motionReadability: number;
  contactScore: number;
  humanDecisionMs: number;
  manualActions: number;
  usableFinal: boolean;
}

export interface AnimationBenchmarkSummary {
  trials: number;
  usableFinals: number;
  falseSuccesses: number;
  stuck: number;
  averageCandidateJobs: number;
  averageDirectionOutputs: number;
  averageElapsedMs: number;
  averageDimensionScore: number;
  averageIdentityScore: number;
  averageDirectionConsistency: number;
  averageMotionReadability: number;
  averageContactScore: number;
  averageHumanDecisionMs: number;
  averageManualActions: number;
}

const MIN_PILOT_IDENTITY = 82;
const MIN_PILOT_SCORE_GAP = 6;

export function theoreticalMotionPilotDirectionOutputs(directionCount: 3 | 5, pilotCandidateCount = 3) {
  return pilotCandidateCount + directionCount - 1;
}

export function theoreticalStandardDirectionOutputs(directionCount: 3 | 5, candidateCount = 3) {
  return directionCount * candidateCount;
}

export function decideMotionPilotReview(evaluations: readonly MotionPilotEvaluation[]): MotionPilotAdoptionDecision {
  if (evaluations.length < 3) return { action: "fallback", reason: "fewer than three pilot candidates reached review" };
  const usable = evaluations.filter((evaluation) => evaluation.ready);
  if (usable.length < 2) return { action: "fallback", reason: "fewer than two pilot candidates passed Quality Gate v2" };
  const ranked = usable.slice().sort((left, right) => right.score - left.score);
  if (ranked[0].warningCount > 0) return { action: "fallback", reason: "leading pilot candidate has quality warnings" };
  if (typeof ranked[0].identityScore === "number" && ranked[0].identityScore < MIN_PILOT_IDENTITY) {
    return { action: "fallback", reason: "leading pilot identity score is below threshold" };
  }
  if (ranked[0].score - ranked[1].score < MIN_PILOT_SCORE_GAP) return { action: "fallback", reason: "pilot candidates are too close to call" };
  return { action: "review", reason: "clean pilot leader is ready for human review", leadingJobId: ranked[0].jobId };
}

export function summarizeAnimationBenchmark(trials: readonly AnimationBenchmarkTrial[]): AnimationBenchmarkSummary {
  const average = (values: number[]) => values.length > 0 ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : 0;
  return {
    trials: trials.length,
    usableFinals: trials.filter((trial) => trial.usableFinal).length,
    falseSuccesses: trials.filter((trial) => trial.falseSuccess).length,
    stuck: trials.filter((trial) => trial.stuck).length,
    averageCandidateJobs: average(trials.map((trial) => trial.candidateJobs)),
    averageDirectionOutputs: average(trials.map((trial) => trial.directionOutputs)),
    averageElapsedMs: average(trials.map((trial) => trial.elapsedMs)),
    averageDimensionScore: average(trials.map((trial) => trial.dimensionScore)),
    averageIdentityScore: average(trials.map((trial) => trial.identityScore)),
    averageDirectionConsistency: average(trials.map((trial) => trial.directionConsistency)),
    averageMotionReadability: average(trials.map((trial) => trial.motionReadability)),
    averageContactScore: average(trials.map((trial) => trial.contactScore)),
    averageHumanDecisionMs: average(trials.map((trial) => trial.humanDecisionMs)),
    averageManualActions: average(trials.map((trial) => trial.manualActions))
  };
}

export function motionPilotMeetsAdoptionGate(pilot: AnimationBenchmarkSummary, standard: AnimationBenchmarkSummary) {
  const outputsReduced = pilot.averageDirectionOutputs < standard.averageDirectionOutputs;
  const timeAcceptable = pilot.averageElapsedMs <= standard.averageElapsedMs || pilot.averageMotionReadability > standard.averageMotionReadability;
  const identityPreserved = pilot.averageIdentityScore >= standard.averageIdentityScore;
  const directionConsistencyPreserved = pilot.averageDirectionConsistency >= standard.averageDirectionConsistency;
  const terminalSafety = pilot.falseSuccesses === 0 && pilot.stuck === 0;
  return {
    adopt: outputsReduced && timeAcceptable && identityPreserved && directionConsistencyPreserved && terminalSafety,
    outputsReduced,
    timeAcceptable,
    identityPreserved,
    directionConsistencyPreserved,
    terminalSafety
  };
}
