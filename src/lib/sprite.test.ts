import { describe, expect, it } from "vitest";
import type { SpriteAction, SpriteFrame } from "../types";
import {
  applyChromaKey,
  buildSpriteMetadata,
  calculateGridCells,
  countEdgeTouches,
  packSpriteSheet
} from "./sprite";

describe("sprite utilities", () => {
  it("calculates grid cells with gutters", () => {
    const cells = calculateGridCells(260, 130, { columns: 2, rows: 1, gutter: 4 });
    expect(cells).toEqual([
      { index: 0, x: 0, y: 0, width: 128, height: 130 },
      { index: 1, x: 132, y: 0, width: 128, height: 130 }
    ]);
  });

  it("packs frames into a sprite sheet", () => {
    const frames = makeFrames(5);
    const packed = packSpriteSheet(frames, 64, 64, 3);
    expect(packed.width).toBe(192);
    expect(packed.height).toBe(128);
    expect(packed.placements[4]).toMatchObject({ x: 64, y: 64, width: 64, height: 64 });
  });

  it("builds action metadata", () => {
    const frames = makeFrames(2);
    const action: SpriteAction = {
      name: "idle",
      fps: 8,
      loop: true,
      frameIds: frames.map((frame) => frame.id),
      cell: { width: 128, height: 128 },
      anchor: { x: 64, y: 120 }
    };
    const metadata = buildSpriteMetadata("example_sprite", [action], frames);
    expect(metadata.actions[0]).toMatchObject({
      name: "idle",
      fps: 8,
      loop: true,
      cell: { width: 128, height: 128 },
      anchor: { x: 64, y: 120 }
    });
    expect(metadata.actions[0].frames).toHaveLength(2);
  });

  it("applies chroma key transparency within tolerance", () => {
    const input = new Uint8ClampedArray([
      255, 0, 255, 255,
      10, 20, 30, 255
    ]);
    const output = applyChromaKey(input, { r: 255, g: 0, b: 255 }, 3);
    expect(output[3]).toBe(0);
    expect(output[7]).toBe(255);
  });

  it("counts edge touches from alpha pixels", () => {
    const rgba = new Uint8ClampedArray(4 * 4 * 4);
    rgba[3] = 255;
    rgba[(2 * 4 + 2) * 4 + 3] = 255;
    expect(countEdgeTouches(rgba, 4, 4, 1)).toBe(1);
  });
});

function makeFrames(count: number): SpriteFrame[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `frame_${index}`,
    name: `frame_${index}.png`,
    dataUrl: `data:image/png;base64,${index}`,
    width: 64,
    height: 64,
    index
  }));
}

