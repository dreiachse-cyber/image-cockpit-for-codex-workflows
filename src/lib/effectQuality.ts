import type { EffectQualityReportV2 } from "../types";

export interface EffectFrameQualitySample {
  alphaCoverage: number;
  edgeContactRatio: number;
  centroidX: number;
  centroidY: number;
  brightness: number;
  averageRed: number;
  averageGreen: number;
  averageBlue: number;
}

export interface EffectQualityOptions {
  loopExpected: boolean;
  energyEnvelope: "burst" | "sustain" | "pulse" | "travel" | "expand-fade";
  expectedPeakFrame?: number;
  recordedAt?: string;
}

export function buildEffectQualityReportV2(
  samples: EffectFrameQualitySample[],
  options: EffectQualityOptions
): EffectQualityReportV2 {
  if (samples.length === 0) throw new Error("Effect Quality v2 requires at least one frame sample.");
  samples.forEach(validateSample);

  const consecutive = samples.slice(1).map((sample, index) => pairDelta(samples[index], sample));
  const maximumAlphaDelta = max(consecutive.map((delta) => delta.alpha));
  const maximumCentroidDelta = max(consecutive.map((delta) => delta.centroid));
  const maximumPaletteDelta = max(consecutive.map((delta) => delta.palette));
  const alphaContinuityScore = score(100 - maximumAlphaDelta * 150);
  const energyCentroidScore = score(100 - maximumCentroidDelta * 110);
  const paletteConsistencyScore = score(100 - maximumPaletteDelta * 105);

  const energy = samples.map((sample) => sample.alphaCoverage * sample.brightness);
  const peakEnergy = Math.max(...energy);
  const peakFrameIndex = Math.max(0, energy.indexOf(peakEnergy));
  const brightnessEnvelopeScore = scoreEnvelope(samples, peakEnergy, options.energyEnvelope);
  const clippingOverdrawScore = score(100 - Math.max(...samples.map((sample) => sample.edgeContactRatio)) * 170
    - Math.max(0, Math.max(...samples.map((sample) => sample.alphaCoverage)) - 0.82) * 220);

  const loopSeamScore = options.loopExpected && samples.length > 1
    ? score(100 - pairDelta(samples.at(-1)!, samples[0]).combined * 105)
    : null;
  const eventPeakDeltaFrames = options.expectedPeakFrame === undefined
    ? null
    : peakFrameIndex - clampInteger(options.expectedPeakFrame, 0, samples.length - 1);

  const shadowWarnings: string[] = [];
  if (loopSeamScore !== null && loopSeamScore < 68) shadowWarnings.push("loop seam energy changes abruptly");
  if (alphaContinuityScore < 65) shadowWarnings.push("alpha/opacity continuity is unstable");
  if (energyCentroidScore < 65) shadowWarnings.push("energy centroid jumps between frames");
  if (brightnessEnvelopeScore < 62) shadowWarnings.push("brightness envelope does not match the recipe");
  if (clippingOverdrawScore < 65) shadowWarnings.push("effect clipping or overdraw risk is high");
  if (paletteConsistencyScore < 65) shadowWarnings.push("palette changes abruptly between frames");
  if (eventPeakDeltaFrames !== null && Math.abs(eventPeakDeltaFrames) > 1) shadowWarnings.push("peak frame is offset from the requested event");

  return {
    metricVersion: "image-cockpit.effect-quality.v2",
    policyVersion: "shadow-v1",
    recordedAt: options.recordedAt ?? new Date().toISOString(),
    loopSeamScore,
    alphaContinuityScore,
    energyCentroidScore,
    brightnessEnvelopeScore,
    clippingOverdrawScore,
    paletteConsistencyScore,
    peakFrameIndex,
    eventPeakDeltaFrames,
    shadowWarnings
  };
}

function scoreEnvelope(
  samples: EffectFrameQualitySample[],
  peakEnergy: number,
  envelope: EffectQualityOptions["energyEnvelope"]
) {
  if (peakEnergy <= 0.0001) return 0;
  const energy = samples.map((sample) => sample.alphaCoverage * sample.brightness);
  const start = energy[0] / peakEnergy;
  const end = energy.at(-1)! / peakEnergy;
  if (envelope === "burst" || envelope === "expand-fade") {
    return score(100 - (start + end) * 48);
  }
  if (envelope === "sustain") {
    const mean = energy.reduce((sum, value) => sum + value, 0) / energy.length;
    const deviation = energy.reduce((sum, value) => sum + Math.abs(value - mean), 0) / energy.length;
    return score(100 - (deviation / Math.max(0.0001, mean)) * 75);
  }
  if (envelope === "pulse") {
    const highFrames = energy.filter((value) => value >= peakEnergy * 0.72).length;
    return score(100 - Math.abs(highFrames - Math.max(1, Math.round(samples.length / 3))) * 12);
  }
  const centroidTravel = pairDelta(samples[0], samples.at(-1)!).centroid;
  return score(55 + Math.min(45, centroidTravel * 95));
}

function pairDelta(left: EffectFrameQualitySample, right: EffectFrameQualitySample) {
  const alpha = Math.abs(left.alphaCoverage - right.alphaCoverage);
  const centroid = Math.hypot(left.centroidX - right.centroidX, left.centroidY - right.centroidY) / Math.SQRT2;
  const brightness = Math.abs(left.brightness - right.brightness);
  const palette = Math.hypot(
    left.averageRed - right.averageRed,
    left.averageGreen - right.averageGreen,
    left.averageBlue - right.averageBlue
  ) / Math.sqrt(3);
  return {
    alpha,
    centroid,
    brightness,
    palette,
    combined: alpha * 0.32 + centroid * 0.28 + brightness * 0.24 + palette * 0.16
  };
}

function validateSample(sample: EffectFrameQualitySample) {
  ([
    "alphaCoverage",
    "edgeContactRatio",
    "centroidX",
    "centroidY",
    "brightness",
    "averageRed",
    "averageGreen",
    "averageBlue"
  ] as const).forEach((key) => {
    const value = sample[key];
    if (!Number.isFinite(value) || value < 0 || value > 1) throw new Error(`Effect Quality v2 ${key} must be between 0 and 1.`);
  });
}

function score(value: number) {
  return Math.round(Math.max(0, Math.min(100, value)) * 10) / 10;
}

function max(values: number[]) {
  return values.length > 0 ? Math.max(...values) : 0;
}

function clampInteger(value: number, min: number, maxValue: number) {
  return Math.max(min, Math.min(maxValue, Math.round(value)));
}
