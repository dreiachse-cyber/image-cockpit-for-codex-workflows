export interface BestFirstQualifiedCandidateSummary {
  ready: boolean;
  score: number;
  warningCount: number;
  identityScore?: number;
  shadowWouldBlock?: boolean;
}
export interface BestFirstQualifiedDecision {
  qualified: boolean;
  reason: string;
}

export const BEST_FIRST_QUALIFIED_MIN_SCORE = 3300;
export const BEST_FIRST_QUALIFIED_MIN_IDENTITY_SCORE = 85;

export function evaluateBestFirstQualifiedCandidate(
  candidate: BestFirstQualifiedCandidateSummary
): BestFirstQualifiedDecision {
  if (!candidate.ready) {
    return { qualified: false, reason: "first Best candidate did not pass every requested direction" };
  }
  if (candidate.warningCount !== 0) {
    return { qualified: false, reason: "first Best candidate has quality warnings" };
  }
  if (candidate.score < BEST_FIRST_QUALIFIED_MIN_SCORE) {
    return { qualified: false, reason: "first Best candidate score is below the strict solo threshold" };
  }
  if (
    typeof candidate.identityScore !== "number" ||
    candidate.identityScore < BEST_FIRST_QUALIFIED_MIN_IDENTITY_SCORE
  ) {
    return { qualified: false, reason: "first Best candidate identity is below the strict solo threshold" };
  }
  if (candidate.shadowWouldBlock !== false) {
    return { qualified: false, reason: "first Best candidate has a shadow quality block" };
  }
  return {
    qualified: true,
    reason: "first completed Best candidate passed the strict solo gate"
  };
}
