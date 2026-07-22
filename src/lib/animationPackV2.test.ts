import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import type { AnimationPackManifest, AnimationPackV2 } from "../types";
import {
  addPackPoint,
  addPackRect,
  animationPlaybackSequence,
  animationDirectionSyncWarnings,
  buildAnimationPackV2EngineExports,
  createAnimationPackV2,
  createAnimationPackV2Zip,
  duplicateAnimationFrame,
  holdAnimationFrame,
  migrateAnimationPackV1,
  moveAnimationEvent,
  parseAnimationPack,
  reverseAnimationTimeline,
  serializeAnimationPackV2,
  setAnimationFrameDuration,
  setAnimationLoopMode,
  validateAnimationPackV2
} from "./animationPackV2";

describe("Animation Pack v2 timeline", () => {
  it.each([4, 6, 8, 12, 16, 20])("keeps %i-frame duration, duplicate, reverse, and ping-pong edits metadata-only", (frameCount) => {
    const original = makePack(frameCount);
    const held = holdAnimationFrame(original, 1, 80);
    const duplicated = duplicateAnimationFrame(held, 1);
    const reversed = reverseAnimationTimeline(duplicated);
    const pingPong = setAnimationLoopMode(reversed, "ping-pong");

    expect(held.frameDurations[1]).toBe(original.frameDurations[1] + 80);
    expect(duplicated.frameOrder).toHaveLength(frameCount + 1);
    expect(duplicated.frameOrder[2]).toBe(duplicated.frameOrder[1]);
    expect(reversed.frameOrder[0]).toBe(duplicated.frameOrder.at(-1));
    expect(pingPong.loopMode).toBe("ping-pong");
    expect(pingPong.frames).toEqual(original.frames);
  });

  it.each(["loop", "one-shot"] as const)("supports %s playback", (loopMode) => {
    const pack = setAnimationLoopMode(makePack(8), loopMode);
    expect(pack.loopMode).toBe(loopMode);
    expect(pack.events.some((event) => event.type === "loop-point")).toBe(loopMode === "loop");
  });

  it("builds a ping-pong preview sequence without duplicating either seam endpoint", () => {
    const pack = setAnimationLoopMode(makePack(4), "ping-pong");
    expect(animationPlaybackSequence(pack)).toEqual([0, 1, 2, 3, 2, 1]);
  });

  it.each([1, 3, 5])("synchronizes %i directions by default and warns on explicit exceptions", (directionCount) => {
    const pack = makePack(6, directionCount);
    expect(pack.directions).toHaveLength(directionCount);
    expect(animationDirectionSyncWarnings(pack)).toEqual([]);
    pack.directionOverrides = { [pack.directions[0]]: { frameDurations: pack.frameDurations.map((duration) => duration + 1) } };
    expect(animationDirectionSyncWarnings(pack)).toEqual([expect.stringContaining(pack.directions[0])]);
  });

  it("serializes events, pivots, anchors, sockets, hitboxes, hurtboxes, and trim rects", () => {
    let pack = makePack(8);
    pack = moveAnimationEvent(pack, "event-impact", 6);
    pack = addPackPoint(pack, "pivot", 2);
    pack = addPackPoint(pack, "anchor", 3);
    pack = addPackPoint(pack, "socket", 4, "weapon");
    pack = addPackRect(pack, "hitbox", 5);
    pack = addPackRect(pack, "hurtbox", 6);
    pack.trimRects.push({ id: "trim-0", name: "trim", frameIndex: 0, x: 0, y: 0, width: 1, height: 1, origin: "user" });
    const roundTrip = validateAnimationPackV2(JSON.parse(serializeAnimationPackV2(pack)));

    expect(roundTrip.events.find((event) => event.id === "event-impact")).toMatchObject({ frameIndex: 6, origin: "user" });
    expect(roundTrip.pivots).toHaveLength(2);
    expect(roundTrip.anchors).toHaveLength(2);
    expect(roundTrip.sockets[0].name).toBe("weapon");
    expect(roundTrip.hitboxes).toHaveLength(1);
    expect(roundTrip.hurtboxes).toHaveLength(1);
    expect(roundTrip.trimRects).toHaveLength(1);
  });

  it("round-trips v2 without semantic changes", () => {
    const pack = setAnimationFrameDuration(makePack(8), 3, 333);
    expect(parseAnimationPack(serializeAnimationPackV2(pack))).toEqual(pack);
  });

  it("rejects unknown schemas with a precise error", () => {
    expect(() => parseAnimationPack({ schema: "image-cockpit.animation.v99" })).toThrow(/unsupported.*v99/i);
  });

  it("rejects Windows separators in portable file references", () => {
    const pack = makePack(8);
    pack.frames[0].fileRef = "frames\\front-000.png";
    expect(() => validateAnimationPackV2(pack)).toThrow(/unsafe/i);
  });

  it("preserves Unicode labels and transparent-frame metadata", () => {
    const pack = makePack(8);
    pack.title = "白猫・待機モーション";
    pack.frames[0].transparent = true;
    const roundTrip = parseAnimationPack(serializeAnimationPackV2(pack));
    expect(roundTrip.title).toBe("白猫・待機モーション");
    expect(roundTrip.frames[0].transparent).toBe(true);
  });
});

describe("Animation Pack v2 compatibility and engine handoff", () => {
  it("migrates v1 equal-duration frames from FPS and maps legacy ping-pong", () => {
    const migrated = migrateAnimationPackV1(makeLegacyManifest(), { defaultFps: 10 });
    expect(migrated.provenance.migratedFrom).toBe("image-cockpit.animation.v1");
    expect(migrated.frameDurations).toEqual(Array(8).fill(100));
    expect(migrated.loopMode).toBe("ping-pong");
  });

  it("migrates legacy one-shot action when no playback override exists", () => {
    const legacy = makeLegacyManifest();
    legacy.action = "attack";
    legacy.playback = "normal";
    expect(migrateAnimationPackV1(legacy).loopMode).toBe("one-shot");
  });

  it("builds Generic, Godot, Phaser, Aseprite, and Unity common metadata with valid frame refs", () => {
    const pack = duplicateAnimationFrame(makePack(6, 3), 2);
    const outputs = buildAnimationPackV2EngineExports(pack);
    expect(outputs.map((output) => output.filename)).toEqual([
      "engine/generic.json",
      "engine/godot-spriteframes.json",
      "engine/phaser.json",
      "engine/aseprite.json",
      "engine/unity-common.json"
    ]);
    for (const output of outputs) {
      const text = JSON.stringify(output.data);
      expect(text).toContain(pack.files.sheet);
      expect(text).toContain("front-000");
    }
    expect(outputs.at(-1)?.data).toMatchObject({ packageIncluded: false });
  });

  it("writes manifest, sheet, and every engine handoff into the v2 zip", async () => {
    const pack = makePack(8);
    const blob = await createAnimationPackV2Zip(pack, new Blob(["transparent-png"], { type: "image/png" }));
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    expect(zip.file("manifest.json")).toBeTruthy();
    expect(zip.file(pack.files.sheet)).toBeTruthy();
    for (const output of buildAnimationPackV2EngineExports(pack)) expect(zip.file(output.filename)).toBeTruthy();
    const reimported = parseAnimationPack(await zip.file("manifest.json")!.async("string"));
    expect(reimported).toEqual(pack);
  });
});

function makePack(frameCount = 8, directionCount = 5): AnimationPackV2 {
  const directionSets: Record<number, string[]> = {
    1: ["side"],
    3: ["front", "side", "back"],
    5: ["front", "front-three-quarter", "side", "back-three-quarter", "back"]
  };
  const directions = directionSets[directionCount] ?? directionSets[5];
  return createAnimationPackV2({
    title: "Run Cycle",
    actionId: "run",
    directions,
    framesPerDirection: frameCount,
    defaultFps: 12,
    loopMode: "loop",
    grid: { columns: frameCount, rows: directionCount, gutter: 0 },
    cell: { width: 256, height: 256 },
    motionRecipe: {
      id: "run",
      version: 2,
      compilerVersion: "1.1.0",
      qualityProfile: "grounded-strict",
      frameCount: frameCount as 4 | 6 | 8 | 12 | 16 | 20
    },
    sourceFingerprint: "sha256-test",
    generationProfile: "best",
    createdAt: "2026-07-15T00:00:00.000Z"
  });
}

function makeLegacyManifest(): AnimationPackManifest {
  return {
    schema: "image-cockpit.animation.v1",
    title: "Legacy Run",
    kind: "user",
    action: "run",
    directions: ["front", "side", "back"],
    grid: { columns: 8, rows: 3, gutter: 0 },
    cell: { width: 256, height: 256 },
    framesPerDirection: 8,
    playback: "ping-pong-reverse",
    createdAt: "2026-07-01T00:00:00.000Z",
    createdWith: "Image Cockpit",
    files: { sheet: "sheet.png" }
  };
}
