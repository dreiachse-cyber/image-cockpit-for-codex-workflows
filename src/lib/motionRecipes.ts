import type { AnimationActionQualityProfile } from "../types";

export const MOTION_RECIPE_SCHEMA = "image-cockpit.motion-recipe.v1" as const;
export const MOTION_RECIPE_VERSION = 1 as const;
export const MOTION_RECIPE_COMPILER_VERSION = "1.2.0" as const;

export type MotionRecipeLoopMode = "loop" | "one-shot" | "ping-pong";
export type MotionRecipeGroundingProfile = "grounded" | "airborne" | "downed" | "exempt";
export type MotionRecipeIntensity = "subtle" | "moderate" | "high";
export type MotionFrameCount = 4 | 6 | 8 | 12 | 16 | 20;
export const MOTION_FRAME_COUNTS: readonly MotionFrameCount[] = [4, 6, 8, 12, 16, 20];
export const EXPERIMENTAL_MOTION_FRAME_COUNTS = [16, 20] as const;

export function isExperimentalMotionFrameCount(value: number): boolean {
  return EXPERIMENTAL_MOTION_FRAME_COUNTS.some((frameCount) => frameCount === value);
}

export type BodyTopologyId =
  | "biped"
  | "quadruped"
  | "serpentine-or-body-contact"
  | "floating"
  | "winged-flying"
  | "multi-leg";

export type BodyContactQaDimension = "footline" | "paw-contact" | "body-contact" | "hover-height" | "wing-beat" | "multi-contact";

export interface BodyTopologyProfile {
  id: BodyTopologyId;
  displayName: { en: string; ja: string };
  groundContactParts: string[];
  anchorPolicy: string;
  bboxExpectation: string;
  rootMotionPolicy: string;
  footlineApplicable: boolean;
  contactQaDimension: BodyContactQaDimension;
  secondaryMotion: string[];
  directionSilhouetteNotes: string[];
}

export const BODY_TOPOLOGY_PROFILES: readonly BodyTopologyProfile[] = [
  {
    id: "biped",
    displayName: { en: "Biped", ja: "二足" },
    groundContactParts: ["left foot", "right foot", "robe hem when it replaces visible feet"],
    anchorPolicy: "Use the bottom-center root between the planted feet and preserve the standing baseline.",
    bboxExpectation: "Keep the full head-to-feet silhouette inside the cell with stable head size and leg length.",
    rootMotionPolicy: "Measure root translation from the pelvis and the midpoint between planted feet.",
    footlineApplicable: true,
    contactQaDimension: "footline",
    secondaryMotion: ["hair", "clothing", "tail or carried gear when present"],
    directionSilhouetteNotes: ["Keep both legs readable in front and rear views.", "Keep the profile foot order and weapon side readable in side view."]
  },
  {
    id: "quadruped",
    displayName: { en: "Quadruped", ja: "四足" },
    groundContactParts: ["front paws or hooves", "rear paws or hooves"],
    anchorPolicy: "Use the center of the support polygon formed by paws or hooves, not a humanoid pelvis anchor.",
    bboxExpectation: "Preserve body length, shoulder height, head scale, and tail clearance across frames.",
    rootMotionPolicy: "Measure torso translation and alternating paw contact; do not force a two-foot baseline.",
    footlineApplicable: false,
    contactQaDimension: "paw-contact",
    secondaryMotion: ["tail", "ears", "mane or fur", "saddle or carried gear"],
    directionSilhouetteNotes: ["Separate near and far legs in side view.", "Keep head, torso, hindquarters, and tail order readable in front and rear views."]
  },
  {
    id: "serpentine-or-body-contact",
    displayName: { en: "Serpentine / body contact", ja: "蛇行 / 胴体接地" },
    groundContactParts: ["lower body contact arc", "tail or belly support"],
    anchorPolicy: "Anchor to the center of the stable body-contact arc instead of inventing feet.",
    bboxExpectation: "Preserve body length, coil thickness, head scale, and readable contact curve without per-frame stretching.",
    rootMotionPolicy: "Measure root from the head-to-body centerline and body-contact path.",
    footlineApplicable: false,
    contactQaDimension: "body-contact",
    secondaryMotion: ["tail tip", "fins", "crest", "upper-body accessories"],
    directionSilhouetteNotes: ["Keep the body curve and head direction unambiguous.", "Do not mirror coil handedness accidentally between adjacent frames."]
  },
  {
    id: "floating",
    displayName: { en: "Floating", ja: "浮遊" },
    groundContactParts: [],
    anchorPolicy: "Anchor to a stable hover center and measure hover height above the source baseline.",
    bboxExpectation: "Preserve full floating silhouette and a consistent empty gap below the body.",
    rootMotionPolicy: "Measure controlled hover-height change and horizontal root drift; never snap to a footline.",
    footlineApplicable: false,
    contactQaDimension: "hover-height",
    secondaryMotion: ["cloth", "wisps", "orbiting details", "hair"],
    directionSilhouetteNotes: ["Keep the hover gap visible in every direction.", "Keep orbiting or trailing elements attached to the same body side."]
  },
  {
    id: "winged-flying",
    displayName: { en: "Winged flying", ja: "有翼飛行" },
    groundContactParts: [],
    anchorPolicy: "Anchor to the chest or body mass center and preserve flight altitude unless the Recipe includes takeoff or landing.",
    bboxExpectation: "Keep full wing tips, tail, head, and feet or talons inside the cell at maximum wing extension.",
    rootMotionPolicy: "Measure body-center travel separately from the wing-beat envelope.",
    footlineApplicable: false,
    contactQaDimension: "wing-beat",
    secondaryMotion: ["wing feathers or membranes", "tail", "ears", "trailing cloth"],
    directionSilhouetteNotes: ["Front and rear views must distinguish wing sweep and body facing.", "Side view must preserve full nose-to-tail and wing-tip clearance."]
  },
  {
    id: "multi-leg",
    displayName: { en: "Multi-leg", ja: "多脚" },
    groundContactParts: ["supporting leg set", "alternating contact cluster"],
    anchorPolicy: "Anchor to the center of the active support polygon across all planted legs.",
    bboxExpectation: "Preserve torso scale, leg count impression, and radial or bilateral leg spacing.",
    rootMotionPolicy: "Measure body center plus support-cluster changes; do not collapse contacts to two humanoid feet.",
    footlineApplicable: false,
    contactQaDimension: "multi-contact",
    secondaryMotion: ["antennae", "abdomen", "tail", "outer leg follow-through"],
    directionSilhouetteNotes: ["Keep the intended leg-count impression and avoid merged leg masses.", "Preserve front/rear body orientation even when the leg pattern is nearly radial."]
  }
];

const BODY_TOPOLOGY_BY_ID = new Map(BODY_TOPOLOGY_PROFILES.map((profile) => [profile.id, profile]));

export type MotionVariantModifierKey =
  | "intensity"
  | "tempo"
  | "weight"
  | "exaggeration"
  | "handedness"
  | "weaponClass"
  | "travelAmount"
  | "secondaryMotionLevel"
  | "vfxAmount";

export interface MotionVariantSelection {
  intensity: "subtle" | "normal" | "strong";
  tempo: "slow" | "normal" | "fast";
  weight: "light" | "normal" | "heavy";
  exaggeration: "low" | "normal" | "high";
  handedness: "inherit" | "left" | "right" | "ambidextrous";
  weaponClass: "none" | "unarmed" | "sword" | "heavy-weapon" | "polearm" | "bow" | "firearm" | "staff" | "shield";
  travelAmount: "in-place" | "short" | "medium" | "long";
  secondaryMotionLevel: "low" | "normal" | "high";
  vfxAmount: "none" | "low" | "normal" | "high";
}

export const DEFAULT_MOTION_VARIANT: MotionVariantSelection = {
  intensity: "normal",
  tempo: "normal",
  weight: "normal",
  exaggeration: "normal",
  handedness: "inherit",
  weaponClass: "none",
  travelAmount: "in-place",
  secondaryMotionLevel: "normal",
  vfxAmount: "none"
};

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
  allowedFrameCounts: MotionFrameCount[];
  framePhases: MotionRecipeFramePhase[];
  defaultTopology: BodyTopologyId;
  supportedTopologies: BodyTopologyId[];
  allowedModifiers: MotionVariantModifierKey[];
  experimental: boolean;
  tags: string[];
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
  frameCount?: MotionFrameCount;
  allowedFrameCounts?: MotionFrameCount[];
  defaultTopology?: BodyTopologyId;
  supportedTopologies?: BodyTopologyId[];
  allowedModifiers?: MotionVariantModifierKey[];
  experimental?: boolean;
  tags?: string[];
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
  const frameCount = seed.frameCount ?? 8;
  const framePhases = seed.phases.map((description, index) => ({
    id: description.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || `phase-${index + 1}`,
    frameStart: Math.min(frameCount, Math.floor((index * frameCount) / seed.phases.length) + 1),
    frameEnd: Math.min(frameCount, Math.max(1, Math.floor(((index + 1) * frameCount) / seed.phases.length))),
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
    frameCount,
    allowedFrameCounts: seed.allowedFrameCounts ?? [...MOTION_FRAME_COUNTS],
    framePhases,
    defaultTopology: seed.defaultTopology ?? "biped",
    supportedTopologies: seed.supportedTopologies ?? [seed.defaultTopology ?? "biped"],
    allowedModifiers: seed.allowedModifiers ?? ["intensity", "tempo", "weight", "exaggeration", "secondaryMotionLevel"],
    experimental: seed.experimental ?? false,
    tags: seed.tags ?? [seed.family, seed.loopMode],
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
        `Create exactly ${frameCount} source frames for each requested direction.`,
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
  },
  {
    id: "dash", family: "locomotion", displayName: { en: "Dash", ja: "ダッシュ" },
    localizedDescription: { en: "Explosive acceleration, travel, brake, and ready recovery.", ja: "爆発的な加速、移動、制動、復帰が読めるダッシュです。" },
    actionName: "dash", previewClassName: "sample-run-sheet sample-run", loopMode: "one-shot", defaultFps: 18,
    phases: ["ready", "compression", "launch", "acceleration", "peak travel", "brake", "replant", "ready end"],
    groundingProfile: "exempt", motionIntensity: "high",
    motion: "Explosive game dash with compression, strong launch silhouette, controlled travel, braking contact, and a readable recovery.",
    notes: "Travel must stay within the cell and the final frame must not be mistaken for a looping run pose.",
    supportedTopologies: ["biped", "quadruped", "serpentine-or-body-contact", "floating", "winged-flying", "multi-leg"],
    allowedModifiers: ["intensity", "tempo", "weight", "exaggeration", "travelAmount", "secondaryMotionLevel", "vfxAmount"],
    allowedVfx: ["small launch streak", "small brake dust", "compact speed accent"],
    experimental: true, tags: ["movement", "travel", "burst", "experimental"],
    negative: ["continuous run cycle, teleport, screen-wide speed lines, cell-boundary crossing"]
  },
  {
    id: "dodge-roll", family: "locomotion", displayName: { en: "Dodge Roll / Backstep", ja: "回避ロール / バックステップ" },
    localizedDescription: { en: "Evade, compact transit, replant, and face the threat again.", ja: "回避、短い移動、再接地、構え直しが読める動作です。" },
    actionName: "dodge", previewClassName: "sample-knockback-sheet sample-knockback", loopMode: "one-shot", defaultFps: 14,
    phases: ["ready", "evade anticipation", "leave line", "compact transit", "clear threat", "replant", "turn back", "ready end"],
    groundingProfile: "exempt", motionIntensity: "high",
    motion: "Compact evasive roll or backstep chosen to fit the source topology, followed by a clean replant and ready stance.",
    notes: "Do not force a humanoid somersault onto a topology that should sidestep, coil, hop, or hover-shift instead.",
    supportedTopologies: ["biped", "quadruped", "serpentine-or-body-contact", "floating", "multi-leg"],
    allowedModifiers: ["intensity", "tempo", "weight", "exaggeration", "travelAmount", "secondaryMotionLevel"],
    experimental: true, tags: ["movement", "evasion", "one-shot", "experimental"],
    negative: ["attack impact, defeated pose, continuous spin, cropped roll, invented feet"]
  },
  {
    id: "charge-heavy-attack", family: "combat", displayName: { en: "Charge / Heavy Attack", ja: "溜め / 強攻撃" },
    localizedDescription: { en: "Weighty charge, decisive impact, follow-through, and recovery.", ja: "重い溜め、決定的な打撃、振り抜き、復帰が読める強攻撃です。" },
    actionName: "heavy-attack", previewClassName: "sample-attack-sheet sample-attack", loopMode: "one-shot", defaultFps: 10,
    phases: ["ready", "load weight", "deep charge", "release begins", "heavy impact", "follow-through", "recover weight", "ready end"],
    groundingProfile: "grounded", motionIntensity: "high",
    motion: "Heavy charged attack with visible weight loading, delayed release, one decisive impact, broad follow-through, and controlled recovery.",
    notes: "The support contacts and prop grip must remain coherent while the attack arc becomes wider than a basic attack.",
    requiredProps: ["preserve the source weapon or focus when present"],
    allowedVfx: ["compact heavy slash arc", "small impact burst", "brief charge glow"],
    supportedTopologies: ["biped", "quadruped", "multi-leg"],
    allowedModifiers: ["intensity", "tempo", "weight", "exaggeration", "handedness", "weaponClass", "travelAmount", "secondaryMotionLevel", "vfxAmount"],
    experimental: true, tags: ["combat", "weapon", "heavy", "one-shot", "experimental"],
    negative: ["light jab, rapid combo, continuous loop, detached weapon, grip switching"]
  },
  {
    id: "combo-attack", family: "combat", displayName: { en: "Combo Attack", ja: "連続攻撃" },
    localizedDescription: { en: "Two or three linked strikes with readable rhythm and a final recovery.", ja: "2〜3打のつながり、リズム、最終復帰が読める連続攻撃です。" },
    actionName: "combo", previewClassName: "sample-attack-sheet sample-attack", loopMode: "one-shot", defaultFps: 16,
    phases: ["ready", "first wind-up", "first strike", "link", "second strike", "finisher", "follow-through", "ready end"],
    groundingProfile: "grounded", motionIntensity: "high",
    motion: "Two or three clearly linked attacks with alternating silhouettes, one readable finisher, and a full recovery instead of a seamless loop.",
    notes: "Preserve handedness, weapon class, grip, and facing through every link; do not duplicate one strike pose.",
    requiredProps: ["preserve the source weapon or unarmed identity consistently"],
    allowedVfx: ["small per-strike slash accents", "compact finisher spark"],
    supportedTopologies: ["biped", "quadruped", "multi-leg"],
    allowedModifiers: ["intensity", "tempo", "weight", "exaggeration", "handedness", "weaponClass", "travelAmount", "secondaryMotionLevel", "vfxAmount"],
    experimental: true, tags: ["combat", "weapon", "combo", "one-shot", "experimental"],
    negative: ["single repeated strike, grip switching, infinite combo loop, screen-filling effects"]
  },
  {
    id: "stun", family: "combat", displayName: { en: "Stun", ja: "スタン" },
    localizedDescription: { en: "Impact loss of control, unstable hold, and partial recovery.", ja: "衝撃、制御喪失、不安定な停止、回復が読めるスタンです。" },
    actionName: "stun", previewClassName: "sample-hurt-sheet sample-hurt", loopMode: "one-shot", defaultFps: 10,
    phases: ["ready", "stun impact", "balance breaks", "unstable peak", "stunned hold", "regain control", "settle", "ready end"],
    groundingProfile: "exempt", motionIntensity: "moderate",
    motion: "Non-gory stun reaction with an immediate control break, a readable unstable hold, and a partial recovery without becoming downed.",
    notes: "Use topology-appropriate support loss: foot stagger, paw brace, body wobble, hover disruption, wing hitch, or leg-cluster instability.",
    allowedVfx: ["tiny attached stun spark", "small orbiting accent"],
    supportedTopologies: ["biped", "quadruped", "serpentine-or-body-contact", "floating", "winged-flying", "multi-leg"],
    allowedModifiers: ["intensity", "tempo", "weight", "exaggeration", "secondaryMotionLevel", "vfxAmount"],
    experimental: true, tags: ["combat", "reaction", "control", "experimental"],
    negative: ["blood, gore, collapse to defeated pose, large cartoon symbols, invented humanoid legs"]
  },
  {
    id: "get-up", family: "utility", displayName: { en: "Get Up", ja: "起き上がり" },
    localizedDescription: { en: "Recover support from a downed pose and return to ready.", ja: "ダウン姿勢から支持を取り戻し、構えへ戻る動作です。" },
    actionName: "get-up", previewClassName: "sample-death-sheet sample-slow", loopMode: "one-shot", defaultFps: 10,
    phases: ["downed hold", "find support", "lift begins", "mid recovery", "support returns", "rise or uncoil", "settle", "ready end"],
    groundingProfile: "exempt", motionIntensity: "moderate",
    motion: "Topology-aware recovery from a compact downed pose into the source ready stance with clear support regain and no scale popping.",
    notes: "Bipeds push or kneel, quadrupeds regain paws, body-contact creatures uncoil, and multi-leg creatures restore their support cluster.",
    supportedTopologies: ["biped", "quadruped", "serpentine-or-body-contact", "multi-leg"],
    allowedModifiers: ["intensity", "tempo", "weight", "exaggeration", "secondaryMotionLevel"],
    experimental: true, tags: ["utility", "recovery", "downed", "one-shot", "experimental"],
    negative: ["instant standing pop, reverse death playback, invented limbs, enlarged crouched frames"]
  }
];

export const MOTION_RECIPES: readonly MotionRecipe[] = RECIPE_SEEDS.map(createMotionRecipe);
export const LEGACY_MOTION_RECIPE_IDS = MOTION_RECIPES.slice(0, 16).map((recipe) => recipe.id);
const MOTION_RECIPE_BY_ID = new Map(MOTION_RECIPES.map((recipe) => [recipe.id, recipe]));

export interface MotionRecipeReference {
  id: string;
  version: number;
  compilerVersion: string;
  qualityProfile: AnimationActionQualityProfile;
  bodyTopology?: BodyTopologyId;
  frameCount?: MotionFrameCount;
  modifiers?: MotionVariantSelection;
  experimental?: boolean;
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

export function motionRecipeReference(recipe: MotionRecipe, options?: {
  topology?: BodyTopologyId;
  frameCount?: MotionFrameCount;
  variant?: Partial<MotionVariantSelection>;
}): MotionRecipeReference {
  const variant = options?.variant ? normalizeMotionVariant(options.variant) : undefined;
  return {
    id: recipe.id,
    version: recipe.version,
    compilerVersion: MOTION_RECIPE_COMPILER_VERSION,
    qualityProfile: recipe.qualityProfile.actionProfile,
    ...(options?.topology ? { bodyTopology: options.topology } : {}),
    ...(options?.frameCount ? { frameCount: options.frameCount } : {}),
    ...(variant ? { modifiers: variant } : {}),
    ...(recipe.experimental ? { experimental: true } : {})
  };
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
    variantSummary: string;
    promptDiff: string[];
    validationWarnings: string[];
  };
  qaContract: ReturnType<typeof compileMotionRecipeQaContract>;
}

export function compileMotionRecipe(input: {
  recipe: MotionRecipe;
  directions: readonly string[];
  modifiers?: readonly MotionRecipeModifier[];
  topology?: BodyTopologyId;
  frameCount?: MotionFrameCount;
  variant?: Partial<MotionVariantSelection>;
}): CompiledMotionRecipe {
  const directions = input.directions.map((direction) => direction.trim()).filter(Boolean);
  const modifiers = input.modifiers ?? [];
  const topology = input.topology ?? input.recipe.defaultTopology;
  const frameCount = input.frameCount ?? input.recipe.frameCount as MotionFrameCount;
  const variant = normalizeMotionVariant(input.variant);
  const validationErrors = validateMotionVariant(input.recipe, { topology, frameCount, modifiers: variant });
  if (validationErrors.length > 0) throw new Error(`Invalid Motion Recipe variant: ${validationErrors.join("; ")}`);
  const structuredModifierLines = compileStructuredModifierLines(input.recipe, variant);
  const appliedModifiers = [
    ...structuredModifierLines.map((item) => `${item.key}:${variant[item.key]}`),
    ...modifiers.filter((item) => item.enabled !== false && item.text.trim()).map((item) => item.id)
  ];
  const removedModifiers = modifiers.filter((item) => item.enabled === false || !item.text.trim()).map((item) => item.id);
  const framePhases = compileMotionFramePhases(input.recipe, frameCount);
  const topologyProfile = getBodyTopologyProfile(topology);
  const hardLines = [
    `Create exactly ${frameCount} source frames for each requested direction.`,
    ...input.recipe.promptSegments.hard.filter((line) => !/^Create exactly \d+ source frames/i.test(line))
  ];
  const sectionInput: CompiledMotionRecipe["sections"] = [
    { id: "hard", lines: [`Motion Recipe: ${input.recipe.id} v${input.recipe.version}; compiler ${MOTION_RECIPE_COMPILER_VERSION}.`, ...hardLines] },
    { id: "motion", lines: [...input.recipe.promptSegments.motion, ...input.recipe.secondaryMotion, ...structuredModifierLines.map((item) => item.text), ...modifiers.filter((item) => item.enabled !== false).map((item) => item.text)] },
    { id: "phases", lines: framePhases.map((phase) => `Frames ${phase.frameStart}-${phase.frameEnd}: ${phase.description}.`) },
    { id: "identity", lines: [
      ...input.recipe.promptSegments.identity,
      input.recipe.silhouetteExpectation,
      input.recipe.rootMotionPolicy,
      input.recipe.anchorPolicy,
      `Body topology: ${topologyProfile.id}. ${topologyProfile.bboxExpectation}`,
      topologyProfile.anchorPolicy,
      topologyProfile.rootMotionPolicy,
      ...topologyProfile.directionSilhouetteNotes
    ] },
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
  const metadata = motionRecipeReference(input.recipe, { topology, frameCount, variant });
  const qaContract = compileMotionRecipeQaContract(input.recipe, { topology, frameCount, variant });
  const variantSummary = summarizeMotionVariant(input.recipe, { topology, frameCount, modifiers: variant });
  return {
    prompt,
    negativePrompt,
    notes: [`Motion Recipe ${metadata.id} v${metadata.version}`, `Compiler ${metadata.compilerVersion}`, `QA profile ${metadata.qualityProfile}`, variantSummary, input.recipe.notes].join("\n"),
    metadata,
    sections,
    diagnostics: {
      sectionOrder: sections.map((section) => section.id),
      appliedModifiers,
      removedModifiers,
      deduplicatedSegmentCount,
      variantSummary,
      promptDiff: [
        `Topology: ${topologyProfile.displayName.en}`,
        `Frame budget: ${frameCount}`,
        ...structuredModifierLines.map((item) => item.text)
      ],
      validationWarnings: input.recipe.experimental ? ["Experimental Recipe: official samples remain unchanged until owner approval."] : []
    },
    qaContract
  };
}

export function compileMotionRecipeQaContract(recipe: MotionRecipe, options?: {
  topology?: BodyTopologyId;
  frameCount?: MotionFrameCount;
  variant?: Partial<MotionVariantSelection>;
}) {
  const topology = options?.topology ?? recipe.defaultTopology;
  const topologyProfile = getBodyTopologyProfile(topology);
  const frameCount = options?.frameCount ?? recipe.frameCount as MotionFrameCount;
  const variant = normalizeMotionVariant(options?.variant);
  const motionRange = adjustMotionRange(recipe.qualityProfile.motionRange, variant);
  const rootDriftTolerancePx = adjustRootDriftTolerance(recipe.qualityProfile.rootDriftTolerancePx, variant, topologyProfile);
  const requiredProps = variant.weaponClass !== "none" && variant.weaponClass !== "unarmed"
    ? Array.from(new Set([...recipe.requiredProps, `preserve ${variant.weaponClass} identity, grip, and attachment`]))
    : recipe.requiredProps;
  return {
    recipe: motionRecipeReference(recipe, { topology, frameCount, variant }),
    actionProfile: recipe.qualityProfile.actionProfile,
    expectedPhases: compileMotionFramePhases(recipe, frameCount).map((phase) => phase.description),
    loopExpected: recipe.qualityProfile.loopSeamRequired,
    loopMode: recipe.loopMode,
    groundingProfile: topology === "floating" || topology === "winged-flying" ? "airborne" : recipe.groundingProfile,
    bodyTopology: topology,
    contactQaDimension: topologyProfile.contactQaDimension,
    groundContactParts: topologyProfile.groundContactParts,
    footlineApplicable: topologyProfile.footlineApplicable,
    motionRange,
    rootDriftTolerancePx,
    footlineTolerancePx: topologyProfile.footlineApplicable ? recipe.qualityProfile.footlineTolerancePx : 0,
    requiredProps,
    allowedVfx: variant.vfxAmount === "none" ? [] : recipe.allowedVfx,
    fps: adjustedFps(recipe.defaultFps, variant.tempo),
    frameCount,
    frameGrid: motionFrameGrid(frameCount),
    anchorPolicy: topologyProfile.anchorPolicy,
    bboxExpectation: topologyProfile.bboxExpectation,
    rootMotionPolicy: topologyProfile.rootMotionPolicy,
    secondaryMotion: topologyProfile.secondaryMotion,
    modifiers: variant,
    exportDefaults: recipe.exportDefaults
  };
}

export function getBodyTopologyProfile(id: BodyTopologyId): BodyTopologyProfile {
  return BODY_TOPOLOGY_BY_ID.get(id) ?? BODY_TOPOLOGY_PROFILES[0]!;
}

export function motionFrameGrid(frameCount: MotionFrameCount) {
  if (frameCount === 6) return { columns: 3, rows: 2, gutter: 0 };
  return { columns: 4, rows: Math.ceil(frameCount / 4), gutter: 0 };
}

export function normalizeMotionVariant(value?: Partial<MotionVariantSelection>): MotionVariantSelection {
  return { ...DEFAULT_MOTION_VARIANT, ...(value ?? {}) };
}

export function compileMotionFramePhases(recipe: MotionRecipe, frameCount: MotionFrameCount): MotionRecipeFramePhase[] {
  const grouped = new Map<string, MotionRecipeFramePhase>();
  recipe.framePhases.forEach((phase, index) => {
    const frameStart = Math.min(frameCount, Math.floor((index * frameCount) / recipe.framePhases.length) + 1);
    const frameEnd = Math.min(frameCount, Math.max(frameStart, Math.floor(((index + 1) * frameCount) / recipe.framePhases.length)));
    const key = `${frameStart}:${frameEnd}`;
    const current = grouped.get(key);
    if (current) {
      current.description = `${current.description} / ${phase.description}`;
      current.id = `${current.id}-${phase.id}`;
    } else {
      grouped.set(key, { ...phase, frameStart, frameEnd });
    }
  });
  return Array.from(grouped.values());
}

export function validateMotionVariant(recipe: MotionRecipe, input: {
  topology: BodyTopologyId;
  frameCount: MotionFrameCount;
  modifiers: MotionVariantSelection;
}): string[] {
  const errors: string[] = [];
  if (!BODY_TOPOLOGY_BY_ID.has(input.topology)) errors.push(`unknown topology '${input.topology}'`);
  if (!recipe.supportedTopologies.includes(input.topology)) errors.push(`topology '${input.topology}' is not supported by '${recipe.id}'`);
  if (!MOTION_FRAME_COUNTS.includes(input.frameCount)) errors.push(`frame count '${input.frameCount}' is unsupported`);
  if (!recipe.allowedFrameCounts.includes(input.frameCount)) errors.push(`frame count '${input.frameCount}' is not allowed by '${recipe.id}'`);
  (Object.keys(DEFAULT_MOTION_VARIANT) as MotionVariantModifierKey[]).forEach((key) => {
    if (isVariantModifierActive(key, input.modifiers[key]) && !recipe.allowedModifiers.includes(key)) {
      errors.push(`modifier '${key}' is not allowed by '${recipe.id}'`);
    }
  });
  if (input.modifiers.handedness !== "inherit" && ["none", "unarmed"].includes(input.modifiers.weaponClass)) {
    errors.push("handedness requires a held weaponClass");
  }
  if (!["biped"].includes(input.topology) && !["none", "unarmed"].includes(input.modifiers.weaponClass)) {
    errors.push(`weaponClass '${input.modifiers.weaponClass}' is incompatible with topology '${input.topology}'`);
  }
  if (input.modifiers.vfxAmount !== "none" && recipe.allowedVfx.length === 0) {
    errors.push(`vfxAmount '${input.modifiers.vfxAmount}' requires Recipe allowedVfx`);
  }
  if (input.modifiers.travelAmount === "long" && recipe.loopMode !== "one-shot") {
    errors.push("long travel is incompatible with looping Recipes");
  }
  return errors;
}

export function summarizeMotionVariant(recipe: MotionRecipe, input: {
  topology: BodyTopologyId;
  frameCount: MotionFrameCount;
  modifiers: MotionVariantSelection;
}) {
  const profile = getBodyTopologyProfile(input.topology);
  const changed = compileStructuredModifierLines(recipe, input.modifiers).map((item) => `${item.key}=${input.modifiers[item.key]}`);
  return `${profile.displayName.en}, ${input.frameCount} frames${changed.length ? `, ${changed.join(", ")}` : ", default modifiers"}.`;
}

function isVariantModifierActive(key: MotionVariantModifierKey, value: MotionVariantSelection[MotionVariantModifierKey]) {
  return value !== DEFAULT_MOTION_VARIANT[key];
}

function compileStructuredModifierLines(recipe: MotionRecipe, variant: MotionVariantSelection): Array<{ key: MotionVariantModifierKey; text: string }> {
  const lines: Array<{ key: MotionVariantModifierKey; text: string }> = [];
  const add = (key: MotionVariantModifierKey, text: string) => {
    if (recipe.allowedModifiers.includes(key) && isVariantModifierActive(key, variant[key])) lines.push({ key, text });
  };
  add("intensity", variant.intensity === "subtle"
    ? "Variant intensity is subtle: reduce displacement while keeping every phase readable."
    : "Variant intensity is strong: widen the primary action silhouette and preserve controlled recovery.");
  add("tempo", variant.tempo === "slow"
    ? "Variant tempo is slow: extend anticipation and settling beats without duplicating frames."
    : "Variant tempo is fast: shorten holds, keep silhouettes distinct, and retain the complete phase order.");
  add("weight", variant.weight === "light"
    ? "Variant weight is light: use quick lift, small compression, and responsive recovery."
    : "Variant weight is heavy: use deeper loading, broader committed motion, delayed follow-through, and stronger support contact.");
  add("exaggeration", variant.exaggeration === "low"
    ? "Variant exaggeration is low: keep arcs restrained while preserving action readability."
    : "Variant exaggeration is high: amplify pose contrast and arcs without changing anatomy or scale.");
  add("handedness", `Keep ${variant.handedness}-handed grip and weapon-side identity consistent in every direction and frame.`);
  add("weaponClass", variant.weaponClass === "unarmed"
    ? "Use a consistent unarmed action and do not invent a weapon."
    : `Preserve one consistent ${variant.weaponClass} design, grip, scale, and attachment through all phases.`);
  add("travelAmount", `Use ${variant.travelAmount} root travel, keep it inside the cell, and make the final anchor intentional.`);
  add("secondaryMotionLevel", `Use ${variant.secondaryMotionLevel} secondary motion; it must lag and support the primary action without obscuring it.`);
  add("vfxAmount", `Use ${variant.vfxAmount} VFX drawn only from the Recipe allowlist and keep body, prop, and contact silhouette visible.`);
  return lines;
}

function adjustMotionRange(range: [number, number], variant: MotionVariantSelection): [number, number] {
  const intensityFactor = variant.intensity === "subtle" ? 0.72 : variant.intensity === "strong" ? 1.3 : 1;
  const weightFactor = variant.weight === "heavy" ? 1.18 : variant.weight === "light" ? 1.08 : 1;
  const exaggerationFactor = variant.exaggeration === "high" ? 1.22 : variant.exaggeration === "low" ? 0.82 : 1;
  const travelFactor = variant.travelAmount === "long" ? 1.35 : variant.travelAmount === "medium" ? 1.2 : variant.travelAmount === "short" ? 1.08 : 1;
  const factor = intensityFactor * weightFactor * exaggerationFactor * travelFactor;
  return [roundRange(range[0] * Math.min(1, factor)), roundRange(Math.min(0.95, range[1] * factor))];
}

function adjustRootDriftTolerance(base: number, variant: MotionVariantSelection, topology: BodyTopologyProfile) {
  const travelBonus = variant.travelAmount === "long" ? 28 : variant.travelAmount === "medium" ? 18 : variant.travelAmount === "short" ? 8 : 0;
  const topologyBonus = topology.contactQaDimension === "hover-height" || topology.contactQaDimension === "wing-beat" ? 8 : topology.footlineApplicable ? 0 : 4;
  return base + travelBonus + topologyBonus;
}

function adjustedFps(base: number, tempo: MotionVariantSelection["tempo"]) {
  if (tempo === "slow") return Math.max(1, Math.round(base * 0.75));
  if (tempo === "fast") return Math.max(1, Math.round(base * 1.3));
  return base;
}

function roundRange(value: number) {
  return Math.round(value * 10000) / 10000;
}

export function validateMotionRecipe(value: MotionRecipe): string[] {
  const errors: string[] = [];
  if (value.schema !== MOTION_RECIPE_SCHEMA) errors.push("schema");
  if (!value.id.trim()) errors.push("id");
  if (value.version !== MOTION_RECIPE_VERSION) errors.push("version");
  if (!value.family || !value.displayName.en || !value.displayName.ja || !value.localizedDescription.en || !value.localizedDescription.ja) errors.push("localized metadata");
  if (!value.loopMode || value.defaultFps <= 0 || value.frameCount <= 0 || value.framePhases.length === 0 || value.allowedFrameCounts.length === 0) errors.push("timing");
  if (value.framePhases.some((phase) => phase.frameStart < 1 || phase.frameEnd > value.frameCount || phase.frameStart > phase.frameEnd)) errors.push("framePhases");
  if (!value.groundingProfile || !value.rootMotionPolicy || !value.anchorPolicy || !value.silhouetteExpectation) errors.push("motion policy");
  if (!BODY_TOPOLOGY_BY_ID.has(value.defaultTopology) || value.supportedTopologies.some((id) => !BODY_TOPOLOGY_BY_ID.has(id)) || !value.supportedTopologies.includes(value.defaultTopology)) errors.push("body topology");
  if (!Array.isArray(value.allowedModifiers) || !Array.isArray(value.tags)) errors.push("variant policy");
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
