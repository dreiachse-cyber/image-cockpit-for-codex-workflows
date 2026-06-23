import type { GridSettings, SpriteAction, SpriteFrame } from "../types";

export interface GridCell {
  index: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PackPlacement {
  frameId: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface QcSummary {
  edgeTouchCount: number;
  sizeMismatchCount: number;
  duplicateCount: number;
  transparentFrames: number;
}

export function calculateGridCells(
  imageWidth: number,
  imageHeight: number,
  settings: GridSettings
): GridCell[] {
  const columns = Math.max(1, Math.floor(settings.columns));
  const rows = Math.max(1, Math.floor(settings.rows));
  const gutter = Math.max(0, Math.floor(settings.gutter));
  const cellWidth = Math.floor((imageWidth - gutter * (columns - 1)) / columns);
  const cellHeight = Math.floor((imageHeight - gutter * (rows - 1)) / rows);

  return Array.from({ length: columns * rows }, (_, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    return {
      index,
      x: column * (cellWidth + gutter),
      y: row * (cellHeight + gutter),
      width: cellWidth,
      height: cellHeight
    };
  });
}

export function packSpriteSheet(
  frames: SpriteFrame[],
  cellWidth: number,
  cellHeight: number,
  columns = Math.ceil(Math.sqrt(Math.max(frames.length, 1)))
) {
  const safeColumns = Math.max(1, columns);
  const rows = Math.max(1, Math.ceil(frames.length / safeColumns));
  const placements: PackPlacement[] = frames.map((frame, index) => ({
    frameId: frame.id,
    x: (index % safeColumns) * cellWidth,
    y: Math.floor(index / safeColumns) * cellHeight,
    width: cellWidth,
    height: cellHeight
  }));

  return {
    width: safeColumns * cellWidth,
    height: rows * cellHeight,
    columns: safeColumns,
    rows,
    placements
  };
}

export function buildSpriteMetadata(
  spriteName: string,
  actions: SpriteAction[],
  frames: SpriteFrame[]
) {
  const framesById = new Map(frames.map((frame) => [frame.id, frame]));
  return {
    name: spriteName,
    generatedAt: new Date().toISOString(),
    actions: actions.map((action) => ({
      name: action.name,
      fps: action.fps,
      loop: action.loop,
      frames: action.frameIds.map((frameId, order) => {
        const frame = framesById.get(frameId);
        return {
          id: frameId,
          name: frame?.name ?? `frame_${order}`,
          order,
          width: frame?.width ?? action.cell.width,
          height: frame?.height ?? action.cell.height
        };
      }),
      cell: action.cell,
      anchor: action.anchor
    }))
  };
}

export function applyChromaKey(
  input: Uint8ClampedArray,
  key: { r: number; g: number; b: number },
  tolerance: number
) {
  const output = new Uint8ClampedArray(input);
  const limit = Math.max(0, tolerance);
  for (let i = 0; i < output.length; i += 4) {
    const dr = output[i] - key.r;
    const dg = output[i + 1] - key.g;
    const db = output[i + 2] - key.b;
    const distance = Math.sqrt(dr * dr + dg * dg + db * db);
    if (distance <= limit) {
      output[i + 3] = 0;
    }
  }
  return output;
}

export function countEdgeTouches(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  padding: number
) {
  const safePadding = Math.max(0, Math.floor(padding));
  let touches = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const nearEdge =
        x < safePadding ||
        y < safePadding ||
        x >= width - safePadding ||
        y >= height - safePadding;
      if (!nearEdge) continue;
      if (rgba[(y * width + x) * 4 + 3] > 8) touches += 1;
    }
  }
  return touches;
}

export function summarizeFrames(frames: SpriteFrame[], cellWidth: number, cellHeight: number): QcSummary {
  const seen = new Set<string>();
  let duplicateCount = 0;
  let sizeMismatchCount = 0;
  let transparentFrames = 0;

  for (const frame of frames) {
    if (seen.has(frame.dataUrl)) duplicateCount += 1;
    seen.add(frame.dataUrl);
    if (frame.width !== cellWidth || frame.height !== cellHeight) sizeMismatchCount += 1;
    if (frame.dataUrl.includes("image/png")) transparentFrames += 1;
  }

  return {
    edgeTouchCount: 0,
    sizeMismatchCount,
    duplicateCount,
    transparentFrames
  };
}

