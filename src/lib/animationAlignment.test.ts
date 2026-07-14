import { describe, expect, it } from "vitest";
import {
  ANIMATION_EXPORT_ANCHOR_RATIO,
  ANIMATION_NORMALIZATION_FOOTLINE_RATIO,
  animationExportAnchor,
  animationNormalizationFootline
} from "./animationAlignment";

describe("animation alignment contract", () => {
  it("keeps the legacy export anchor while naming the normalization footline separately", () => {
    expect(ANIMATION_NORMALIZATION_FOOTLINE_RATIO).toBe(0.9);
    expect(ANIMATION_EXPORT_ANCHOR_RATIO).toBe(0.92);
    expect(animationNormalizationFootline(256)).toBe(230);
    expect(animationExportAnchor(256, 256)).toEqual({ x: 128, y: 236 });
  });
});
