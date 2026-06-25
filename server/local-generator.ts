import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { deflateSync } from "node:zlib";

export type LocalGenerationWorkflow = "image-generate" | "sprite-generate";

export type LocalGenerationRequest = {
  workflowMode?: string;
  prompt?: string;
  negativePrompt?: string;
  jobNotes?: string;
  seed?: string;
  size?: string;
  count?: number;
  grid?: unknown;
  cell?: unknown;
  action?: string;
};

export type LocalGenerationResult = {
  name: string;
  path: string;
  mimeType: "image/png";
};

type Rgba = [number, number, number, number];

type PixelCanvas = {
  width: number;
  height: number;
  pixels: Uint8Array;
};

type Palette = {
  primary: Rgba;
  secondary: Rgba;
  accent: Rgba;
  shadow: Rgba;
  glow: Rgba;
};

const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const crcTable = buildCrcTable();

export async function generateLocalImages(
  request: LocalGenerationRequest,
  outboxDir: string,
  id: string
): Promise<LocalGenerationResult[]> {
  const workflowMode = normalizeLocalGenerationWorkflow(request.workflowMode);
  const count = workflowMode === "image-generate" ? clampInteger(request.count ?? 1, 1, 4) : 1;
  const results: LocalGenerationResult[] = [];

  for (let index = 0; index < count; index += 1) {
    const image =
      workflowMode === "sprite-generate"
        ? renderSpriteSheet(request, index)
        : renderPromptImage(request, index);
    const suffix = workflowMode === "sprite-generate" ? "sprite-sheet" : `image-${index + 1}`;
    const name = `${id}-${suffix}.png`;
    const path = join(outboxDir, name);
    await writeFile(path, encodePng(image));
    results.push({ name, path, mimeType: "image/png" });
  }

  const sidecarName = `${id}-local-generation.json`;
  await writeFile(
    join(outboxDir, sidecarName),
    JSON.stringify(
      {
        id,
        createdAt: new Date().toISOString(),
        workflowMode,
        prompt: request.prompt ?? "",
        negativePrompt: request.negativePrompt ?? "",
        jobNotes: request.jobNotes ?? "",
        seed: request.seed ?? "",
        results: results.map((result) => result.name),
        generator: "image-cockpit.local-procedural-v1"
      },
      null,
      2
    ),
    "utf8"
  );

  return results;
}

function renderPromptImage(request: LocalGenerationRequest, index: number) {
  const { width, height } = parseSize(request.size, 1024, 1024);
  const prompt = `${request.prompt ?? ""} ${request.jobNotes ?? ""}`.toLowerCase();
  const seed = `${request.seed ?? ""}:${request.prompt ?? ""}:${index}`;
  const random = createRng(seed);
  const palette = paletteForPrompt(prompt, random);
  const canvas = createCanvas(width, height);

  drawSoftBackdrop(canvas, palette, random);
  drawPromptMotifs(canvas, prompt, palette, random);
  drawCharacter(canvas, Math.round(width * 0.5), Math.round(height * 0.56), Math.round(Math.min(width, height) * 0.38), {
    palette,
    frame: index,
    variant: prompt,
    random
  });
  drawSparkPixels(canvas, palette.accent, random, Math.round(width * height * 0.00045));
  return canvas;
}

function renderSpriteSheet(request: LocalGenerationRequest, index: number) {
  const grid = parseGrid(request.grid);
  const cell = parseCell(request.cell);
  const width = grid.columns * cell.width;
  const height = grid.rows * cell.height;
  const prompt = `${request.prompt ?? ""} ${request.jobNotes ?? ""}`.toLowerCase();
  const random = createRng(`${request.seed ?? ""}:${request.prompt ?? ""}:sprite:${index}`);
  const palette = paletteForPrompt(prompt, random);
  const canvas = createCanvas(width, height);
  const frameCount = grid.columns * grid.rows;

  for (let frame = 0; frame < frameCount; frame += 1) {
    const column = frame % grid.columns;
    const row = Math.floor(frame / grid.columns);
    const x = column * cell.width;
    const y = row * cell.height;
    const phase = (frame / Math.max(1, grid.columns - 1)) * Math.PI * 2;
    drawFrameGuide(canvas, x, y, cell.width, cell.height, frame, palette);
    drawCharacter(canvas, x + Math.round(cell.width / 2), y + Math.round(cell.height * 0.58 + Math.sin(phase) * 3), Math.round(Math.min(cell.width, cell.height) * 0.58), {
      palette,
      frame,
      variant: `${prompt} ${request.action ?? ""}`,
      random,
      walkPhase: phase
    });
  }

  return canvas;
}

function createCanvas(width: number, height: number): PixelCanvas {
  return { width, height, pixels: new Uint8Array(width * height * 4) };
}

function drawSoftBackdrop(canvas: PixelCanvas, palette: Palette, random: () => number) {
  const cx = canvas.width * (0.42 + random() * 0.16);
  const cy = canvas.height * (0.35 + random() * 0.12);
  const radius = Math.min(canvas.width, canvas.height) * (0.42 + random() * 0.14);
  for (let y = 0; y < canvas.height; y += 1) {
    for (let x = 0; x < canvas.width; x += 1) {
      const distance = Math.hypot(x - cx, y - cy) / radius;
      const alpha = Math.max(0, 1 - distance) * 70;
      if (alpha > 0) blendPixel(canvas, x, y, [palette.glow[0], palette.glow[1], palette.glow[2], alpha]);
    }
  }
  fillEllipse(canvas, canvas.width / 2, canvas.height * 0.78, canvas.width * 0.26, canvas.height * 0.045, palette.shadow);
}

function drawPromptMotifs(canvas: PixelCanvas, prompt: string, palette: Palette, random: () => number) {
  const count = prompt.includes("forest") || prompt.includes("森") ? 26 : prompt.includes("space") || prompt.includes("星") ? 34 : 18;
  for (let i = 0; i < count; i += 1) {
    const x = Math.round(canvas.width * (0.14 + random() * 0.72));
    const y = Math.round(canvas.height * (0.09 + random() * 0.58));
    const size = Math.max(3, Math.round(Math.min(canvas.width, canvas.height) * (0.008 + random() * 0.012)));
    if (prompt.includes("fire") || prompt.includes("炎")) {
      fillDiamond(canvas, x, y, size, palette.accent);
    } else if (prompt.includes("water") || prompt.includes("水")) {
      fillEllipse(canvas, x, y, size * 0.8, size * 1.3, [palette.accent[0], palette.accent[1], palette.accent[2], 130]);
    } else {
      fillRect(canvas, x, y, size, size, [palette.accent[0], palette.accent[1], palette.accent[2], 105]);
    }
  }
}

function drawFrameGuide(canvas: PixelCanvas, x: number, y: number, width: number, height: number, frame: number, palette: Palette) {
  const guide: Rgba = frame % 2 === 0 ? [palette.glow[0], palette.glow[1], palette.glow[2], 22] : [palette.primary[0], palette.primary[1], palette.primary[2], 16];
  fillRect(canvas, x + 2, y + 2, width - 4, height - 4, guide);
  fillEllipse(canvas, x + width / 2, y + height * 0.82, width * 0.28, height * 0.04, palette.shadow);
}

function drawCharacter(
  canvas: PixelCanvas,
  cx: number,
  cy: number,
  size: number,
  options: { palette: Palette; frame: number; variant: string; random: () => number; walkPhase?: number }
) {
  const { palette, frame, variant, walkPhase = frame * 0.75 } = options;
  const pixel = Math.max(2, Math.round(size / 28));
  const bodyW = pixel * 10;
  const bodyH = pixel * 16;
  const headR = pixel * 5;
  const legSwing = Math.round(Math.sin(walkPhase) * pixel * 2);
  const armSwing = Math.round(Math.cos(walkPhase) * pixel * 2);
  const baseY = cy + pixel * 11;

  fillRect(canvas, cx - bodyW / 2, cy - bodyH / 2, bodyW, bodyH, palette.primary);
  fillRect(canvas, cx - bodyW / 2 + pixel * 2, cy - bodyH / 2 + pixel * 3, bodyW - pixel * 4, bodyH - pixel * 3, palette.secondary);
  fillCircle(canvas, cx, cy - bodyH / 2 - headR + pixel, headR, [238, 207, 168, 255]);
  fillRect(canvas, cx - headR, cy - bodyH / 2 - headR * 2, headR * 2, pixel * 3, palette.accent);

  if (variant.includes("mage") || variant.includes("wizard") || variant.includes("魔")) {
    fillTriangle(canvas, cx - headR - pixel, cy - bodyH / 2 - headR * 2, cx, cy - bodyH / 2 - headR * 4, cx + headR + pixel, cy - bodyH / 2 - headR * 2, palette.accent);
    drawLine(canvas, cx + bodyW / 2 + pixel * 2, cy - pixel * 8, cx + bodyW / 2 + pixel * 2, baseY, pixel, [116, 79, 43, 255]);
    fillDiamond(canvas, cx + bodyW / 2 + pixel * 2, cy - pixel * 10, pixel * 3, palette.glow);
  } else if (variant.includes("mech") || variant.includes("robot")) {
    fillRect(canvas, cx - headR, cy - bodyH / 2 - headR * 2, headR * 2, pixel * 2, [225, 232, 240, 255]);
    fillRect(canvas, cx - pixel * 2, cy - bodyH / 2 - headR, pixel * 4, pixel * 2, palette.accent);
  } else {
    fillTriangle(canvas, cx - headR, cy - bodyH / 2 - headR * 2, cx, cy - bodyH / 2 - headR * 3, cx + headR, cy - bodyH / 2 - headR * 2, palette.accent);
  }

  drawLimb(canvas, cx - bodyW / 2, cy - pixel * 2, cx - bodyW / 2 - pixel * 4, cy + pixel * 5 + armSwing, pixel * 2, palette.primary);
  drawLimb(canvas, cx + bodyW / 2, cy - pixel * 2, cx + bodyW / 2 + pixel * 4, cy + pixel * 5 - armSwing, pixel * 2, palette.primary);
  drawLimb(canvas, cx - pixel * 3, cy + bodyH / 2 - pixel, cx - pixel * 4 - legSwing, baseY, pixel * 2, palette.secondary);
  drawLimb(canvas, cx + pixel * 3, cy + bodyH / 2 - pixel, cx + pixel * 4 + legSwing, baseY, pixel * 2, palette.secondary);
  fillRect(canvas, cx - headR + pixel * 2, cy - bodyH / 2 - headR + pixel, pixel * 2, pixel * 2, [42, 45, 54, 255]);
  fillRect(canvas, cx + headR - pixel * 4, cy - bodyH / 2 - headR + pixel, pixel * 2, pixel * 2, [42, 45, 54, 255]);
}

function drawSparkPixels(canvas: PixelCanvas, color: Rgba, random: () => number, count: number) {
  const size = Math.max(2, Math.round(Math.min(canvas.width, canvas.height) / 160));
  for (let i = 0; i < count; i += 1) {
    const x = Math.round(random() * canvas.width);
    const y = Math.round(random() * canvas.height);
    fillRect(canvas, x, y, size, size, [color[0], color[1], color[2], 95]);
  }
}

function drawLimb(canvas: PixelCanvas, x1: number, y1: number, x2: number, y2: number, width: number, color: Rgba) {
  drawLine(canvas, Math.round(x1), Math.round(y1), Math.round(x2), Math.round(y2), Math.max(1, Math.round(width)), color);
}

function drawLine(canvas: PixelCanvas, x1: number, y1: number, x2: number, y2: number, width: number, color: Rgba) {
  const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1), 1);
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const x = Math.round(x1 + (x2 - x1) * t);
    const y = Math.round(y1 + (y2 - y1) * t);
    fillCircle(canvas, x, y, width, color);
  }
}

function fillRect(canvas: PixelCanvas, x: number, y: number, width: number, height: number, color: Rgba) {
  const left = clampInteger(Math.floor(x), 0, canvas.width);
  const top = clampInteger(Math.floor(y), 0, canvas.height);
  const right = clampInteger(Math.ceil(x + width), 0, canvas.width);
  const bottom = clampInteger(Math.ceil(y + height), 0, canvas.height);
  for (let py = top; py < bottom; py += 1) {
    for (let px = left; px < right; px += 1) blendPixel(canvas, px, py, color);
  }
}

function fillCircle(canvas: PixelCanvas, cx: number, cy: number, radius: number, color: Rgba) {
  fillEllipse(canvas, cx, cy, radius, radius, color);
}

function fillEllipse(canvas: PixelCanvas, cx: number, cy: number, rx: number, ry: number, color: Rgba) {
  const left = Math.floor(cx - rx);
  const right = Math.ceil(cx + rx);
  const top = Math.floor(cy - ry);
  const bottom = Math.ceil(cy + ry);
  for (let y = top; y <= bottom; y += 1) {
    for (let x = left; x <= right; x += 1) {
      const dx = (x - cx) / Math.max(1, rx);
      const dy = (y - cy) / Math.max(1, ry);
      if (dx * dx + dy * dy <= 1) blendPixel(canvas, x, y, color);
    }
  }
}

function fillDiamond(canvas: PixelCanvas, cx: number, cy: number, radius: number, color: Rgba) {
  for (let y = Math.floor(cy - radius); y <= Math.ceil(cy + radius); y += 1) {
    for (let x = Math.floor(cx - radius); x <= Math.ceil(cx + radius); x += 1) {
      if (Math.abs(x - cx) + Math.abs(y - cy) <= radius) blendPixel(canvas, x, y, color);
    }
  }
}

function fillTriangle(canvas: PixelCanvas, ax: number, ay: number, bx: number, by: number, cx: number, cy: number, color: Rgba) {
  const minX = Math.floor(Math.min(ax, bx, cx));
  const maxX = Math.ceil(Math.max(ax, bx, cx));
  const minY = Math.floor(Math.min(ay, by, cy));
  const maxY = Math.ceil(Math.max(ay, by, cy));
  const area = edge(ax, ay, bx, by, cx, cy);
  if (area === 0) return;
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const w0 = edge(bx, by, cx, cy, x, y);
      const w1 = edge(cx, cy, ax, ay, x, y);
      const w2 = edge(ax, ay, bx, by, x, y);
      if ((w0 >= 0 && w1 >= 0 && w2 >= 0) || (w0 <= 0 && w1 <= 0 && w2 <= 0)) blendPixel(canvas, x, y, color);
    }
  }
}

function edge(ax: number, ay: number, bx: number, by: number, cx: number, cy: number) {
  return (cx - ax) * (by - ay) - (cy - ay) * (bx - ax);
}

function blendPixel(canvas: PixelCanvas, x: number, y: number, color: Rgba) {
  if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return;
  const offset = (Math.floor(y) * canvas.width + Math.floor(x)) * 4;
  const sourceAlpha = color[3] / 255;
  const targetAlpha = canvas.pixels[offset + 3] / 255;
  const outputAlpha = sourceAlpha + targetAlpha * (1 - sourceAlpha);
  if (outputAlpha <= 0) return;
  canvas.pixels[offset] = Math.round((color[0] * sourceAlpha + canvas.pixels[offset] * targetAlpha * (1 - sourceAlpha)) / outputAlpha);
  canvas.pixels[offset + 1] = Math.round((color[1] * sourceAlpha + canvas.pixels[offset + 1] * targetAlpha * (1 - sourceAlpha)) / outputAlpha);
  canvas.pixels[offset + 2] = Math.round((color[2] * sourceAlpha + canvas.pixels[offset + 2] * targetAlpha * (1 - sourceAlpha)) / outputAlpha);
  canvas.pixels[offset + 3] = Math.round(outputAlpha * 255);
}

function encodePng(canvas: PixelCanvas) {
  const stride = canvas.width * 4;
  const raw = Buffer.alloc((stride + 1) * canvas.height);
  for (let y = 0; y < canvas.height; y += 1) {
    const rowOffset = y * (stride + 1);
    raw[rowOffset] = 0;
    Buffer.from(canvas.pixels.buffer, canvas.pixels.byteOffset + y * stride, stride).copy(raw, rowOffset + 1);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(canvas.width, 0);
  ihdr.writeUInt32BE(canvas.height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    pngSignature,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0))
  ]);
}

function pngChunk(type: string, data: Buffer) {
  const typeBuffer = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function crc32(buffer: Buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function buildCrcTable() {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let value = i;
    for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    table[i] = value >>> 0;
  }
  return table;
}

function paletteForPrompt(prompt: string, random: () => number): Palette {
  if (prompt.includes("fire") || prompt.includes("炎")) return createPalette([205, 72, 47, 255], [85, 36, 45, 255], [255, 189, 77, 235]);
  if (prompt.includes("water") || prompt.includes("水")) return createPalette([49, 135, 202, 255], [42, 68, 136, 255], [143, 229, 245, 225]);
  if (prompt.includes("space") || prompt.includes("星")) return createPalette([98, 82, 184, 255], [34, 38, 86, 255], [238, 210, 113, 225]);
  if (prompt.includes("mech") || prompt.includes("robot")) return createPalette([108, 125, 143, 255], [43, 54, 68, 255], [104, 232, 215, 230]);
  if (prompt.includes("cute") || prompt.includes("かわいい")) return createPalette([232, 116, 163, 255], [105, 73, 132, 255], [255, 213, 126, 220]);
  const hue = Math.floor(random() * 5);
  const options: Array<[Rgba, Rgba, Rgba]> = [
    [[46, 142, 97, 255], [35, 78, 67, 255], [155, 224, 122, 220]],
    [[180, 91, 77, 255], [84, 54, 68, 255], [247, 189, 97, 220]],
    [[76, 121, 190, 255], [40, 57, 102, 255], [137, 213, 228, 220]],
    [[136, 93, 184, 255], [68, 49, 103, 255], [227, 171, 255, 220]],
    [[190, 132, 64, 255], [79, 61, 44, 255], [241, 214, 117, 220]]
  ];
  return createPalette(...options[hue]);
}

function createPalette(primary: Rgba, secondary: Rgba, accent: Rgba): Palette {
  return {
    primary,
    secondary,
    accent,
    shadow: [24, 28, 34, 78],
    glow: [accent[0], accent[1], accent[2], 150]
  };
}

function parseSize(value: string | undefined, fallbackWidth: number, fallbackHeight: number) {
  const match = value?.match(/^(\d{2,4})x(\d{2,4})$/);
  if (!match) return { width: fallbackWidth, height: fallbackHeight };
  return {
    width: clampInteger(Number(match[1]), 256, 1536),
    height: clampInteger(Number(match[2]), 256, 1536)
  };
}

function parseGrid(value: unknown) {
  const grid = value && typeof value === "object" ? (value as { columns?: unknown; rows?: unknown }) : {};
  return {
    columns: clampInteger(Number(grid.columns ?? 8), 1, 12),
    rows: clampInteger(Number(grid.rows ?? 4), 1, 8)
  };
}

function parseCell(value: unknown) {
  const cell = value && typeof value === "object" ? (value as { width?: unknown; height?: unknown }) : {};
  return {
    width: clampInteger(Number(cell.width ?? 128), 32, 256),
    height: clampInteger(Number(cell.height ?? 128), 32, 256)
  };
}

function normalizeLocalGenerationWorkflow(value: string | undefined): LocalGenerationWorkflow {
  return value === "sprite-generate" ? "sprite-generate" : "image-generate";
}

function clampInteger(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.round(value)));
}

function createRng(seed: string) {
  const digest = createHash("sha256").update(seed || "image-cockpit").digest();
  let state = digest.readUInt32LE(0) || 0x9e3779b9;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}
