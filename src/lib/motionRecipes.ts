import type { AnimationActionQualityProfile } from "../types";

export const MOTION_RECIPE_SCHEMA = "image-cockpit.motion-recipe.v1" as const;
export const MOTION_RECIPE_VERSION = 1 as const;
export const MOTION_RECIPE_COMPILER_VERSION = "1.0.0" as const;

export type MotionRecipeLoopMode = "loop" | "one-shot" | "ping-pong";
export type MotionRecipeGroundingProfile = "grounded" | "airborne" | "downed" | "exempt";
export type MotionRecipeIntensity = "subtle" | "moderate" | "high";

export interface MotionRecipeFramePhase {
  id: string;
  frameStart: number;
  frameEnd: number;
  description: string;
}

export interface MotionRecipeQualityProfile {
  actionProfile: AnimationActionQualityProfile;
  expectedPhases: string[];
  loopSeamRequired: boolean;
  motionRange: [number, number];
  rootDriftTolerancePx: number;
  footlineTolerancePx: number;
}

export interface MotionRecipe {
  schema: typeof MOTION_RECIPE_SCHEMA;
  id: string;
  version: typeof MOTION_RECIPE_VERSION;
  family: "core" | "locomotion" | "combat" | "magic" | "social" | "utility";
  displayName: { en: string; ja: string };
  localizedDescription: { en: string; ja: string };
  actionName: string;
  previewClassName: string;
  loopMode: MotionRecipeLoopMode;
  defaultFps: number;
  frameCount: number;
  framePhases: MotionRecipeFramePhase[];
  groundingProfile: MotionRecipeGroundingProfile;
  rootMotionPolicy: string;
  anchorPolicy: string;
  silhouetteExpectation: string;
  requiredProps: string[];
  allowedVfx: string[];
  identityConstraints: string[];
  motionIntensity: MotionRecipeIntensity;
  secondaryMotion: string[];
  promptSegments: {
    hard: string[];
    motion: string[];
    identity: string[];
    direction: string[];
    background: string[];
  };
  negativeConstraints: string[];
  qualityProfile: MotionRecipeQualityProfile;
  exportDefaults: {
    cell: { width: number; height: number };
    anchor: { x: number; y: number };
    playback: "normal" | "ping-pong-reverse";
    background: "transparent";
  };
  notes: string;
}

interface MotionRecipeSeed {
  id: string;
  family: MotionRecipe["family"];
  displayName: MotionRecipe["displayName"];
  localizedDescription: MotionRecipe["localizedDescription"];
  actionName: string;
  previewClassName: string;
  loopMode: MotionRecipeLoopMode;
  defaultFps: number;
  phases: string[];
  groundingProfile: MotionRecipeGroundingProfile;
  motionIntensity: MotionRecipeIntensity;
  motion: string;
  notes: string;
  requiredProps?: string[];
  allowedVfx?: string[];
  secondaryMotion?: string[];
  negative?: string[];
}

const SHARED_IDENTITY = [
  "Preserve the uploaded character's identity, outfit, palette, head-to-body ratio, silhouette, props, and pixel density in every frame.",
  "Keep one real character scale across every direction and pose; lower poses become shorter and must never be enlarged to fill the cell."
];

const SHARED_NEGATIVE = [
  "cropped hair, cropped head, cropped feet, duplicated heads, body fragments, changed character identity",
  "nonuniform character scale, per-cell auto-fit, neighboring-cell intrusion, camera drift",
  "non-flat background, gradients, shadows baked into the chroma key, text, labels, UI symbols"
];

const PROFILE_MOTION_RANGE: Record<AnimationActionQualityProfile, [number, number]> = {
  "grounded-strict": [0.001, 0.16],
  "grounded-soft": [0.004, 0.3],
  "airborne-or-exempt": [0.004, 0.42],
  "subtle-loop": [0.0015, 0.08]
};

function qualityActionProfile(seed: MotionRecipeSeed): AnimationActionQualityProfile {
  if (seed.groundingProfile === "airborne" || seed.groundingProfile === "downed" || seed.groundingProfile === "exempt") return "airborne-or-exempt";
  if (seed.motionIntensity === "subtle") return "subtle-loop";
  if (["idle", "guard", "cast", "interact", "item"].includes(seed.actionName)) return "grounded-strict";
  return "grounded-soft";
}

function createMotionRecipe(seed: MotionRecipeSeed): MotionRecipe {
  const actionProfile = qualityActionProfile(seed);
  const loopSeamRequired = seed.loopMode !== "one-shot";
  const framePhases = seed.phases.map((description, index) => ({
    id: description.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || `phase-${index + 1}`,
    frameStart: index + 1,
    frameEnd: index + 1,
    description
  }));
  return {
    schema: MOTION_RECIPE_SCHEMA,
    id: seed.id,
    version: MOTION_RECIPE_VERSION,
    family: seed.family,
    displayName: seed.displayName,
    localizedDescription: seed.localizedDescription,
    actionName: seed.actionName,
    previewClassName: seed.previewClassName,
    loopMode: seed.loopMode,
    defaultFps: seed.defaultFps,
    frameCount: 8,
    framePhases,
    groundingProfile: seed.groundingProfile,
    rootMotionPolicy: seed.groundingProfile === "airborne"
      ? "Allow compact vertical root motion, but return to the source center and baseline on landing."
      : seed.groundingProfile === "downed"
        ? "Allow a controlled downward root path into a compact final pose without enlarging the character."
        : "Keep the root centered; do not translate, skate, or auto-center each frame independently.",
    anchorPolicy: seed.groundingProfile === "airborne"
      ? "Use the standing baseline before takeoff and after landing; preserve bottom-center export anchor."
      : "Keep at least one planted foot or the robe hem on a stable visual baseline; preserve bottom-center export anchor.",
    silhouetteExpectation: "Keep the complete hair, head, hands, props, effects, outfit, and feet inside every 256px cell with readable padding.",
    requiredProps: seed.requiredProps ?? [],
    allowedVfx: seed.allowedVfx ?? [],
    identityConstraints: SHARED_IDENTITY,
    motionIntensity: seed.motionIntensity,
    secondaryMotion: seed.secondaryMotion ?? ["hair and clothing follow-through must lag the body motion without replacing the primary action"],
    promptSegments: {
      hard: [
        "Create exactly eight source frames for each requested direction.",
        "Use fixed 256px by 256px cells and keep every frame isolated inside its own cell."
      ],
      motion: [seed.motion, seed.notes],
      identity: SHARED_IDENTITY,
      direction: ["Make the same motion readable from every requested view and preserve strict direction identity."],
      background: ["Prefer transparent background; otherwise use only the requested flat chroma-key color."]
    },
    negativeConstraints: [...SHARED_NEGATIVE, ...(seed.negative ?? [])],
    qualityProfile: {
      actionProfile,
      expectedPhases: framePhases.map((phase) => phase.description),
      loopSeamRequired,
      motionRange: PROFILE_MOTION_RANGE[actionProfile],
      rootDriftTolerancePx: seed.groundingProfile === "airborne" ? 18 : seed.groundingProfile === "downed" ? 22 : 10,
      footlineTolerancePx: seed.groundingProfile === "grounded" ? 8 : 18
    },
    exportDefaults: {
      cell: { width: 256, height: 256 },
      anchor: { x: 0.5, y: 0.9 },
      playback: seed.loopMode === "ping-pong" ? "ping-pong-reverse" : "normal",
      background: "transparent"
    },
    notes: seed.notes
  };
}

const RECIPE_SEEDS: MotionRecipeSeed[] = [
  {
    id: "idle-breathing", family: "core", displayName: { en: "Idle Breathing", ja: "待機呼吸ループ" },
    localizedDescription: { en: "Stable 8-frame ready stance with planted feet and subtle breathing.", ja: "足を固定し、呼吸と二次動作が読める8フレーム待機です。" },
    actionName: "idle", previewClassName: "sample-idle-sheet sample-idle", loopMode: "loop", defaultFps: 12,
    phases: ["neutral", "inhale", "secondary rise", "top of breath", "exhale", "secondary settle", "return", "loop bridge"],
    groundingProfile: "grounded", motionIntensity: "subtle",
    motion: "Idle breathing ready stance with planted feet, a visible 2-4px shoulder and chest rise, controlled inhale/exhale, and a stable center.",
    notes: "Feet remain planted on the exact baseline; no stepping, walking, hopping, or nearly identical frames.",
    secondaryMotion: ["hair, hood, clothing, and backpack follow the breath with a small delay"]
  },
  {
    id: "walk-cycle", family: "locomotion", displayName: { en: "Walk Cycle", ja: "歩行ループ" },
    localizedDescription: { en: "Readable walking loop with contact and passing poses.", ja: "接地と通過ポーズが読める8フレーム歩行です。" },
    actionName: "walk", previewClassName: "sample-walk-sheet sample-walk", loopMode: "loop", defaultFps: 12,
    phases: ["left contact", "left down", "left passing", "right reach", "right contact", "right down", "right passing", "left reach bridge"],
    groundingProfile: "grounded", motionIntensity: "moderate",
    motion: "Alternating walk cycle with clear contact, passing, opposite arm swing, modest stride, knee bend, toe contact, and no airborne frame.",
    notes: "At least one foot stays near the ground; frame 1 and frame 5 must show clearly different contact silhouettes.",
    secondaryMotion: ["subtle torso bob and hair or clothing follow-through support visible leg motion"]
  },
  {
    id: "run-cycle", family: "locomotion", displayName: { en: "Run Cycle", ja: "走行ループ" },
    localizedDescription: { en: "Fast strides with airborne beats and strong arm drive.", ja: "空中フレームと強い腕振りが読める走りです。" },
    actionName: "run", previewClassName: "sample-run-sheet sample-run", loopMode: "ping-pong", defaultFps: 20,
    phases: ["right-lead stride", "stride narrows", "feet together", "crossover", "left lead begins", "left reach", "airborne stride", "left-lead endpoint"],
    groundingProfile: "airborne", motionIntensity: "high",
    motion: "Generate one run half-cycle: the right-leading stride crosses through mandatory feet-together passing poses into the left-leading stride.",
    notes: "Playback appends the reverse order for a 16-frame ping-pong cycle; do not squeeze both full halves into the source frames.",
    secondaryMotion: ["forward torso lean, strong opposite arm drive, hair and clothing lag"]
  },
  {
    id: "basic-attack", family: "combat", displayName: { en: "Basic Attack", ja: "基本攻撃" },
    localizedDescription: { en: "Grounded attack with anticipation, impact, and recovery.", ja: "溜め、打撃、戻りが読める基本攻撃です。" },
    actionName: "attack", previewClassName: "sample-attack-sheet sample-attack", loopMode: "one-shot", defaultFps: 12,
    phases: ["ready", "anticipation", "wind-up", "strike", "impact", "follow-through", "recover", "ready end"],
    groundingProfile: "grounded", motionIntensity: "high",
    motion: "Generic forward armed or unarmed attack with a planted pivot foot, readable strike direction, compact lunge, impact, and recovery.",
    notes: "Keep the lower body stable and the strike, hand, weapon, and any tiny trail within the cell.",
    allowedVfx: ["small slash arc", "small hit spark"], negative: ["large attack effects, foot skating, random stance-width changes"]
  },
  {
    id: "hurt-reaction", family: "combat", displayName: { en: "Hurt Reaction", ja: "被弾リアクション" },
    localizedDescription: { en: "Short recoil, stagger, and return.", ja: "のけぞり、踏ん張り、復帰が読める被弾動作です。" },
    actionName: "hurt", previewClassName: "sample-hurt-sheet sample-hurt", loopMode: "one-shot", defaultFps: 12,
    phases: ["ready", "hit start", "recoil", "recoil peak", "brace", "regain balance", "settle", "ready end"],
    groundingProfile: "grounded", motionIntensity: "moderate",
    motion: "Brief non-gory hit reaction using torso angle, head jolt, shoulder lift, and a bracing foot without collapsing.",
    notes: "Make the recoil distinct from attack, jump, and downed animations.", allowedVfx: ["tiny hit spark"],
    negative: ["blood, wounds, gore, broken limbs, collapse to ground"]
  },
  {
    id: "death-downed", family: "combat", displayName: { en: "Death / Downed", ja: "ダウン" },
    localizedDescription: { en: "Non-gory collapse into a compact defeated pose.", ja: "流血なしでコンパクトに倒れ込むダウンです。" },
    actionName: "death", previewClassName: "sample-death-sheet sample-slow", loopMode: "one-shot", defaultFps: 8,
    phases: ["lose balance", "collapse begins", "fall or kneel", "ground contact", "downed pose", "settle", "final still", "final hold"],
    groundingProfile: "downed", motionIntensity: "high",
    motion: "Game-style non-gory defeat that collapses or kneels into a compact, readable, mostly still downed pose.",
    notes: "Prefer kneeling, slumped, seated, or compact fallen poses over a full sideways corpse.",
    negative: ["blood, gore, wounds, dismemberment, horror detail, corpse realism"]
  },
  {
    id: "spell-cast", family: "magic", displayName: { en: "Spell Cast", ja: "詠唱 / 発動" },
    localizedDescription: { en: "Raise, charge, release, and recover with compact magic.", ja: "小さな魔法効果で詠唱から発動まで読める動きです。" },
    actionName: "cast", previewClassName: "sample-cast-sheet sample-cast", loopMode: "one-shot", defaultFps: 10,
    phases: ["ready", "raise focus", "charge", "bright charge", "release", "follow-through", "settle", "ready end"],
    groundingProfile: "grounded", motionIntensity: "moderate",
    motion: "Grounded spell cast with planted feet or anchored robe hem and a compact charge/release at the hand, staff, book, or focus.",
    notes: "Use one consistent effect color, size, and attachment point across directions.", requiredProps: ["preserve source focus prop when present"],
    allowedVfx: ["small attached magic charge", "compact release"], negative: ["giant circles, beams, explosions, floating body"]
  },
  {
    id: "jump-hop", family: "locomotion", displayName: { en: "Jump / Hop", ja: "ジャンプ" },
    localizedDescription: { en: "Compact in-place jump with landing and settle.", ja: "踏み切り、頂点、着地が読める小さなジャンプです。" },
    actionName: "jump", previewClassName: "sample-jump-sheet sample-jump", loopMode: "one-shot", defaultFps: 12,
    phases: ["ready", "crouch", "push-off", "rising", "apex", "falling", "landing squash", "settle"],
    groundingProfile: "airborne", motionIntensity: "high",
    motion: "Small in-place jump with crouch, push-off, apex, fall, landing squash, and a return to the original center and baseline.",
    notes: "Leave generous top padding for hair, hats, ears, staff, and weapons.", negative: ["dash, long leap, flying pose, cropped apex"]
  },
  {
    id: "guard-block", family: "combat", displayName: { en: "Guard / Block", ja: "ガード" },
    localizedDescription: { en: "Raise guard, brace, absorb, and recover.", ja: "防御を構え、受け止め、戻るガード動作です。" },
    actionName: "guard", previewClassName: "sample-guard-sheet sample-guard", loopMode: "one-shot", defaultFps: 10,
    phases: ["ready", "raise guard", "brace", "hold", "absorb", "recoil", "recover", "guard end"],
    groundingProfile: "grounded", motionIntensity: "moderate",
    motion: "Readable defensive brace using arms, weapon, staff, shield, or body stance without hiding the character.",
    notes: "It must read as defense even without a shield.", allowedVfx: ["tiny impact spark", "small shield flash"], negative: ["attack swing, hidden face and torso"]
  },
  {
    id: "victory-cheer", family: "social", displayName: { en: "Victory Cheer", ja: "勝利ポーズ" },
    localizedDescription: { en: "Loopable cheer or wave with a small bounce.", ja: "小さな跳ねと手振りが読める勝利ループです。" },
    actionName: "cheer", previewClassName: "sample-cheer-sheet sample-cheer", loopMode: "loop", defaultFps: 10,
    phases: ["ready", "arm rises", "cheer peak", "small bounce", "wave or hold", "settle", "proud pose", "loop bridge"],
    groundingProfile: "grounded", motionIntensity: "moderate",
    motion: "Expressive victory cheer or wave using arms, head, clothing, and only a small celebratory bounce.",
    notes: "Keep it distinct from jump by preserving a stable landing baseline.", negative: ["large jump, confetti clouds, trophy labels"]
  },
  {
    id: "interact-pickup", family: "utility", displayName: { en: "Interact / Pickup", ja: "調べる / 拾う" },
    localizedDescription: { en: "Look, reach, inspect or pick up, then return.", ja: "見る、伸ばす、拾う、戻る汎用動作です。" },
    actionName: "interact", previewClassName: "sample-interact-sheet sample-interact", loopMode: "one-shot", defaultFps: 10,
    phases: ["ready", "look", "reach", "bend or pickup", "inspect", "return upward", "settle", "ready end"],
    groundingProfile: "grounded", motionIntensity: "moderate",
    motion: "Generic interact, inspect, or pickup action with readable hands and a compact upper-body bend.",
    notes: "Any item remains small; avoid a crouch that crushes the silhouette.", requiredProps: ["optional small interaction item"], negative: ["second character, cluttered prop, deep cropped crouch"]
  },
  {
    id: "ranged-attack", family: "combat", displayName: { en: "Ranged Attack", ja: "遠距離攻撃" },
    localizedDescription: { en: "Aim, release a tiny shot, and recover.", ja: "狙い、小さな射撃、戻りが読める遠距離攻撃です。" },
    actionName: "ranged", previewClassName: "sample-ranged-sheet sample-ranged", loopMode: "one-shot", defaultFps: 12,
    phases: ["ready", "aim", "draw or charge", "release", "tiny shot", "follow-through", "recover", "ready end"],
    groundingProfile: "grounded", motionIntensity: "high",
    motion: "Generic ranged action for bows, throws, staffs, or light shots with a compact forward release.",
    notes: "Use one consistent tiny projectile no larger than about 20x20px near the hand or weapon tip.", requiredProps: ["preserve source ranged prop or add one compact generic prop"],
    allowedVfx: ["one tiny projectile", "small release spark"], negative: ["large gun, cannon, beam, smoke cloud, projectile crossing cell edges"]
  },
  {
    id: "skill-release", family: "magic", displayName: { en: "Skill Release", ja: "スキル発動" },
    localizedDescription: { en: "Compact activation burst after focus.", ja: "溜めより発動を重視したコンパクトなスキルです。" },
    actionName: "skill", previewClassName: "sample-skill-sheet sample-skill", loopMode: "one-shot", defaultFps: 12,
    phases: ["ready", "focus", "compress energy", "release", "peak effect", "recoil", "settle", "ready end"],
    groundingProfile: "grounded", motionIntensity: "high",
    motion: "Compact skill activation emphasizing frames 4-5, with energy attached to hand, chest, weapon, or feet while the silhouette stays visible.",
    notes: "This is the release moment, not a long cast or detached ranged weapon attack.", allowedVfx: ["compact attached burst"],
    negative: ["arrows, bullets, guns, bows, thrown weapons, screen-filling effects"]
  },
  {
    id: "knockback", family: "combat", displayName: { en: "Knockback", ja: "ノックバック" },
    localizedDescription: { en: "Large recoil, backward force, stumble, and recovery.", ja: "大きくのけぞり、後退し、戻るノックバックです。" },
    actionName: "knockback", previewClassName: "sample-knockback-sheet sample-knockback", loopMode: "one-shot", defaultFps: 12,
    phases: ["ready", "impact", "lean back", "recoil peak", "stumble", "regain footing", "settle", "ready end"],
    groundingProfile: "exempt", motionIntensity: "high",
    motion: "Strong non-gory knockback with torso recoil, compact backward slide, bracing foot, stumble, and full recovery.",
    notes: "Stronger than Hurt Reaction but never becomes a defeated/downed pose.", allowedVfx: ["tiny hit spark"], negative: ["blood, gore, cell-boundary crossing, collapse to floor"]
  },
  {
    id: "item-use", family: "utility", displayName: { en: "Item Use", ja: "アイテム使用" },
    localizedDescription: { en: "Draw, use, read, and stow a small item.", ja: "小物を取り出し、使い、戻す道具使用です。" },
    actionName: "item", previewClassName: "sample-item-sheet sample-item", loopMode: "one-shot", defaultFps: 10,
    phases: ["ready", "draw item", "present item", "use item", "tiny read beat", "put away", "settle", "ready end"],
    groundingProfile: "grounded", motionIntensity: "moderate",
    motion: "Upright hand-focused item use with a compact potion, scroll, bottle, charm, ration, card, device, or tool.",
    notes: "Keep the item near the body and do not bend toward the floor.", requiredProps: ["one small generic item"], allowedVfx: ["tiny confirmation spark"], negative: ["readable text, large prop, ground pickup, speech bubble"]
  },
  {
    id: "talk", family: "social", displayName: { en: "Talk / NPC Reaction", ja: "会話 / NPCリアクション" },
    localizedDescription: { en: "Subtle loopable talk with gestures and nods.", ja: "手振りや頷きで会話感を出す控えめなループです。" },
    actionName: "talk", previewClassName: "sample-talk-sheet sample-talk", loopMode: "loop", defaultFps: 10,
    phases: ["neutral", "gesture begins", "small nod", "gesture peak", "blink or settle", "second gesture", "return", "loop bridge"],
    groundingProfile: "grounded", motionIntensity: "subtle",
    motion: "Restrained NPC conversation loop using small hand gestures, nods, shoulders, blink, and a clean bridge.",
    notes: "Keep feet planted; conversation must remain readable even when pixel-art mouth motion is tiny.",
    secondaryMotion: ["small shoulder and clothing follow-through supports the restrained gestures"], negative: ["speech bubbles, punctuation, emojis, floating symbols, attack or dance motion"]
  }
];

export const MOTION_RECIPES: readonly MotionRecipe[] = RECIPE_SEEDS.map(createMotionRecipe);
const MOTION_RECIPE_BY_ID = new Map(MOTION_RECIPES.map((recipe) => [recipe.id, recipe]));

export interface MotionRecipeReference {
  id: string;
  version: number;
  compilerVersion: string;
  qualityProfile: AnimationActionQualityProfile;
}

export type MotionRecipeResolutionKind = "exact" | "legacy-preset-fallback" | "version-migration" | "unknown-version-fallback" | "default";

export function resolveMotionRecipe(input: {
  recipeId?: string;
  recipeVersion?: number | string;
  presetId?: string;
  actionName?: string;
}): { recipe: MotionRecipe; resolution: MotionRecipeResolutionKind; warnings: string[] } {
  const requestedId = input.recipeId?.trim() || input.presetId?.trim();
  const byId = requestedId ? MOTION_RECIPE_BY_ID.get(requestedId) : undefined;
  const byAction = input.actionName ? MOTION_RECIPES.find((recipe) => recipe.actionName === input.actionName?.trim().toLowerCase()) : undefined;
  const recipe = byId ?? byAction ?? MOTION_RECIPE_BY_ID.get("idle-breathing") ?? MOTION_RECIPES[0]!;
  const parsedVersion = input.recipeVersion === undefined || input.recipeVersion === "" ? undefined : Number(input.recipeVersion);
  if (!requestedId && !input.actionName) return { recipe, resolution: "default", warnings: ["No recipe metadata was found; Idle Breathing v1 was selected explicitly."] };
  if (!byId && requestedId) return { recipe, resolution: "legacy-preset-fallback", warnings: [`Unknown recipe id '${requestedId}'; resolved by action or safe default.`] };
  if (parsedVersion === undefined) return { recipe, resolution: "legacy-preset-fallback", warnings: [`Legacy preset '${recipe.id}' had no recipe version; migrated to v${recipe.version}.`] };
  if (parsedVersion === recipe.version) return { recipe, resolution: "exact", warnings: [] };
  if (parsedVersion === 0) return { recipe, resolution: "version-migration", warnings: [`Recipe '${recipe.id}' v0 migrated to v${recipe.version}.`] };
  return { recipe, resolution: "unknown-version-fallback", warnings: [`Unknown recipe version '${input.recipeVersion}' for '${recipe.id}'; using current v${recipe.version} with explicit warning.`] };
}

export function motionRecipeReference(recipe: MotionRecipe): MotionRecipeReference {
  return { id: recipe.id, version: recipe.version, compilerVersion: MOTION_RECIPE_COMPILER_VERSION, qualityProfile: recipe.qualityProfile.actionProfile };
}

export interface MotionRecipeModifier {
  id: string;
  text: string;
  enabled?: boolean;
}

export interface CompiledMotionRecipe {
  prompt: string;
  negativePrompt: string;
  notes: string;
  metadata: MotionRecipeReference;
  sections: Array<{ id: "hard" | "motion" | "phases" | "identity" | "direction" | "background" | "negative"; lines: string[] }>;
  diagnostics: {
    sectionOrder: string[];
    appliedModifiers: string[];
    removedModifiers: string[];
    deduplicatedSegmentCount: number;
  };
  qaContract: ReturnType<typeof compileMotionRecipeQaContract>;
}

export function compileMotionRecipe(input: {
  recipe: MotionRecipe;
  directions: readonly string[];
  modifiers?: readonly MotionRecipeModifier[];
}): CompiledMotionRecipe {
  const directions = input.directions.map((direction) => direction.trim()).filter(Boolean);
  const modifiers = input.modifiers ?? [];
  const appliedModifiers = modifiers.filter((item) => item.enabled !== false && item.text.trim()).map((item) => item.id);
  const removedModifiers = modifiers.filter((item) => item.enabled === false || !item.text.trim()).map((item) => item.id);
  const sectionInput: CompiledMotionRecipe["sections"] = [
    { id: "hard", lines: [`Motion Recipe: ${input.recipe.id} v${input.recipe.version}; compiler ${MOTION_RECIPE_COMPILER_VERSION}.`, ...input.recipe.promptSegments.hard] },
    { id: "motion", lines: [...input.recipe.promptSegments.motion, ...input.recipe.secondaryMotion, ...modifiers.filter((item) => item.enabled !== false).map((item) => item.text)] },
    { id: "phases", lines: input.recipe.framePhases.map((phase) => `Frames ${phase.frameStart}-${phase.frameEnd}: ${phase.description}.`) },
    { id: "identity", lines: [...input.recipe.promptSegments.identity, input.recipe.silhouetteExpectation, input.recipe.rootMotionPolicy, input.recipe.anchorPolicy] },
    { id: "direction", lines: [...input.recipe.promptSegments.direction, `Requested directions only: ${directions.join(", ") || "front"}.`, directionIdentityRule(directions)] },
    { id: "background", lines: input.recipe.promptSegments.background },
    { id: "negative", lines: input.recipe.negativeConstraints }
  ];
  const seen = new Set<string>();
  let deduplicatedSegmentCount = 0;
  const sections = sectionInput.map((section) => ({
    ...section,
    lines: section.lines.map(cleanSegment).filter((line) => {
      if (!line) return false;
      const key = line.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
      if (seen.has(key)) {
        deduplicatedSegmentCount += 1;
        return false;
      }
      seen.add(key);
      return true;
    })
  }));
  const negativePrompt = sections.find((section) => section.id === "negative")?.lines.join(", ") ?? "";
  const prompt = sections.map((section) => `${section.id.toUpperCase()}: ${section.lines.join(" ")}`).join("\n");
  const metadata = motionRecipeReference(input.recipe);
  return {
    prompt,
    negativePrompt,
    notes: [`Motion Recipe ${metadata.id} v${metadata.version}`, `Compiler ${metadata.compilerVersion}`, `QA profile ${metadata.qualityProfile}`, input.recipe.notes].join("\n"),
    metadata,
    sections,
    diagnostics: { sectionOrder: sections.map((section) => section.id), appliedModifiers, removedModifiers, deduplicatedSegmentCount },
    qaContract: compileMotionRecipeQaContract(input.recipe)
  };
}

export function compileMotionRecipeQaContract(recipe: MotionRecipe) {
  return {
    recipe: motionRecipeReference(recipe),
    actionProfile: recipe.qualityProfile.actionProfile,
    expectedPhases: recipe.qualityProfile.expectedPhases,
    loopExpected: recipe.qualityProfile.loopSeamRequired,
    loopMode: recipe.loopMode,
    groundingProfile: recipe.groundingProfile,
    motionRange: recipe.qualityProfile.motionRange,
    rootDriftTolerancePx: recipe.qualityProfile.rootDriftTolerancePx,
    footlineTolerancePx: recipe.qualityProfile.footlineTolerancePx,
    requiredProps: recipe.requiredProps,
    allowedVfx: recipe.allowedVfx,
    fps: recipe.defaultFps,
    frameCount: recipe.frameCount,
    exportDefaults: recipe.exportDefaults
  };
}

export function validateMotionRecipe(value: MotionRecipe): string[] {
  const errors: string[] = [];
  if (value.schema !== MOTION_RECIPE_SCHEMA) errors.push("schema");
  if (!value.id.trim()) errors.push("id");
  if (value.version !== MOTION_RECIPE_VERSION) errors.push("version");
  if (!value.family || !value.displayName.en || !value.displayName.ja || !value.localizedDescription.en || !value.localizedDescription.ja) errors.push("localized metadata");
  if (!value.loopMode || value.defaultFps <= 0 || value.frameCount <= 0 || value.framePhases.length === 0) errors.push("timing");
  if (value.framePhases.some((phase) => phase.frameStart < 1 || phase.frameEnd > value.frameCount || phase.frameStart > phase.frameEnd)) errors.push("framePhases");
  if (!value.groundingProfile || !value.rootMotionPolicy || !value.anchorPolicy || !value.silhouetteExpectation) errors.push("motion policy");
  if (!Array.isArray(value.requiredProps) || !Array.isArray(value.allowedVfx) || !Array.isArray(value.identityConstraints) || !Array.isArray(value.secondaryMotion)) errors.push("constraints");
  if (!value.promptSegments.hard.length || !value.promptSegments.motion.length || !value.negativeConstraints.length) errors.push("promptSegments");
  if (!value.qualityProfile.expectedPhases.length || value.qualityProfile.motionRange.length !== 2) errors.push("qualityProfile");
  if (value.exportDefaults.cell.width <= 0 || value.exportDefaults.cell.height <= 0) errors.push("exportDefaults");
  return errors;
}

function cleanSegment(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function directionIdentityRule(directions: readonly string[]) {
  const rules = [
    directions.includes("front") ? "front is straight toward camera" : "",
    directions.includes("front three-quarter") ? "front three-quarter is diagonal-front" : "",
    directions.includes("side") ? "side is strict profile" : "",
    directions.includes("back three-quarter") ? "back three-quarter is diagonal-back" : "",
    directions.includes("back") ? "back is a true straight rear view with no face details" : ""
  ].filter(Boolean);
  return `Direction identity: ${rules.join(", ") || "use the requested direction labels exactly"}.`;
}
