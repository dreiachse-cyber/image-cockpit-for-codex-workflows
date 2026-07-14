import type {
  AnimationActionQualityProfile,
  AnimationNormalizationCorrection,
  AnimationQualityDirectionMetrics,
  AnimationQualityMetricSet,
  AnimationQualityReportV2
} from "../types";

export interface AnimationQualityFrameInput {
  direction: string;
  frameIndex: number;
  width: number;
  height: number;
  rgba: ArrayLike<number>;
  bounds: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
    count?: number;
  } | null;
}

export interface BuildAnimationQualityReportInput {
  action?: string;
  rawFrames: AnimationQualityFrameInput[];
  normalizedFrames: AnimationQualityFrameInput[];
  corrections: AnimationNormalizationCorrection[];
  referenceFrame?: AnimationQualityFrameInput;
  recordedAt?: string;
}

const ALPHA_THRESHOLD = 12;
const PALETTE_BINS = 64;
const SILHOUETTE_GRID = 8;

export function animationActionQualityProfile(action?: string): AnimationActionQualityProfile {
  const normalized = normalizeAction(action);
  if (matchesAction(normalized, ["jump", "hop", "knockback", "death", "downed", "float", "floating", "fly", "airborne"])) {
    return "airborne-or-exempt";
  }
  if (matchesAction(normalized, ["breath", "talk", "cast"])) return "subtle-loop";
  if (matchesAction(normalized, ["idle", "guard", "block", "interact", "item"])) return "grounded-strict";
  return "grounded-soft";
}

export function animationActionExpectsLoop(action?: string) {
  const normalized = normalizeAction(action);
  return matchesAction(normalized, ["idle", "breath", "walk", "run", "talk", "cheer", "loop", "cycle"]);
}

export function animationActionExpectedPhases(action?: string) {
  const normalized = normalizeAction(action);
  if (matchesAction(normalized, ["jump", "hop"])) return ["anticipation", "takeoff", "airborne", "landing"];
  if (matchesAction(normalized, ["death", "downed"])) return ["anticipation", "collapse", "settle"];
  if (matchesAction(normalized, ["walk", "run", "cycle"])) return ["contact", "passing", "opposite-contact", "return"];
  if (matchesAction(normalized, ["attack", "ranged", "skill", "hurt", "knockback"])) {
    return ["anticipation", "active/contact", "recovery", "return"];
  }
  if (matchesAction(normalized, ["breath", "talk", "cast"])) return ["rest", "expansion/reaction", "recovery", "return"];
  return ["anticipation", "hold", "recovery", "return"];
}

export function buildAnimationQualityReport(input: BuildAnimationQualityReportInput): AnimationQualityReportV2 {
  const action = normalizeAction(input.action) || "unknown";
  const actionProfile = animationActionQualityProfile(action);
  const loopExpected = animationActionExpectsLoop(action);
  const rawMetrics = buildMetricSet(input.rawFrames, loopExpected);
  const normalizedMetrics = buildMetricSet(input.normalizedFrames, loopExpected);
  const normalizationCorrection = summarizeCorrections(input.corrections);
  const identity = scoreIdentity(input.normalizedFrames, input.referenceFrame);
  const footlineScore = scoreFootline(rawMetrics, actionProfile);
  const loopSeamScore = loopExpected ? scoreLoopSeam(normalizedMetrics) : null;
  const motionScore = scoreMotion(normalizedMetrics.averageMotion, actionProfile);
  const phaseScore = scorePhase(normalizedMetrics);
  const dimensionWarnings = collectDimensionWarnings(rawMetrics, normalizedMetrics, normalizationCorrection);
  const reasons = collectShadowReasons({
    profile: actionProfile,
    loopExpected,
    rawMetrics,
    normalizedMetrics,
    normalizationCorrection,
    identityScore: identity.identityScore,
    footlineScore,
    loopSeamScore,
    phaseScore,
    motionScore
  });

  return {
    metricVersion: "image-cockpit.animation-quality.v2",
    policyVersion: "shadow-v1",
    recordedAt: input.recordedAt ?? new Date().toISOString(),
    action,
    actionProfile,
    expectedPhases: animationActionExpectedPhases(action),
    loopExpected,
    rawMetrics,
    normalizedMetrics,
    normalizationCorrection,
    identityScore: identity.identityScore,
    paletteScore: identity.paletteScore,
    silhouetteScore: identity.silhouetteScore,
    footlineScore,
    loopSeamScore,
    phaseScore,
    motionScore,
    dimensionWarnings,
    shadowDecision: {
      mode: "shadow",
      wouldBlock: reasons.length > 0,
      reasons
    },
    hardGateUnchanged: true
  };
}

function normalizeAction(action?: string) {
  return action?.trim().toLowerCase().replace(/[\s_]+/g, "-") ?? "";
}

function matchesAction(action: string, markers: string[]) {
  return markers.some((marker) => action === marker || action.includes(marker));
}

function buildMetricSet(frames: AnimationQualityFrameInput[], loopExpected: boolean): AnimationQualityMetricSet {
  const groups = new Map<string, AnimationQualityFrameInput[]>();
  frames.forEach((frame) => {
    const group = groups.get(frame.direction) ?? [];
    group.push(frame);
    groups.set(frame.direction, group);
  });
  const directions = Array.from(groups.entries()).map(([direction, rowFrames]) =>
    buildDirectionMetrics(direction, rowFrames.slice().sort((left, right) => left.frameIndex - right.frameIndex), loopExpected)
  );
  return {
    frameCount: frames.length,
    directionCount: directions.length,
    directions,
    averageCenterDriftPx: round(average(directions.map((item) => item.centerDriftPx))),
    averageFootlineDriftPx: round(average(directions.map((item) => item.footlineDriftPx))),
    averageWidthVariation: round(average(directions.map((item) => item.widthVariation)), 4),
    averageHeightVariation: round(average(directions.map((item) => item.heightVariation)), 4),
    averageGroundedFrameRatio: round(average(directions.map((item) => item.groundedFrameRatio)), 4),
    averageMotion: round(average(directions.map((item) => item.averageMotion)), 5),
    averageLoopSeam: loopExpected
      ? round(average(directions.map((item) => item.loopSeam).filter((value): value is number => value !== null)), 5)
      : null
  };
}

function buildDirectionMetrics(direction: string, frames: AnimationQualityFrameInput[], loopExpected: boolean): AnimationQualityDirectionMetrics {
  const valid = frames.filter((frame) => frame.bounds);
  const widths = valid.map((frame) => (frame.bounds?.maxX ?? 0) - (frame.bounds?.minX ?? 0) + 1);
  const heights = valid.map((frame) => (frame.bounds?.maxY ?? 0) - (frame.bounds?.minY ?? 0) + 1);
  const centers = valid.map((frame) => ((frame.bounds?.minX ?? 0) + (frame.bounds?.maxX ?? 0)) / 2);
  const footlines = valid.map((frame) => frame.bounds?.maxY ?? 0);
  const motion = frames.slice(1).map((frame, index) => pixelDifferenceRatio(frames[index], frame));
  const loopSeam = loopExpected && frames.length > 1 ? pixelDifferenceRatio(frames[frames.length - 1], frames[0]) : null;
  return {
    direction,
    frameCount: frames.length,
    centerDriftPx: round(range(centers)),
    footlineDriftPx: round(range(footlines)),
    widthVariation: round(variation(widths), 4),
    heightVariation: round(variation(heights), 4),
    groundedFrameRatio: round(valid.length > 0 ? valid.filter(hasGroundContact).length / valid.length : 0, 4),
    averageMotion: round(average(motion), 5),
    maxMotion: round(motion.length > 0 ? Math.max(...motion) : 0, 5),
    loopSeam: loopSeam === null ? null : round(loopSeam, 5)
  };
}

function hasGroundContact(frame: AnimationQualityFrameInput) {
  if (!frame.bounds) return false;
  const groundY = Math.round(frame.height * 0.9);
  const minY = Math.max(frame.bounds.minY, groundY - 5);
  const maxY = Math.min(frame.bounds.maxY, groundY + 7);
  if (minY > maxY) return false;
  let count = 0;
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = frame.bounds.minX; x <= frame.bounds.maxX; x += 1) {
      if ((frame.rgba[(y * frame.width + x) * 4 + 3] ?? 0) > ALPHA_THRESHOLD) count += 1;
    }
  }
  return count >= Math.max(2, Math.round((frame.bounds.maxX - frame.bounds.minX + 1) * 0.02));
}

function summarizeCorrections(corrections: AnimationNormalizationCorrection[]): AnimationQualityReportV2["normalizationCorrection"] {
  const scaleDeltas = corrections.map((item) => Math.abs(item.scale - 1));
  const translations = corrections.map((item) => Math.hypot(item.translateX, item.translateY));
  const adjusted = corrections.filter((item, index) => scaleDeltas[index] > 0.025 || translations[index] > 2).length;
  return {
    frames: corrections,
    adjustedFrameRatio: round(corrections.length > 0 ? adjusted / corrections.length : 0, 4),
    averageScaleDelta: round(average(scaleDeltas), 4),
    maxScaleDelta: round(scaleDeltas.length > 0 ? Math.max(...scaleDeltas) : 0, 4),
    averageTranslationPx: round(average(translations)),
    maxTranslationPx: round(translations.length > 0 ? Math.max(...translations) : 0)
  };
}

function scoreIdentity(frames: AnimationQualityFrameInput[], reference?: AnimationQualityFrameInput) {
  if (frames.length === 0) return { identityScore: 0, paletteScore: 0, silhouetteScore: 0 };
  const referenceSignature = reference ? frameSignature(reference) : frameSignature(frames[0]);
  const comparable = reference ? frames : frames.slice(1);
  if (comparable.length === 0) return { identityScore: 100, paletteScore: 100, silhouetteScore: 100 };
  const paletteScore = round(average(comparable.map((frame) => paletteSimilarity(referenceSignature.palette, frameSignature(frame).palette))) * 100);
  const silhouetteScore = round(average(comparable.map((frame) => silhouetteSimilarity(referenceSignature, frameSignature(frame)))) * 100);
  return {
    paletteScore,
    silhouetteScore,
    identityScore: round(paletteScore * 0.58 + silhouetteScore * 0.42)
  };
}

function frameSignature(frame: AnimationQualityFrameInput) {
  const palette = new Array<number>(PALETTE_BINS).fill(0);
  const silhouette = new Array<number>(SILHOUETTE_GRID * SILHOUETTE_GRID).fill(0);
  const bounds = frame.bounds;
  if (!bounds) return { palette, silhouette, aspect: 0, density: 0 };
  const boxWidth = Math.max(1, bounds.maxX - bounds.minX + 1);
  const boxHeight = Math.max(1, bounds.maxY - bounds.minY + 1);
  let opaque = 0;
  for (let y = bounds.minY; y <= bounds.maxY; y += 1) {
    for (let x = bounds.minX; x <= bounds.maxX; x += 1) {
      const offset = (y * frame.width + x) * 4;
      if ((frame.rgba[offset + 3] ?? 0) <= ALPHA_THRESHOLD) continue;
      opaque += 1;
      const red = frame.rgba[offset] ?? 0;
      const green = frame.rgba[offset + 1] ?? 0;
      const blue = frame.rgba[offset + 2] ?? 0;
      palette[(red >> 6) * 16 + (green >> 6) * 4 + (blue >> 6)] += 1;
      const gridX = Math.min(SILHOUETTE_GRID - 1, Math.floor(((x - bounds.minX) / boxWidth) * SILHOUETTE_GRID));
      const gridY = Math.min(SILHOUETTE_GRID - 1, Math.floor(((y - bounds.minY) / boxHeight) * SILHOUETTE_GRID));
      silhouette[gridY * SILHOUETTE_GRID + gridX] += 1;
    }
  }
  normalizeVector(palette);
  const gridCellArea = Math.max(1, (boxWidth * boxHeight) / silhouette.length);
  for (let index = 0; index < silhouette.length; index += 1) silhouette[index] = Math.min(1, silhouette[index] / gridCellArea);
  return { palette, silhouette, aspect: boxWidth / boxHeight, density: opaque / (boxWidth * boxHeight) };
}

function paletteSimilarity(left: number[], right: number[]) {
  return clamp(1 - left.reduce((sum, value, index) => sum + Math.abs(value - right[index]), 0) / 2, 0, 1);
}

function silhouetteSimilarity(left: ReturnType<typeof frameSignature>, right: ReturnType<typeof frameSignature>) {
  const grid = 1 - average(left.silhouette.map((value, index) => Math.abs(value - right.silhouette[index])));
  const aspect = 1 - Math.min(1, Math.abs(left.aspect - right.aspect) / Math.max(0.01, left.aspect, right.aspect));
  const density = 1 - Math.min(1, Math.abs(left.density - right.density));
  return clamp(grid * 0.62 + aspect * 0.24 + density * 0.14, 0, 1);
}

function pixelDifferenceRatio(left: AnimationQualityFrameInput, right: AnimationQualityFrameInput) {
  if (left.width !== right.width || left.height !== right.height) return 1;
  const length = Math.min(left.rgba.length, right.rgba.length);
  let total = 0;
  for (let index = 0; index < length; index += 1) total += Math.abs((left.rgba[index] ?? 0) - (right.rgba[index] ?? 0));
  return total / Math.max(1, length * 255);
}

function scoreFootline(metrics: AnimationQualityMetricSet, profile: AnimationActionQualityProfile) {
  if (profile === "airborne-or-exempt") return 100;
  const driftLimit = profile === "grounded-strict" ? 5 : profile === "subtle-loop" ? 7 : 10;
  const driftScore = clamp(1 - metrics.averageFootlineDriftPx / driftLimit, 0, 1) * 55;
  const contactScore = metrics.averageGroundedFrameRatio * 45;
  return round(driftScore + contactScore);
}

function scoreLoopSeam(metrics: AnimationQualityMetricSet) {
  if (metrics.averageLoopSeam === null) return 100;
  const tolerance = Math.max(0.025, metrics.averageMotion * 2.5);
  return round(clamp(1 - metrics.averageLoopSeam / Math.max(0.001, tolerance), 0, 1) * 100);
}

function scoreMotion(value: number, profile: AnimationActionQualityProfile) {
  const rangeByProfile: Record<AnimationActionQualityProfile, [number, number]> = {
    "grounded-strict": [0.001, 0.16],
    "grounded-soft": [0.004, 0.3],
    "airborne-or-exempt": [0.004, 0.42],
    "subtle-loop": [0.0015, 0.08]
  };
  const [minimum, maximum] = rangeByProfile[profile];
  if (value >= minimum && value <= maximum) return 100;
  if (value < minimum) return round(clamp(value / minimum, 0, 1) * 100);
  return round(clamp(1 - (value - maximum) / Math.max(0.01, maximum), 0, 1) * 100);
}

function scorePhase(metrics: AnimationQualityMetricSet) {
  const motions = metrics.directions.map((item) => item.averageMotion);
  if (motions.length === 0) return 0;
  const mean = average(motions);
  if (mean <= 0) return 0;
  return round(clamp(1 - range(motions) / Math.max(0.001, mean * 2.5), 0, 1) * 100);
}

function collectDimensionWarnings(
  raw: AnimationQualityMetricSet,
  normalized: AnimationQualityMetricSet,
  correction: AnimationQualityReportV2["normalizationCorrection"]
) {
  const warnings: string[] = [];
  if (raw.averageCenterDriftPx > 10) warnings.push(`raw center drift ${raw.averageCenterDriftPx}px`);
  if (raw.averageFootlineDriftPx > 8) warnings.push(`raw footline drift ${raw.averageFootlineDriftPx}px`);
  if (raw.averageWidthVariation > 0.32) warnings.push(`raw width variation ${Math.round(raw.averageWidthVariation * 100)}%`);
  if (raw.averageHeightVariation > 0.25) warnings.push(`raw height variation ${Math.round(raw.averageHeightVariation * 100)}%`);
  if (correction.adjustedFrameRatio > 0.35 && correction.averageScaleDelta > 0.06) {
    warnings.push(`normalization resized ${Math.round(correction.adjustedFrameRatio * 100)}% of frames`);
  }
  if (correction.maxTranslationPx > 14) warnings.push(`normalization translation peaked at ${correction.maxTranslationPx}px`);
  if (raw.averageFootlineDriftPx > normalized.averageFootlineDriftPx + 6) warnings.push("normalization masked raw footline drift");
  return warnings;
}

function collectShadowReasons(input: {
  profile: AnimationActionQualityProfile;
  loopExpected: boolean;
  rawMetrics: AnimationQualityMetricSet;
  normalizedMetrics: AnimationQualityMetricSet;
  normalizationCorrection: AnimationQualityReportV2["normalizationCorrection"];
  identityScore: number;
  footlineScore: number;
  loopSeamScore: number | null;
  phaseScore: number;
  motionScore: number;
}) {
  const reasons: string[] = [];
  if (input.rawMetrics.frameCount === 0 || input.normalizedMetrics.frameCount === 0) reasons.push("quality metrics could not inspect animation frames");
  if (input.identityScore < 62) reasons.push(`identity consistency is low (${input.identityScore})`);
  if (input.profile !== "airborne-or-exempt" && input.footlineScore < 45) reasons.push(`ground contact is unstable (${input.footlineScore})`);
  if (input.loopExpected && input.loopSeamScore !== null && input.loopSeamScore < 30) reasons.push(`loop seam is abrupt (${input.loopSeamScore})`);
  if (input.motionScore < 30) reasons.push(`action motion is outside the expected range (${input.motionScore})`);
  if (input.loopExpected && (input.profile === "grounded-strict" || input.profile === "subtle-loop")) {
    const minimumAverage = input.profile === "grounded-strict" ? 0.015 : 0.006;
    const minimumPeak = input.profile === "grounded-strict" ? 0.04 : 0.015;
    const readableDirections = input.normalizedMetrics.directions.filter(
      (direction) => direction.averageMotion >= minimumAverage || direction.maxMotion >= minimumPeak
    ).length;
    if (readableDirections < Math.min(2, input.normalizedMetrics.directionCount)) {
      reasons.push(`subtle loop motion is unreadable across directions (${readableDirections}/${input.normalizedMetrics.directionCount})`);
    }
  }
  if (input.phaseScore < 25 && input.normalizedMetrics.directionCount > 1) reasons.push(`motion phases disagree across directions (${input.phaseScore})`);
  if (
    input.normalizationCorrection.adjustedFrameRatio > 0.6 &&
    (input.normalizationCorrection.averageScaleDelta > 0.12 || input.normalizationCorrection.averageTranslationPx > 10)
  ) {
    reasons.push("normalization is masking large source-frame corrections");
  }
  return reasons;
}

function normalizeVector(values: number[]) {
  const total = values.reduce((sum, value) => sum + value, 0);
  if (total <= 0) return;
  for (let index = 0; index < values.length; index += 1) values[index] /= total;
}

function average(values: number[]) {
  return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function range(values: number[]) {
  return values.length > 0 ? Math.max(...values) - Math.min(...values) : 0;
}

function variation(values: number[]) {
  if (values.length === 0) return 0;
  const sorted = values.slice().sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
  return median > 0 ? range(values) / median : 0;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function round(value: number, decimals = 2) {
  const multiplier = 10 ** decimals;
  return Math.round(value * multiplier) / multiplier;
}
