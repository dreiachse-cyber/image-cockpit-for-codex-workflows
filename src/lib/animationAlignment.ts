export const ANIMATION_NORMALIZATION_FOOTLINE_RATIO = 0.9;
export const ANIMATION_EXPORT_ANCHOR_RATIO = 0.92;

export function animationNormalizationFootline(height: number) {
  return Math.round(height * ANIMATION_NORMALIZATION_FOOTLINE_RATIO);
}

export function animationExportAnchor(width: number, height: number) {
  return {
    x: Math.round(width / 2),
    y: Math.round(height * ANIMATION_EXPORT_ANCHOR_RATIO)
  };
}
