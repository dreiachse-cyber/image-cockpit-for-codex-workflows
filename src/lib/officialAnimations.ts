import type { AnimationLibraryItem, AnimationPackManifest } from "../types";

const CREATED_WITH = "Image Cockpit for Codex Workflows";
const DIRECTIONS = ["front", "front three-quarter", "side", "back three-quarter", "back"];
const STANDARD_GRID = { columns: 8, rows: 5, gutter: 0 };
const STANDARD_CELL = { width: 256, height: 256 };

export const OFFICIAL_ANIMATION_LIBRARY: AnimationLibraryItem[] = [
  createOfficialAnimation({
    id: "official-idle-breathing",
    title: "Idle Breathing",
    action: "idle",
    sheetDataUrl: "/samples/idle-breathing-sheet.png",
    playback: "normal",
    tags: ["idle", "breathing", "ready", "character", "sprite"]
  }),
  createOfficialAnimation({
    id: "official-walk-cycle",
    title: "Walk Cycle",
    action: "walk",
    sheetDataUrl: "/samples/walk-cycle-sheet.png",
    playback: "normal",
    tags: ["walk", "move", "character", "sprite"]
  }),
  createOfficialAnimation({
    id: "official-run-cycle",
    title: "Run Cycle",
    action: "run",
    sheetDataUrl: "/samples/run-cycle-sheet.png",
    playback: "ping-pong-reverse",
    tags: ["run", "move", "character", "sprite"]
  })
];

function createOfficialAnimation({
  id,
  title,
  action,
  sheetDataUrl,
  playback,
  tags
}: {
  id: string;
  title: string;
  action: string;
  sheetDataUrl: string;
  playback: AnimationPackManifest["playback"];
  tags: string[];
}): AnimationLibraryItem {
  const manifest: AnimationPackManifest = {
    schema: "image-cockpit.animation.v1",
    title,
    kind: "official",
    action,
    directions: DIRECTIONS,
    grid: STANDARD_GRID,
    cell: STANDARD_CELL,
    framesPerDirection: STANDARD_GRID.columns,
    playback,
    createdAt: "2026-06-25T00:00:00.000Z",
    createdWith: CREATED_WITH,
    license: "sample",
    sourceNote: "Bundled official sample for Image Cockpit animation workflows.",
    promptSummary: "",
    tags,
    files: {
      sheet: "sheet.png",
      previewGif: "preview.gif",
      previewWebp: "preview.webp",
      directionPreviews: DIRECTIONS.map((direction) => ({
        direction,
        gif: `previews/${direction.replace(/\s+/g, "-")}.gif`,
        webp: `previews/${direction.replace(/\s+/g, "-")}.webp`
      })),
      metadata: "metadata.json"
    }
  };

  return {
    id,
    kind: "official",
    title,
    action,
    manifest,
    sheetDataUrl
  };
}
