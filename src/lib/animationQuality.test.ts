import { describe, expect, it } from "vitest";
import type { AnimationNormalizationCorrection } from "../types";
import {
  animationActionExpectsLoop,
  animationActionExpectedPhases,
  animationActionQualityProfile,
  buildAnimationQualityReport
} from "./animationQuality";
import type { AnimationQualityFrameInput } from "./animationQuality";

describe("animation quality v2", () => {
  it("keeps raw defects visible when normalization masks them", () => {
    const raw = [40, 54, 46, 58].map((bottom, frameIndex) => makeRectFrame("front", frameIndex, 20, bottom - 23, 20, 24));
    const normalized = raw.map((_, frameIndex) => makeRectFrame("front", frameIndex, 22, 34, 20, 24));
    const report = buildAnimationQualityReport({
      action: "guard",
      rawFrames: raw,
      normalizedFrames: normalized,
      corrections: raw.map((frame, index) => correction(frame, normalized[index], 1, 0, 18)),
      recordedAt: "2026-07-15T00:00:00.000Z"
    });

    expect(report.rawMetrics.averageFootlineDriftPx).toBeGreaterThan(10);
    expect(report.normalizedMetrics.averageFootlineDriftPx).toBe(0);
    expect(report.dimensionWarnings).toContain("normalization masked raw footline drift");
    expect(report.shadowDecision.wouldBlock).toBe(true);
    expect(report.hardGateUnchanged).toBe(true);
  });

  it("measures loop seams only for actions that should loop", () => {
    const frames = [
      makeRectFrame("front", 0, 20, 32, 20, 24, [220, 60, 80]),
      makeRectFrame("front", 1, 21, 32, 20, 24, [220, 60, 80]),
      makeRectFrame("front", 2, 22, 32, 20, 24, [220, 60, 80]),
      makeRectFrame("front", 3, 20, 32, 20, 24, [20, 80, 240])
    ];
    const idle = buildAnimationQualityReport({ action: "idle", rawFrames: frames, normalizedFrames: frames, corrections: [] });
    const attack = buildAnimationQualityReport({ action: "attack", rawFrames: frames, normalizedFrames: frames, corrections: [] });

    expect(idle.loopExpected).toBe(true);
    expect(idle.normalizedMetrics.averageLoopSeam).not.toBeNull();
    expect(idle.loopSeamScore).toBeLessThan(100);
    expect(attack.loopExpected).toBe(false);
    expect(attack.normalizedMetrics.averageLoopSeam).toBeNull();
    expect(attack.loopSeamScore).toBeNull();
  });

  it("maps action semantics to explicit quality profiles", () => {
    expect(animationActionQualityProfile("guard")).toBe("grounded-strict");
    expect(animationActionQualityProfile("run-cycle")).toBe("grounded-soft");
    expect(animationActionQualityProfile("jump")).toBe("airborne-or-exempt");
    expect(animationActionQualityProfile("talk-react")).toBe("subtle-loop");
    expect(animationActionQualityProfile("idle")).toBe("grounded-strict");
    expect(animationActionQualityProfile("idle-breathing")).toBe("subtle-loop");
    expect(animationActionExpectsLoop("walk-cycle")).toBe(true);
    expect(animationActionExpectsLoop("spell-cast")).toBe(false);
    expect(animationActionExpectedPhases("attack")).toEqual(["anticipation", "active/contact", "recovery", "return"]);
  });

  it("uses source appearance as the identity reference when available", () => {
    const reference = makeRectFrame("reference", 0, 18, 28, 24, 28, [230, 40, 70]);
    const matching = [0, 1, 2].map((index) => makeRectFrame("front", index, 18 + index, 28, 24, 28, [230, 40, 70]));
    const shifted = [0, 1, 2].map((index) => makeRectFrame("front", index, 18 + index, 28, 24, 28, [20, 70, 230]));
    const matchingReport = buildAnimationQualityReport({
      action: "walk",
      rawFrames: matching,
      normalizedFrames: matching,
      corrections: [],
      referenceFrame: reference
    });
    const shiftedReport = buildAnimationQualityReport({
      action: "walk",
      rawFrames: shifted,
      normalizedFrames: shifted,
      corrections: [],
      referenceFrame: reference
    });

    expect(matchingReport.paletteScore).toBeGreaterThan(shiftedReport.paletteScore);
    expect(matchingReport.identityScore).toBeGreaterThan(shiftedReport.identityScore);
  });

  it("summarizes per-frame normalization corrections", () => {
    const raw = [makeRectFrame("front", 0, 16, 24, 24, 30), makeRectFrame("front", 1, 20, 28, 20, 26)];
    const normalized = raw.map((_, index) => makeRectFrame("front", index, 20, 30, 22, 28));
    const corrections = [
      correction(raw[0], normalized[0], 0.8, 5, 7),
      correction(raw[1], normalized[1], 1.15, -4, 9)
    ];
    const report = buildAnimationQualityReport({ action: "interact", rawFrames: raw, normalizedFrames: normalized, corrections });

    expect(report.normalizationCorrection.frames).toHaveLength(2);
    expect(report.normalizationCorrection.adjustedFrameRatio).toBe(1);
    expect(report.normalizationCorrection.maxScaleDelta).toBeCloseTo(0.2);
    expect(report.normalizationCorrection.maxTranslationPx).toBeGreaterThan(9);
  });

  it("flags a nearly static idle loop across multiple directions in shadow mode", () => {
    const directions = ["front", "side", "back"];
    const frames = directions.flatMap((direction) =>
      [0, 1, 2, 3].map((frameIndex) => makeRectFrame(direction, frameIndex, 20 + (frameIndex % 2), 32, 20, 24))
    );
    const report = buildAnimationQualityReport({ action: "idle", rawFrames: frames, normalizedFrames: frames, corrections: [] });

    expect(report.shadowDecision.wouldBlock).toBe(true);
    expect(report.shadowDecision.reasons).toContain("subtle loop motion is unreadable across directions (0/3)");
    expect(report.hardGateUnchanged).toBe(true);
  });
});

function makeRectFrame(
  direction: string,
  frameIndex: number,
  x: number,
  y: number,
  rectWidth: number,
  rectHeight: number,
  color: [number, number, number] = [210, 90, 120]
): AnimationQualityFrameInput {
  const width = 64;
  const height = 64;
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let py = y; py < y + rectHeight; py += 1) {
    for (let px = x; px < x + rectWidth; px += 1) {
      const offset = (py * width + px) * 4;
      rgba[offset] = color[0];
      rgba[offset + 1] = color[1];
      rgba[offset + 2] = color[2];
      rgba[offset + 3] = 255;
    }
  }
  return {
    direction,
    frameIndex,
    width,
    height,
    rgba,
    bounds: { minX: x, minY: y, maxX: x + rectWidth - 1, maxY: y + rectHeight - 1, count: rectWidth * rectHeight }
  };
}

function correction(
  raw: AnimationQualityFrameInput,
  normalized: AnimationQualityFrameInput,
  scale: number,
  translateX: number,
  translateY: number
): AnimationNormalizationCorrection {
  return {
    direction: raw.direction,
    frameIndex: raw.frameIndex,
    scale,
    translateX,
    translateY,
    rawBounds: raw.bounds,
    normalizedBounds: normalized.bounds
  };
}
