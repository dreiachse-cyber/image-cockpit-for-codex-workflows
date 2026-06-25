import JSZip from "jszip";
import type { AnimationLibraryItem, AnimationPackManifest } from "../types";
import { createId } from "./image";

export const ANIMATION_PACK_SCHEMA = "image-cockpit.animation.v1";
const MAX_PACK_SIZE_BYTES = 30 * 1024 * 1024;
const MAX_EMBEDDED_FILE_SIZE_BYTES = 12 * 1024 * 1024;

export async function importAnimationPackBlob(blob: Blob, fileName = "animation-pack.zip"): Promise<AnimationLibraryItem> {
  if (blob.size > MAX_PACK_SIZE_BYTES) {
    throw new Error("Animation pack is too large.");
  }

  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  assertZipPathsSafe(zip);
  const manifestEntry = zip.file("manifest.json");
  if (!manifestEntry) throw new Error("Animation pack is missing manifest.json.");

  const manifest = validateAnimationPackManifest(JSON.parse(await manifestEntry.async("string")));
  const sheetEntry = zip.file(manifest.files.sheet);
  if (!sheetEntry) throw new Error("Animation pack is missing its sheet image.");

  const sheetDataUrl = await zipEntryToDataUrl(sheetEntry, "image/png");
  const previewEntry = manifest.files.previewGif ? zip.file(manifest.files.previewGif) : null;
  const previewWebpEntry = manifest.files.previewWebp ? zip.file(manifest.files.previewWebp) : null;
  const importedAt = new Date().toISOString();
  const userManifest: AnimationPackManifest = {
    ...manifest,
    kind: "user",
    title: manifest.title.trim() || fileName.replace(/\.[^.]+$/, "") || "Imported Animation"
  };

  return {
    id: createId("animlib"),
    kind: "user",
    title: userManifest.title,
    action: userManifest.action,
    manifest: userManifest,
    previewDataUrl: previewEntry ? await zipEntryToDataUrl(previewEntry, "image/gif") : undefined,
    previewWebpDataUrl: previewWebpEntry ? await zipEntryToDataUrl(previewWebpEntry, "image/webp") : undefined,
    sheetDataUrl,
    importedAt,
    updatedAt: importedAt
  };
}

export function validateAnimationPackManifest(value: unknown): AnimationPackManifest {
  if (!isRecord(value)) throw new Error("Animation pack manifest must be a JSON object.");
  if (value.schema !== ANIMATION_PACK_SCHEMA) throw new Error("Unsupported animation pack schema.");
  if (value.kind !== "official" && value.kind !== "user") throw new Error("Animation pack kind is invalid.");

  const title = readRequiredString(value, "title");
  const action = readRequiredString(value, "action");
  const createdAt = readRequiredString(value, "createdAt");
  const createdWith = readRequiredString(value, "createdWith");
  const directions = readStringArray(value.directions, "directions");
  const grid = readGrid(value.grid);
  const cell = readCell(value.cell);
  const framesPerDirection = readPositiveInteger(value.framesPerDirection, "framesPerDirection");
  const playback = value.playback === "ping-pong-reverse" ? "ping-pong-reverse" : "normal";
  const files = readFiles(value.files);

  return {
    schema: ANIMATION_PACK_SCHEMA,
    title,
    kind: value.kind,
    action,
    directions,
    grid,
    cell,
    framesPerDirection,
    playback,
    createdAt,
    createdWith,
    license: readOptionalString(value.license),
    sourceNote: readOptionalString(value.sourceNote),
    promptSummary: readOptionalString(value.promptSummary),
    tags: Array.isArray(value.tags) ? value.tags.filter((tag): tag is string => typeof tag === "string").slice(0, 20) : [],
    files
  };
}

export function isSafeAnimationPackPath(path: string) {
  if (!path || path.length > 180) return false;
  if (/[\x00-\x1f]/.test(path)) return false;
  if (path.includes("\\")) return false;
  if (path.startsWith("/") || path.startsWith("~")) return false;
  if (/^[a-z]:/i.test(path)) return false;
  const parts = path.split("/");
  return parts.every((part) => part.length > 0 && part !== "." && part !== "..");
}

function assertZipPathsSafe(zip: JSZip) {
  for (const path of Object.keys(zip.files)) {
    const normalized = path.replace(/\/$/, "");
    if (normalized && !isSafeAnimationPackPath(normalized)) {
      throw new Error(`Animation pack contains an unsafe path: ${path}`);
    }
  }
}

function readFiles(value: unknown): AnimationPackManifest["files"] {
  if (!isRecord(value)) throw new Error("Animation pack files must be a JSON object.");
  const sheet = readRequiredString(value, "sheet");
  const previewGif = readOptionalString(value.previewGif);
  const previewWebp = readOptionalString(value.previewWebp);
  const metadata = readOptionalString(value.metadata);
  [sheet, previewGif, previewWebp, metadata].filter((path): path is string => Boolean(path)).forEach((path) => {
    if (!isSafeAnimationPackPath(path)) throw new Error(`Animation pack file path is unsafe: ${path}`);
  });
  return { sheet, previewGif, previewWebp, metadata };
}

function readGrid(value: unknown) {
  if (!isRecord(value)) throw new Error("Animation pack grid is invalid.");
  return {
    columns: readPositiveInteger(value.columns, "grid.columns"),
    rows: readPositiveInteger(value.rows, "grid.rows"),
    gutter: typeof value.gutter === "number" ? Math.max(0, Math.floor(value.gutter)) : 0
  };
}

function readCell(value: unknown) {
  if (!isRecord(value)) throw new Error("Animation pack cell is invalid.");
  return {
    width: readPositiveInteger(value.width, "cell.width"),
    height: readPositiveInteger(value.height, "cell.height")
  };
}

function readStringArray(value: unknown, field: string) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`Animation pack ${field} must be a string array.`);
  }
  return value.slice(0, 20);
}

function readRequiredString(value: Record<string, unknown>, field: string) {
  const text = value[field];
  if (typeof text !== "string" || text.trim().length === 0) {
    throw new Error(`Animation pack ${field} is required.`);
  }
  return text.trim();
}

function readOptionalString(value: unknown) {
  return typeof value === "string" ? value.trim() : undefined;
}

function readPositiveInteger(value: unknown, field: string) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error(`Animation pack ${field} must be a positive number.`);
  }
  return Math.floor(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

async function zipEntryToDataUrl(entry: JSZip.JSZipObject, fallbackMime: string) {
  const blob = await entry.async("blob");
  if (blob.size > MAX_EMBEDDED_FILE_SIZE_BYTES) {
    throw new Error(`Animation pack file is too large: ${entry.name}`);
  }
  return blobToDataUrl(blob.type ? blob : new Blob([blob], { type: fallbackMime }));
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
