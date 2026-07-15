import { describe, expect, it } from "vitest";
import { buildEffectQualityReportV2 } from "./effectQuality";

const sample = (overrides: Partial<Parameters<typeof buildEffectQualityReportV2>[0][number]> = {}) => ({
  alphaCoverage: 0.34,
  edgeContactRatio: 0.01,
  centroidX: 0.5,
  centroidY: 0.52,
  brightness: 0.72,
  averageRed: 0.3,
  averageGreen: 0.72,
  averageBlue: 0.95,
  ...overrides
});

describe("Effect Quality Gate v2 shadow metrics", () => {
  it("keeps a stable loop clear and records the requested event delta", () => {
    const report = buildEffectQualityReportV2(
      [sample(), sample({ brightness: 0.76 }), sample({ brightness: 0.72 })],
      { loopExpected: true, energyEnvelope: "sustain", expectedPeakFrame: 1, recordedAt: "2026-07-15T00:00:00.000Z" }
    );
    expect(report.metricVersion).toBe("image-cockpit.effect-quality.v2");
    expect(report.loopSeamScore).toBeGreaterThan(90);
    expect(report.eventPeakDeltaFrames).toBe(0);
    expect(report.shadowWarnings).toEqual([]);
  });

  it("warns on a clipped, palette-shifting, discontinuous sequence without blocking it", () => {
    const report = buildEffectQualityReportV2(
      [
        sample({ alphaCoverage: 0.08, centroidX: 0.1, brightness: 0.1, averageRed: 1, averageGreen: 0, averageBlue: 0 }),
        sample({ alphaCoverage: 0.94, edgeContactRatio: 0.85, centroidX: 0.92, centroidY: 0.1, brightness: 1, averageRed: 0, averageGreen: 0, averageBlue: 1 })
      ],
      { loopExpected: true, energyEnvelope: "burst", expectedPeakFrame: 0 }
    );
    expect(report.shadowWarnings.length).toBeGreaterThanOrEqual(5);
    expect(report.eventPeakDeltaFrames).toBe(1);
    expect(report.policyVersion).toBe("shadow-v1");
  });

  it("rejects invalid analysis samples", () => {
    expect(() => buildEffectQualityReportV2([sample({ brightness: 1.2 })], {
      loopExpected: false,
      energyEnvelope: "burst"
    })).toThrow(/brightness/);
  });
});
