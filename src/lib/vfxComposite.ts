import JSZip from "jszip";
import type {
  AnimationPackV2,
  EffectAnimationMetadata,
  HistoryItem,
  SpriteAction,
  SpriteFrame
} from "../types";
import { createApngBlob, createGifBlob } from "./exporters";
import { canvasToBlob, dataUrlToBlob, loadImage } from "./image";

export const VFX_COMPOSITE_SCHEMA = "image-cockpit.vfx-composite.v1" as const;
export const VFX_COMPOSITE_SOCKETS = ["hand", "weapon-tip", "feet", "body-center", "projectile-origin", "impact-point"] as const;
export const VFX_COMPOSITE_EVENTS = ["startup", "charge", "active", "impact", "recovery"] as const;

export type VfxCompositeSocket = typeof VFX_COMPOSITE_SOCKETS[number];
export type VfxCompositeEvent = typeof VFX_COMPOSITE_EVENTS[number];
export type VfxCompositeBlendMode = "normal" | "additive" | "screen";
export type VfxCompositeLayer = "front" | "back";
export type VfxCompositeSyncMode = "start" | "peak";

export interface VfxCompositeManifest {
  schema: typeof VFX_COMPOSITE_SCHEMA;
  schemaVersion: 1;
  id: string;
  title: string;
  createdAt: string;
  character: {
    historyId: string;
    name: string;
    sheet: string;
    packSchema: AnimationPackV2["schema"] | "legacy";
    packRef: string;
    sourceJobId?: string;
    direction: string;
  };
  effect: {
    historyId: string;
    name: string;
    sheet: string;
    packSchema: "image-cockpit.effect-animation.v1";
    packRef: string;
    sourceJobId?: string;
    category: string;
    qualityRank: EffectAnimationMetadata["qualityRank"];
  };
  attachment: {
    socket: VfxCompositeSocket;
    event: VfxCompositeEvent;
    syncMode: VfxCompositeSyncMode;
    fallback: "pivot" | "anchor" | "estimated-center";
  };
  layer: VfxCompositeLayer;
  blendMode: VfxCompositeBlendMode;
  transform: {
    offsetX: number;
    offsetY: number;
    scale: number;
    rotation: number;
    opacity: number;
  };
  timing: {
    startFrame: number;
    peakFrame: number;
    timeScale: number;
  };
  preview: {
    background: "checkerboard" | "light" | "dark" | "game";
    overlays: {
      safeArea: boolean;
      clipping: boolean;
      hitbox: boolean;
      hurtbox: boolean;
      effectBounds: boolean;
    };
  };
  files: {
    characterSheet: "layers/character.png";
    effectSheet: "layers/effect.png";
    manifest: "composite.json";
    previewGif: "preview/composite.gif";
    previewApng: "preview/composite.apng";
    generic: "engine/generic.json";
    godot: "engine/godot.json";
    phaser: "engine/phaser.json";
  };
}

export interface VfxAttachmentPoint {
  x: number;
  y: number;
  source: "socket" | "pivot" | "anchor" | "estimated-center";
  estimated: boolean;
  label: string;
}

export interface CreateVfxCompositeInput {
  character: HistoryItem;
  effect: HistoryItem & { effectAnimation: EffectAnimationMetadata };
  direction?: string;
  now?: string;
}

export interface VfxCompositeRenderInput {
  manifest: VfxCompositeManifest;
  animationPack?: AnimationPackV2;
  effectMetadata?: EffectAnimationMetadata;
  characterFrames: SpriteFrame[];
  effectFrames: SpriteFrame[];
  characterSheet: Blob | string;
  effectSheet: Blob | string;
}

export interface VfxCompositeArtifacts {
  frames: SpriteFrame[];
  previewGif: Blob;
  previewApng: Blob;
  pack: Blob;
}

export function createVfxCompositeManifest(input: CreateVfxCompositeInput): VfxCompositeManifest {
  const effect = input.effect.effectAnimation;
  const direction = input.direction
    ?? input.character.animationPackV2?.directions[0]
    ?? input.character.animationDirections?.[0]
    ?? "front";
  const attachment = defaultAttachment(effect.category);
  const event = resolveEventFrame(input.character.animationPackV2, attachment.event, direction);
  const peakFrame = effect.qualityV2?.peakFrameIndex ?? Math.max(0, Math.floor(effect.frameCount / 2));
  const syncMode: VfxCompositeSyncMode = attachment.event === "impact" ? "peak" : "start";
  const startFrame = syncMode === "peak" ? event.frameIndex - peakFrame : event.frameIndex;
  const createdAt = input.now ?? new Date().toISOString();
  return validateVfxCompositeManifest({
    schema: VFX_COMPOSITE_SCHEMA,
    schemaVersion: 1,
    id: `composite-${slug(input.character.id)}-${slug(input.effect.id)}`,
    title: `${stripExtension(input.character.name)} + ${effect.name}`,
    createdAt,
    character: {
      historyId: input.character.id,
      name: input.character.name,
      sheet: "layers/character.png",
      packSchema: input.character.animationPackV2?.schema ?? "legacy",
      packRef: input.character.animationPackV2 ? "animation.json" : "legacy-history",
      sourceJobId: input.character.animationPackV2?.provenance.sourceJobId,
      direction
    },
    effect: {
      historyId: input.effect.id,
      name: effect.name,
      sheet: "layers/effect.png",
      packSchema: "image-cockpit.effect-animation.v1",
      packRef: "effect.json",
      sourceJobId: effect.sourceJobId,
      category: effect.category,
      qualityRank: effect.qualityRank
    },
    attachment: {
      socket: attachment.socket,
      event: attachment.event,
      syncMode,
      fallback: "pivot"
    },
    layer: attachment.layer,
    blendMode: normalizeBlendMode(effect.blendMode),
    transform: { offsetX: 0, offsetY: 0, scale: 1, rotation: 0, opacity: 1 },
    timing: { startFrame, peakFrame, timeScale: 1 },
    preview: {
      background: "checkerboard",
      overlays: { safeArea: true, clipping: true, hitbox: false, hurtbox: false, effectBounds: true }
    },
    files: defaultFiles()
  });
}

export function validateVfxCompositeManifest(value: unknown): VfxCompositeManifest {
  const raw = record(value, "VFX composite manifest") as unknown as VfxCompositeManifest;
  if (raw.schema !== VFX_COMPOSITE_SCHEMA || raw.schemaVersion !== 1) throw new Error(`Unsupported VFX composite schema: ${String(raw.schema)}.`);
  required(raw.id, "id");
  required(raw.title, "title");
  required(raw.createdAt, "createdAt");
  required(raw.character?.historyId, "character.historyId");
  required(raw.character?.name, "character.name");
  required(raw.character?.direction, "character.direction");
  required(raw.effect?.historyId, "effect.historyId");
  required(raw.effect?.name, "effect.name");
  if (!VFX_COMPOSITE_SOCKETS.includes(raw.attachment?.socket)) throw new Error("VFX composite socket is invalid.");
  if (!VFX_COMPOSITE_EVENTS.includes(raw.attachment?.event)) throw new Error("VFX composite event is invalid.");
  if (raw.attachment.syncMode !== "start" && raw.attachment.syncMode !== "peak") throw new Error("VFX composite sync mode is invalid.");
  if (raw.layer !== "front" && raw.layer !== "back") throw new Error("VFX composite layer is invalid.");
  if (!["normal", "additive", "screen"].includes(raw.blendMode)) throw new Error("VFX composite blend mode is invalid.");
  finite(raw.transform.offsetX, "transform.offsetX", -2048, 2048);
  finite(raw.transform.offsetY, "transform.offsetY", -2048, 2048);
  finite(raw.transform.scale, "transform.scale", 0.05, 8);
  finite(raw.transform.rotation, "transform.rotation", -720, 720);
  finite(raw.transform.opacity, "transform.opacity", 0, 1);
  integer(raw.timing.startFrame, "timing.startFrame", -1024, 1024);
  integer(raw.timing.peakFrame, "timing.peakFrame", 0, 1024);
  finite(raw.timing.timeScale, "timing.timeScale", 0.05, 8);
  return JSON.parse(JSON.stringify({ ...raw, files: defaultFiles() })) as VfxCompositeManifest;
}

export function serializeVfxCompositeManifest(manifest: VfxCompositeManifest) {
  return JSON.stringify(validateVfxCompositeManifest(manifest), null, 2);
}

export function parseVfxCompositeManifest(value: string | unknown) {
  return validateVfxCompositeManifest(typeof value === "string" ? JSON.parse(value) : value);
}

export function resolveVfxAttachmentPoint(
  pack: AnimationPackV2 | undefined,
  socket: VfxCompositeSocket,
  frameIndex: number,
  direction: string
): VfxAttachmentPoint {
  const point = nearestPoint(pack?.sockets ?? [], socket, frameIndex, direction);
  if (point) return { x: point.x, y: point.y, source: "socket", estimated: false, label: point.name };
  const pivot = nearestPoint(pack?.pivots ?? [], undefined, frameIndex, direction);
  if (pivot) return { x: pivot.x, y: pivot.y, source: "pivot", estimated: true, label: `${pivot.name} fallback` };
  const anchor = nearestPoint(pack?.anchors ?? [], undefined, frameIndex, direction);
  if (anchor) return { x: anchor.x, y: anchor.y, source: "anchor", estimated: true, label: `${anchor.name} fallback` };
  return defaultEstimatedPoint(socket);
}

export function resolveEventFrame(pack: AnimationPackV2 | undefined, event: VfxCompositeEvent, direction: string) {
  const candidates = pack?.events.filter((item) =>
    (item.type === event || item.name.toLowerCase() === event) && (!item.direction || item.direction === direction)
  ) ?? [];
  const exact = candidates.find((item) => item.direction === direction) ?? candidates[0];
  if (exact) return { frameIndex: exact.frameIndex, estimated: false };
  const count = pack?.frameOrder.length ?? 8;
  const ratios: Record<VfxCompositeEvent, number> = { startup: 0, charge: 0.2, active: 0.36, impact: 0.55, recovery: 0.82 };
  return { frameIndex: Math.max(0, Math.min(count - 1, Math.round((count - 1) * ratios[event]))), estimated: true };
}

export function mapCompositeEffectFrame(
  characterFrame: number,
  timing: VfxCompositeManifest["timing"],
  frameCount: number,
  loopMode: EffectAnimationMetadata["loopMode"]
) {
  if (frameCount <= 0) return null;
  const local = Math.floor((characterFrame - timing.startFrame) * timing.timeScale);
  if (local < 0) return null;
  if (loopMode === "one-shot") return local < frameCount ? local : null;
  if (loopMode === "ping-pong-loop" && frameCount > 1) {
    const span = frameCount * 2 - 2;
    const index = local % span;
    return index < frameCount ? index : span - index;
  }
  return local % frameCount;
}

export function retimeVfxToEvent(
  manifest: VfxCompositeManifest,
  pack: AnimationPackV2 | undefined,
  event: VfxCompositeEvent,
  syncMode: VfxCompositeSyncMode
) {
  const next = clone(manifest);
  const resolved = resolveEventFrame(pack, event, next.character.direction);
  next.attachment.event = event;
  next.attachment.syncMode = syncMode;
  next.timing.startFrame = syncMode === "peak" ? resolved.frameIndex - next.timing.peakFrame : resolved.frameIndex;
  return validateVfxCompositeManifest(next);
}

export async function createVfxCompositeArtifacts(input: VfxCompositeRenderInput): Promise<VfxCompositeArtifacts> {
  const manifest = validateVfxCompositeManifest(input.manifest);
  if (input.characterFrames.length === 0 || input.effectFrames.length === 0) throw new Error("Composite export requires character and effect frames.");
  const frames = await renderCompositeFrames({ ...input, manifest });
  const action: SpriteAction = {
    name: slug(manifest.title),
    fps: Math.max(1, Math.round(1000 / averageFrameDuration(input.animationPack))),
    loop: input.animationPack?.loopMode !== "one-shot",
    frameIds: frames.map((frame) => frame.id),
    cell: { width: frames[0].width, height: frames[0].height },
    anchor: { x: Math.round(frames[0].width / 2), y: Math.round(frames[0].height * 0.9) }
  };
  const previewGif = await createGifBlob(frames, action, { forceLoop: action.loop });
  const previewApng = await createApngBlob(frames, action, { forceLoop: action.loop });
  const pack = await createVfxCompositePackZip({ ...input, manifest, frames, previewGif, previewApng });
  return { frames, previewGif, previewApng, pack };
}

export async function importVfxCompositePack(blob: Blob) {
  if (blob.type === "application/json" || blob.type === "text/json" || blob.type === "text/plain") {
    return parseVfxCompositeManifest(await blob.text());
  }
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const manifestFile = zip.file("composite.json");
  if (!manifestFile) throw new Error("VFX Composite Pack is missing composite.json.");
  for (const path of ["layers/character.png", "layers/effect.png"]) {
    if (!zip.file(path)) throw new Error(`VFX Composite Pack is missing ${path}.`);
  }
  return parseVfxCompositeManifest(await manifestFile.async("string"));
}

async function renderCompositeFrames(input: VfxCompositeRenderInput & { manifest: VfxCompositeManifest }) {
  const output: SpriteFrame[] = [];
  const direction = input.manifest.character.direction;
  for (let index = 0; index < input.characterFrames.length; index += 1) {
    const characterFrame = input.characterFrames[index];
    const effectIndex = mapCompositeEffectFrame(index, input.manifest.timing, input.effectFrames.length, effectLoopMode(input));
    const effectFrame = effectIndex === null ? undefined : input.effectFrames[effectIndex];
    const characterImage = await loadImage(characterFrame.dataUrl);
    const effectImage = effectFrame ? await loadImage(effectFrame.dataUrl) : undefined;
    const canvas = document.createElement("canvas");
    canvas.width = characterFrame.width;
    canvas.height = characterFrame.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("VFX composite canvas is unavailable.");
    context.clearRect(0, 0, canvas.width, canvas.height);
    const drawCharacter = () => context.drawImage(characterImage, 0, 0, canvas.width, canvas.height);
    const drawEffect = () => {
      if (!effectImage || !effectFrame) return;
      const point = resolveVfxAttachmentPoint(input.animationPack, input.manifest.attachment.socket, index, direction);
      const effectMetadata = effectMetadataFromInput(input);
      const anchorX = effectMetadata?.anchor.x ?? effectFrame.width / 2;
      const anchorY = effectMetadata?.anchor.y ?? effectFrame.height / 2;
      context.save();
      context.globalAlpha = input.manifest.transform.opacity;
      context.globalCompositeOperation = compositeOperation(input.manifest.blendMode);
      context.translate(
        point.x * canvas.width + input.manifest.transform.offsetX,
        point.y * canvas.height + input.manifest.transform.offsetY
      );
      context.rotate(input.manifest.transform.rotation * Math.PI / 180);
      context.scale(input.manifest.transform.scale, input.manifest.transform.scale);
      context.drawImage(effectImage, -anchorX, -anchorY, effectFrame.width, effectFrame.height);
      context.restore();
    };
    if (input.manifest.layer === "back") {
      drawEffect();
      drawCharacter();
    } else {
      drawCharacter();
      drawEffect();
    }
    const dataUrl = canvas.toDataURL("image/png");
    output.push({
      id: `composite-frame-${index}`,
      name: `composite-frame-${String(index + 1).padStart(3, "0")}`,
      dataUrl,
      width: canvas.width,
      height: canvas.height,
      index
    });
  }
  return output;
}

async function createVfxCompositePackZip(input: VfxCompositeRenderInput & {
  manifest: VfxCompositeManifest;
  frames: SpriteFrame[];
  previewGif: Blob;
  previewApng: Blob;
}) {
  const zip = new JSZip();
  zip.file("composite.json", serializeVfxCompositeManifest(input.manifest));
  zip.file("layers/character.png", await sourceToBuffer(input.characterSheet));
  zip.file("layers/effect.png", await sourceToBuffer(input.effectSheet));
  zip.file("preview/composite.gif", await input.previewGif.arrayBuffer());
  zip.file("preview/composite.apng", await input.previewApng.arrayBuffer());
  for (const frame of input.frames) zip.file(`preview/frames/${frame.name}.png`, await dataUrlToBlob(frame.dataUrl).arrayBuffer());
  const engine = buildVfxCompositeEngineExports(input.manifest);
  zip.file("engine/generic.json", JSON.stringify(engine.generic, null, 2));
  zip.file("engine/godot.json", JSON.stringify(engine.godot, null, 2));
  zip.file("engine/phaser.json", JSON.stringify(engine.phaser, null, 2));
  return zip.generateAsync({ type: "blob" });
}

export function buildVfxCompositeEngineExports(manifest: VfxCompositeManifest) {
  const reference = {
    characterSheet: manifest.files.characterSheet,
    effectSheet: manifest.files.effectSheet,
    socket: manifest.attachment.socket,
    event: manifest.attachment.event,
    syncMode: manifest.attachment.syncMode,
    layer: manifest.layer,
    blend: manifest.blendMode,
    transform: manifest.transform,
    timing: manifest.timing
  };
  return {
    generic: { schema: "image-cockpit.vfx-composite.generic.v1", ...reference },
    godot: { resourceType: "ImageCockpitVfxComposite", characterTexture: manifest.files.characterSheet, effectTexture: manifest.files.effectSheet, attachment: reference },
    phaser: { key: slug(manifest.title), textures: { character: manifest.files.characterSheet, effect: manifest.files.effectSheet }, attachment: reference }
  };
}

function defaultAttachment(category: string): { socket: VfxCompositeSocket; event: VfxCompositeEvent; layer: VfxCompositeLayer } {
  if (/projectile/.test(category)) return { socket: "projectile-origin", event: "active", layer: "front" };
  if (/impact|hit-spark/.test(category)) return { socket: "impact-point", event: "impact", layer: "front" };
  if (/magic|heal|buff|barrier|shield|aura|status/.test(category)) return { socket: "hand", event: "charge", layer: "front" };
  if (/trail|landing|footstep|telegraph|aoe/.test(category)) return { socket: "feet", event: "active", layer: "back" };
  if (/spawn|portal/.test(category)) return { socket: "body-center", event: "startup", layer: "back" };
  return { socket: "weapon-tip", event: "impact", layer: "front" };
}

function defaultEstimatedPoint(socket: VfxCompositeSocket): VfxAttachmentPoint {
  const points: Record<VfxCompositeSocket, [number, number]> = {
    hand: [0.64, 0.48],
    "weapon-tip": [0.78, 0.42],
    feet: [0.5, 0.9],
    "body-center": [0.5, 0.55],
    "projectile-origin": [0.72, 0.48],
    "impact-point": [0.74, 0.5]
  };
  const [x, y] = points[socket];
  return { x, y, source: "estimated-center", estimated: true, label: `${socket} estimated` };
}

function nearestPoint(
  points: AnimationPackV2["sockets"],
  name: string | undefined,
  frameIndex: number,
  direction: string
) {
  return points
    .filter((point) => (!name || point.name.toLowerCase() === name.toLowerCase()) && (!point.direction || point.direction === direction))
    .sort((left, right) => Number(right.direction === direction) - Number(left.direction === direction)
      || Math.abs(left.frameIndex - frameIndex) - Math.abs(right.frameIndex - frameIndex))[0];
}

function effectLoopMode(input: VfxCompositeRenderInput) {
  return input.effectMetadata?.loopMode ?? "one-shot";
}

function effectMetadataFromInput(input: VfxCompositeRenderInput) {
  return input.effectMetadata;
}

function averageFrameDuration(pack: AnimationPackV2 | undefined) {
  if (!pack || pack.frameDurations.length === 0) return 1000 / 12;
  return pack.frameDurations.reduce((sum, value) => sum + value, 0) / pack.frameDurations.length;
}

function compositeOperation(mode: VfxCompositeBlendMode): GlobalCompositeOperation {
  if (mode === "additive") return "lighter";
  if (mode === "screen") return "screen";
  return "source-over";
}

function normalizeBlendMode(value: string): VfxCompositeBlendMode {
  if (value === "additive" || value === "screen") return value;
  return "normal";
}

function defaultFiles(): VfxCompositeManifest["files"] {
  return {
    characterSheet: "layers/character.png",
    effectSheet: "layers/effect.png",
    manifest: "composite.json",
    previewGif: "preview/composite.gif",
    previewApng: "preview/composite.apng",
    generic: "engine/generic.json",
    godot: "engine/godot.json",
    phaser: "engine/phaser.json"
  };
}

function record(value: unknown, label: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  return value as Record<string, unknown>;
}

function required(value: unknown, label: string) {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > 240) throw new Error(`VFX composite ${label} is invalid.`);
}

function finite(value: unknown, label: string, min: number, max: number) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) throw new Error(`VFX composite ${label} is invalid.`);
}

function integer(value: unknown, label: string, min: number, max: number) {
  finite(value, label, min, max);
  if (!Number.isInteger(value)) throw new Error(`VFX composite ${label} must be an integer.`);
}

function stripExtension(value: string) {
  return value.replace(/\.[^.]+$/, "");
}

function slug(value: string) {
  return value.normalize("NFKD").toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "vfx-composite";
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

async function sourceToBuffer(value: Blob | string) {
  return (value instanceof Blob ? value : dataUrlToBlob(value)).arrayBuffer();
}

export async function createCompositeSheetBlob(frames: SpriteFrame[]) {
  if (frames.length === 0) throw new Error("No composite frames to pack.");
  const columns = Math.min(4, frames.length);
  const rows = Math.ceil(frames.length / columns);
  const canvas = document.createElement("canvas");
  canvas.width = frames[0].width * columns;
  canvas.height = frames[0].height * rows;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Composite sheet canvas is unavailable.");
  for (let index = 0; index < frames.length; index += 1) {
    const image = await loadImage(frames[index].dataUrl);
    context.drawImage(image, (index % columns) * frames[0].width, Math.floor(index / columns) * frames[0].height);
  }
  return canvasToBlob(canvas);
}
