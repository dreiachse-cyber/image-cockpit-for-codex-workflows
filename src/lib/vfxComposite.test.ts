import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import type { AnimationPackV2, EffectAnimationMetadata, HistoryItem } from "../types";
import {
  buildVfxCompositeEngineExports,
  createVfxCompositeManifest,
  importVfxCompositePack,
  mapCompositeEffectFrame,
  parseVfxCompositeManifest,
  resolveEventFrame,
  resolveVfxAttachmentPoint,
  retimeVfxToEvent,
  serializeVfxCompositeManifest
} from "./vfxComposite";

describe("VFX Composite Stage", () => {
  it("serializes socket, event, transform, blend and timing without drift", () => {
    const manifest = createVfxCompositeManifest({ character: character(), effect: effect(), now: "2026-07-15T00:00:00.000Z" });
    manifest.blendMode = "screen";
    manifest.layer = "back";
    manifest.transform = { offsetX: 14, offsetY: -8, scale: 1.25, rotation: 18, opacity: 0.76 };
    manifest.timing = { startFrame: 2, peakFrame: 3, timeScale: 0.75 };
    expect(parseVfxCompositeManifest(serializeVfxCompositeManifest(manifest))).toEqual(manifest);
  });

  it("uses a named socket and falls back to pivot for an old pack", () => {
    const pack = animationPack();
    pack.sockets.push({ id: "socket-1", name: "weapon-tip", frameIndex: 2, x: 0.8, y: 0.35, origin: "user", direction: "front" });
    expect(resolveVfxAttachmentPoint(pack, "weapon-tip", 2, "front")).toMatchObject({ x: 0.8, source: "socket", estimated: false });
    pack.sockets = [];
    pack.pivots.push({ id: "pivot-1", name: "pivot", frameIndex: 2, x: 0.5, y: 0.9, origin: "user" });
    expect(resolveVfxAttachmentPoint(pack, "weapon-tip", 2, "front")).toMatchObject({ source: "pivot", estimated: true });
  });

  it("maps loop, one-shot and ping-pong timing", () => {
    const timing = { startFrame: 1, peakFrame: 2, timeScale: 1 };
    expect(mapCompositeEffectFrame(0, timing, 4, "loop")).toBeNull();
    expect(mapCompositeEffectFrame(5, timing, 4, "loop")).toBe(0);
    expect(mapCompositeEffectFrame(5, timing, 4, "one-shot")).toBeNull();
    expect(mapCompositeEffectFrame(5, timing, 4, "ping-pong-loop")).toBe(2);
  });

  it("retimes effect start or peak to an animation event", () => {
    const manifest = createVfxCompositeManifest({ character: character(), effect: effect() });
    const pack = animationPack();
    expect(resolveEventFrame(pack, "impact", "front")).toEqual({ frameIndex: 4, estimated: false });
    expect(retimeVfxToEvent(manifest, pack, "impact", "peak").timing.startFrame).toBe(2);
    expect(retimeVfxToEvent(manifest, pack, "startup", "start").timing.startFrame).toBe(0);
  });

  it("imports a pack with separate layers and emits Generic, Godot and Phaser references", async () => {
    const manifest = createVfxCompositeManifest({ character: character(), effect: effect() });
    const zip = new JSZip();
    zip.file("composite.json", serializeVfxCompositeManifest(manifest));
    zip.file("layers/character.png", "character");
    zip.file("layers/effect.png", "effect");
    const blob = await zip.generateAsync({ type: "blob" });
    expect(await importVfxCompositePack(blob)).toEqual(manifest);
    const engines = buildVfxCompositeEngineExports(manifest);
    expect(engines.generic.characterSheet).toBe("layers/character.png");
    expect(engines.godot.effectTexture).toBe("layers/effect.png");
    expect(engines.phaser.attachment.socket).toBe(manifest.attachment.socket);
  });
});

function character(): HistoryItem {
  const pack = animationPack();
  return {
    id: "character-1", name: "hero-attack.png", dataUrl: "data:image/png;base64,AA==", provider: "local-inbox",
    prompt: "", seed: "", size: "128x128", createdAt: "2026-07-15T00:00:00.000Z", adopted: false,
    source: "generate", animationDirections: ["front"], animationPackV2: pack
  };
}

function effect(): HistoryItem & { effectAnimation: EffectAnimationMetadata } {
  return {
    id: "effect-1", name: "slash.png", dataUrl: "data:image/png;base64,AA==", provider: "local-inbox",
    prompt: "", seed: "", size: "512x256", createdAt: "2026-07-15T00:00:00.000Z", adopted: false,
    source: "generate",
    effectAnimation: {
      kind: "effect-animation", name: "slash", category: "slash-arc", type: "crescent", style: "pixel-clean",
      colorPalette: "cyan-white", frameCount: 8, frameSize: { width: 128, height: 128 }, layout: { columns: 4, rows: 2 },
      loopMode: "one-shot", fps: 12, anchor: { x: 64, y: 64, mode: "center" }, blendMode: "additive",
      background: "transparent", alphaPremultiplied: false, qualityRank: "gold", warnings: [],
      qualityV2: {
        metricVersion: "image-cockpit.effect-quality.v2", policyVersion: "shadow-v1", recordedAt: "2026-07-15T00:00:00.000Z",
        loopSeamScore: null, alphaContinuityScore: 90, energyCentroidScore: 90, brightnessEnvelopeScore: 90,
        clippingOverdrawScore: 90, paletteConsistencyScore: 90, peakFrameIndex: 2, eventPeakDeltaFrames: 0, shadowWarnings: []
      }
    }
  };
}

function animationPack(): AnimationPackV2 {
  return {
    schema: "image-cockpit.animation.v2", schemaVersion: 2, title: "Hero attack", kind: "user", actionId: "attack",
    recipeId: "attack", recipeVersion: 1, compilerVersion: "1.1.0", sourceFingerprint: "test", directions: ["front"],
    frames: Array.from({ length: 8 }, (_, index) => ({ id: `f${index}`, direction: "front", sourceFrameIndex: index, sheetRect: { x: index * 128, y: 0, width: 128, height: 128 } })),
    frameOrder: [0, 1, 2, 3, 4, 5, 6, 7], frameDurations: Array(8).fill(83), defaultFps: 12, loopMode: "one-shot",
    events: [
      { id: "startup", type: "startup", name: "startup", frameIndex: 0, origin: "recipe" },
      { id: "impact", type: "impact", name: "impact", frameIndex: 4, origin: "recipe" }
    ],
    pivots: [], anchors: [], sockets: [], hitboxes: [], hurtboxes: [], trimRects: [],
    qualitySummary: { rank: "gold", warningCount: 0, loopSeamScore: null, identityScore: 95 }, generationProfile: "best",
    provenance: { createdAt: "2026-07-15T00:00:00.000Z", createdWith: "test" },
    grid: { columns: 8, rows: 1, gutter: 0 }, cell: { width: 128, height: 128 },
    files: { sheet: "sheet.png", metadata: "animation.json", engine: { generic: "engine/generic.json", godot: "engine/godot.json", phaser: "engine/phaser.json", aseprite: "engine/aseprite.json", unity: "engine/unity.json" } }
  };
}
