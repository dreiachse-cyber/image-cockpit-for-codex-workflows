import { applyPalette, GIFEncoder, quantize } from "gifenc";
import JSZip from "jszip";
import type { SpriteAction, SpriteFrame } from "../types";
import { canvasToBlob, dataUrlToBlob, downloadBlob, loadImage } from "./image";
import { buildSpriteMetadata, packSpriteSheet } from "./sprite";

export async function createSpriteSheetBlob(frames: SpriteFrame[], action: SpriteAction) {
  const ordered = action.frameIds
    .map((frameId) => frames.find((frame) => frame.id === frameId))
    .filter((frame): frame is SpriteFrame => Boolean(frame));
  const packed = packSpriteSheet(ordered, action.cell.width, action.cell.height);
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

export async function exportSpriteSheet(frames: SpriteFrame[], action: SpriteAction) {
  const blob = await createSpriteSheetBlob(frames, action);
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

export async function createGifBlob(frames: SpriteFrame[], action: SpriteAction) {
  const ordered = action.frameIds
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
      repeat: action.loop ? 0 : -1
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

export function exportMetadata(spriteName: string, actions: SpriteAction[], frames: SpriteFrame[]) {
  const metadata = buildSpriteMetadata(spriteName, actions, frames);
  const blob = new Blob([JSON.stringify(metadata, null, 2)], { type: "application/json" });
  downloadBlob(blob, `${spriteName}.sprite.json`);
}
