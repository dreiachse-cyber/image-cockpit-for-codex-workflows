import type {
  AnimationNormalizationCorrection,
  AnimationQualityDirectionMetrics,
  AnimationQualityReportV2
} from "../types";

export type AnimationReviewDecision = "winner" | "reject" | "hold";
export type AnimationReviewHeatMode =
  | "foot-drift"
  | "bbox"
  | "identity"
  | "loop-seam"
  | "static-copy"
  | "clipping";
export type AnimationReviewCellStatus = "pass" | "warning" | "fail";

export interface AnimationHumanReviewDecision {
  jobId: string;
  decision: AnimationReviewDecision;
  reasonTags: string[];
  note: string;
}

export interface AnimationHumanReview {
  updatedAt: string;
  manualWinnerJobId?: string;
  decisions: AnimationHumanReviewDecision[];
}

export interface AnimationReviewDimensionScore {
  id: "identity" | "palette" | "silhouette" | "footline" | "loop" | "phase" | "motion" | "correction";
  label: string;
  score: number | null;
  status: AnimationReviewCellStatus;
}

export interface AnimationReviewQcCell {
  direction: string;
  frameIndex: number;
  status: AnimationReviewCellStatus;
  value: number;
  label: string;
  correction?: AnimationNormalizationCorrection;
}

export const animationReviewReasonTags = [
  "identity-drift",
  "palette-drift",
  "silhouette-break",
  "footline-drift",
  "loop-seam",
  "phase-mismatch",
  "motion-weak",
  "over-correction",
  "clipping",
  "static-copy"
] as const;

const clampScore = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

export function animationReviewScoreStatus(score: number | null): AnimationReviewCellStatus {
  if (score === null) return "warning";
  if (score < 55) return "fail";
  if (score < 75) return "warning";
  return "pass";
}

export function animationReviewDimensionScores(report?: AnimationQualityReportV2): AnimationReviewDimensionScore[] {
  const adjustedRatio = report?.normalizationCorrection.adjustedFrameRatio ?? 0;
  const averageTranslation = report?.normalizationCorrection.averageTranslationPx ?? 0;
  const averageScaleDelta = report?.normalizationCorrection.averageScaleDelta ?? 0;
  const correctionScore = report
    ? clampScore(100 - adjustedRatio * 55 - averageTranslation * 2.5 - averageScaleDelta * 260)
    : null;
  const values: Array<[AnimationReviewDimensionScore["id"], string, number | null]> = [
    ["identity", "Identity", report?.identityScore ?? null],
    ["palette", "Palette", report?.paletteScore ?? null],
    ["silhouette", "Silhouette", report?.silhouetteScore ?? null],
    ["footline", report?.contactQaDimension ?? "Footline", report?.footlineScore ?? null],
    ["loop", "Loop seam", report?.loopSeamScore ?? null],
    ["phase", "Phase", report?.phaseScore ?? null],
    ["motion", "Motion", report?.motionScore ?? null],
    ["correction", "Correction", correctionScore]
  ];
  return values.map(([id, label, score]) => ({ id, label, score, status: animationReviewScoreStatus(score) }));
}

export function emptyAnimationHumanReview(updatedAt = new Date(0).toISOString()): AnimationHumanReview {
  return { updatedAt, decisions: [] };
}

export function normalizeAnimationHumanReview(value: unknown, updatedAt = new Date().toISOString()): AnimationHumanReview {
  if (!value || typeof value !== "object") return emptyAnimationHumanReview(updatedAt);
  const source = value as Partial<AnimationHumanReview>;
  const decisions = Array.isArray(source.decisions)
    ? source.decisions.flatMap((entry) => {
        if (!entry || typeof entry !== "object") return [];
        const item = entry as Partial<AnimationHumanReviewDecision>;
        if (typeof item.jobId !== "string" || !item.jobId.trim()) return [];
        const decision: AnimationReviewDecision = item.decision === "winner" || item.decision === "reject" ? item.decision : "hold";
        const reasonTags = Array.isArray(item.reasonTags)
          ? [...new Set(item.reasonTags.filter((tag): tag is string => typeof tag === "string" && tag.trim().length > 0).map((tag) => tag.trim().slice(0, 48)))].slice(0, 12)
          : [];
        return [{
          jobId: item.jobId.trim().slice(0, 160),
          decision,
          reasonTags,
          note: typeof item.note === "string" ? item.note.trim().slice(0, 1000) : ""
        }];
      })
    : [];
  const manualWinnerJobId = typeof source.manualWinnerJobId === "string" && source.manualWinnerJobId.trim()
    ? source.manualWinnerJobId.trim().slice(0, 160)
    : undefined;
  return {
    updatedAt: typeof source.updatedAt === "string" && source.updatedAt.trim() ? source.updatedAt : updatedAt,
    ...(manualWinnerJobId ? { manualWinnerJobId } : {}),
    decisions
  };
}

export function upsertAnimationHumanReviewDecision(
  review: AnimationHumanReview,
  decision: AnimationHumanReviewDecision,
  updatedAt = new Date().toISOString()
): AnimationHumanReview {
  const normalized = normalizeAnimationHumanReview({
    ...review,
    updatedAt,
    manualWinnerJobId: decision.decision === "winner" ? decision.jobId : review.manualWinnerJobId,
    decisions: [...review.decisions.filter((entry) => entry.jobId !== decision.jobId), decision]
  }, updatedAt);
  if (decision.decision !== "winner" && normalized.manualWinnerJobId === decision.jobId) {
    delete normalized.manualWinnerJobId;
  }
  return normalized;
}

function directionMetric(report: AnimationQualityReportV2 | undefined, direction: string): AnimationQualityDirectionMetrics | undefined {
  return report?.normalizedMetrics.directions.find((entry) => entry.direction === direction)
    ?? report?.rawMetrics.directions.find((entry) => entry.direction === direction);
}

function correctionFor(report: AnimationQualityReportV2 | undefined, direction: string, frameIndex: number) {
  return report?.normalizationCorrection.frames.find((entry) => entry.direction === direction && entry.frameIndex === frameIndex);
}

export function animationReviewHeatValue(
  report: AnimationQualityReportV2 | undefined,
  direction: string,
  frameIndex: number,
  mode: AnimationReviewHeatMode
): number {
  const metric = directionMetric(report, direction);
  const correction = correctionFor(report, direction, frameIndex);
  if (!report || !metric) return 0;
  switch (mode) {
    case "foot-drift": return Math.min(100, metric.footlineDriftPx * 12);
    case "bbox": return Math.min(100, (metric.widthVariation + metric.heightVariation) * 220);
    case "identity": return Math.max(0, 100 - report.identityScore);
    case "loop-seam": return metric.loopSeam === null ? 0 : Math.min(100, metric.loopSeam * 100);
    case "static-copy": return Math.max(0, 100 - metric.averageMotion * 100);
    case "clipping": {
      const bounds = correction?.normalizedBounds ?? correction?.rawBounds;
      if (!bounds) return 0;
      return bounds.minX <= 0 || bounds.minY <= 0 ? 85 : 0;
    }
  }
}

export function animationReviewQcMatrix(
  report: AnimationQualityReportV2 | undefined,
  directions: string[],
  frameCount: number,
  mode: AnimationReviewHeatMode
): AnimationReviewQcCell[] {
  return directions.flatMap((direction) => Array.from({ length: Math.max(1, frameCount) }, (_, frameIndex) => {
    const value = animationReviewHeatValue(report, direction, frameIndex, mode);
    const status: AnimationReviewCellStatus = value >= 70 ? "fail" : value >= 35 ? "warning" : "pass";
    return {
      direction,
      frameIndex,
      status,
      value: Math.round(value),
      label: `${direction} frame ${frameIndex + 1}: ${status}, ${Math.round(value)}`,
      correction: correctionFor(report, direction, frameIndex)
    };
  }));
}

export function animationReviewAutomaticReason(report?: AnimationQualityReportV2) {
  if (!report) return "Quality report is not available, so automatic adoption is suspended.";
  const strongest = animationReviewDimensionScores(report)
    .filter((entry) => entry.score !== null)
    .sort((left, right) => (right.score ?? 0) - (left.score ?? 0))[0];
  const warningText = report.dimensionWarnings.length > 0
    ? `${report.dimensionWarnings.length} quality warning(s) remain.`
    : "No dimension warnings remain.";
  return `${strongest?.label ?? "Quality"} is strongest at ${strongest?.score ?? 0}. ${warningText}`;
}

export function buildAnimationCalibrationExport(input: {
  tournamentId: string;
  sourceFingerprint: string;
  winnerJobId?: string;
  review: AnimationHumanReview;
  reports: Record<string, AnimationQualityReportV2 | undefined>;
}) {
  return {
    schema: "image-cockpit.animation-review-calibration.v1" as const,
    exportedAt: new Date().toISOString(),
    tournamentId: input.tournamentId,
    sourceFingerprint: input.sourceFingerprint,
    winnerJobId: input.winnerJobId ?? input.review.manualWinnerJobId ?? null,
    humanReview: normalizeAnimationHumanReview(input.review),
    candidates: Object.entries(input.reports).map(([jobId, report]) => ({
      jobId,
      dimensions: animationReviewDimensionScores(report),
      warnings: report?.dimensionWarnings ?? [],
      shadowWouldBlock: report?.shadowDecision.wouldBlock ?? null,
      shadowReasons: report?.shadowDecision.reasons ?? []
    }))
  };
}
