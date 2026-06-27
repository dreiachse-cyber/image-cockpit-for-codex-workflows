import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";

const root = process.cwd();
const failures = [];
const privacyTextExtensions = new Set(["", ".css", ".html", ".js", ".json", ".md", ".mjs", ".ts", ".tsx", ".txt", ".yaml", ".yml"]);

function slugPromptExampleTitle(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function promptPreviewFilesFromMarkdown(file, prefix) {
  const text = readText(file)?.replace(/\r\n/g, "\n") ?? "";
  return [...text.matchAll(/###\s+\d+\.\s+([^\n]+)\n\n```text\n[\s\S]*?\n```/g)].map(
    (match) => `public/prompt-examples/${prefix}-${slugPromptExampleTitle(match[1].trim())}.png`
  );
}

const requiredFiles = [
  "README.md",
  "CHANGELOG.md",
  "LICENSE",
  "CONTRIBUTING.md",
  "SECURITY.md",
  "CODE_OF_CONDUCT.md",
  ".env.example",
  ".gitignore",
  ".github/workflows/ci.yml",
  "scripts/doctor.mjs",
  "scripts/release-audit.mjs",
  "scripts/real-codex-runner-smoke.mjs",
  "scripts/real-imagegen-smoke.mjs",
  "scripts/ui-smoke.mjs",
  "scripts/capture-readme-screenshots.mjs",
  "docs/qa/completed-codex-job-import-storage-quota.md",
  "docs/qa/local-state-oom-safe-mode-retention.md",
  "public/reset-local-state.html",
  "public/samples/idle-breathing-sheet.png",
  "public/samples/walk-cycle-sheet.png",
  "public/samples/run-cycle-sheet.png",
  "public/samples/basic-attack-sheet.png",
  "public/samples/hurt-reaction-sheet.png",
  "public/samples/death-downed-sheet.png",
  "public/samples/spell-cast-sheet.png",
  "public/samples/jump-hop-sheet.png",
  "public/samples/guard-block-sheet.png",
  "public/samples/victory-cheer-sheet.png",
  "public/samples/interact-pickup-sheet.png",
  "public/samples/ranged-attack-sheet.png",
  "public/samples/skill-release-sheet.png",
  "public/samples/knockback-sheet.png",
  "public/samples/item-use-sheet.png",
  "public/samples/talk-sheet.png",
  "src/App.test.ts",
  "src/lib/animationPack.ts",
  "src/lib/animationPack.test.ts",
  "src/lib/officialAnimations.ts",
  "docs/review/mvp-review-report.md",
  "docs/roadmap/release-roadmap.md",
  "docs/release/v0.1.0-checklist.md",
  "docs/release/v0.1.0-runbook.md",
  "docs/release/v0.1.0-release-notes.md",
  "docs/release/v0.1.0-owner-review.md",
  "docs/release/v0.1.0-final-audit.md",
  "docs/release/v0.1.0-acceptance-evidence.md",
  "docs/release/v0.1.0-owner-decision.md",
  "docs/usage/manual-handoff.md",
  "docs/demo/mvp-demo.gif",
  "docs/qa/simple-image-generate-import-latest-1280x720.png",
  "docs/qa/simple-image-generate-import-latest-mobile-390x844.png",
  "docs/qa/simple-sprite-generate-actions-1280x720.png",
  "docs/qa/manual-handoff-import-latest-1280x720.png",
  "docs/qa/real-codex-runner-smoke.md",
  "docs/qa/imagegen-handoff-smoke.md",
  "docs/qa/codex-generation-job-concurrency-3.md",
  "docs/qa/codex-log-card-limit-3.md",
  "docs/qa/generation-job-reliability-hardening.md",
  "docs/qa/artifact-staging-and-real-browser-generation-qa.md",
  "docs/qa/temp-candidate-contact-import-filter.md",
  "docs/qa/official-animation-gallery.html",
  "docs/qa/official-animation-batch-2-to-10.md",
  "docs/qa/official-animation-next-5-gallery.html",
  "docs/qa/official-animation-next-5.md",
  "docs/qa/official-animation-transparency-audit.json",
  "docs/qa/official-idle-breathing/idle-breathing-mechanical-qa.json",
  "docs/qa/official-basic-attack/basic-attack-grid-qa.png",
  "docs/qa/official-basic-attack/basic-attack-mechanical-qa.json",
  "docs/qa/official-hurt-reaction/hurt-reaction-grid-qa.png",
  "docs/qa/official-hurt-reaction/hurt-reaction-mechanical-qa.json",
  "docs/qa/official-death-downed/death-downed-grid-qa.png",
  "docs/qa/official-death-downed/death-downed-mechanical-qa.json",
  "docs/qa/official-spell-cast/spell-cast-grid-qa.png",
  "docs/qa/official-spell-cast/spell-cast-mechanical-qa.json",
  "docs/qa/official-jump-hop/jump-hop-grid-qa.png",
  "docs/qa/official-jump-hop/jump-hop-mechanical-qa.json",
  "docs/qa/official-guard-block/guard-block-grid-qa.png",
  "docs/qa/official-guard-block/guard-block-mechanical-qa.json",
  "docs/qa/official-victory-cheer/victory-cheer-grid-qa.png",
  "docs/qa/official-victory-cheer/victory-cheer-mechanical-qa.json",
  "docs/qa/official-interact-pickup/interact-pickup-grid-qa.png",
  "docs/qa/official-interact-pickup/interact-pickup-mechanical-qa.json",
  "docs/qa/official-ranged-attack/ranged-attack-grid-qa.png",
  "docs/qa/official-ranged-attack/ranged-attack-mechanical-qa.json",
  "docs/qa/official-skill-release/skill-release-grid-qa.png",
  "docs/qa/official-skill-release/skill-release-mechanical-qa.json",
  "docs/qa/official-knockback/knockback-grid-qa.png",
  "docs/qa/official-knockback/knockback-mechanical-qa.json",
  "docs/qa/official-item-use/item-use-grid-qa.png",
  "docs/qa/official-item-use/item-use-mechanical-qa.json",
  "docs/qa/official-talk/talk-grid-qa.png",
  "docs/qa/official-talk/talk-mechanical-qa.json",
  "docs/qa/official-walk-cycle/walk-cycle-mechanical-qa.json",
  "docs/qa/official-run-cycle/run-cycle-mechanical-qa.json",
  "docs/demo/readme/pixel-art-generation.png",
  "docs/demo/readme/prompt-examples-modal.png",
  "docs/demo/readme/image-editing.png",
  "docs/demo/readme/animation-generation.png",
  "docs/marketing/x-launch/launch-post-ja.md",
  "docs/marketing/x-launch/launch-thread-ja.md",
  "docs/marketing/x-launch/asset-checklist.md",
  "docs/marketing/x-launch/social-preview.png",
  ".github/PULL_REQUEST_TEMPLATE.md",
  "docs/prompt-examples/README.md",
  "docs/prompt-examples/basic-character-prompts.md",
  "docs/prompt-examples/profession-character-prompts.md",
  "docs/prompt-examples/monster-prompts.md",
  "public/prompt-examples/basic-boy-adventurer.png",
  "public/prompt-examples/basic-girl-adventurer.png",
  "public/prompt-examples/basic-young-male-hero.png",
  "public/prompt-examples/basic-young-female-hero.png",
  "public/prompt-examples/basic-middle-aged-male-mercenary.png",
  "public/prompt-examples/basic-middle-aged-female-ranger.png",
  "public/prompt-examples/basic-elder-male-sage.png",
  "public/prompt-examples/basic-elder-female-herbalist.png",
  "public/prompt-examples/basic-androgynous-traveler.png",
  "public/prompt-examples/basic-small-village-child.png",
  "public/prompt-examples/basic-large-veteran-warrior.png",
  "public/prompt-examples/basic-hooded-mysterious-figure.png",
  ...promptPreviewFilesFromMarkdown("docs/prompt-examples/profession-character-prompts.md", "profession"),
  ...promptPreviewFilesFromMarkdown("docs/prompt-examples/monster-prompts.md", "monster")
];

const requiredEnvKeys = [
  "IMAGE_COCKPIT_API_PORT",
  "IMAGE_COCKPIT_HANDOFF_DIR",
  "IMAGE_COCKPIT_CODEX_AUTORUN",
  "IMAGE_COCKPIT_CODEX_COMMAND",
  "IMAGE_COCKPIT_CODEX_SANDBOX",
  "IMAGE_COCKPIT_CODEX_APPROVAL",
  "IMAGE_COCKPIT_CODEX_HELP_ARGS_JSON",
  "IMAGE_COCKPIT_CODEX_EXEC_ARGS_JSON"
];

const requiredWorkflowIds = ["image-generate", "image-edit", "sprite-generate", "sprite-edit"];
const requiredGitignorePatterns = ["node_modules/", "dist/", "coverage/", ".env", ".env.", "!.env.example", "codex-handoff/"];
const requiredPackageScripts = [
  "doctor",
  "typecheck",
  "test",
  "build",
  "capture:readme",
  "smoke",
  "ui:smoke",
  "codex:smoke",
  "imagegen:smoke",
  "release:audit",
  "verify",
  "review:local"
];
const requiredVerifyCommands = [
  "npm run doctor",
  "npm run typecheck",
  "npm test",
  "npm run build",
  "npm run smoke",
  "npm run release:audit"
];
const requiredReviewLocalCommands = ["npm run verify", "npm run ui:smoke", "npm run codex:smoke"];
const requiredReadmeLinks = [
  "CHANGELOG.md",
  "docs/release/v0.1.0-release-notes.md",
  "docs/release/v0.1.0-owner-review.md",
  "docs/release/v0.1.0-final-audit.md",
  "docs/release/v0.1.0-acceptance-evidence.md",
  "docs/release/v0.1.0-owner-decision.md",
  "docs/release/v0.1.0-checklist.md",
  "docs/release/v0.1.0-runbook.md",
  "docs/usage/manual-handoff.md",
  "docs/qa/imagegen-handoff-smoke.md",
  ".github/workflows/ci.yml",
  "LICENSE",
  "CONTRIBUTING.md",
  "SECURITY.md",
  "CODE_OF_CONDUCT.md"
];

checkRequiredFiles();
checkPackageJson();
checkEnvExample();
checkGitignore();
checkTrackedFiles();
checkPublicPrivacy();
checkNoDirectOpenAiIntegration();
checkWorkflowIds();
checkPendingJobCoverage();
checkSimpleLocalInboxAction();
checkCoreLocalization();
checkPromptCatalogExamples();
checkCiWorkflow();
checkReleaseDocs();

if (failures.length > 0) {
  console.error("Release audit failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("Release audit passed.");

function checkRequiredFiles() {
  requiredFiles.forEach((file) => {
    if (!existsSync(join(root, file))) {
      failures.push(`Missing required file: ${file}`);
    }
  });
}

function checkPackageJson() {
  const packageJson = readJson("package.json");
  if (!packageJson) return;

  if (packageJson.private !== true) {
    failures.push("package.json must keep npm package publishing disabled unless the owner explicitly approves npm distribution.");
  }

  if (packageJson.license !== "MIT") {
    failures.push("package.json license should be MIT.");
  }

  requiredPackageScripts.forEach((scriptName) => {
    if (!packageJson.scripts?.[scriptName]) {
      failures.push(`Missing package script: ${scriptName}`);
    }
  });

  const verifyScript = packageJson.scripts?.verify ?? "";
  requiredVerifyCommands.forEach((command) => {
    if (!verifyScript.includes(command)) {
      failures.push(`verify script should include: ${command}`);
    }
  });

  const reviewLocalScript = packageJson.scripts?.["review:local"] ?? "";
  requiredReviewLocalCommands.forEach((command) => {
    if (!reviewLocalScript.includes(command)) {
      failures.push(`review:local script should include: ${command}`);
    }
  });

  const dependencies = {
    ...(packageJson.dependencies ?? {}),
    ...(packageJson.devDependencies ?? {})
  };
  Object.keys(dependencies).forEach((dependency) => {
    if (dependency === "openai" || dependency.startsWith("@openai/")) {
      failures.push(`Direct OpenAI package dependency is not allowed in the app: ${dependency}`);
    }
  });
}

function checkEnvExample() {
  const text = readText(".env.example");
  if (!text) return;

  requiredEnvKeys.forEach((key) => {
    if (!new RegExp(`^${escapeRegExp(key)}=`, "m").test(text)) {
      failures.push(`.env.example is missing ${key}`);
    }
  });

  if (/OPENAI_API_KEY|sk-[A-Za-z0-9_-]{20,}/.test(text)) {
    failures.push(".env.example must not contain API key placeholders that look like secrets.");
  }
}

function checkGitignore() {
  const text = readText(".gitignore");
  if (!text) return;

  requiredGitignorePatterns.forEach((pattern) => {
    if (!text.includes(pattern)) {
      failures.push(`.gitignore should include ${pattern}`);
    }
  });
}

function checkTrackedFiles() {
  const tracked = git(["ls-files"]);
  if (tracked === null) return;

  tracked
    .split(/\r?\n/)
    .filter(Boolean)
    .forEach((file) => {
      const normalized = file.replace(/\\/g, "/");
      if (normalized === ".env.example") return;
      if (normalized === ".gitignore") return;
      if (normalized === ".env" || normalized.startsWith(".env.")) {
        failures.push(`Secret-bearing env file is tracked: ${file}`);
      }
      if (
        normalized.startsWith("codex-handoff/") ||
        normalized.startsWith("node_modules/") ||
        normalized.startsWith("dist/") ||
        normalized.startsWith("coverage/")
      ) {
        failures.push(`Generated or local-only path is tracked: ${file}`);
      }
    });
}

function checkPublicPrivacy() {
  const tracked = git(["ls-files"]);
  if (tracked === null) return;

  const windowsUserPathPattern = new RegExp(["C:", "\\\\", "Users", "\\\\"].join(""), "i");
  const workspaceDrivePathPattern = new RegExp(["D:", "\\\\", "codex", "\\\\"].join(""), "i");
  const localAppDataCodexRuntimePattern = new RegExp(
    [
      "%LOCALAPPDATA%",
      "\\\\",
      "OpenAI",
      "\\\\",
      "Codex",
      "\\\\",
      "bin",
      "\\\\",
      "(?!<runtime-id>|\\.\\.\\.)[A-Za-z0-9_-]{6,}",
      "\\\\",
      "codex\\.exe"
    ].join(""),
    "i"
  );
  const blockedLiterals = [
    { label: "personal Windows user name", value: ["na", "kaya"].join("") },
    { label: "observed local Codex runtime id", value: ["38dff", "8711e296435"].join("") }
  ];

  tracked
    .split(/\r?\n/)
    .filter(Boolean)
    .filter((file) => file !== "scripts/release-audit.mjs")
    .filter((file) => isPrivacyAuditedTextFile(file))
    .forEach((file) => {
      const text = readText(file);
      if (!text) return;

      if (windowsUserPathPattern.test(text)) {
        failures.push(`Public privacy guard found a Windows user profile path in ${file}`);
      }
      if (workspaceDrivePathPattern.test(text)) {
        failures.push(`Public privacy guard found a local workspace drive path in ${file}`);
      }
      if (localAppDataCodexRuntimePattern.test(text)) {
        failures.push(`Public privacy guard found a concrete Codex runtime path in ${file}`);
      }

      blockedLiterals.forEach(({ label, value }) => {
        if (text.includes(value)) {
          failures.push(`Public privacy guard found ${label} in ${file}`);
        }
      });
    });
}

function checkNoDirectOpenAiIntegration() {
  const tracked = git(["ls-files", "src", "server", "scripts", "package.json", ".env.example"]);
  if (tracked === null) return;

  tracked
    .split(/\r?\n/)
    .filter((file) => file !== "scripts/release-audit.mjs")
    .filter((file) => file && isAuditedTextFile(file))
    .forEach((file) => {
      const text = readText(file);
      if (!text) return;
      if (/from\s+["']openai["']|require\(["']openai["']\)|api\.openai\.com|OPENAI_API_KEY/.test(text)) {
        failures.push(`Direct OpenAI API integration marker found in ${file}`);
      }
    });
}

function checkWorkflowIds() {
  const appText = readText("src/App.tsx");
  const stylesText = readText("src/styles.css");
  const smokeText = readText("scripts/smoke.mjs");
  const uiSmokeText = readText("scripts/ui-smoke.mjs");
  const exportersText = readText("src/lib/exporters.ts");
  const animationPackText = readText("src/lib/animationPack.ts");
  const realCodexSmokeText = readText("scripts/real-codex-runner-smoke.mjs");
  if (!appText || !stylesText || !smokeText || !uiSmokeText || !realCodexSmokeText) return;

  requiredWorkflowIds.forEach((workflowId) => {
    if (!appText.includes(workflowId)) {
      failures.push(`App is missing workflow id: ${workflowId}`);
    }
  });

  requiredWorkflowIds.forEach((workflowId) => {
    if (!smokeText.includes(workflowId)) {
      failures.push(`Smoke test should cover Codex handoff workflow: ${workflowId}`);
    }
  });

  [
    "Pixel Art Generation",
    "Image Editing",
    "Animation Generation",
    "Initial screen should open the Pixel Art Generation workspace",
    "Initial screen should not show legacy Guided Start options",
    "selectWorkflowTab",
    "Route: Codex Handoff",
    "5-direction chroma-key sprite sheet",
    "Generate Pixel Art",
    "Generate Animation",
    "Animation generated",
    "Prompt Examples",
    "prompt-example-trigger",
    "Prompt Examples modal",
    "directly below the prompt field",
    "Pick by preview image",
    "Prompt Examples should show image previews",
    "Prompt Examples should hide raw prompt text",
    "prompt-card-preview",
    "prompt-category-tabs",
    "Copy Prompt",
    "Use Prompt",
    "Clockwork Mushroom Courier",
    "Basic Character",
    "Profession Character",
    "Monster",
    "basicCharacterPromptExampleChecks",
    "expandedPromptExampleChecks",
    "expectedPromptExampleCount",
    "Boy Adventurer",
    "Girl Adventurer",
    "Young Male Hero",
    "Young Female Hero",
    "Middle-Aged Male Mercenary",
    "Middle-Aged Female Ranger",
    "Elder Male Sage",
    "Elder Female Herbalist",
    "Androgynous Traveler",
    "Small Village Child",
    "Large Veteran Warrior",
    "Hooded Mysterious Figure",
    "Boy Warrior Apprentice",
    "Middle-Aged Female Captain",
    "Classic Green Slime",
    "Earth Spirit",
    "at least 78 image previews",
    "generated from prompt example",
    "Prompt example loaded into Pixel Art Generation",
    "Generation can take a few minutes.",
    "assertCodexQueue",
    "Codex Jobs",
    "Active 1/3",
    "Active 2/3",
    "Active 3/3",
    "Queue Codex Job",
    "Queued",
    "Waiting for an open slot",
    "Codex job queued",
    "codexJobRows",
    "codexJobShelfInHistory",
    "codexJobShelfInSource",
    "codexJobShelfBeforeHistoryList",
    "Codex job shelf should appear above the Results cards in the right column",
    "Codex queue drains after results return",
    "assertImageEditing",
    "assertAnimationResultNotEditable",
    "Edit Image",
    "Upload Image",
    "Numbered edit regions",
    "Edited from",
    "source-status-button",
    "source chip selects the source preview",
    "downloadModalButtons",
    "resultDownloadActionButtons",
    "resultDownloadGridButtonsInWorkspace",
    "Image Editing PNG download should preserve transparent alpha",
    "expectedCodexLogHistoryLimit = 3",
    "Codex log panel retains the latest 3 completed log cards",
    "Compact Codex log panel should show at most",
    "Compact Codex log should auto-scroll to the latest line",
    "Fullscreen Codex log should open at the latest line",
    "Mobile fullscreen Codex log should stay on the latest line",
    "mock runner tail marker",
    "dragCanvasRegion",
    "annotation-region-row",
    "annotation-comment-field",
    "image-edit-source-status",
    "Image Editing edit source preview",
    "Image Editing should not render the old Before / After compare card",
    "result-download-panel",
    "Image Editing should place the result download card under the preview workspace",
    "Initial workspace should place the result download card under the preview workspace",
    "resultDownloadPanelComplete",
    "Image Editing should hide animated GIF download for non-animation results",
    "Image Editing should hide animated WebP download for non-animation results",
    "PNG",
    "policy_or_safety",
    "Generation failed",
    "生成できませんでした",
    "codex-failure-card",
    "Codex failure should not create a fake history image",
    "Codex failure should release the active job slot",
    "assertHistoryIncrementalRendering",
    "Results list renders the first 100 history items",
    "Results list loads 20 more cards on scroll",
    "historyVisibleCount",
    "Animation output",
    "Animation outputs are final artifacts",
    "Animation results should not expose the rectangle selection toolbar",
    "finalEditNoticeVisible",
    "disabledButtons",
    "Image Editing should hide the old annotation PNG button",
    "hiddenButtons",
    "hiddenText",
    "Sprite Actions",
    "Export Sprite",
    "spriteBenchVisible",
    "should keep the Sprite Actions panel hidden for now",
    "workflowTabsInsidePanel",
    "workflowTabsInTopbar",
    "1. Upload Pixel Art",
    "Animation Library should stay hidden until the feature is ready",
    "Generation Method",
    "5-Direction Sheet",
    "hatch-pet",
    "5-Direction hatch-pet",
    "2. Choose Motion",
    "Animation Library",
    "Official Animations",
    "User Animations",
    "Import Animation",
    "Export Animation Pack",
    "image-cockpit.animation.v1",
    "mock-run-cycle.image-cockpit-animation.zip",
    "Animation pack imported",
    "Animation loaded from library",
    "workspaceExportAnimationPackButtons",
    "Idle Breathing",
    "idle-breathing-sheet.png",
    "sample-idle-sheet",
    "Walk Cycle",
    "walk-cycle-sheet.png",
    "sample-walk-sheet",
    "Run Cycle",
    "run-cycle-sheet.png",
    "sample-run-sheet",
    "Basic Attack",
    "basic-attack-sheet.png",
    "sample-attack-sheet",
    "Hurt Reaction",
    "hurt-reaction-sheet.png",
    "sample-hurt-sheet",
    "Death / Downed",
    "death-downed-sheet.png",
    "sample-death-sheet",
    "Spell Cast",
    "spell-cast-sheet.png",
    "sample-cast-sheet",
    "Jump / Hop",
    "jump-hop-sheet.png",
    "sample-jump-sheet",
    "Guard / Block",
    "guard-block-sheet.png",
    "sample-guard-sheet",
    "Victory Cheer",
    "victory-cheer-sheet.png",
    "sample-cheer-sheet",
    "Interact / Pickup",
    "interact-pickup-sheet.png",
    "sample-interact-sheet",
    "Ranged Attack",
    "ranged-attack-sheet.png",
    "sample-ranged-sheet",
    "Skill Release",
    "skill-release-sheet.png",
    "sample-skill-sheet",
    "Knockback",
    "knockback-sheet.png",
    "sample-knockback-sheet",
    "Item Use",
    "item-use-sheet.png",
    "sample-item-sheet",
    "Talk / NPC Reaction",
    "talk-sheet.png",
    "sample-talk-sheet",
    "Hop Bounce",
    "Choose Animation",
    "Selected animation",
    "selected-animation-card",
    "Animation card should not show unselected animation options",
    "Fixed cells: 256 x 256 px",
    "Animation Generation should not expose free-form motion prompt textareas",
    "Choose Animation modal",
    "Choose Animation trigger should sit directly below the selected animation card",
    "Pick an animated sample",
    "Select Animation",
    "animation-preset-example-trigger",
    "animation-preset-modal",
    "animation-sample-sprite",
    "Choose Animation should show 16 verified animated sprite samples",
    "Choose Animation should include the Idle Breathing animation card",
    "Choose Animation should include the Walk Cycle animation card",
    "Choose Animation should include the Run Cycle animation card",
    "Choose Animation should include the Basic Attack animation card",
    "Choose Animation should include the Hurt Reaction animation card",
    "Choose Animation should include the Death / Downed animation card",
    "Choose Animation should include the Spell Cast animation card",
    "Choose Animation should include the Jump / Hop animation card",
    "Choose Animation should include the Guard / Block animation card",
    "Choose Animation should include the Victory Cheer animation card",
    "Choose Animation should include the Interact / Pickup animation card",
    "Choose Animation should include the Ranged Attack animation card",
    "Choose Animation should include the Skill Release animation card",
    "Choose Animation should include the Knockback animation card",
    "Choose Animation should include the Item Use animation card",
    "Choose Animation should include the Talk / NPC Reaction animation card",
    "card should use the generated",
    "expectedNormalizedAnimationFrames",
    "assertNormalizedAnimationFrames",
    "should normalize animation frame cutouts around center and footline",
    "Animation selected",
    "preExerciseButtonChecks",
    "3. Generate",
    "4. Download",
    "resultDownloadPanelInWorkspace",
    "resultDownloadPanelInSource",
    "should not show stale animation preview images before a selected animation result exists",
    "Animated GIF",
    "Animated WebP",
    "Sprite Sheet",
    "Directional Previews",
    "GIF Preview",
    "Sprite Sheet Preview",
    "expectedPreviewImages: 6",
    "expectedAnimationPreviewImagesAfterExercise",
    "animation preview image(s)",
    "expectSourceRoundTrip",
    "Source selected for animation generation",
    "animationPreviewImages",
    "canvasPanelVisible",
    "expectedCanvasPreviewModeAfterExercise",
    "canvasPreviewMode",
    "annotationToolbarVisible",
    "Preview toolbar visibility should be",
    "shows the selected result in the main preview",
    "resultPreviewImages",
    "resultPreviewLoaded",
    "resultPreviewFrameHeight",
    "Animation frames ready",
    "Generated from",
    "animationSourceStatus",
    "Codex log fullscreen button",
    "Fullscreen Codex log text area should be taller than normal",
    "Mobile fullscreen Codex log panel should fit within the viewport",
    "persisted generated-from source after reload",
    "regenerated animation previews after reload",
    "spriteSheetGridOverlays",
    "256 x 256 px",
    "persisted animation frames after reload",
    "persisted 256 x 256 px frame size after reload"
  ].forEach((marker) => {
    if (!uiSmokeText.includes(marker)) {
      failures.push(`UI smoke should cover workspace workflow review: ${marker}`);
    }
  });

  [
    "BASIC_CHARACTER_CATEGORY",
    "Basic Character",
    "docs/prompt-examples/basic-character-prompts.md",
    "basic-boy-adventurer",
    "basic-girl-adventurer",
    "basic-young-male-hero",
    "basic-young-female-hero",
    "basic-middle-aged-male-mercenary",
    "basic-middle-aged-female-ranger",
    "basic-elder-male-sage",
    "basic-elder-female-herbalist",
    "basic-androgynous-traveler",
    "basic-small-village-child",
    "basic-large-veteran-warrior",
    "basic-hooded-mysterious-figure",
    "PROFESSION_CHARACTER_CATEGORY",
    "MONSTER_CATEGORY",
    "parsePromptCatalogMarkdown",
    "professionCharacterPromptsMarkdown",
    "monsterPromptsMarkdown",
    "professionCharacterPromptExamples",
    "monsterPromptExamples",
    "docs/prompt-examples/profession-character-prompts.md",
    "docs/prompt-examples/monster-prompts.md"
  ].forEach((marker) => {
    if (!appText.includes(marker)) {
      failures.push(`App should include the expanded Prompt Examples catalog: ${marker}`);
    }
  });

  ["SHOW_SPRITE_ACTIONS_PANEL", "SHOW_ANIMATION_LIBRARY = false", "without-sprite-actions"].forEach((marker) => {
    if (!appText.includes(marker)) {
      failures.push(`App should keep Sprite Actions panel behind the temporary visibility flag: ${marker}`);
    }
  });

  [
    "normalizeOpaqueBounds",
    "normalizeFrameOpaqueBounds",
    "selectPrimaryOpaqueComponent",
    "isLikelyFrameGarbageComponent",
    "removeFrameEdgeResiduePixels",
    "despillFrameEdgePixels"
  ].forEach((marker) => {
    if (!appText.includes(marker)) {
      failures.push(`App should normalize generated animation frame cutouts: ${marker}`);
    }
  });

  ["sprite-sheet-grid-preview", "sprite-sheet-grid-overlay"].forEach((marker) => {
    if (!appText.includes(marker) && !stylesText.includes(marker)) {
      failures.push(`App should overlay a review grid on generated sprite sheets: ${marker}`);
    }
  });

  ["temporary 1-pixel pure cyan #00FFFF guide grid", "removeAnimationGuideGridPixels"].forEach((marker) => {
    if (!appText.includes(marker)) {
      failures.push(`App should request and remove temporary animation guide grids: ${marker}`);
    }
  });

  [
    [appText, "createDirectionPreviewBlobs"],
    [appText, "directionPreviews"],
    [exportersText, "input.directionPreviews"],
    [animationPackText, "readDirectionPreviewFiles"]
  ].forEach(([text, marker]) => {
    if (!text.includes(marker)) {
      failures.push(`Animation packs should include all direction preview GIF/WebP files: ${marker}`);
    }
  });

  if (!smokeText.includes("/api/codex/results")) {
    failures.push("Smoke test should cover Local Inbox outbox result listing/import.");
  }
  [
    "QA JSON outbox file should be ignored",
    "work-in-progress outbox image should be ignored",
    "staging outbox image should be ignored",
    "candidate contact temp outbox image should be ignored",
    "tmp transparent derivative outbox image should be ignored",
    "contact sheet outbox image should be ignored",
    "grid QA outbox image should be ignored",
    "debug outbox image should be ignored",
    "preview grid outbox image should be ignored",
    "AB gallery outbox image should be ignored"
  ].forEach((marker) => {
    if (!smokeText.includes(marker)) {
      failures.push(`Smoke test should cover hardened outbox result filtering: ${marker}`);
    }
  });

  [
    "assertTempCandidateContactImportFilter",
    "temp candidate contact filter setup",
    "candidate-contact.tmp",
    "preview-grid history item"
  ].forEach((marker) => {
    if (!uiSmokeText.includes(marker)) {
      failures.push(`UI smoke should cover temp/contact import filtering: ${marker}`);
    }
  });

  [
    "Real Codex runner smoke passed.",
    "IMAGE_COCKPIT_REAL_CODEX_SMOKE_KEEP",
    "runner smoke ok",
    "IMAGE_COCKPIT_CODEX_AUTORUN",
    "completed",
    "exitCode"
  ].forEach((marker) => {
    if (!realCodexSmokeText.includes(marker)) {
      failures.push(`Real Codex runner smoke should cover installed runner completion: ${marker}`);
    }
  });

  const realImagegenSmokeText = readText("scripts/real-imagegen-smoke.mjs");
  [
    "Real imagegen smoke passed.",
    "IMAGE_COCKPIT_IMAGEGEN_SMOKE_KEEP",
    "IMAGE_COCKPIT_IMAGEGEN_SMOKE_TIMEOUT_MS",
    "built-in image generation path",
    "Do not create a placeholder image",
    "Returned PNG should be larger than a placeholder"
  ].forEach((marker) => {
    if (!realImagegenSmokeText?.includes(marker)) {
      failures.push(`Real imagegen smoke should cover prompt-only imagegen completion: ${marker}`);
    }
  });

  const serverText = readText("server/index.ts");
  [
    "imagegen skill default built-in image generation path",
    "never a procedural placeholder",
    "workflowMode=image-edit",
    "numbered annotationContext region comments",
    "workflowMode=sprite-generate",
    "spriteContext.chromaKey",
    "spriteContext.directions",
    "image-cockpit.direction-split-animation.v1",
    "front-three-quarter",
    "Do not return only one combined 5x8 sheet",
    "spriteContext.variant=directional-hatch-pet",
    "direction-01-front",
    "no character pixels crossing cell borders",
    "exactly one full-body character",
    "duplicated heads",
    "If the first result contains unwanted text or numbers, retry once",
    "serverVerified",
    "artifactStableMs",
    "publishVerifiedDirectionSplitArtifact",
    "outbox/.staging/<job-id>/",
    "Do not run git status",
    "Do not place *-qa.json, work files",
    "candidate-contact sheets",
    "preview grids",
    "write them as a small Markdown sidecar"
  ].forEach((marker) => {
    if (!serverText?.includes(marker)) {
      failures.push(`Server should preserve imagegen handoff instructions: ${marker}`);
    }
  });

  [
    "exportDirectionalAnimations",
    "directional-hatch-pet",
    "DIRECTIONAL_HATCH_PET_GRID",
    "buildDirectionalHatchPetPreviewActions",
    "DIRECTION_SPLIT_ANIMATION_SCHEMA",
    "selectDirectionSplitAnimationResults",
    "waitingForFinalManifest",
    "waitingForVerifiedArtifacts",
    "Bronze candidate",
    "importDirectionSplitBronzeCandidate",
    "clearCodexFailureNotice",
    "retryCodexFailureImport",
    "shouldIgnoreOutboxResultName",
    "hasTemporaryOutboxResultMarker",
    "composeDirectionSplitAnimationSheet",
    "validateDirectionSplitAnimationCells",
    "selectDirectionalHatchPetResults",
    "animation-source-status",
    "selectSourceFromPreview",
    "source-status-chip",
    "statusSourceSelectedForAnimation",
    "with-downloads",
    "codexLogsFullscreen",
    "codexLogFullscreen",
    "codexLogExitFullscreen",
    "downloadModalOpen",
    "DownloadOptionsModal",
    "openDownloadModal",
    "result-download-action",
    "download-options-modal",
    "CODEX_LOG_HISTORY_LIMIT = MAX_ACTIVE_CODEX_JOBS",
    "codexLogAutoScrollRef",
    "pre.scrollTop = pre.scrollHeight",
    "Maximize2",
    "Minimize2",
    ".codex-log-panel.fullscreen",
    "exactly one full-body character",
    "Do not let body parts, items, projectiles, or effects cross cell borders",
    "Quality gate before returning",
    "codexFailurePolicyMessage"
  ].forEach((marker) => {
    if (!appText.includes(marker) && !stylesText.includes(marker)) {
      failures.push(`App should preserve strict animation result preview/prompt handling: ${marker}`);
    }
  });

  [
    "INITIAL_HISTORY_RENDER_COUNT",
    "HISTORY_RENDER_BATCH_SIZE",
    "visibleHistory",
    "data-visible-count",
    "getVisibleHistoryCount",
    "history-load-more-sentinel"
  ].forEach((marker) => {
    if (!appText.includes(marker)) {
      failures.push(`App should preserve incremental Results list rendering: ${marker}`);
    }
  });

  [
    "type CodexFailureKind",
    "type CodexJobDiagnostic",
    "getJobDiagnostic",
    "reasonKind",
    '"status": "blocked"',
    "Do not include hidden policy text",
    "no_image_returned"
  ].forEach((marker) => {
    if (!serverText?.includes(marker)) {
      failures.push(`Server should preserve Codex imagegen failure diagnostic handling: ${marker}`);
    }
  });

  [
    "sprite generation job should include sprite frame count",
    "sprite generation job should attach the source image",
    "sprite generation job should include chroma key",
    "sprite generation job should include the standard variant",
    "sprite generation job should include five direction rows",
    "direction split manifest should be listed",
    "direction split manifest import should preserve JSON MIME type",
    "sprite generation job should instruct Codex to use built-in image generation",
    "hatch-pet job should include hatch-pet variant",
    "hatch-pet job should include 72 atlas cells",
    "hatch-pet job should instruct Codex to use the hatch-pet workflow",
    "directional hatch-pet job should include the directional hatch-pet variant",
    "directional hatch-pet job should include 360 atlas cells",
    "directional hatch-pet job should instruct Codex to return five atlas images",
    "job should include numbered edit annotations",
    "job should include numbered edit comments",
    "sprite edit job should include sprite frame count",
    "sprite generation job should not carry edit annotations",
    "sprite edit job should not carry edit annotations",
    "mock autorun preflight should report ready",
    "mock autorun job should start in running state",
    "mock autorun exact job-id result should not create a diagnostic",
    "mock autorun result image should be listed",
    "waitForJobState"
  ].forEach((marker) => {
    if (!smokeText.includes(marker)) {
      failures.push(`Smoke test should cover sprite handoff detail: ${marker}`);
    }
  });

  [
    "IMAGE_COCKPIT_CODEX_HELP_ARGS_JSON",
    "IMAGE_COCKPIT_CODEX_EXEC_ARGS_JSON",
    "parseJsonStringArray",
    "selectCodexLaunchCommand",
    "knownCodexCliCandidates",
    "isLocalOpenAiCodexCliCommand",
    "approval_policy=",
    "launchCommand",
    "resolvedCommandPaths",
    "WindowsApps Codex Desktop executable"
  ].forEach((marker) => {
    const serverText = readText("server/index.ts");
    if (!serverText.includes(marker)) {
      failures.push(`Server should support runner wrapper args: ${marker}`);
    }
  });

  if (readText("server/index.ts")?.includes("--ask-for-approval")) {
    failures.push("Server must not use the removed Codex CLI --ask-for-approval flag.");
  }
  if (smokeText.includes("--ask-for-approval")) {
    failures.push("Smoke mock runner args must not use the removed Codex CLI --ask-for-approval flag.");
  }

  [
    "resolved command path",
    "launchCommand",
    "WindowsApps Codex Desktop executable",
    "terminal-runnable Codex CLI",
    "resolveCommandCandidates"
  ].forEach((marker) => {
    const doctorText = readText("scripts/doctor.mjs");
    if (!doctorText.includes(marker)) {
      failures.push(`Doctor should report Codex command diagnostics: ${marker}`);
    }
  });
}

function checkPendingJobCoverage() {
  const appText = readText("src/App.tsx");
  const appTestText = readText("src/App.test.ts");
  if (!appText || !appTestText) return;

  [
    'status.state === "running"',
    'status.state === "unknown"',
    "shouldWaitForCodexRunner",
    "shouldReportCompletedCodexImportFailure",
    "recordCodexImportFailure",
    "Direction split import failed"
  ].forEach((marker) => {
    if (!appText.includes(marker) && !appTestText.includes(marker)) {
      failures.push(`Pending job coverage is missing marker: ${marker}`);
    }
  });

  const uiSmokeText = readText("scripts/ui-smoke.mjs");
  const storageText = readText("src/lib/storage.ts");
  const resetPageText = readText("public/reset-local-state.html");
  const qaText = readText("docs/qa/completed-codex-job-import-storage-quota.md");
  const localStateQaText = readText("docs/qa/local-state-oom-safe-mode-retention.md");
  [
    "assertCompletedDirectionSplitImportFailure",
    "assertPartialDirectionSplitRecovery",
    "assertManifestFirstDirectionSplitRecovery",
    "mock-partial-direction-split-recovery.flag",
    "Partial direction files without a manifest should not add a failure card",
    "mock-manifest-first-direction-split-recovery.flag",
    "Manifest-first direction files should not add a failure card",
    "mock-direction-split-import-failure.flag",
    "Completed direction split import failure should release the active job slot"
  ].forEach((marker) => {
    if (!uiSmokeText.includes(marker)) {
      failures.push(`Completed Codex import UI smoke coverage is missing marker: ${marker}`);
    }
  });
  [
    "HISTORY_SUMMARY_KEY",
    "FRAMES_SUMMARY_KEY",
    "saveLargeState",
    "localStorage mirror",
    "STORAGE_WARNING_BYTES",
    "STORAGE_AUTO_SAFE_BYTES",
    "STORAGE_HARD_BLOCK_BYTES",
    "isStorageSafeModeSearch",
    "preflightLocalStateStorage",
    "clearImageCockpitLocalState",
    "HISTORY_RETENTION_LIMIT",
    "FRAME_RETENTION_LIMIT",
    "approxBytes",
    "largestItemBytes",
    "retentionPolicy",
    "PENDING_CODEX_JOB_STORAGE_KEY"
  ].forEach((marker) => {
    if (!storageText.includes(marker)) {
      failures.push(`Large history/frame storage quota guard is missing marker: ${marker}`);
    }
  });

  [
    "Local state safe mode",
    "Local state recovery",
    "Clear history",
    "Clear frames",
    "Clear animation library",
    "Clear all local Image Cockpit state",
    "localhostで新規origin",
    "危険を理解して読み込む"
  ].forEach((marker) => {
    if (!appText.includes(marker)) {
      failures.push(`Local state recovery UI marker is missing: ${marker}`);
    }
  });

  [
    "assertSafeModeRecovery",
    "assertStoragePreflightRecovery",
    "assertResetLocalStatePage",
    "mockLargeStorage=1",
    "Local state safe mode",
    "Local state recovery"
  ].forEach((marker) => {
    if (!uiSmokeText.includes(marker)) {
      failures.push(`Local state OOM UI smoke coverage is missing marker: ${marker}`);
    }
  });

  [
    "Image Cockpit Local State Reset",
    "codex-handoff/outbox",
    "image-cockpit.pendingCodexJob",
    "indexedDB.deleteDatabase",
    "/?safe=1"
  ].forEach((marker) => {
    if (!resetPageText.includes(marker)) {
      failures.push(`Static reset page is missing safety marker: ${marker}`);
    }
  });

  [
    "completed + outboxあり + import失敗",
    "Direction split import failed",
    "localStorage容量超過",
    "ui-smoke"
  ].forEach((marker) => {
    if (!qaText.includes(marker)) {
      failures.push(`Completed Codex import QA doc is missing marker: ${marker}`);
    }
  });

  [
    "?safe=1",
    "?skipStorage=1",
    "reset-local-state.html",
    "navigator.storage.estimate",
    "ui-smoke",
    "codex-handoff/outbox",
    "main merge前"
  ].forEach((marker) => {
    if (!localStateQaText.includes(marker)) {
      failures.push(`Local state OOM QA doc is missing marker: ${marker}`);
    }
  });
}

function checkSimpleLocalInboxAction() {
  const appText = readText("src/App.tsx");
  if (!appText) return;

  [
    "async function importLatestOutboxResult",
    "statusInboxImported",
    "Import Latest",
    "Import File"
  ].forEach((marker) => {
    if (!appText.includes(marker)) {
      failures.push(`Simplified UI should keep import support available internally: ${marker}`);
    }
  });

  ["{copy.importLatest}", "{copy.importFile}"].forEach((marker) => {
    if (appText.includes(marker)) {
      failures.push(`Simplified UI should hide secondary import buttons for now: ${marker}`);
    }
  });
}

function checkCoreLocalization() {
  const appText = readText("src/App.tsx");
  const appTestText = readText("src/App.test.ts");
  if (!appText || !appTestText) return;

  [
    "resolveInitialLanguage",
    "SUPPORTED_LANGUAGE_IDS",
    "resolveLocaleToLanguage",
    "withUiCopy",
    "copy.workflowPanelTitle",
    "copy.animationStepSourceTitle",
    "copy.animationStepMotionTitle",
    "copy.animationStepGenerateTitle",
    "copy.imageDownloadTitle",
    "copy.canvasAnnotationTitle",
    "copy.canvasEmpty",
    "copy.exportSheetPng",
    "copy.exportMetadataJson",
    "formatImagesImportedStatus",
    "formatFramesAddedStatus",
    "プレビュー",
    "スプライト書き出し",
    "スプライトパッケージ書き出し"
  ].forEach((marker) => {
    if (!appText.includes(marker)) {
      failures.push(`Core localization marker is missing: ${marker}`);
    }
  });

  if (!appTestText.includes("resolveInitialLanguage")) {
    failures.push("App tests should cover initial language resolution.");
  }

  [
    "zh-CN",
    "zh-TW",
    "ko",
    "ru",
    "es",
    "pt-BR",
    "de",
    "fr",
    "id",
    "tr",
    "vi",
    "pl",
    "it",
    "简体中文",
    "繁體中文",
    "한국어",
    "Русский",
    "Español",
    "Português (Brasil)",
    "Deutsch",
    "Français",
    "Bahasa Indonesia",
    "Türkçe",
    "Tiếng Việt",
    "Polski",
    "Italiano",
    "像素艺术生成",
    "像素藝術生成",
    "픽셀 아트 생성",
    "Генерация пиксель-арта",
    "Geração de pixel art",
    "Pixel-Art-Erstellung"
  ].forEach((marker) => {
    if (!appText.includes(marker)) {
      failures.push(`Locale pack marker is missing: ${marker}`);
    }
  });

  if (!appTestText.includes("zh-Hant-TW") || !appTestText.includes("pt-PT") || !appTestText.includes("SUPPORTED_LANGUAGE_IDS")) {
    failures.push("App tests should cover extended locale resolution and stored locale ids.");
  }
}

function checkPromptCatalogExamples() {
  const catalogs = [
    {
      file: "docs/prompt-examples/profession-character-prompts.md",
      prefix: "profession",
      expectedCount: 30,
      sampleTitles: ["Boy Warrior Apprentice", "Middle-Aged Female Captain"]
    },
    {
      file: "docs/prompt-examples/monster-prompts.md",
      prefix: "monster",
      expectedCount: 30,
      sampleTitles: ["Classic Green Slime", "Earth Spirit"]
    }
  ];

  catalogs.forEach((catalog) => {
    const text = readText(catalog.file)?.replace(/\r\n/g, "\n");
    if (!text) return;
    const negativePrompt = text.match(/## Common Negative Prompt[\s\S]*?```text\n([\s\S]*?)\n```/)?.[1]?.trim() ?? "";
    if (!negativePrompt) {
      failures.push(`${catalog.file} should include a common negative prompt.`);
    }
    const examples = [...text.matchAll(/###\s+\d+\.\s+([^\n]+)\n\n```text\n([\s\S]*?)\n```/g)].map((match) => ({
      title: match[1].trim(),
      prompt: match[2].trim()
    }));
    if (examples.length !== catalog.expectedCount) {
      failures.push(`${catalog.file} should include ${catalog.expectedCount} prompt examples, got ${examples.length}.`);
    }
    catalog.sampleTitles.forEach((title) => {
      if (!examples.some((example) => example.title === title)) {
        failures.push(`${catalog.file} should include sample prompt: ${title}`);
      }
    });
    examples.forEach((example) => {
      if (!example.prompt.includes("transparent background preferred")) {
        failures.push(`${catalog.file} prompt should prefer transparent background: ${example.title}`);
      }
      const imageFile = `public/prompt-examples/${catalog.prefix}-${slugPromptExampleTitle(example.title)}.png`;
      const imagePath = join(root, imageFile);
      if (!existsSync(imagePath)) return;
      const image = readFileSync(imagePath);
      const isPng = image.length > 24 && image[0] === 0x89 && image[1] === 0x50 && image[2] === 0x4e && image[3] === 0x47;
      if (!isPng) {
        failures.push(`Prompt example preview should be PNG: ${imageFile}`);
        return;
      }
      const width = image.readUInt32BE(16);
      const height = image.readUInt32BE(20);
      if (width < 1024 || height < 1024) {
        failures.push(`Prompt example preview should be at least 1024px in both dimensions: ${imageFile} is ${width}x${height}`);
      }
    });
  });
}

function checkCiWorkflow() {
  const workflow = readText(".github/workflows/ci.yml");
  if (!workflow) return;

  [
    "actions/checkout@v4",
    "actions/setup-node@v4",
    "npm ci",
    "npm run verify"
  ].forEach((line) => {
    if (!workflow.includes(line)) {
      failures.push(`CI workflow is missing expected step: ${line}`);
    }
  });

  if (!/contents:\s+read/.test(workflow)) {
    failures.push("CI workflow should keep contents permission read-only.");
  }
}

function checkReleaseDocs() {
  const readme = readText("README.md");
  const checklist = readText("docs/release/v0.1.0-checklist.md");
  const runbook = readText("docs/release/v0.1.0-runbook.md");
  const releaseNotes = readText("docs/release/v0.1.0-release-notes.md");
  const ownerReview = readText("docs/release/v0.1.0-owner-review.md");
  const finalAudit = readText("docs/release/v0.1.0-final-audit.md");
  const acceptanceEvidence = readText("docs/release/v0.1.0-acceptance-evidence.md");
  const ownerDecision = readText("docs/release/v0.1.0-owner-decision.md");
  const manualHandoff = readText("docs/usage/manual-handoff.md");
  if (!readme || !checklist || !runbook || !releaseNotes || !ownerReview || !finalAudit || !acceptanceEvidence || !ownerDecision || !manualHandoff) return;

  requiredReadmeLinks.forEach((link) => {
    if (!readme.includes(link)) {
      failures.push(`README is missing release link: ${link}`);
    }
  });

  ["Repository visibility change to public is explicitly approved", "Main merge is explicitly approved"].forEach((gate) => {
    if (!checklist.includes(gate)) {
      failures.push(`Release checklist is missing gate: ${gate}`);
    }
  });

  [
    "Do not change repository visibility, branch protection, or release assets without explicit owner approval.",
    "Do Not Ship If",
    "docs/release/v0.1.0-owner-review.md",
    "docs/release/v0.1.0-final-audit.md",
    "A direct OpenAI API call or API key requirement was added.",
    "`codex-handoff/`, `.env`, generated outputs, model weights, or license-unclear assets are staged."
  ].forEach((line) => {
    if (!runbook.includes(line)) {
      failures.push(`Release runbook is missing safety line: ${line}`);
    }
  });

  [
    "npm run doctor",
    "npm run verify",
    "npm run review:local",
    "npm run ui:smoke",
    "npm run codex:smoke",
    "Pixel art generation",
    "Image editing",
    "Animation generation",
    "The app itself does not call OpenAI APIs directly",
    "manual handoff",
    "terminal-runnable `%LOCALAPPDATA%\\OpenAI\\Codex\\bin\\...\\codex.exe` CLI",
    "codex exec -c approval_policy",
    "real no-image runner smoke",
    "Owner review guide gives the short path through `review:local`, manual workflow checks, and approval gates.",
    "Final audit maps the completion definition and explicit user requirements to evidence, while keeping merge, public visibility, tag, and release approval gates separate.",
    "npm run release:audit"
  ].forEach((line) => {
    if (!releaseNotes.includes(line)) {
      failures.push(`Release notes draft is missing expected content: ${line}`);
    }
  });

  [
    "Pixel art generation",
    "Image editing",
    "Animation generation",
    "Workspace simplicity",
    "Local-first boundary",
    "Manual handoff fallback",
    "Runner lifecycle wiring",
    "Codex command diagnostics",
    "Real Codex runner smoke",
    "real-codex-runner-smoke.mjs",
    "terminal-runnable Codex CLI",
    "real-codex-runner-smoke.md",
    "manual-handoff-import-latest-1280x720.png",
    "docs/release/v0.1.0-owner-decision.md",
    "docs/release/v0.1.0-owner-review.md",
    "docs/release/v0.1.0-final-audit.md",
    "Approval History",
    "codex exec",
    "npm run ui:smoke",
    "npm run smoke",
    "npm run verify",
    "npm run review:local"
  ].forEach((line) => {
    if (!acceptanceEvidence.includes(line)) {
      failures.push(`Acceptance evidence is missing expected content: ${line}`);
    }
  });
  checkAcceptanceEvidencePaths(acceptanceEvidence);

  [
    "Completion Definition Audit",
    "Explicit User Requirements",
    "Local-only OSS that runs where Codex is installed",
    "Disable Codex job creation while waiting for a result",
    "Keep visibility / release changes owner-approved",
    "Satisfied by approval history",
    "Real Codex smoke job `codex-job-2026-06-23T09-55-31-399Z`",
    "The v0.1.0 public baseline is release-ready for local-first usage"
  ].forEach((line) => {
    if (!finalAudit.includes(line)) {
      failures.push(`Final audit is missing expected content: ${line}`);
    }
  });
  checkAcceptanceEvidencePaths(finalAudit);

  [
    "npm run review:local",
    "npm run dev:all",
    "OpenAI API",
    "GitHub About / Topics / Social preview",
    "PR受付制限",
    "X投稿文",
    "P0 / P1 / P2"
  ].forEach((line) => {
    if (!ownerReview.includes(line)) {
      failures.push(`Owner review guide is missing expected content: ${line}`);
    }
  });

  [
    "Owner Decisions",
    "Do Not Proceed Without Approval",
    "Approve merge into `main`",
    "Approve changing repository visibility from private to public",
    "Approve creating the `v0.1.0` tag and GitHub release",
    "Owner review guide: `docs/release/v0.1.0-owner-review.md`",
    "Final audit: `docs/release/v0.1.0-final-audit.md`",
    "Owner-review sweep: `npm run review:local` on Codex-installed review machines",
    "automatic no-image `codex exec` completion has been verified",
    "Do not treat a successful Codex `--help` preflight as proof that automatic `codex exec` job completion works",
    "Do not treat mock autorun smoke as proof that the installed Codex executable itself can complete on every machine.",
    "Do not treat the no-image runner smoke as proof that image generation or image editing is available in every Codex environment."
  ].forEach((line) => {
    if (!ownerDecision.includes(line)) {
      failures.push(`Owner decision record is missing expected content: ${line}`);
    }
  });

  [
    "codex-handoff/inbox/",
    "codex-handoff/assets/",
    "codex-handoff/outbox/",
    "IMAGE_COCKPIT_CODEX_AUTORUN=0",
    "Local Inbox",
    "does not call OpenAI APIs directly"
  ].forEach((line) => {
    if (!manualHandoff.includes(line)) {
      failures.push(`Manual handoff guide is missing expected content: ${line}`);
    }
  });
}

function checkAcceptanceEvidencePaths(text) {
  const pathPattern = /`([^`]+\.(?:gif|json|md|mjs|png|ts|tsx|yml))`/g;
  const refs = new Set();
  let match;
  while ((match = pathPattern.exec(text))) {
    refs.add(match[1]);
  }

  refs.forEach((file) => {
    if (!existsSync(join(root, file))) {
      failures.push(`Acceptance evidence references missing file: ${file}`);
    }
  });
}

function readText(file) {
  try {
    return readFileSync(join(root, file), "utf8");
  } catch {
    failures.push(`Could not read ${file}`);
    return "";
  }
}

function readJson(file) {
  try {
    return JSON.parse(readText(file));
  } catch (error) {
    failures.push(`Could not parse ${file}: ${error.message}`);
    return null;
  }
}

function git(args) {
  try {
    return execFileSync("git", args, { cwd: root, encoding: "utf8" });
  } catch (error) {
    failures.push(`git ${args.join(" ")} failed: ${error.message}`);
    return null;
  }
}

function isAuditedTextFile(file) {
  if (file === "package.json" || file === ".env.example") return true;
  return [".js", ".mjs", ".ts", ".tsx"].includes(extname(file));
}

function isPrivacyAuditedTextFile(file) {
  return privacyTextExtensions.has(extname(file));
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
