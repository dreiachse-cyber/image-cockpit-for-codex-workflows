import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import type { AnimationPackManifest } from "../types";
import { createAnimationPackZip } from "./exporters";
import { importAnimationPackBlob, isSafeAnimationPackPath, validateAnimationPackManifest } from "./animationPack";

describe("animation pack validation", () => {
  it("accepts the v1 animation manifest", () => {
    expect(validateAnimationPackManifest(makeManifest()).schema).toBe("image-cockpit.animation.v1");
  });

  it("rejects unsupported schemas", () => {
    expect(() => validateAnimationPackManifest({ ...makeManifest(), schema: "image-cockpit.animation.v0" })).toThrow(
      /schema/i
    );
  });

  it("rejects unsafe zip paths", () => {
    expect(isSafeAnimationPackPath("sheet.png")).toBe(true);
    expect(isSafeAnimationPackPath("frames/frame-001.png")).toBe(true);
    expect(isSafeAnimationPackPath("../sheet.png")).toBe(false);
    expect(isSafeAnimationPackPath("C:/Users/example/sheet.png")).toBe(false);
    expect(isSafeAnimationPackPath("/tmp/sheet.png")).toBe(false);
  });

  it("rejects packages missing the sheet image", async () => {
    const zip = new JSZip();
    zip.file("manifest.json", JSON.stringify(makeManifest()));
    const blob = await zip.generateAsync({ type: "blob" });

    await expect(importAnimationPackBlob(blob)).rejects.toThrow(/missing its sheet/i);
  });

  it("rejects packages with path traversal entries", async () => {
    const zip = new JSZip();
    zip.file("manifest.json", JSON.stringify({ ...makeManifest(), files: { sheet: "../evil.png" } }));
    const blob = await zip.generateAsync({ type: "blob" });

    await expect(importAnimationPackBlob(blob)).rejects.toThrow(/unsafe/i);
  });

  it("exports manifest and sheet into a portable zip", async () => {
    const manifest = makeManifest();
    const blob = await createAnimationPackZip({
      manifest,
      sheet: new Blob(["png"], { type: "image/png" })
    });
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());

    expect(zip.file("manifest.json")).toBeTruthy();
    expect(zip.file("sheet.png")).toBeTruthy();
    expect(JSON.parse(await zip.file("manifest.json")!.async("string")).schema).toBe("image-cockpit.animation.v1");
  });

  it("exports direction GIF and WebP previews into the animation pack", async () => {
    const manifest = makeManifest();
    const blob = await createAnimationPackZip({
      manifest,
      sheet: new Blob(["png"], { type: "image/png" }),
      previewGif: new Blob(["front-gif"], { type: "image/gif" }),
      previewWebp: new Blob(["front-webp"], { type: "image/webp" }),
      directionPreviews: manifest.files.directionPreviews?.map((preview) => ({
        direction: preview.direction,
        gif: new Blob([`${preview.direction}-gif`], { type: "image/gif" }),
        webp: new Blob([`${preview.direction}-webp`], { type: "image/webp" })
      }))
    });
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const exportedManifest = JSON.parse(await zip.file("manifest.json")!.async("string")) as AnimationPackManifest;

    expect(zip.file("preview.gif")).toBeTruthy();
    expect(zip.file("preview.webp")).toBeTruthy();
    expect(exportedManifest.files.directionPreviews).toHaveLength(5);
    for (const preview of exportedManifest.files.directionPreviews ?? []) {
      expect(zip.file(preview.gif ?? "")).toBeTruthy();
      expect(zip.file(preview.webp ?? "")).toBeTruthy();
    }
  });
});

function makeManifest(): AnimationPackManifest {
  return {
    schema: "image-cockpit.animation.v1",
    title: "Run Cycle",
    kind: "user",
    action: "run",
    directions: ["front", "front three-quarter", "side", "back three-quarter", "back"],
    grid: { columns: 8, rows: 5, gutter: 0 },
    cell: { width: 256, height: 256 },
    framesPerDirection: 8,
    playback: "ping-pong-reverse",
    createdAt: "2026-06-25T00:00:00.000Z",
    createdWith: "Image Cockpit for Codex Workflows",
    license: "user-controlled",
    sourceNote: "",
    promptSummary: "",
    tags: ["run", "sprite"],
    files: {
      sheet: "sheet.png",
      previewGif: "preview.gif",
      previewWebp: "preview.webp",
      directionPreviews: [
        "front",
        "front three-quarter",
        "side",
        "back three-quarter",
        "back"
      ].map((direction) => ({
        direction,
        gif: `previews/${direction.replace(/\s+/g, "-")}.gif`,
        webp: `previews/${direction.replace(/\s+/g, "-")}.webp`
      })),
      metadata: "metadata.json"
    }
  };
}
