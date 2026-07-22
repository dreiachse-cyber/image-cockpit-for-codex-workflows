import { describe, expect, it } from "vitest";
import {
  BODY_TOPOLOGY_PROFILES,
  compileMotionRecipe,
  compileMotionRecipeQaContract,
  DEFAULT_MOTION_VARIANT,
  EXPERIMENTAL_MOTION_FRAME_COUNTS,
  isExperimentalMotionFrameCount,
  LEGACY_MOTION_RECIPE_IDS,
  motionFrameGrid,
  MOTION_RECIPES,
  MOTION_FRAME_COUNTS,
  MOTION_RECIPE_COMPILER_VERSION,
  normalizeMotionVariant,
  resolveMotionRecipe,
  validateMotionRecipe,
  validateMotionVariant
} from "./motionRecipes";

describe("versioned Motion Recipes", () => {
  it("migrates all 16 legacy preset ids into complete schemas", () => {
    expect(LEGACY_MOTION_RECIPE_IDS).toEqual([
      "idle-breathing", "walk-cycle", "run-cycle", "basic-attack", "hurt-reaction", "death-downed", "spell-cast", "jump-hop",
      "guard-block", "victory-cheer", "interact-pickup", "ranged-attack", "skill-release", "knockback", "item-use", "talk"
    ]);
    expect(MOTION_RECIPES).toHaveLength(22);
    expect(new Set(MOTION_RECIPES.map((recipe) => recipe.id)).size).toBe(22);
    expect(MOTION_RECIPES.every((recipe) => validateMotionRecipe(recipe).length === 0)).toBe(true);
  });

  it("defines six topology profiles without applying biped foot QA to exempt bodies", () => {
    expect(BODY_TOPOLOGY_PROFILES.map((profile) => profile.id)).toEqual([
      "biped", "quadruped", "serpentine-or-body-contact", "floating", "winged-flying", "multi-leg"
    ]);
    expect(BODY_TOPOLOGY_PROFILES.find((profile) => profile.id === "biped")).toMatchObject({ footlineApplicable: true, contactQaDimension: "footline" });
    expect(BODY_TOPOLOGY_PROFILES.filter((profile) => profile.id !== "biped").every((profile) => !profile.footlineApplicable)).toBe(true);
  });

  it("adds the first six repertoire Recipes as Experimental without promoting legacy presets", () => {
    const experimental = MOTION_RECIPES.filter((recipe) => recipe.experimental);
    expect(experimental.map((recipe) => recipe.id)).toEqual(["dash", "dodge-roll", "charge-heavy-attack", "combo-attack", "stun", "get-up"]);
    expect(MOTION_RECIPES.filter((recipe) => LEGACY_MOTION_RECIPE_IDS.includes(recipe.id)).every((recipe) => !recipe.experimental)).toBe(true);
  });

  it("keeps 8f as the stable default and marks only 16f/20f as experimental budgets", () => {
    expect(MOTION_FRAME_COUNTS).toEqual([4, 6, 8, 12, 16, 20]);
    expect(EXPERIMENTAL_MOTION_FRAME_COUNTS).toEqual([16, 20]);
    expect(MOTION_FRAME_COUNTS.filter(isExperimentalMotionFrameCount)).toEqual([16, 20]);
    expect(MOTION_RECIPES.every((recipe) => recipe.frameCount === 8 && recipe.allowedFrameCounts.join(",") === "4,6,8,12,16,20")).toBe(true);
    expect(MOTION_RECIPE_COMPILER_VERSION).toBe("1.2.0");
  });

  it.each(MOTION_RECIPES.map((recipe) => [recipe.id, recipe] as const))("validates and snapshots %s", (_id, recipe) => {
    expect(validateMotionRecipe(recipe)).toEqual([]);
    const compiled = compileMotionRecipe({ recipe, directions: ["front", "side", "back"] });
    expect({
      id: recipe.id,
      version: recipe.version,
      family: recipe.family,
      timing: [recipe.loopMode, recipe.defaultFps, recipe.frameCount],
      grounding: recipe.groundingProfile,
      intensity: recipe.motionIntensity,
      phases: recipe.framePhases.map((phase) => phase.description),
      qa: compileMotionRecipeQaContract(recipe),
      sectionOrder: compiled.diagnostics.sectionOrder,
      promptHead: compiled.prompt.split("\n").slice(0, 3)
    }).toMatchSnapshot();
  });

  it("compiles hard, motion, phases, identity, direction, background, negative in deterministic order", () => {
    const recipe = MOTION_RECIPES.find((item) => item.id === "basic-attack")!;
    const compiled = compileMotionRecipe({
      recipe,
      directions: ["front", "side", "back"],
      modifiers: [
        { id: "duplicate", text: recipe.promptSegments.motion[0] },
        { id: "enabled", text: "Keep the strike especially compact." },
        { id: "disabled", text: "Add a giant explosion.", enabled: false },
        { id: "empty", text: "" }
      ]
    });
    expect(compiled.diagnostics.sectionOrder).toEqual(["hard", "motion", "phases", "identity", "direction", "background", "negative"]);
    expect(compiled.diagnostics.appliedModifiers).toEqual(["duplicate", "enabled"]);
    expect(compiled.diagnostics.removedModifiers).toEqual(["disabled", "empty"]);
    expect(compiled.diagnostics.deduplicatedSegmentCount).toBeGreaterThan(0);
    expect(compiled.prompt.match(/Keep the strike especially compact/g)).toHaveLength(1);
    expect(compiled.metadata.compilerVersion).toBe(MOTION_RECIPE_COMPILER_VERSION);
  });

  it("supports exact, legacy, v0 migration, unknown version warning, action fallback, and safe default", () => {
    expect(resolveMotionRecipe({ recipeId: "walk-cycle", recipeVersion: 1 }).resolution).toBe("exact");
    expect(resolveMotionRecipe({ presetId: "walk-cycle" })).toMatchObject({ resolution: "legacy-preset-fallback", warnings: [expect.stringContaining("no recipe version")] });
    expect(resolveMotionRecipe({ recipeId: "walk-cycle", recipeVersion: 0 })).toMatchObject({ resolution: "version-migration", warnings: [expect.stringContaining("v0 migrated")] });
    expect(resolveMotionRecipe({ recipeId: "walk-cycle", recipeVersion: 99 })).toMatchObject({ resolution: "unknown-version-fallback", warnings: [expect.stringContaining("Unknown recipe version")] });
    expect(resolveMotionRecipe({ recipeId: "removed-preset", actionName: "jump" })).toMatchObject({ recipe: { id: "jump-hop" }, resolution: "legacy-preset-fallback" });
    expect(resolveMotionRecipe({})).toMatchObject({ recipe: { id: "idle-breathing" }, resolution: "default" });
  });

  it.each([
    ["subtle loop", "idle-breathing", "subtle-loop", true],
    ["locomotion", "walk-cycle", "grounded-soft", true],
    ["grounded one-shot", "basic-attack", "grounded-soft", false],
    ["airborne/downed", "death-downed", "airborne-or-exempt", false]
  ] as const)("derives QA for %s", (_kind, id, profile, loopExpected) => {
    const recipe = MOTION_RECIPES.find((item) => item.id === id)!;
    expect(compileMotionRecipeQaContract(recipe)).toMatchObject({ actionProfile: profile, loopExpected });
  });

  it.each(["dash", "dodge-roll", "charge-heavy-attack", "combo-attack", "stun", "get-up"])("snapshots Experimental compiler contract for %s", (id) => {
    const recipe = MOTION_RECIPES.find((item) => item.id === id)!;
    const variant = id === "charge-heavy-attack"
      ? normalizeMotionVariant({ intensity: "strong", tempo: "slow", weight: "heavy", weaponClass: "heavy-weapon", handedness: "right", vfxAmount: "low" })
      : normalizeMotionVariant({ intensity: "strong", tempo: "fast", exaggeration: "high", secondaryMotionLevel: "high" });
    const compiled = compileMotionRecipe({ recipe, directions: ["front", "side", "back"], topology: "biped", frameCount: 12, variant });
    expect({
      id,
      experimental: recipe.experimental,
      metadata: compiled.metadata,
      qa: compiled.qaContract,
      summary: compiled.diagnostics.variantSummary,
      promptDiff: compiled.diagnostics.promptDiff,
      prompt: compiled.prompt
    }).toMatchSnapshot();
  });

  it.each(MOTION_FRAME_COUNTS)("keeps %s-frame layout, phases, prompt, QA, and metadata consistent", (frameCount) => {
    const recipe = MOTION_RECIPES.find((item) => item.id === "dash")!;
    const compiled = compileMotionRecipe({ recipe, directions: ["front", "side", "back"], topology: "biped", frameCount, variant: DEFAULT_MOTION_VARIANT });
    expect(compiled.metadata.frameCount).toBe(frameCount);
    expect(compiled.qaContract.frameCount).toBe(frameCount);
    expect(compiled.qaContract.frameGrid).toEqual(motionFrameGrid(frameCount));
    expect(compiled.prompt).toContain(`Create exactly ${frameCount} source frames`);
    expect(compiled.sections.find((section) => section.id === "phases")?.lines.every((line) => {
      const numbers = line.match(/Frames (\d+)-(\d+)/)?.slice(1).map(Number) ?? [];
      return numbers.length === 2 && numbers[0]! >= 1 && numbers[1]! <= frameCount;
    })).toBe(true);
  });

  it("rejects incompatible modifier combinations before compile", () => {
    const dash = MOTION_RECIPES.find((item) => item.id === "dash")!;
    const errors = validateMotionVariant(dash, {
      topology: "quadruped",
      frameCount: 8,
      modifiers: normalizeMotionVariant({ weaponClass: "sword", handedness: "right" })
    });
    expect(errors).toEqual(expect.arrayContaining([expect.stringContaining("weaponClass"), expect.stringContaining("not allowed")]));
    expect(() => compileMotionRecipe({
      recipe: dash,
      directions: ["side"],
      topology: "quadruped",
      frameCount: 8,
      variant: { weaponClass: "sword", handedness: "right" }
    })).toThrow("Invalid Motion Recipe variant");
  });

  it("adjusts QA thresholds with heavy, strong, long-travel variants", () => {
    const recipe = MOTION_RECIPES.find((item) => item.id === "dash")!;
    const baseline = compileMotionRecipeQaContract(recipe, { topology: "biped", frameCount: 8, variant: DEFAULT_MOTION_VARIANT });
    const heavy = compileMotionRecipeQaContract(recipe, {
      topology: "biped",
      frameCount: 8,
      variant: { ...DEFAULT_MOTION_VARIANT, intensity: "strong", weight: "heavy", travelAmount: "long" }
    });
    expect(heavy.motionRange[1]).toBeGreaterThan(baseline.motionRange[1]);
    expect(heavy.rootDriftTolerancePx).toBeGreaterThan(baseline.rootDriftTolerancePx);
  });

  it.each([
    ["biped", "footline", true],
    ["quadruped", "paw-contact", false],
    ["floating", "hover-height", false],
    ["winged-flying", "wing-beat", false]
  ] as const)("uses %s topology QA instead of a universal footline", (topology, contactQaDimension, footlineApplicable) => {
    const recipe = MOTION_RECIPES.find((item) => item.id === "stun")!;
    expect(compileMotionRecipeQaContract(recipe, { topology, frameCount: 8, variant: DEFAULT_MOTION_VARIANT })).toMatchObject({
      bodyTopology: topology,
      contactQaDimension,
      footlineApplicable,
      footlineTolerancePx: footlineApplicable ? expect.any(Number) : 0
    });
  });
});
