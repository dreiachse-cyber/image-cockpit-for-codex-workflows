import { describe, expect, it } from "vitest";
import type { AnimationQualityReportV2 } from "../types";
import {
  animationReviewDimensionScores,
  animationReviewQcMatrix,
  buildAnimationCalibrationExport,
  normalizeAnimationHumanReview,
  upsertAnimationHumanReviewDecision
} from "./animationReview";

const report: AnimationQualityReportV2 = {
  metricVersion: "image-cockpit.animation-quality.v2",
  policyVersion: "shadow-v1",
  recordedAt: "2026-07-15T00:00:00.000Z",
  action: "walk",
  actionProfile: "grounded-strict",
  expectedPhases: ["contact", "passing"],
  loopExpected: true,
  rawMetrics: {
    frameCount: 2,
    directionCount: 1,
    directions: [{ direction: "front", frameCount: 2, centerDriftPx: 1, footlineDriftPx: 6, widthVariation: 0.1, heightVariation: 0.05, groundedFrameRatio: 1, averageMotion: 0.4, maxMotion: 0.6, loopSeam: 0.2 }],
    averageCenterDriftPx: 1,
    averageFootlineDriftPx: 6,
    averageWidthVariation: 0.1,
    averageHeightVariation: 0.05,
    averageGroundedFrameRatio: 1,
    averageMotion: 0.4,
    averageLoopSeam: 0.2
  },
  normalizedMetrics: {
    frameCount: 2,
    directionCount: 1,
    directions: [{ direction: "front", frameCount: 2, centerDriftPx: 0.5, footlineDriftPx: 4, widthVariation: 0.05, heightVariation: 0.04, groundedFrameRatio: 1, averageMotion: 0.45, maxMotion: 0.7, loopSeam: 0.1 }],
    averageCenterDriftPx: 0.5,
    averageFootlineDriftPx: 4,
    averageWidthVariation: 0.05,
    averageHeightVariation: 0.04,
    averageGroundedFrameRatio: 1,
    averageMotion: 0.45,
    averageLoopSeam: 0.1
  },
  normalizationCorrection: {
    frames: [{ direction: "front", frameIndex: 0, scale: 1, translateX: 0, translateY: 1, rawBounds: { minX: 0, minY: 1, maxX: 16, maxY: 16 }, normalizedBounds: { minX: 1, minY: 1, maxX: 15, maxY: 15 } }],
    adjustedFrameRatio: 0.5,
    averageScaleDelta: 0.01,
    maxScaleDelta: 0.02,
    averageTranslationPx: 1,
    maxTranslationPx: 2
  },
  identityScore: 91,
  paletteScore: 87,
  silhouetteScore: 77,
  footlineScore: 52,
  loopSeamScore: 81,
  phaseScore: 70,
  motionScore: 83,
  dimensionWarnings: ["footline"],
  shadowDecision: { mode: "shadow", wouldBlock: true, reasons: ["footline"] },
  hardGateUnchanged: true
};

describe("animation review cockpit model", () => {
  it("exposes eight inspectable quality dimensions", () => {
    const scores = animationReviewDimensionScores(report);
    expect(scores).toHaveLength(8);
    expect(scores.find((entry) => entry.id === "footline")?.status).toBe("fail");
    expect(scores.find((entry) => entry.id === "correction")?.score).toBeTypeOf("number");
  });

  it("creates non-color QC labels for every direction and frame", () => {
    const cells = animationReviewQcMatrix(report, ["front", "left"], 2, "foot-drift");
    expect(cells).toHaveLength(4);
    expect(cells[0].label).toContain("front frame 1");
    expect(cells[0].status).toBe("warning");
  });

  it("normalizes and updates persistent manual decisions", () => {
    const normalized = normalizeAnimationHumanReview({
      updatedAt: "now",
      decisions: [{ jobId: " job-a ", decision: "reject", reasonTags: ["loop-seam", "loop-seam"], note: " note " }]
    });
    const updated = upsertAnimationHumanReviewDecision(normalized, { jobId: "job-b", decision: "winner", reasonTags: [], note: "best" }, "later");
    expect(normalized.decisions[0].reasonTags).toEqual(["loop-seam"]);
    expect(updated.manualWinnerJobId).toBe("job-b");
    expect(updated.decisions).toHaveLength(2);
  });

  it("exports model scores with calibration metadata", () => {
    const exported = buildAnimationCalibrationExport({
      tournamentId: "tournament-1",
      sourceFingerprint: "sha256:source",
      review: { updatedAt: "now", decisions: [] },
      reports: { "job-a": report }
    });
    expect(exported.schema).toBe("image-cockpit.animation-review-calibration.v1");
    expect(exported.candidates[0].dimensions).toHaveLength(8);
  });
});
