import { describe, expect, it } from "vitest";
import {
  compileMotionRecipe,
  compileMotionRecipeQaContract,
  MOTION_RECIPES,
  MOTION_RECIPE_COMPILER_VERSION,
  resolveMotionRecipe,
  validateMotionRecipe
} from "./motionRecipes";

describe("versioned Motion Recipes", () => {
  it("migrates all 16 legacy preset ids into complete schemas", () => {
    expect(MOTION_RECIPES).toHaveLength(16);
    expect(new Set(MOTION_RECIPES.map((recipe) => recipe.id)).size).toBe(16);
    expect(MOTION_RECIPES.every((recipe) => validateMotionRecipe(recipe).length === 0)).toBe(true);
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
});
