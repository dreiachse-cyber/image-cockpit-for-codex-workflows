import { applyPalette, GIFEncoder, quantize } from "gifenc";
import JSZip from "jszip";
import type { AnimationPackManifest, EffectAnimationMetadata, SpriteAction, SpriteFrame } from "../types";
import { canvasToBlob, dataUrlToBlob, downloadBlob, loadImage } from "./image";
import { buildSpriteMetadata, packSpriteSheet, resolvePlaybackFrameIds } from "./sprite";

export interface AnimationPackExportInput {
  manifest: AnimationPackManifest;
  sheet: Blob | string;
  previewGif?: Blob;
  previewWebp?: Blob;
  previewApng?: Blob;
  directionPreviews?: Array<{
    direction: string;
    gif?: Blob;
    webp?: Blob;
    apng?: Blob;
  }>;
  metadata?: unknown;
  frames?: Array<{ name: string; dataUrl: string }>;
}

export interface EffectPackExportInput {
  metadata: EffectAnimationMetadata;
  sheet: Blob | string;
  previewGif?: Blob;
  previewApng?: Blob;
  frames?: Array<{ name: string; dataUrl: string }>;
}

export async function createSpriteSheetBlob(frames: SpriteFrame[], action: SpriteAction, columns?: number) {
  const ordered = action.frameIds
    .map((frameId) => frames.find((frame) => frame.id === frameId))
    .filter((frame): frame is SpriteFrame => Boolean(frame));
  const packed = packSpriteSheet(ordered, action.cell.width, action.cell.height, columns);
  const canvas = document.createElement("canvas");
  canvas.width = packed.width;
  canvas.height = packed.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas context unavailable");
  context.clearRect(0, 0, canvas.width, canvas.height);

  for (const placement of packed.placements) {
    const frame = ordered.find((item) => item.id === placement.frameId);
    if (!frame) continue;
    const image = await loadImage(frame.dataUrl);
    context.drawImage(image, placement.x, placement.y, placement.width, placement.height);
  }

  return canvasToBlob(canvas);
}

export async function exportSpriteSheet(frames: SpriteFrame[], action: SpriteAction, columns?: number) {
  const blob = await createSpriteSheetBlob(frames, action, columns);
  downloadBlob(blob, `${action.name}_sheet.png`);
}

export async function exportFramesZip(frames: SpriteFrame[], action: SpriteAction) {
  const zip = new JSZip();
  action.frameIds.forEach((frameId, index) => {
    const frame = frames.find((item) => item.id === frameId);
    if (!frame) return;
    zip.file(`${action.name}_${String(index).padStart(3, "0")}.png`, dataUrlToBlob(frame.dataUrl));
  });
  const blob = await zip.generateAsync({ type: "blob" });
  downloadBlob(blob, `${action.name}_frames.zip`);
}

export async function createGifBlob(
  frames: SpriteFrame[],
  action: SpriteAction,
  options: { forceLoop?: boolean } = {}
) {
  const ordered = resolvePlaybackFrameIds(action)
    .map((frameId) => frames.find((frame) => frame.id === frameId))
    .filter((frame): frame is SpriteFrame => Boolean(frame));
  if (ordered.length === 0) throw new Error("No frames to export");

  const width = action.cell.width;
  const height = action.cell.height;
  const encoder = GIFEncoder();
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Canvas context unavailable");

  for (const frame of ordered) {
    const image = await loadImage(frame.dataUrl);
    context.clearRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    const data = context.getImageData(0, 0, width, height).data;
    const palette = quantize(data, 255, { format: "rgba4444", oneBitAlpha: true });
    const transparentIndex = palette.findIndex((color) => color[3] === 0);
    const index = applyPalette(data, palette, "rgba4444");
    encoder.writeFrame(index, width, height, {
      palette,
      delay: Math.round(1000 / Math.max(1, action.fps)),
      transparent: transparentIndex >= 0,
      transparentIndex: Math.max(0, transparentIndex),
      repeat: options.forceLoop || action.loop ? 0 : -1
    });
  }

  encoder.finish();
  const bytes = encoder.bytes();
  const arrayBuffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(arrayBuffer).set(bytes);
  return new Blob([arrayBuffer], { type: "image/gif" });
}

export async function exportGif(frames: SpriteFrame[], action: SpriteAction) {
  const blob = await createGifBlob(frames, action);
  downloadBlob(blob, `${action.name}.gif`);
}

export async function createApngBlob(
  frames: SpriteFrame[],
  action: SpriteAction,
  options: { forceLoop?: boolean } = {}
) {
  const ordered = resolvePlaybackFrameIds(action)
    .map((frameId) => frames.find((frame) => frame.id === frameId))
    .filter((frame): frame is SpriteFrame => Boolean(frame));
  if (ordered.length === 0) throw new Error("No frames to export");

  const width = action.cell.width;
  const height = action.cell.height;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas context unavailable");

  const pngFrames: ParsedPng[] = [];
  for (const frame of ordered) {
    const image = await loadImage(frame.dataUrl);
    context.clearRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    const pngBlob = await canvasToBlob(canvas, "image/png");
    pngFrames.push(parsePng(new Uint8Array(await pngBlob.arrayBuffer())));
  }

  const first = pngFrames[0];
  const chunks: Uint8Array[] = [PNG_SIGNATURE, makePngChunk("IHDR", first.ihdr)];
  const animationControl = new Uint8Array(8);
  writeUint32BigEndian(animationControl, 0, ordered.length);
  writeUint32BigEndian(animationControl, 4, options.forceLoop || action.loop ? 0 : 1);
  chunks.push(makePngChunk("acTL", animationControl));
  chunks.push(...first.beforeIdat.map((chunk) => makePngChunk(chunk.type, chunk.data)));

  const delayMs = Math.max(20, Math.round(1000 / Math.max(1, action.fps)));
  let sequence = 0;
  pngFrames.forEach((frame, index) => {
    chunks.push(makePngChunk("fcTL", makeFrameControlPayload(sequence++, width, height, delayMs)));
    if (index === 0) {
      chunks.push(...frame.idat.map((data) => makePngChunk("IDAT", data)));
      return;
    }
    for (const data of frame.idat) {
      const payload = new Uint8Array(4 + data.length);
      writeUint32BigEndian(payload, 0, sequence++);
      payload.set(data, 4);
      chunks.push(makePngChunk("fdAT", payload));
    }
  });
  chunks.push(...first.afterIdat.map((chunk) => makePngChunk(chunk.type, chunk.data)));
  chunks.push(makePngChunk("IEND", new Uint8Array()));

  const bytes = concatBytes(chunks);
  const arrayBuffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(arrayBuffer).set(bytes);
  return new Blob([arrayBuffer], { type: "image/apng" });
}

export async function exportApng(frames: SpriteFrame[], action: SpriteAction) {
  const blob = await createApngBlob(frames, action);
  downloadBlob(blob, `${action.name}.apng`);
}

export async function createAnimatedWebpBlob(frames: SpriteFrame[], action: SpriteAction) {
  const ordered = resolvePlaybackFrameIds(action)
    .map((frameId) => frames.find((frame) => frame.id === frameId))
    .filter((frame): frame is SpriteFrame => Boolean(frame));
  if (ordered.length === 0) throw new Error("No frames to export");

  const width = action.cell.width;
  const height = action.cell.height;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas context unavailable");

  const frameChunks: Uint8Array[] = [];
  const delay = Math.max(20, Math.round(1000 / Math.max(1, action.fps)));

  for (const frame of ordered) {
    const image = await loadImage(frame.dataUrl);
    context.clearRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    const webpBlob = await canvasToBlob(canvas, "image/webp");
    const frameData = extractWebpFrameChunks(new Uint8Array(await webpBlob.arrayBuffer()));
    const frameHeader = new Uint8Array(16);
    writeUint24(frameHeader, 0, 0);
    writeUint24(frameHeader, 3, 0);
    writeUint24(frameHeader, 6, width - 1);
    writeUint24(frameHeader, 9, height - 1);
    writeUint24(frameHeader, 12, delay);
    frameHeader[15] = 0x03;
    frameChunks.push(makeChunk("ANMF", concatBytes([frameHeader, ...frameData])));
  }

  const vp8xPayload = new Uint8Array(10);
  vp8xPayload[0] = 0x12;
  writeUint24(vp8xPayload, 4, width - 1);
  writeUint24(vp8xPayload, 7, height - 1);

  const animPayload = new Uint8Array(6);
  const animView = new DataView(animPayload.buffer);
  animView.setUint32(0, 0, true);
  animView.setUint16(4, action.loop ? 0 : 1, true);

  return makeWebpRiff([makeChunk("VP8X", vp8xPayload), makeChunk("ANIM", animPayload), ...frameChunks]);
}

export async function exportWebP(frames: SpriteFrame[], action: SpriteAction) {
  const blob = await createAnimatedWebpBlob(frames, action);
  downloadBlob(blob, `${action.name}.webp`);
}

export function exportMetadata(spriteName: string, actions: SpriteAction[], frames: SpriteFrame[]) {
  const metadata = buildSpriteMetadata(spriteName, actions, frames);
  const blob = new Blob([JSON.stringify(metadata, null, 2)], { type: "application/json" });
  downloadBlob(blob, `${spriteName}.sprite.json`);
}

export function exportEffectMetadata(metadata: EffectAnimationMetadata, filenameBase = metadata.name) {
  const blob = new Blob([JSON.stringify(metadata, null, 2)], { type: "application/json" });
  downloadBlob(blob, `${safePackBaseName(filenameBase)}.effect.json`);
}

export async function createAnimationPackZip(input: AnimationPackExportInput) {
  const zip = new JSZip();
  const manifest = normalizePackManifestFiles(input.manifest);
  zip.file("manifest.json", JSON.stringify(manifest, null, 2));
  zip.file(manifest.files.sheet, await sourceToZipData(input.sheet));

  if (input.previewGif && manifest.files.previewGif) {
    zip.file(manifest.files.previewGif, await sourceToZipData(input.previewGif));
  }
  if (input.previewWebp && manifest.files.previewWebp) {
    zip.file(manifest.files.previewWebp, await sourceToZipData(input.previewWebp));
  }
  if (input.previewApng && manifest.files.previewApng) {
    zip.file(manifest.files.previewApng, await sourceToZipData(input.previewApng));
  }
  if (input.directionPreviews && manifest.files.directionPreviews) {
    for (const preview of input.directionPreviews) {
      const fileSet = manifest.files.directionPreviews.find((item) => item.direction === preview.direction);
      if (!fileSet) continue;
      if (preview.gif && fileSet.gif) zip.file(fileSet.gif, await sourceToZipData(preview.gif));
      if (preview.webp && fileSet.webp) zip.file(fileSet.webp, await sourceToZipData(preview.webp));
      if (preview.apng && fileSet.apng) zip.file(fileSet.apng, await sourceToZipData(preview.apng));
    }
  }
  if (manifest.files.metadata) {
    zip.file(
      manifest.files.metadata,
      JSON.stringify(input.metadata ?? buildAnimationPackMetadata(manifest), null, 2)
    );
  }
  if (input.frames) {
    for (let index = 0; index < input.frames.length; index += 1) {
      const frame = input.frames[index];
      zip.file(`frames/frame-${String(index + 1).padStart(3, "0")}.png`, await sourceToZipData(frame.dataUrl));
    }
  }

  return zip.generateAsync({ type: "blob" });
}

export async function exportAnimationPack(input: AnimationPackExportInput) {
  const blob = await createAnimationPackZip(input);
  downloadBlob(blob, `${safePackBaseName(input.manifest.title)}.image-cockpit-animation.zip`);
}

export async function createEffectPackZip(input: EffectPackExportInput) {
  const zip = new JSZip();
  const metadata = normalizeEffectMetadataFiles(input.metadata);
  zip.file("effect.json", JSON.stringify(metadata, null, 2));
  zip.file("sheet.png", await sourceToZipData(input.sheet));

  if (input.previewGif) {
    zip.file("preview.gif", await sourceToZipData(input.previewGif));
  }
  if (input.previewApng) {
    zip.file("preview.apng", await sourceToZipData(input.previewApng));
  }
  if (input.frames) {
    for (let index = 0; index < input.frames.length; index += 1) {
      const frame = input.frames[index];
      const safeFrameName = frame.name.replace(/\.[^.]+$/, "").replace(/[^a-z0-9._-]+/gi, "-");
      zip.file(`frames/${safeFrameName || `frame-${String(index + 1).padStart(3, "0")}`}.png`, await sourceToZipData(frame.dataUrl));
    }
  }

  return zip.generateAsync({ type: "blob" });
}

export async function exportEffectPack(input: EffectPackExportInput) {
  const blob = await createEffectPackZip(input);
  downloadBlob(blob, `${safePackBaseName(input.metadata.name)}.image-cockpit-effect.zip`);
}

function normalizePackManifestFiles(manifest: AnimationPackManifest): AnimationPackManifest {
  return {
    ...manifest,
    files: {
      sheet: manifest.files.sheet || "sheet.png",
      previewGif: manifest.files.previewGif || "preview.gif",
      previewWebp: manifest.files.previewWebp || "preview.webp",
      previewApng: manifest.files.previewApng || "preview.apng",
      directionPreviews: manifest.files.directionPreviews,
      metadata: manifest.files.metadata || "metadata.json"
    }
  };
}

function normalizeEffectMetadataFiles(metadata: EffectAnimationMetadata): EffectAnimationMetadata {
  return {
    ...metadata,
    artifacts: {
      sheet: metadata.artifacts?.sheet || "sheet.png",
      previewGif: metadata.artifacts?.previewGif || "preview.gif",
      previewApng: metadata.artifacts?.previewApng || "preview.apng",
      metadata: metadata.artifacts?.metadata || "effect.json",
      frames: metadata.artifacts?.frames || Array.from({ length: metadata.frameCount }, (_, index) => {
        return `frames/frame-${String(index + 1).padStart(3, "0")}.png`;
      })
    }
  };
}

async function sourceToZipData(source: Blob | string) {
  const blob = source instanceof Blob ? source : dataUrlToBlob(source);
  return blob.arrayBuffer();
}

function safePackBaseName(title: string) {
  const normalized = title
    .trim()
    .toLowerCase()
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "image-cockpit-animation";
}

function buildAnimationPackMetadata(manifest: AnimationPackManifest) {
  return {
    title: manifest.title,
    action: manifest.action,
    exportedAt: new Date().toISOString(),
    createdWith: manifest.createdWith,
    grid: manifest.grid,
    cell: manifest.cell,
    directions: manifest.directions,
    framesPerDirection: manifest.framesPerDirection,
    playback: manifest.playback ?? "normal",
    tags: manifest.tags ?? [],
    license: manifest.license ?? "",
    sourceNote: manifest.sourceNote ?? ""
  };
}

interface ParsedPng {
  ihdr: Uint8Array;
  beforeIdat: Array<{ type: string; data: Uint8Array }>;
  idat: Uint8Array[];
  afterIdat: Array<{ type: string; data: Uint8Array }>;
}

const PNG_SIGNATURE = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
let pngCrcTable: Uint32Array | undefined;

function parsePng(bytes: Uint8Array): ParsedPng {
  if (bytes.length < PNG_SIGNATURE.length || !PNG_SIGNATURE.every((value, index) => bytes[index] === value)) {
    throw new Error("Canvas did not return a PNG image.");
  }

  let ihdr: Uint8Array | undefined;
  const beforeIdat: ParsedPng["beforeIdat"] = [];
  const idat: Uint8Array[] = [];
  const afterIdat: ParsedPng["afterIdat"] = [];
  let seenIdat = false;

  for (let offset = PNG_SIGNATURE.length; offset + 12 <= bytes.length;) {
    const length = readUint32BigEndian(bytes, offset);
    const type = readFourCc(bytes, offset + 4);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    const nextOffset = dataEnd + 4;
    if (nextOffset > bytes.length) throw new Error("PNG chunk length is invalid.");
    const data = bytes.slice(dataStart, dataEnd);
    offset = nextOffset;

    if (type === "IHDR") {
      ihdr = data;
      continue;
    }
    if (type === "IDAT") {
      seenIdat = true;
      idat.push(data);
      continue;
    }
    if (type === "IEND") break;
    if (type === "acTL" || type === "fcTL" || type === "fdAT") continue;
    if (seenIdat) {
      afterIdat.push({ type, data });
    } else {
      beforeIdat.push({ type, data });
    }
  }

  if (!ihdr || idat.length === 0) throw new Error("PNG output did not contain IHDR/IDAT chunks.");
  return { ihdr, beforeIdat, idat, afterIdat };
}

function makeFrameControlPayload(sequence: number, width: number, height: number, delayMs: number) {
  const payload = new Uint8Array(26);
  writeUint32BigEndian(payload, 0, sequence);
  writeUint32BigEndian(payload, 4, width);
  writeUint32BigEndian(payload, 8, height);
  writeUint32BigEndian(payload, 12, 0);
  writeUint32BigEndian(payload, 16, 0);
  writeUint16BigEndian(payload, 20, Math.min(65535, delayMs));
  writeUint16BigEndian(payload, 22, 1000);
  payload[24] = 0;
  payload[25] = 0;
  return payload;
}

function makePngChunk(type: string, payload: Uint8Array) {
  const chunkType = asciiBytes(type);
  const bytes = new Uint8Array(12 + payload.length);
  writeUint32BigEndian(bytes, 0, payload.length);
  bytes.set(chunkType, 4);
  bytes.set(payload, 8);
  writeUint32BigEndian(bytes, 8 + payload.length, crc32(concatBytes([chunkType, payload])));
  return bytes;
}

function crc32(bytes: Uint8Array) {
  const table = pngCrcTable ?? buildPngCrcTable();
  pngCrcTable = table;
  let crc = 0xffffffff;
  for (const byte of bytes) crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function buildPngCrcTable() {
  const table = new Uint32Array(256);
  for (let index = 0; index < table.length; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
}

function extractWebpFrameChunks(bytes: Uint8Array) {
  if (readFourCc(bytes, 0) !== "RIFF" || readFourCc(bytes, 8) !== "WEBP") {
    throw new Error("Canvas did not return a WebP RIFF image.");
  }

  const chunks: Uint8Array[] = [];
  let hasBitstream = false;
  for (let offset = 12; offset + 8 <= bytes.length;) {
    const type = readFourCc(bytes, offset);
    const size = readUint32(bytes, offset + 4);
    const end = offset + 8 + size + (size % 2);
    if (end > bytes.length) break;
    if (type === "ALPH" || type === "VP8 " || type === "VP8L") {
      chunks.push(bytes.slice(offset, end));
      if (type === "VP8 " || type === "VP8L") hasBitstream = true;
    }
    offset = end;
  }

  if (!hasBitstream) throw new Error("Canvas WebP output did not contain a VP8/VP8L bitstream.");
  return chunks;
}

function makeWebpRiff(chunks: Uint8Array[]) {
  const payload = concatBytes([asciiBytes("WEBP"), ...chunks]);
  const bytes = new Uint8Array(8 + payload.length);
  bytes.set(asciiBytes("RIFF"), 0);
  new DataView(bytes.buffer).setUint32(4, payload.length, true);
  bytes.set(payload, 8);
  const arrayBuffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(arrayBuffer).set(bytes);
  return new Blob([arrayBuffer], { type: "image/webp" });
}

function makeChunk(fourCc: string, payload: Uint8Array) {
  const bytes = new Uint8Array(8 + payload.length + (payload.length % 2));
  bytes.set(asciiBytes(fourCc), 0);
  new DataView(bytes.buffer).setUint32(4, payload.length, true);
  bytes.set(payload, 8);
  return bytes;
}

function concatBytes(parts: Uint8Array[]) {
  const length = parts.reduce((total, part) => total + part.length, 0);
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.length;
  }
  return bytes;
}

function asciiBytes(value: string) {
  const bytes = new Uint8Array(value.length);
  for (let index = 0; index < value.length; index += 1) bytes[index] = value.charCodeAt(index);
  return bytes;
}

function readFourCc(bytes: Uint8Array, offset: number) {
  return String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]);
}

function readUint32(bytes: Uint8Array, offset: number) {
  return new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getUint32(0, true);
}

function readUint32BigEndian(bytes: Uint8Array, offset: number) {
  return new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getUint32(0, false);
}

function writeUint32BigEndian(bytes: Uint8Array, offset: number, value: number) {
  new DataView(bytes.buffer, bytes.byteOffset + offset, 4).setUint32(0, value >>> 0, false);
}

function writeUint16BigEndian(bytes: Uint8Array, offset: number, value: number) {
  new DataView(bytes.buffer, bytes.byteOffset + offset, 2).setUint16(0, Math.max(0, Math.floor(value)), false);
}

function writeUint24(bytes: Uint8Array, offset: number, value: number) {
  const safeValue = Math.max(0, Math.floor(value));
  bytes[offset] = safeValue & 0xff;
  bytes[offset + 1] = (safeValue >> 8) & 0xff;
  bytes[offset + 2] = (safeValue >> 16) & 0xff;
}
