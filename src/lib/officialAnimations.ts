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
  }),
  createOfficialAnimation({
    id: "official-basic-attack",
    title: "Basic Attack",
    action: "attack",
    sheetDataUrl: "/samples/basic-attack-sheet.png",
    playback: "normal",
    tags: ["attack", "combat", "character", "sprite"]
  }),
  createOfficialAnimation({
    id: "official-hurt-reaction",
    title: "Hurt Reaction",
    action: "hurt",
    sheetDataUrl: "/samples/hurt-reaction-sheet.png",
    playback: "normal",
    tags: ["hurt", "combat", "reaction", "character", "sprite"]
  }),
  createOfficialAnimation({
    id: "official-death-downed",
    title: "Death / Downed",
    action: "death",
    sheetDataUrl: "/samples/death-downed-sheet.png",
    playback: "normal",
    tags: ["death", "downed", "combat", "character", "sprite"]
  }),
  createOfficialAnimation({
    id: "official-spell-cast",
    title: "Spell Cast",
    action: "cast",
    sheetDataUrl: "/samples/spell-cast-sheet.png",
    playback: "normal",
    tags: ["cast", "magic", "skill", "character", "sprite"]
  }),
  createOfficialAnimation({
    id: "official-jump-hop",
    title: "Jump / Hop",
    action: "jump",
    sheetDataUrl: "/samples/jump-hop-sheet.png",
    playback: "normal",
    tags: ["jump", "move", "character", "sprite"]
  }),
  createOfficialAnimation({
    id: "official-guard-block",
    title: "Guard / Block",
    action: "guard",
    sheetDataUrl: "/samples/guard-block-sheet.png",
    playback: "normal",
    tags: ["guard", "block", "combat", "character", "sprite"]
  }),
  createOfficialAnimation({
    id: "official-victory-cheer",
    title: "Victory Cheer",
    action: "cheer",
    sheetDataUrl: "/samples/victory-cheer-sheet.png",
    playback: "normal",
    tags: ["cheer", "victory", "emotion", "character", "sprite"]
  }),
  createOfficialAnimation({
    id: "official-interact-pickup",
    title: "Interact / Pickup",
    action: "interact",
    sheetDataUrl: "/samples/interact-pickup-sheet.png",
    playback: "normal",
    tags: ["interact", "pickup", "utility", "character", "sprite"]
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
