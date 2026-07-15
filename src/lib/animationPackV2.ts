import JSZip from "jszip";
import type {
  AnimationPackManifest,
  AnimationPackV2,
  AnimationPackV2DirectionOverride,
  AnimationPackV2Event,
  AnimationPackV2LoopMode,
  AnimationPackV2Rect,
  AnimationQualityReportV2,
  GridSettings,
  MotionRecipeMetadata
} from "../types";
import { dataUrlToBlob, downloadBlob } from "./image";

export const ANIMATION_PACK_V2_SCHEMA = "image-cockpit.animation.v2" as const;

export interface CreateAnimationPackV2Input {
  title: string;
  actionId: string;
  directions: string[];
  framesPerDirection: number;
  defaultFps: number;
  loopMode: AnimationPackV2LoopMode;
  grid: GridSettings;
  cell: { width: number; height: number };
  motionRecipe?: MotionRecipeMetadata;
  sourceFingerprint?: string;
  generationProfile?: "fast" | "balanced" | "best";
  quality?: AnimationQualityReportV2;
  sourceName?: string;
  sourceJobId?: string;
  createdAt?: string;
}

export interface AnimationPackV2EngineExport {
  filename: string;
  mediaType: "application/json";
  data: Record<string, unknown>;
}

export function createAnimationPackV2(input: CreateAnimationPackV2Input): AnimationPackV2 {
  const frameCount = positiveInteger(input.framesPerDirection, "framesPerDirection");
  const fps = positiveNumber(input.defaultFps, "defaultFps");
  const directions = uniqueStrings(input.directions, "directions");
  const frameDuration = Math.max(1, Math.round(1000 / fps));
  const recipeId = input.motionRecipe?.id ?? input.actionId;
  const recipeVersion = input.motionRecipe?.version ?? 1;
  const compilerVersion = input.motionRecipe?.compilerVersion ?? "legacy";
  const frames = directions.flatMap((direction, directionIndex) =>
    Array.from({ length: frameCount }, (_, sourceFrameIndex) => ({
      id: `${slug(direction)}-${String(sourceFrameIndex).padStart(3, "0")}`,
      direction,
      sourceFrameIndex,
      sheetRect: {
        x: sourceFrameIndex * input.cell.width,
        y: directionIndex * input.cell.height,
        width: input.cell.width,
        height: input.cell.height
      },
      fileRef: `frames/${slug(direction)}-${String(sourceFrameIndex).padStart(3, "0")}.png`
    }))
  );
  const qualityWarnings = input.quality?.dimensionWarnings.length ?? 0;
  const wouldBlock = input.quality?.shadowDecision.wouldBlock ?? false;

  return {
    schema: ANIMATION_PACK_V2_SCHEMA,
    schemaVersion: 2,
    title: input.title.trim() || input.actionId,
    kind: "user",
    actionId: input.actionId,
    recipeId,
    recipeVersion,
    compilerVersion,
    sourceFingerprint: input.sourceFingerprint?.trim() || "unknown",
    directions,
    frames,
    frameOrder: Array.from({ length: frameCount }, (_, index) => index),
    frameDurations: Array.from({ length: frameCount }, () => frameDuration),
    defaultFps: fps,
    loopMode: input.loopMode,
    events: defaultEvents(frameCount, input.loopMode),
    pivots: [{ id: "pivot-origin", name: "origin", frameIndex: 0, x: 0.5, y: 1, origin: "recipe" }],
    anchors: [{ id: "anchor-origin", name: "origin", frameIndex: 0, x: 0.5, y: 1, origin: "recipe" }],
    sockets: [],
    hitboxes: [],
    hurtboxes: [],
    trimRects: [],
    qualitySummary: {
      rank: wouldBlock ? "failed" : qualityWarnings > 0 ? "silver" : input.quality ? "gold" : "unknown",
      warningCount: qualityWarnings,
      loopSeamScore: input.quality?.loopSeamScore ?? null,
      identityScore: input.quality?.identityScore ?? null
    },
    generationProfile: input.generationProfile ?? "unknown",
    provenance: {
      createdAt: input.createdAt ?? new Date().toISOString(),
      createdWith: "Image Cockpit for Codex Workflows",
      sourceName: input.sourceName,
      sourceJobId: input.sourceJobId
    },
    grid: { ...input.grid },
    cell: { ...input.cell },
    files: defaultPackFiles()
  };
}

export function validateAnimationPackV2(value: unknown): AnimationPackV2 {
  const pack = record(value, "Animation Pack v2 manifest");
  if (pack.schema !== ANIMATION_PACK_V2_SCHEMA || pack.schemaVersion !== 2) {
    throw new Error(`Unsupported animation pack schema: ${String(pack.schema ?? "missing")}.`);
  }
  requiredString(pack.title, "title");
  requiredString(pack.actionId, "actionId");
  requiredString(pack.recipeId, "recipeId");
  positiveInteger(pack.recipeVersion, "recipeVersion");
  requiredString(pack.compilerVersion, "compilerVersion");
  requiredString(pack.sourceFingerprint, "sourceFingerprint");
  const directions = uniqueStrings(pack.directions, "directions");
  const frames = array(pack.frames, "frames");
  if (frames.length === 0) throw new Error("Animation Pack v2 frames must not be empty.");
  frames.forEach((frame, index) => validateFrame(frame, directions, index));
  const frameOrder = integerArray(pack.frameOrder, "frameOrder");
  const frameDurations = positiveNumberArray(pack.frameDurations, "frameDurations");
  if (frameOrder.length !== frameDurations.length || frameOrder.length === 0) {
    throw new Error("Animation Pack v2 frameOrder and frameDurations must have the same non-zero length.");
  }
  const sourceIndexes = new Set(frames.map((frame) => Number(record(frame, "frame").sourceFrameIndex)));
  frameOrder.forEach((sourceIndex) => {
    if (!sourceIndexes.has(sourceIndex)) throw new Error(`Animation Pack v2 frameOrder references missing frame ${sourceIndex}.`);
  });
  positiveNumber(pack.defaultFps, "defaultFps");
  loopMode(pack.loopMode);
  eventArray(pack.events, "events", frameOrder.length, directions);
  pointArray(pack.pivots, "pivots", frameOrder.length, directions);
  pointArray(pack.anchors, "anchors", frameOrder.length, directions);
  pointArray(pack.sockets, "sockets", frameOrder.length, directions);
  rectArray(pack.hitboxes, "hitboxes", frameOrder.length, directions);
  rectArray(pack.hurtboxes, "hurtboxes", frameOrder.length, directions);
  rectArray(pack.trimRects, "trimRects", frameOrder.length, directions);
  validateDirectionOverrides(pack.directionOverrides, directions);
  record(pack.qualitySummary, "qualitySummary");
  if (!["fast", "balanced", "best", "unknown"].includes(String(pack.generationProfile))) {
    throw new Error("Animation Pack v2 generationProfile is invalid.");
  }
  record(pack.provenance, "provenance");
  validateGrid(pack.grid);
  validateCell(pack.cell);
  validateFiles(pack.files);
  return JSON.parse(JSON.stringify(pack)) as AnimationPackV2;
}

export function serializeAnimationPackV2(pack: AnimationPackV2) {
  return JSON.stringify(validateAnimationPackV2(pack), null, 2);
}

export function parseAnimationPack(value: string | unknown, migration?: { defaultFps?: number; loopMode?: AnimationPackV2LoopMode }) {
  const parsed: unknown = typeof value === "string" ? JSON.parse(value) : value;
  if (!parsed || typeof parsed !== "object") throw new Error("Animation pack manifest must be a JSON object.");
  const schema = (parsed as { schema?: unknown }).schema;
  if (schema === ANIMATION_PACK_V2_SCHEMA) return validateAnimationPackV2(parsed);
  if (schema === "image-cockpit.animation.v1") return migrateAnimationPackV1(parsed as AnimationPackManifest, migration);
  throw new Error(`Unsupported animation pack schema: ${String(schema ?? "missing")}.`);
}

export function migrateAnimationPackV1(
  manifest: AnimationPackManifest,
  options: { defaultFps?: number; loopMode?: AnimationPackV2LoopMode } = {}
): AnimationPackV2 {
  if (manifest.schema !== "image-cockpit.animation.v1") throw new Error("Animation Pack v1 migration requires a v1 manifest.");
  const fps = options.defaultFps ?? 12;
  const pack = createAnimationPackV2({
    title: manifest.title,
    actionId: manifest.action,
    directions: manifest.directions,
    framesPerDirection: manifest.framesPerDirection,
    defaultFps: fps,
    loopMode: options.loopMode ?? (manifest.playback === "ping-pong-reverse" ? "ping-pong" : inferLegacyLoopMode(manifest.action)),
    grid: manifest.grid,
    cell: manifest.cell,
    motionRecipe: manifest.motionRecipe,
    sourceName: manifest.sourceNote,
    createdAt: manifest.createdAt
  });
  pack.kind = manifest.kind;
  pack.provenance.createdWith = manifest.createdWith;
  pack.provenance.migratedFrom = "image-cockpit.animation.v1";
  pack.files.sheet = manifest.files.sheet;
  return validateAnimationPackV2(pack);
}

export function packV2ToLegacyManifest(pack: AnimationPackV2): AnimationPackManifest {
  const valid = validateAnimationPackV2(pack);
  return {
    schema: "image-cockpit.animation.v1",
    title: valid.title,
    kind: valid.kind,
    action: valid.actionId,
    directions: valid.directions,
    grid: valid.grid,
    cell: valid.cell,
    framesPerDirection: new Set(valid.frameOrder).size,
    playback: valid.loopMode === "ping-pong" ? "ping-pong-reverse" : "normal",
    createdAt: valid.provenance.createdAt,
    createdWith: valid.provenance.createdWith,
    motionRecipe: {
      id: valid.recipeId,
      version: valid.recipeVersion,
      compilerVersion: valid.compilerVersion,
      qualityProfile: "grounded-soft"
    },
    files: { sheet: valid.files.sheet, metadata: valid.files.metadata }
  };
}

export function setAnimationFrameDuration(pack: AnimationPackV2, frameIndex: number, durationMs: number) {
  assertTimelineIndex(pack, frameIndex);
  if (!Number.isFinite(durationMs)) throw new Error("Animation frame duration must be a finite number.");
  const next = clone(pack);
  next.frameDurations[frameIndex] = Math.max(1, Math.round(durationMs));
  return validateAnimationPackV2(next);
}

export function holdAnimationFrame(pack: AnimationPackV2, frameIndex: number, additionalMs: number) {
  assertTimelineIndex(pack, frameIndex);
  return setAnimationFrameDuration(pack, frameIndex, pack.frameDurations[frameIndex] + additionalMs);
}

export function duplicateAnimationFrame(pack: AnimationPackV2, frameIndex: number) {
  assertTimelineIndex(pack, frameIndex);
  const next = clone(pack);
  next.frameOrder.splice(frameIndex + 1, 0, next.frameOrder[frameIndex]);
  next.frameDurations.splice(frameIndex + 1, 0, next.frameDurations[frameIndex]);
  next.events = remapIndexedItems(next.events, (index) => index > frameIndex ? index + 1 : index);
  next.pivots = remapIndexedItems(next.pivots, (index) => index > frameIndex ? index + 1 : index);
  next.anchors = remapIndexedItems(next.anchors, (index) => index > frameIndex ? index + 1 : index);
  next.sockets = remapIndexedItems(next.sockets, (index) => index > frameIndex ? index + 1 : index);
  next.hitboxes = remapIndexedItems(next.hitboxes, (index) => index > frameIndex ? index + 1 : index);
  next.hurtboxes = remapIndexedItems(next.hurtboxes, (index) => index > frameIndex ? index + 1 : index);
  next.trimRects = remapIndexedItems(next.trimRects, (index) => index > frameIndex ? index + 1 : index);
  return validateAnimationPackV2(next);
}

export function reverseAnimationTimeline(pack: AnimationPackV2) {
  const next = clone(pack);
  const length = next.frameOrder.length;
  next.frameOrder.reverse();
  next.frameDurations.reverse();
  next.events = remapIndexedItems(next.events, (index) => length - 1 - index);
  next.pivots = remapIndexedItems(next.pivots, (index) => length - 1 - index);
  next.anchors = remapIndexedItems(next.anchors, (index) => length - 1 - index);
  next.sockets = remapIndexedItems(next.sockets, (index) => length - 1 - index);
  next.hitboxes = remapIndexedItems(next.hitboxes, (index) => length - 1 - index);
  next.hurtboxes = remapIndexedItems(next.hurtboxes, (index) => length - 1 - index);
  next.trimRects = remapIndexedItems(next.trimRects, (index) => length - 1 - index);
  return validateAnimationPackV2(next);
}

export function setAnimationLoopMode(pack: AnimationPackV2, mode: AnimationPackV2LoopMode) {
  const next = clone(pack);
  next.loopMode = loopMode(mode);
  const loopPoint = next.events.find((event) => event.type === "loop-point");
  if (mode === "one-shot" && loopPoint) next.events = next.events.filter((event) => event !== loopPoint);
  if (mode !== "one-shot" && !loopPoint) {
    next.events.push({ id: "event-loop-point", type: "loop-point", name: "loop-point", frameIndex: next.frameOrder.length - 1, origin: "recipe" });
  }
  return validateAnimationPackV2(next);
}

export function moveAnimationEvent(pack: AnimationPackV2, eventId: string, frameIndex: number) {
  assertTimelineIndex(pack, frameIndex);
  const next = clone(pack);
  const event = next.events.find((candidate) => candidate.id === eventId);
  if (!event) throw new Error(`Animation event not found: ${eventId}.`);
  event.frameIndex = frameIndex;
  event.origin = "user";
  return validateAnimationPackV2(next);
}

export function resolveDirectionTimeline(pack: AnimationPackV2, direction: string) {
  if (!pack.directions.includes(direction)) throw new Error(`Animation direction not found: ${direction}.`);
  const override = pack.directionOverrides?.[direction];
  return {
    frameOrder: override?.frameOrder ?? pack.frameOrder,
    frameDurations: override?.frameDurations ?? pack.frameDurations,
    events: override?.events ?? pack.events
  };
}

export function animationPlaybackSequence(pack: AnimationPackV2) {
  const forward = Array.from({ length: pack.frameOrder.length }, (_, index) => index);
  if (pack.loopMode !== "ping-pong" || forward.length < 3) return forward;
  return [...forward, ...forward.slice(1, -1).reverse()];
}

export function animationDirectionSyncWarnings(pack: AnimationPackV2) {
  return pack.directions.flatMap((direction) => {
    const override = pack.directionOverrides?.[direction];
    if (!override) return [];
    const fields = [override.frameOrder && "order", override.frameDurations && "durations", override.events && "events"].filter(Boolean);
    return fields.length > 0 ? [`${direction} uses explicit direction override: ${fields.join(", ")}.`] : [];
  });
}

export function buildAnimationPackV2EngineExports(pack: AnimationPackV2): AnimationPackV2EngineExport[] {
  const valid = validateAnimationPackV2(pack);
  const atlasFrames = Object.fromEntries(valid.frames.map((frame) => [frame.id, {
    frame: frame.sheetRect,
    sourceFrameIndex: frame.sourceFrameIndex,
    direction: frame.direction,
    transparent: frame.transparent ?? false
  }]));
  const actions = Object.fromEntries(valid.directions.map((direction) => {
    const timeline = resolveDirectionTimeline(valid, direction);
    return [direction, {
      frames: timeline.frameOrder.map((index) => frameName(direction, index)),
      durations: timeline.frameDurations,
      loopMode: valid.loopMode,
      events: timeline.events
    }];
  }));
  const common = {
    image: valid.files.sheet,
    size: { width: valid.grid.columns * valid.cell.width, height: valid.grid.rows * valid.cell.height },
    frames: atlasFrames,
    actions,
    pivots: valid.pivots,
    anchors: valid.anchors,
    sockets: valid.sockets,
    hitboxes: valid.hitboxes,
    hurtboxes: valid.hurtboxes,
    trimRects: valid.trimRects
  };
  const allFrames = valid.directions.flatMap((direction) => {
    const timeline = resolveDirectionTimeline(valid, direction);
    return timeline.frameOrder.map((sourceIndex, timelineIndex) => ({
      name: frameName(direction, sourceIndex),
      direction,
      sourceIndex,
      timelineIndex,
      duration: timeline.frameDurations[timelineIndex]
    }));
  });
  return [
    engine(valid.files.engine.generic, { schema: "image-cockpit.generic-animation.v1", ...common }),
    engine(valid.files.engine.godot, {
      resourceType: "SpriteFrames",
      spriteSheet: valid.files.sheet,
      animations: valid.directions.map((direction) => {
        const timeline = resolveDirectionTimeline(valid, direction);
        return {
          name: `${valid.actionId}/${direction}`,
          loop: valid.loopMode !== "one-shot",
          speedFps: valid.defaultFps,
          frames: timeline.frameOrder.map((sourceIndex, index) => ({
            atlasFrame: frameName(direction, sourceIndex),
            durationMs: timeline.frameDurations[index]
          }))
        };
      }),
      metadata: common
    }),
    engine(valid.files.engine.phaser, {
      textureKey: slug(valid.title),
      image: valid.files.sheet,
      frames: atlasFrames,
      animations: valid.directions.map((direction) => {
        const timeline = resolveDirectionTimeline(valid, direction);
        return {
          key: `${valid.actionId}-${slug(direction)}`,
          frames: timeline.frameOrder.map((sourceIndex) => ({ key: slug(valid.title), frame: frameName(direction, sourceIndex) })),
          durations: timeline.frameDurations,
          repeat: valid.loopMode === "one-shot" ? 0 : -1,
          yoyo: valid.loopMode === "ping-pong"
        };
      }),
      metadata: common
    }),
    engine(valid.files.engine.aseprite, {
      frames: Object.fromEntries(allFrames.map((frame) => [frame.name, {
        frame: atlasFrames[frame.name as keyof typeof atlasFrames]?.frame,
        duration: frame.duration
      }])),
      meta: {
        image: valid.files.sheet,
        frameTags: valid.directions.map((direction) => ({
          name: `${valid.actionId}/${direction}`,
          frames: allFrames.filter((frame) => frame.direction === direction).map((frame) => frame.name),
          direction: valid.loopMode === "ping-pong" ? "pingpong" : "forward",
          repeat: valid.loopMode === "one-shot" ? 1 : 0
        })),
        slices: [...valid.pivots, ...valid.anchors, ...valid.sockets]
      }
    }),
    engine(valid.files.engine.unity, {
      schema: "image-cockpit.unity-common-atlas.v1",
      packageIncluded: false,
      note: "Common JSON/atlas handoff only; no Unity package is generated.",
      ...common
    })
  ];
}

export async function createAnimationPackV2Zip(pack: AnimationPackV2, sheet: Blob | string) {
  const valid = validateAnimationPackV2(pack);
  const zip = new JSZip();
  zip.file("manifest.json", serializeAnimationPackV2(valid));
  zip.file(valid.files.sheet, await toArrayBuffer(sheet));
  zip.file(valid.files.metadata, serializeAnimationPackV2(valid));
  for (const output of buildAnimationPackV2EngineExports(valid)) {
    zip.file(output.filename, JSON.stringify(output.data, null, 2));
  }
  return zip.generateAsync({ type: "blob" });
}

export async function exportAnimationPackV2(pack: AnimationPackV2, sheet: Blob | string) {
  const blob = await createAnimationPackV2Zip(pack, sheet);
  downloadBlob(blob, `${slug(pack.title) || "animation"}.image-cockpit-animation-v2.zip`);
}

export function addPackPoint(pack: AnimationPackV2, kind: "pivot" | "anchor" | "socket", frameIndex: number, name?: string) {
  assertTimelineIndex(pack, frameIndex);
  const next = clone(pack);
  const target = kind === "pivot" ? next.pivots : kind === "anchor" ? next.anchors : next.sockets;
  target.push({ id: `${kind}-${Date.now()}-${target.length}`, name: name ?? kind, frameIndex, x: 0.5, y: kind === "socket" ? 0.5 : 1, origin: "user" });
  return validateAnimationPackV2(next);
}

export function addPackRect(pack: AnimationPackV2, kind: "hitbox" | "hurtbox", frameIndex: number, name?: string) {
  assertTimelineIndex(pack, frameIndex);
  const next = clone(pack);
  const target = kind === "hitbox" ? next.hitboxes : next.hurtboxes;
  target.push({ id: `${kind}-${Date.now()}-${target.length}`, name: name ?? kind, frameIndex, x: 0.25, y: 0.25, width: 0.5, height: 0.5, origin: "user" });
  return validateAnimationPackV2(next);
}

function defaultEvents(frameCount: number, mode: AnimationPackV2LoopMode): AnimationPackV2Event[] {
  const last = frameCount - 1;
  const events: AnimationPackV2Event[] = [
    { id: "event-startup", type: "startup", name: "startup", frameIndex: 0, origin: "recipe" },
    { id: "event-active", type: "active", name: "active", frameIndex: Math.min(last, Math.max(0, Math.floor(frameCount / 3))), origin: "recipe" },
    { id: "event-impact", type: "impact", name: "impact", frameIndex: Math.min(last, Math.max(0, Math.floor(frameCount / 2))), origin: "recipe" },
    { id: "event-recovery", type: "recovery", name: "recovery", frameIndex: Math.max(0, last - 1), origin: "recipe" }
  ];
  if (mode !== "one-shot") events.push({ id: "event-loop-point", type: "loop-point", name: "loop-point", frameIndex: last, origin: "recipe" });
  return events;
}

function defaultPackFiles(): AnimationPackV2["files"] {
  return {
    sheet: "sheet.png",
    metadata: "animation.json",
    engine: {
      generic: "engine/generic.json",
      godot: "engine/godot-spriteframes.json",
      phaser: "engine/phaser.json",
      aseprite: "engine/aseprite.json",
      unity: "engine/unity-common.json"
    }
  };
}

function validateFrame(value: unknown, directions: string[], index: number) {
  const frame = record(value, `frames[${index}]`);
  requiredString(frame.id, `frames[${index}].id`);
  const direction = requiredString(frame.direction, `frames[${index}].direction`);
  if (!directions.includes(direction)) throw new Error(`Animation Pack v2 frame direction is unknown: ${direction}.`);
  nonNegativeInteger(frame.sourceFrameIndex, `frames[${index}].sourceFrameIndex`);
  rectCoordinates(frame.sheetRect, `frames[${index}].sheetRect`, false);
  if (frame.fileRef !== undefined && (!isSafePackPath(frame.fileRef) || typeof frame.fileRef !== "string")) {
    throw new Error(`Animation Pack v2 frame fileRef is unsafe: ${String(frame.fileRef)}.`);
  }
  if (frame.transparent !== undefined && typeof frame.transparent !== "boolean") throw new Error("Animation Pack v2 transparent must be boolean.");
}

function eventArray(value: unknown, label: string, frameCount: number, directions: string[]) {
  array(value, label).forEach((item, index) => {
    const event = record(item, `${label}[${index}]`);
    requiredString(event.id, `${label}[${index}].id`);
    requiredString(event.name, `${label}[${index}].name`);
    if (!["startup", "charge", "active", "impact", "recovery", "loop-point", "custom"].includes(String(event.type))) throw new Error(`${label}[${index}].type is invalid.`);
    timelineIndex(event.frameIndex, `${label}[${index}].frameIndex`, frameCount);
    origin(event.origin, `${label}[${index}].origin`);
    optionalDirection(event.direction, directions, `${label}[${index}].direction`);
  });
}

function pointArray(value: unknown, label: string, frameCount: number, directions: string[]) {
  array(value, label).forEach((item, index) => {
    const point = record(item, `${label}[${index}]`);
    requiredString(point.id, `${label}[${index}].id`);
    requiredString(point.name, `${label}[${index}].name`);
    timelineIndex(point.frameIndex, `${label}[${index}].frameIndex`, frameCount);
    normalizedNumber(point.x, `${label}[${index}].x`);
    normalizedNumber(point.y, `${label}[${index}].y`);
    origin(point.origin, `${label}[${index}].origin`);
    optionalDirection(point.direction, directions, `${label}[${index}].direction`);
  });
}

function rectArray(value: unknown, label: string, frameCount: number, directions: string[]) {
  array(value, label).forEach((item, index) => {
    const rect = record(item, `${label}[${index}]`);
    requiredString(rect.id, `${label}[${index}].id`);
    requiredString(rect.name, `${label}[${index}].name`);
    timelineIndex(rect.frameIndex, `${label}[${index}].frameIndex`, frameCount);
    rectCoordinates(rect, `${label}[${index}]`, true);
    origin(rect.origin, `${label}[${index}].origin`);
    optionalDirection(rect.direction, directions, `${label}[${index}].direction`);
  });
}

function validateDirectionOverrides(value: unknown, directions: string[]) {
  if (value === undefined) return;
  const overrides = record(value, "directionOverrides");
  Object.entries(overrides).forEach(([direction, raw]) => {
    if (!directions.includes(direction)) throw new Error(`Animation Pack v2 direction override is unknown: ${direction}.`);
    const override = record(raw, `directionOverrides.${direction}`) as AnimationPackV2DirectionOverride;
    if (override.frameOrder !== undefined) integerArray(override.frameOrder, `directionOverrides.${direction}.frameOrder`);
    if (override.frameDurations !== undefined) positiveNumberArray(override.frameDurations, `directionOverrides.${direction}.frameDurations`);
    if (override.frameOrder && override.frameDurations && override.frameOrder.length !== override.frameDurations.length) {
      throw new Error(`Animation Pack v2 direction override order/durations mismatch: ${direction}.`);
    }
    if (override.events !== undefined) eventArray(override.events, `directionOverrides.${direction}.events`, override.frameOrder?.length ?? Number.MAX_SAFE_INTEGER, directions);
  });
}

function validateGrid(value: unknown) {
  const grid = record(value, "grid");
  positiveInteger(grid.columns, "grid.columns");
  positiveInteger(grid.rows, "grid.rows");
  nonNegativeInteger(grid.gutter, "grid.gutter");
}

function validateCell(value: unknown) {
  const cell = record(value, "cell");
  positiveInteger(cell.width, "cell.width");
  positiveInteger(cell.height, "cell.height");
}

function validateFiles(value: unknown) {
  const files = record(value, "files");
  [files.sheet, files.metadata].forEach((path) => {
    if (typeof path !== "string" || !isSafePackPath(path)) throw new Error(`Animation Pack v2 file path is unsafe: ${String(path)}.`);
  });
  const engineFiles = record(files.engine, "files.engine");
  ["generic", "godot", "phaser", "aseprite", "unity"].forEach((key) => {
    const path = engineFiles[key];
    if (typeof path !== "string" || !isSafePackPath(path)) throw new Error(`Animation Pack v2 engine file path is unsafe: ${String(path)}.`);
  });
}

function isSafePackPath(path: unknown): path is string {
  if (typeof path !== "string" || path.length === 0 || path.length > 180 || path.includes("\\") || path.startsWith("/") || /^[a-z]:/i.test(path)) return false;
  return path.split("/").every((part) => part.length > 0 && part !== "." && part !== "..");
}

function inferLegacyLoopMode(action: string): AnimationPackV2LoopMode {
  return /idle|walk|run|talk|loop|victory/i.test(action) ? "loop" : "one-shot";
}

function engine(filename: string, data: Record<string, unknown>): AnimationPackV2EngineExport {
  return { filename, mediaType: "application/json", data };
}

function frameName(direction: string, sourceIndex: number) {
  return `${slug(direction)}-${String(sourceIndex).padStart(3, "0")}`;
}

function slug(value: string) {
  const normalized = value.normalize("NFKD").toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return normalized || "animation";
}

async function toArrayBuffer(value: Blob | string) {
  const blob = value instanceof Blob ? value : dataUrlToBlob(value);
  return blob.arrayBuffer();
}

function clone(pack: AnimationPackV2) {
  return JSON.parse(JSON.stringify(pack)) as AnimationPackV2;
}

function remapIndexedItems<T extends { frameIndex: number }>(items: T[], map: (index: number) => number) {
  return items.map((item) => ({ ...item, frameIndex: map(item.frameIndex) }));
}

function assertTimelineIndex(pack: AnimationPackV2, index: number) {
  timelineIndex(index, "frameIndex", pack.frameOrder.length);
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be a JSON object.`);
  return value as Record<string, unknown>;
}

function array(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`Animation Pack v2 ${label} must be an array.`);
  return value;
}

function requiredString(value: unknown, label: string) {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`Animation Pack v2 ${label} must be a non-empty string.`);
  return value;
}

function uniqueStrings(value: unknown, label: string) {
  const values = array(value, label).map((item) => requiredString(item, label));
  if (values.length === 0 || new Set(values).size !== values.length) throw new Error(`Animation Pack v2 ${label} must contain unique values.`);
  return values;
}

function positiveInteger(value: unknown, label: string) {
  if (!Number.isInteger(value) || Number(value) <= 0) throw new Error(`Animation Pack v2 ${label} must be a positive integer.`);
  return Number(value);
}

function nonNegativeInteger(value: unknown, label: string) {
  if (!Number.isInteger(value) || Number(value) < 0) throw new Error(`Animation Pack v2 ${label} must be a non-negative integer.`);
  return Number(value);
}

function positiveNumber(value: unknown, label: string) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) throw new Error(`Animation Pack v2 ${label} must be positive.`);
  return value;
}

function normalizedNumber(value: unknown, label: string) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) throw new Error(`Animation Pack v2 ${label} must be between 0 and 1.`);
}

function integerArray(value: unknown, label: string) {
  return array(value, label).map((item, index) => nonNegativeInteger(item, `${label}[${index}]`));
}

function positiveNumberArray(value: unknown, label: string) {
  return array(value, label).map((item, index) => positiveNumber(item, `${label}[${index}]`));
}

function timelineIndex(value: unknown, label: string, frameCount: number) {
  const index = nonNegativeInteger(value, label);
  if (index >= frameCount) throw new Error(`Animation Pack v2 ${label} is outside the timeline.`);
  return index;
}

function loopMode(value: unknown): AnimationPackV2LoopMode {
  if (value !== "loop" && value !== "one-shot" && value !== "ping-pong") throw new Error("Animation Pack v2 loopMode is invalid.");
  return value;
}

function origin(value: unknown, label: string) {
  if (value !== "recipe" && value !== "user") throw new Error(`Animation Pack v2 ${label} must be recipe or user.`);
}

function optionalDirection(value: unknown, directions: string[], label: string) {
  if (value !== undefined && (typeof value !== "string" || !directions.includes(value))) throw new Error(`Animation Pack v2 ${label} is unknown.`);
}

function rectCoordinates(value: unknown, label: string, normalized: boolean) {
  const rect = record(value, label);
  if (normalized) {
    normalizedNumber(rect.x, `${label}.x`);
    normalizedNumber(rect.y, `${label}.y`);
    normalizedNumber(rect.width, `${label}.width`);
    normalizedNumber(rect.height, `${label}.height`);
  } else {
    nonNegativeInteger(rect.x, `${label}.x`);
    nonNegativeInteger(rect.y, `${label}.y`);
    positiveInteger(rect.width, `${label}.width`);
    positiveInteger(rect.height, `${label}.height`);
  }
}
