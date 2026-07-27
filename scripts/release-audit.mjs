import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";

const root = process.cwd();
const failures = [];
const privacyTextExtensions = new Set(["", ".css", ".html", ".js", ".json", ".md", ".mjs", ".ts", ".tsx", ".txt", ".yaml", ".yml"]);
const expectedPackageVersion = "0.1.8";

function parsePromptExampleTitle(value) {
  const heading = value.trim();
  const localizedTitle = heading.match(/^(.+?)\s+\/\s+(.+)$/);
  if (!localizedTitle) return { en: heading, ja: heading };
  return { en: localizedTitle[1].trim(), ja: localizedTitle[2].trim() };
}

function slugPromptExampleTitle(value) {
  return parsePromptExampleTitle(value).en.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
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
  "scripts/dev-supervisor.mjs",
  "scripts/capture-readme-screenshots.mjs",
  "docs/qa/completed-codex-job-import-storage-quota.md",
  "docs/qa/local-state-oom-safe-mode-retention.md",
  "docs/qa/v0.1.8-release-prep.md",
  "docs/qa/v0.1.7-release-prep.md",
  "docs/qa/v0.1.6-release-prep.md",
  "docs/qa/single-horizontal-direction.md",
  "docs/qa/experimental-16-20-frame-animation.md",
  "docs/qa/selectable-single-animation-direction.md",
  "docs/qa/v0.1.5-release-prep.md",
  "docs/qa/v0.1.4-release-prep.md",
  "docs/qa/v0.1.3-release-prep.md",
  "docs/qa/v0.1.2-release-prep.md",
  "docs/qa/v0.1.1-release-prep.md",
  "docs/qa/cockpit-health-repair-supervisor.md",
  "docs/qa/deduplicate-bronze-candidate-import-retry.md",
  "docs/qa/settings-recovery-environment-report.md",
  "docs/qa/animation-direction-split-completion-hotfix.md",
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
  "src/AnimationReviewCockpit.tsx",
  "src/lib/animationReview.ts",
  "src/lib/animationReview.test.ts",
  "docs/qa/animation-review-cockpit-uiux.md",
  "docs/qa/animation-review-calibration-sample.json",
  "src/VfxCompositeStage.tsx",
  "src/lib/vfxComposite.ts",
  "src/lib/vfxComposite.test.ts",
  "src/lib/effectQuality.ts",
  "src/lib/effectQuality.test.ts",
  "docs/qa/vfx-composite-stage.md",
  "docs/qa/vfx-composite-stage-matrix.json",
  "src/lib/motionPilot.ts",
  "src/lib/motionPilot.test.ts",
  "docs/qa/animation-uplift-final-benchmark.md",
  "docs/qa/animation-uplift-final-benchmark.json",
  "docs/qa/animation-uplift-review-index.md",
  "src/lib/officialAnimations.ts",
  "docs/review/mvp-review-report.md",
  "docs/roadmap/release-roadmap.md",
  "docs/release/v0.1.0-checklist.md",
  "docs/release/v0.1.0-runbook.md",
  "docs/release/v0.1.0-release-notes.md",
  "docs/release/v0.1.8-release-notes.md",
  "docs/release/v0.1.7bugfix-release-notes.md",
  "docs/release/v0.1.7-release-notes.md",
  "docs/release/v0.1.6-release-notes.md",
  "docs/release/v0.1.5-release-notes.md",
  "docs/release/v0.1.4-release-notes.md",
  "docs/release/v0.1.3-release-notes.md",
  "docs/release/v0.1.2-release-notes.md",
  "docs/release/v0.1.1-release-notes.md",
  "docs/release/v0.1.0-owner-review.md",
  "docs/release/v0.1.0-final-audit.md",
  "docs/release/v0.1.0-acceptance-evidence.md",
  "docs/release/v0.1.0-owner-decision.md",
  "docs/usage/manual-handoff.md",
  "docs/demo/mvp-demo.gif",
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
  "docs/qa/official-basic-attack/basic-attack-mechanical-qa.json",
  "docs/qa/official-hurt-reaction/hurt-reaction-mechanical-qa.json",
  "docs/qa/official-death-downed/death-downed-mechanical-qa.json",
  "docs/qa/official-spell-cast/spell-cast-mechanical-qa.json",
  "docs/qa/official-jump-hop/jump-hop-mechanical-qa.json",
  "docs/qa/official-guard-block/guard-block-mechanical-qa.json",
  "docs/qa/official-victory-cheer/victory-cheer-mechanical-qa.json",
  "docs/qa/official-interact-pickup/interact-pickup-mechanical-qa.json",
  "docs/qa/official-ranged-attack/ranged-attack-mechanical-qa.json",
  "docs/qa/official-skill-release/skill-release-mechanical-qa.json",
  "docs/qa/official-knockback/knockback-mechanical-qa.json",
  "docs/qa/official-item-use/item-use-mechanical-qa.json",
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
  "docs/prompt-examples/chibi-boy-prompts.md",
  "docs/prompt-examples/chibi-girl-prompts.md",
  "docs/prompt-examples/animal-prompts.md",
  "docs/prompt-examples/beastfolk-prompts.md",
  "docs/qa/prompt-examples/animal-chibi-beastfolk-presets/README.md",
  "docs/qa/prompt-examples/animal-chibi-beastfolk-presets/asset-qc.json",
  "docs/prompt-examples/monster-prompts.md",
  "docs/prompt-examples/monster-girl-prompts.md",
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
  ...promptPreviewFilesFromMarkdown("docs/prompt-examples/chibi-boy-prompts.md", "chibi-boy"),
  ...promptPreviewFilesFromMarkdown("docs/prompt-examples/chibi-girl-prompts.md", "chibi-girl"),
  ...promptPreviewFilesFromMarkdown("docs/prompt-examples/animal-prompts.md", "animal"),
  ...promptPreviewFilesFromMarkdown("docs/prompt-examples/beastfolk-prompts.md", "beastfolk"),
  ...promptPreviewFilesFromMarkdown("docs/prompt-examples/monster-prompts.md", "monster"),
  ...promptPreviewFilesFromMarkdown("docs/prompt-examples/monster-girl-prompts.md", "monster-girl")
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

const requiredWorkflowIds = ["image-generate", "image-edit", "sprite-generate", "sprite-edit", "effect-animation"];
const requiredGitignorePatterns = [
  "node_modules/",
  "dist/",
  "coverage/",
  ".env",
  ".env.",
  "!.env.example",
  "codex-handoff/",
  "tmp/",
  ".dev-logs/",
  ".agents/",
  "docs/qa/**/*.png",
  "docs/qa/**/*.gif",
  "docs/qa/**/*.webp",
  "docs/qa/**/*.zip"
];
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
  "docs/release/v0.1.8-release-notes.md",
  "docs/qa/v0.1.8-release-prep.md",
  "docs/release/v0.1.7bugfix-release-notes.md",
  "docs/release/v0.1.7-release-notes.md",
  "docs/qa/v0.1.7-release-prep.md",
  "docs/release/v0.1.6-release-notes.md",
  "docs/qa/v0.1.6-release-prep.md",
  "docs/release/v0.1.5-release-notes.md",
  "docs/qa/v0.1.5-release-prep.md",
  "docs/release/v0.1.4-release-notes.md",
  "docs/qa/v0.1.4-release-prep.md",
  "docs/release/v0.1.3-release-notes.md",
  "docs/qa/v0.1.3-release-prep.md",
  "docs/release/v0.1.2-release-notes.md",
  "docs/qa/v0.1.2-release-prep.md",
  "docs/release/v0.1.1-release-notes.md",
  "docs/qa/v0.1.1-release-prep.md",
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
checkPromptPresetAssetQa();
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

function isIgnoredQaBinaryEvidence(file) {
  return /^docs\/qa\/.+\.(?:png|gif|webp|zip)$/i.test(file.replace(/\\/g, "/"));
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

  if (packageJson.version !== expectedPackageVersion) {
    failures.push(`package.json version should be ${expectedPackageVersion} for the current release prep.`);
  }

  const appText = readText("src/App.tsx");
  if (!appText.includes(`<small>v${expectedPackageVersion}</small>`)) {
    failures.push(`App version badge should display v${expectedPackageVersion}.`);
  }
  if (!appText.includes(`<strong>v${expectedPackageVersion}</strong>`)) {
    failures.push(`App settings version should display v${expectedPackageVersion}.`);
  }
  if (!appText.includes(`appVersion: "${expectedPackageVersion}"`)) {
    failures.push(`App environment report should include ${expectedPackageVersion}.`);
  }

  const serverText = readText("server/index.ts");
  if (!serverText.includes(`version: "${expectedPackageVersion}"`)) {
    failures.push(`API health version should report ${expectedPackageVersion}.`);
  }

  const packageLock = readJson("package-lock.json");
  if (packageLock) {
    if (packageLock.version !== expectedPackageVersion) {
      failures.push(`package-lock.json version should be ${expectedPackageVersion} for the current release prep.`);
    }
    if (packageLock.packages?.[""]?.version !== expectedPackageVersion) {
      failures.push(`package-lock root package version should be ${expectedPackageVersion} for the current release prep.`);
    }
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
  const motionRecipesText = readText("src/lib/motionRecipes.ts");
  const appTestText = readText("src/App.test.ts");
  const extendedFrameQaText = readText("docs/qa/experimental-16-20-frame-animation.md");
  const selectableSingleDirectionQaText = readText("docs/qa/selectable-single-animation-direction.md");
  const animationTournamentText = readText("src/lib/animationTournament.ts");
  const animationReviewText = readText("src/lib/animationReview.ts");
  const animationReviewUiText = readText("src/AnimationReviewCockpit.tsx");
  const serverText = readText("server/index.ts");
  const animationReviewQaText = readText("docs/qa/animation-review-cockpit-uiux.md");
  const vfxCompositeText = readText("src/lib/vfxComposite.ts");
  const vfxCompositeUiText = readText("src/VfxCompositeStage.tsx");
  const effectQualityText = readText("src/lib/effectQuality.ts");
  const vfxCompositeQaText = readText("docs/qa/vfx-composite-stage.md");
  const motionPilotText = readText("src/lib/motionPilot.ts");
  const finalBenchmarkText = readText("docs/qa/animation-uplift-final-benchmark.md");
  const finalReviewIndexText = readText("docs/qa/animation-uplift-review-index.md");
  const realCodexSmokeText = readText("scripts/real-codex-runner-smoke.mjs");
  const imageEditFullBodyQaText = readText("docs/qa/image-edit-full-body-fit.md");
  if (!appText || !stylesText || !smokeText || !uiSmokeText || !realCodexSmokeText || !animationTournamentText || !animationReviewText || !animationReviewUiText || !serverText || !animationReviewQaText || !vfxCompositeText || !vfxCompositeUiText || !effectQualityText || !vfxCompositeQaText || !motionPilotText || !finalBenchmarkText || !finalReviewIndexText || !motionRecipesText || !appTestText || !extendedFrameQaText || !selectableSingleDirectionQaText) return;

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
    "Effect Animation",
    "Initial screen should open the Pixel Art Generation workspace",
    "Initial screen should not show legacy Guided Start options",
    "selectWorkflowTab",
    "Route: Codex Handoff",
    "chroma-key direction frames",
    "Generate Pixel Art",
    "Generate Animation",
    "Generate Effect",
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
    "Animals",
    "Chibi Boys",
    "Chibi Girls",
    "Beastfolk",
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
    "Two-Head Chibi Knight",
    "Two-Head Chibi Mage",
    "Two-Head Chibi Archer",
    "Two-Head Chibi Healer",
    "Two-Head Chibi Ninja",
    "Two-Head Chibi Alchemist",
    "Two-Head Chibi Pirate",
    "Two-Head Chibi Robot",
    "Two-Head Chibi Dragon Tamer",
    "Boy Warrior Apprentice",
    "Middle-Aged Female Captain",
    "Classic Green Slime",
    "Earth Spirit",
    "Loyal Dog",
    "Copper-Haired Scout",
    "Auburn-Pigtail Farmer",
    "Wolf Beastfolk",
    "const expectedPromptExampleCount = 137",
    "at least ${expectedPromptExampleCount} image previews",
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
    "assertImageEditingFullBodyFitWithLogs",
    "mock-full-body-source.png",
    "imageRectNormalized",
    "imageRectPixels",
    "workspace should not overlap the Codex log panel",
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
    "Directions",
    "5 directions",
    "3 directions",
    "Fixed cells: 256 x 256 px",
    "Notify when done",
    "Animation Generation should not expose free-form motion prompt textareas",
    "Choose Animation modal",
    "Choose Animation trigger should sit directly below the selected animation card",
    "Pick an animated sample",
    "Select Animation",
    "animation-preset-example-trigger",
    "animation-preset-modal",
    "animation-sample-sprite",
    "Choose Animation should show 16 verified and 6 experimental animated samples",
    "Choose Animation should expose 6 experimental Recipes",
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
    "Slash Arc",
    "Hit Spark",
    "Magic Cast",
    "Projectile",
    "Impact",
    "Effect imported",
    "Sheet preview",
    "Frame timeline",
    "Effect GIF",
    "Sheet PNG",
    "Frames ZIP",
    "Metadata JSON",
    "Effect Pack ZIP",
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
    'useState<AnimationGenerationProfile>("best")',
    'initialCandidates: 3',
    'maximumCandidates: 3',
    'shouldStartBalancedAdditionalCandidate',
    'batchMatrixRunId',
    'batchMatrixCellKey',
    'const ANIMATION_DIRECTION_PRESET_IDS: AnimationDirectionPresetId[] = ["five", "three", "one"];'
  ].forEach((marker) => {
    if (!`${appText}\n${animationTournamentText}`.includes(marker)) {
      failures.push(`App should keep Best on the 3-candidate fallback, support adaptive Balanced, and keep 1/3/5 direction presets: ${marker}`);
    }
  });

  [
    [animationTournamentText, "planAnimationInitialCandidateAdmission"],
    [appText, "animationInitialAdmissionMessage"],
    [appText, "startPersistedTournamentInitialCandidatesFromUi"],
    [appText, "serverActiveCodexRunnerCount"],
    [stylesText, "animation-runner-admission-status"],
    [serverText, "startInitialCandidates"],
    [serverText, "withCodexRunnerAdmissionLock"],
    [serverText, "/api/codex/capacity"],
    [serverText, "tournament_job_endpoint_required"],
    [serverText, "animation_tournament_endpoint_required"],
    [serverText, "adaptive_candidate_initial_wave_required"],
    [serverText, "animation_profile_candidate_count_mismatch"],
    [serverText, "registerAnimationTournamentUnlocked"],
    [serverText, "insufficient_runner_slots"],
    [serverText, "initial_batch_admission_required"],
    [animationTournamentText, "evaluateBestFirstQualifiedCandidate"],
    [animationTournamentText, "BEST_FIRST_QUALIFIED_MIN_IDENTITY_SCORE"],
    [serverText, '"first-qualified"'],
    [smokeText, "First Qualified acceptance should cancel both remaining candidates"],
    [smokeText, "rejected Best admission should not leave a tournament manifest"],
    [smokeText, "all three admitted Best candidates should be running in one response"],
    [smokeText, "concurrent generic and animation admission should have exactly one winner"],
    [smokeText, "standard animation jobs should reject the generic job endpoint"],
    [smokeText, "variant casing should not bypass the standard animation endpoint guard"],
    [smokeText, "queued Balanced candidate C should not start before its initial wave"],
    [smokeText, "Best registration should reject a two-candidate initial wave"],
    [smokeText, "profile validation should allow persisted Direction Repair candidates beyond the fixed initial plan"],
    [smokeText, "capacity-blocked Direction Repair should not consume a retry"],
    [uiSmokeText, "Animation Generation should be disabled while one Codex job is running"],
    [uiSmokeText, "Disabled animation action must not register a tournament or job"]
  ].forEach(([text, marker]) => {
    if (!text.includes(marker)) failures.push(`Animation runner admission contract is missing: ${marker}`);
  });

  [
    "animationReviewDimensionScores",
    "animationReviewQcMatrix",
    "normalizeAnimationHumanReview",
    "buildAnimationCalibrationExport",
    "image-cockpit.animation-review-calibration.v1"
  ].forEach((marker) => {
    if (!animationReviewText.includes(marker)) failures.push(`Animation Review model is missing: ${marker}`);
  });

  [
    "Candidate A/B/C · Sync Compare",
    "Candidate A/B/C/D · Sync Compare",
    "Direction × Frame QC Matrix",
    "Preview Studio",
    "Adjacent diff",
    "Frame-range Repair",
    "prefers-reduced-motion: reduce"
  ].forEach((marker) => {
    if (!`${animationReviewUiText}\n${stylesText}`.includes(marker)) failures.push(`Animation Review UI is missing: ${marker}`);
  });

  [
    "Review A/B/C",
    "collapsible-animation-step",
    "animation-source-mismatch",
    "/review",
    "Category",
    "Status"
  ].forEach((marker) => {
    if (!appText.includes(marker)) failures.push(`Animation Review integration is missing: ${marker}`);
  });

  [
    "recordAnimationHumanReview",
    "normalizeAnimationHumanReviewForManifest",
    "/review"
  ].forEach((marker) => {
    if (!serverText.includes(marker)) failures.push(`Animation Review persistence is missing: ${marker}`);
  });

  [
    "assertAnimationReviewCockpit",
    "Mobile Animation Review should fit",
    "Human review persistence",
    "Motion Browser samples should pause"
  ].forEach((marker) => {
    if (!uiSmokeText.includes(marker)) failures.push(`UI smoke should cover Animation Review: ${marker}`);
  });

  [
    "Animation Review Cockpit UI/UX QA",
    "171 tests pass",
    "390×844"
  ].forEach((marker) => {
    if (!animationReviewQaText.includes(marker)) failures.push(`Animation Review QA evidence is missing: ${marker}`);
  });

  [
    "image-cockpit.vfx-composite.v1",
    "VFX_COMPOSITE_SOCKETS",
    "resolveVfxAttachmentPoint",
    "retimeVfxToEvent",
    "createVfxCompositeArtifacts",
    "importVfxCompositePack",
    "buildVfxCompositeEngineExports"
  ].forEach((marker) => {
    if (!vfxCompositeText.includes(marker)) failures.push(`VFX Composite model/export is missing: ${marker}`);
  });

  [
    "VFX Composite Stage",
    "Socket / Event",
    "Basic offset",
    "Advanced adjustments",
    "Combined GIF",
    "Combined APNG",
    "Composite Pack ZIP",
    "Reimport Pack"
  ].forEach((marker) => {
    if (!vfxCompositeUiText.includes(marker)) failures.push(`VFX Composite UI is missing: ${marker}`);
  });

  [
    "image-cockpit.effect-quality.v2",
    "loop seam energy changes abruptly",
    "energy centroid jumps between frames",
    "peak frame is offset from the requested event"
  ].forEach((marker) => {
    if (!effectQualityText.includes(marker)) failures.push(`VFX Quality v2 shadow metrics are missing: ${marker}`);
  });

  [
    "telegraph-aoe",
    "aura-status",
    "heal-buff",
    "barrier-shield",
    "spawn-portal",
    "movement-trail",
    "buildEffectQualityReportV2",
    "Open Composite Stage"
  ].forEach((marker) => {
    if (!appText.includes(marker)) failures.push(`Effect Animation Phase 2 integration is missing: ${marker}`);
  });

  [
    "assertVfxCompositeStage",
    "VFX Composite Pack reimport",
    "six sockets",
    "five overlay controls"
  ].forEach((marker) => {
    if (!uiSmokeText.includes(marker)) failures.push(`UI smoke should cover VFX Composite Stage: ${marker}`);
  });

  [
    "VFX Composite Stage QA",
    "melee attack × slash / impact",
    "cast × magic / aura / heal",
    "projectile attack × projectile / impact",
    "separate-layer export"
  ].forEach((marker) => {
    if (!vfxCompositeQaText.includes(marker)) failures.push(`VFX Composite QA evidence is missing: ${marker}`);
  });

  [
    "theoreticalMotionPilotDirectionOutputs",
    "decideMotionPilotReview",
    "summarizeAnimationBenchmark",
    "motionPilotMeetsAdoptionGate"
  ].forEach((marker) => {
    if (!motionPilotText.includes(marker)) failures.push(`Motion Pilot benchmark model is missing: ${marker}`);
  });

  [
    "Motion Pilot Tournament",
    "Experimental · Best only · default OFF",
    "pilot/expand",
    "Fallback to Balanced",
    "Accept Pilot Expansion",
    "Revalidate Pilot Final",
    "adoptDisabledReason",
    "Pilot expansion will remain in review until a slot is free",
    "artifactDirections"
  ].forEach((marker) => {
    if (!appText.includes(marker)) failures.push(`Motion Pilot UI/client flow is missing: ${marker}`);
  });

  [
    "startMotionPilotExpansion",
    "fallbackMotionPilotTournament",
    "pilotCandidateIds",
    "directionOutputCount",
    "totalCandidateJobs",
    "assertCodexRunnerSlotAvailable"
  ].forEach((marker) => {
    if (!serverText.includes(marker)) failures.push(`Motion Pilot server manifest flow is missing: ${marker}`);
  });

  [
    "Motion Pilot Tournament must remain experimental and default OFF",
    "Best only",
    "Human review gate",
    "remaining 4 directions"
  ].forEach((marker) => {
    if (!uiSmokeText.includes(marker)) failures.push(`UI smoke should cover Motion Pilot gating: ${marker}`);
  });

  [
    "Animation Uplift Final Benchmark",
    "standard real browser trials",
    "Motion Pilot A/B",
    "false success 0",
    "stuck 0"
  ].forEach((marker) => {
    if (!finalBenchmarkText.includes(marker)) failures.push(`Final benchmark evidence is missing: ${marker}`);
  });

  [
    "Phase 1",
    "Phase 2",
    "Phase 3",
    "Phase 4",
    "Phase 5",
    "Phase 6",
    "Phase 7",
    "Phase 8",
    "rollback checkpoint"
  ].forEach((marker) => {
    if (!finalReviewIndexText.includes(marker)) failures.push(`Animation Uplift review index is missing: ${marker}`);
  });

  const directionPresetLayoutPattern = /\.direction-preset-buttons\s*\{[^}]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\);[^}]*\}/s;
  if (!directionPresetLayoutPattern.test(stylesText)) {
    failures.push("Direction preset control should render as a balanced 3-option segmented control.");
  }

  const singleDirectionLayoutPattern = /\.single-direction-buttons\s*\{[^}]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\);[^}]*\}/s;
  const singleDirectionTargetPattern = /\.segmented-control\.single-direction-buttons button\s*\{[^}]*min-height:\s*48px;[^}]*\}/s;
  if (!singleDirectionLayoutPattern.test(stylesText) || !singleDirectionTargetPattern.test(stylesText)) {
    failures.push("Selectable single-direction control should use a responsive three-column layout with 48px targets.");
  }

  [
    [appText, 'const DEFAULT_SINGLE_ANIMATION_DIRECTION: AnimationDirectionId = "side"'],
    [appText, 'animationDirectionOne: "1 direction"'],
    [appText, 'animationDirectionOne: "1方向"'],
    [appText, "animationDirectionsForPreset"],
    [appText, "animationDirectionSelectionForDirections"],
    [appText, "single-direction-buttons"],
    [appText, "data-animation-direction"],
    [appText, "animationSingleDirectionHint"],
    [appText, "canUseMotionPilot"],
    [appText, "motionPilotAvailabilityText"],
    [appText, "select Best to enable"],
    [appText, "setGrid(animationSheetGridForDirections(nextDirections, animationFrameCount))"],
    [appText, "unavailable for single-direction generation"],
    [appTestText, 'canonicalDirections = ["front", "front three-quarter", "side", "back three-quarter", "back"]'],
    [appTestText, 'animationDirectionsForPreset("one", direction)'],
    [appTestText, 'animationDirectionSelectionForDirections(["back-three-quarter"])'],
    [serverText, "![1, 3, 5].includes(requestedDirections.length)"],
    [serverText, "Motion Pilot requires more than one requested direction."],
    [serverText, "complete requested direction set"],
    [smokeText, 'const canonicalSingleDirections = ["front", "front three-quarter", "side", "back three-quarter", "back"]'],
    [smokeText, "smoke-single-back-three-quarter-tournament"],
    [smokeText, "single-direction registration should accept the canonical ${direction} choice"],
    [smokeText, "server should reject Motion Pilot for any single-direction tournament"],
    [smokeText, "server should reject single-direction values outside the five canonical choices"],
    [uiSmokeText, '"1 direction"'],
    [uiSmokeText, ".single-direction-buttons"],
    [uiSmokeText, "back-three-quarter"],
    [uiSmokeText, "single-direction history restores exact direction and frame grid"],
    [uiSmokeText, "IMAGE_COCKPIT_UI_SMOKE_ONLY_SINGLE_DIRECTION"],
    [selectableSingleDirectionQaText, "Side remains the initial single-direction choice"],
    [selectableSingleDirectionQaText, "front three-quarter"],
    [selectableSingleDirectionQaText, "back three-quarter"],
    [selectableSingleDirectionQaText, "4096 x 256 px"],
    [selectableSingleDirectionQaText, "5120 x 256 px"]
  ].forEach(([text, marker]) => {
    if (!text.includes(marker)) {
      failures.push("Animation Generation should keep the selectable 1-direction contract: " + marker);
    }
  });
  [
    [appText, "unavailable for side-only generation"],
    [serverText, "Single-direction animation tournaments require the side direction."]
  ].forEach(([text, retiredMarker]) => {
    if (text.includes(retiredMarker)) {
      failures.push("Animation Generation should not retain the retired side-only restriction: " + retiredMarker);
    }
  });
  [
    [motionRecipesText, "export type MotionFrameCount = 4 | 6 | 8 | 12 | 16 | 20"],
    [motionRecipesText, "MOTION_FRAME_COUNTS: readonly MotionFrameCount[] = [4, 6, 8, 12, 16, 20]"],
    [motionRecipesText, "EXPERIMENTAL_MOTION_FRAME_COUNTS = [16, 20]"],
    [motionRecipesText, 'MOTION_RECIPE_COMPILER_VERSION = "1.2.0"'],
    [appText, "data-frame-count={frameCount}"],
    [appText, "16f / 20f are experimental"],
    [appText, "motion-frame-experimental-note"],
    [stylesText, ".app-shell .motion-frame-buttons { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); }"],
    [serverText, "16 frames use 4x4, and 20 frames use 4x5"],
    [animationPackText, "4, 6, 8, 12, 16, or 20"],
    [animationPackText, "animationLibraryHistoryMetadata"],
    [appText, "historyAnimationFrameCount(selected)"],
    [smokeText, "single-direction candidate should keep a 20x1 / 20-frame final sheet contract"],
    [uiSmokeText, "Single-direction 20f final sheet should be 5120x256"],
    [uiSmokeText, "Five-direction 20f final sheet should be 5120x1280"],
    [uiSmokeText, "Japanese frame buttons should keep localized accessible names"],
    [uiSmokeText, "single-direction 20f Animation Pack download"],
    [uiSmokeText, "five-direction 20f Animation Pack download"],
    [uiSmokeText, "Every single-direction browser manifest should preserve a 4x5 raw direction grid"],
    [appTestText, "[20, { columns: 4, rows: 5, gutter: 0 }]"],
    [extendedFrameQaText, "20f side-only"],
    [extendedFrameQaText, "5120x256"],
    [extendedFrameQaText, "5120x1280"]
  ].forEach(([text, marker]) => {
    if (!text.includes(marker)) failures.push(`Animation Generation should preserve Experimental 16f/20f coverage: ${marker}`);
  });
  [
    "AnimationUtilityModal",
    "animation-advanced-settings-trigger",
    "animation-activity-trigger",
    "Generation status & history",
    "openDialogs[openDialogs.length - 1] !== modalRef.current"
  ].forEach((marker) => {
    if (!appText.includes(marker)) {
      failures.push(`Animation Generation should keep optional controls in utility modals: ${marker}`);
    }
  });

  [
    "effect-steps-simplified",
    "effect-picker-trigger",
    "effect-advanced-settings-trigger",
    "effect-picker-modal-body",
    "effect-optional-tools",
    "Selected effect",
    "Use This Effect"
  ].forEach((marker) => {
    if (!appText.includes(marker)) {
      failures.push(`Effect Animation should keep optional controls in utility modals: ${marker}`);
    }
  });

  [
    "--ui-readable-font-floor: 16px",
    ".source-panel > .workflow-tabs button.active",
    "grid-auto-rows: minmax(54px, auto)",
    "flex: 0 0 auto",
    ".cockpit.without-sprite-actions .history-panel"
  ].forEach((marker) => {
    if (!stylesText.includes(marker)) {
      failures.push(`Readable workflow navigation treatment is missing: ${marker}`);
    }
  });
  if (!/\.source-panel > \.workflow-tabs\s*\{[^}]*order:\s*0;/s.test(stylesText)) {
    failures.push("Primary workflow navigation should keep source-panel order zero at responsive widths");
  }
  if (!/\.app-shell \.history-item\s*\{[^}]*min-height:\s*100px;[^}]*overflow:\s*hidden;/s.test(stylesText)) {
    failures.push("Readable result cards should contain the 16px text within a 100px card");
  }
  if (!/\.app-shell \.history-item\.effect-result\s*\{[^}]*min-height:\s*66px;/s.test(stylesText)) {
    failures.push("Effect result cards should keep their compact two-line readable height");
  }
  if (!/\.app-shell \.history-item small\s*\{[^}]*text-overflow:\s*ellipsis;[^}]*white-space:\s*nowrap;/s.test(stylesText)) {
    failures.push("Result metadata should stay on stable single lines with ellipsis");
  }
  if (!appText.includes("title={item.name}")) {
    failures.push("Truncated result titles should retain the full filename in a native tooltip");
  }

  const sourcePanelStart = appText.indexOf('<aside className="panel source-panel">');
  const sourcePanelEnd = appText.indexOf("{isAnimationWorkflow ? (", sourcePanelStart);
  const sourcePanelShell = sourcePanelStart >= 0 && sourcePanelEnd > sourcePanelStart
    ? appText.slice(sourcePanelStart, sourcePanelEnd)
    : "";
  const workflowTabsIndex = sourcePanelShell.indexOf("<WorkflowTabs");
  const workflowSummaryIndex = sourcePanelShell.indexOf('className="workflow-summary"');
  const cockpitHealthIndex = sourcePanelShell.indexOf("<CockpitHealthPanel");
  if (!(workflowTabsIndex >= 0 && workflowTabsIndex < workflowSummaryIndex && workflowSummaryIndex < cockpitHealthIndex)) {
    failures.push("Primary workflow navigation should lead the left-column hierarchy before summary and health");
  }

  [
    "Initial workspace should place primary workflow buttons before summary and health",
    "Primary workflow buttons should be visible without scrolling the initial workspace",
    "Result cards should contain enlarged text without vertical overlap",
    "Result metadata should stay on stable single lines",
    "Truncated result titles should keep the full filename in the native tooltip",
    "Workflow buttons should not overlap the following animation controls",
    "Responsive workflow panels should stack instead of covering the primary workflow buttons",
    "Collapsed animation source step should keep Upload Pixel Art available on demand",
    "Animation advanced settings should return focus to its trigger",
    "Animation generation history should return focus to its trigger"
  ].forEach((marker) => {
    if (!uiSmokeText.includes(marker)) {
      failures.push(`UI smoke should cover the simplified animation controls: ${marker}`);
    }
  });

  [
    "Effect Animation should show only choose and generate steps by default",
    "Effect optional controls should stay out of the default left column",
    "Effect picker should return focus to its trigger",
    "Effect advanced settings should return focus to its trigger",
    "VFX Composite Stage should stay collapsed as an optional post-generation tool"
  ].forEach((marker) => {
    if (!uiSmokeText.includes(marker)) {
      failures.push(`UI smoke should cover the simplified effect controls: ${marker}`);
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
    "basic-two-head-chibi-knight",
    "basic-two-head-chibi-mage",
    "basic-two-head-chibi-archer",
    "basic-two-head-chibi-healer",
    "basic-two-head-chibi-ninja",
    "basic-two-head-chibi-alchemist",
    "basic-two-head-chibi-pirate",
    "basic-two-head-chibi-robot",
    "basic-two-head-chibi-dragon-tamer",
    "PROFESSION_CHARACTER_CATEGORY",
    "ANIMAL_CATEGORY",
    "CHIBI_BOY_CATEGORY",
    "CHIBI_GIRL_CATEGORY",
    "BEASTFOLK_CATEGORY",
    "MONSTER_CATEGORY",
    "MONSTER_GIRL_CATEGORY",
    "parsePromptCatalogTitle",
    "parsePromptCatalogMarkdown",
    "professionCharacterPromptsMarkdown",
    "animalPromptsMarkdown",
    "chibiBoyPromptsMarkdown",
    "chibiGirlPromptsMarkdown",
    "beastfolkPromptsMarkdown",
    "monsterPromptsMarkdown",
    "monsterGirlPromptsMarkdown",
    "professionCharacterPromptExamples",
    "animalPromptExamples",
    "chibiBoyPromptExamples",
    "chibiGirlPromptExamples",
    "beastfolkPromptExamples",
    "monsterPromptExamples",
    "monsterGirlPromptExamples",
    "docs/prompt-examples/profession-character-prompts.md",
    "docs/prompt-examples/animal-prompts.md",
    "docs/prompt-examples/chibi-boy-prompts.md",
    "docs/prompt-examples/chibi-girl-prompts.md",
    "docs/prompt-examples/beastfolk-prompts.md",
    "docs/prompt-examples/monster-prompts.md",
    "docs/prompt-examples/monster-girl-prompts.md"
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
    "imageRectNormalized",
    "imageRectPixels",
    "source image normalized",
    "Do not zoom in, crop, or reframe"
  ].forEach((marker) => {
    if (!smokeText.includes(marker)) {
      failures.push(`Smoke test should cover Image Editing source coordinate handoff: ${marker}`);
    }
  });
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

  [
    "imagegen skill default built-in image generation path",
    "never a procedural placeholder",
    "workflowMode=image-edit",
    "numbered annotationContext region comments",
    "imageRectNormalized",
    "imageRectPixels",
    "Preserve the original canvas size and aspect ratio",
    "Do not zoom in, crop, or reframe",
    "workflowMode=sprite-generate",
    "workflowMode=effect-animation",
    "spriteContext.chromaKey",
    "spriteContext.directions",
    "image-cockpit.direction-split-animation.v1",
    "front-three-quarter",
    "Do not return only one combined multi-direction sheet",
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
    "real alpha transparency",
    "Do not bake checkerboard",
    "effectContext exactly",
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
    "importEffectAnimationResult",
    "evaluateEffectAnimationQc",
    "effectQualityRankAllowsDownload",
    "exportSelectedEffectPack",
    "CODEX_LOG_HISTORY_LIMIT = MAX_ACTIVE_CODEX_JOBS",
    "codexLogAutoScrollRef",
    "pre.scrollTop = pre.scrollHeight",
    "Maximize2",
    "Minimize2",
    ".codex-log-panel.fullscreen",
    "Every cell must contain exactly one complete",
    "Do not let any part cross cell borders",
    "Quality gate before returning",
    "codexFailurePolicyMessage"
  ].forEach((marker) => {
    if (!appText.includes(marker) && !stylesText.includes(marker)) {
      failures.push(`App should preserve strict animation result preview/prompt handling: ${marker}`);
    }
  });

  [
    "imageDisplayRectForCanvas",
    "annotationImageCoordinates",
    "imageRectNormalized",
    "imageRectPixels",
    "Preserve the original canvas size and aspect ratio",
    "Do not zoom in, crop, or reframe",
    "grid-template-rows: minmax(340px, 1fr) auto",
    "height: 112px",
    "max-height: 112px",
    "container-type: size"
  ].forEach((marker) => {
    if (!appText.includes(marker) && !stylesText.includes(marker)) {
      failures.push(`App should preserve Image Editing full-body fit handling: ${marker}`);
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
    "Image Editing Full-Body Fit QA",
    "imageRectNormalized",
    "imageRectPixels",
    "Codex log panel",
    "Real imagegen editing was not run"
  ].forEach((marker) => {
    if (!imageEditFullBodyQaText?.includes(marker)) {
      failures.push(`Image Editing full-body fit QA doc should record: ${marker}`);
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
    "sprite generation job should include total sprite frame count",
    "sprite generation job should preserve the selected frame budget",
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
    "unapproved mock runner should not report ready",
    "unapproved mock runner should not create fake images",
    "IMAGE_COCKPIT_ALLOW_MOCK_RUNNER",
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
    "detectCodexRunnerMode",
    "isMockRunnerBlocked",
    "mockRunnerBlockedDiagnostic",
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
  const smokeText = readText("scripts/smoke.mjs");
  const serverText = readText("server/index.ts");
  const storageText = readText("src/lib/storage.ts");
  const devSupervisorText = readText("scripts/dev-supervisor.mjs");
  const resetPageText = readText("public/reset-local-state.html");
  const qaText = readText("docs/qa/completed-codex-job-import-storage-quota.md");
  const localStateQaText = readText("docs/qa/local-state-oom-safe-mode-retention.md");
  const cockpitHealthQaText = readText("docs/qa/cockpit-health-repair-supervisor.md");
  const dedupeQaText = readText("docs/qa/deduplicate-bronze-candidate-import-retry.md");
  const settingsQaText = readText("docs/qa/settings-recovery-environment-report.md");
  const directionSplitHotfixQaText = readText("docs/qa/animation-direction-split-completion-hotfix.md");
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
    "outboxImportKey",
    "prependHistoryItemWithDedupe",
    "dedupePersistedLocalInboxHistory",
    "lastOutboxFingerprint",
    "CockpitHealthPanel",
    "Cockpitを修復",
    "結果を再取り込み"
  ].forEach((marker) => {
    if (!appText.includes(marker) && !storageText.includes(marker)) {
      failures.push(`Cockpit health / import dedupe guard is missing marker: ${marker}`);
    }
  });

  [
    "/api/dev/health",
    "/api/dev/repair",
    "127.0.0.1",
    "IMAGE_COCKPIT_API_TARGET",
    "hasRunningCodexJobs",
    "restart-vite"
  ].forEach((marker) => {
    if (!devSupervisorText.includes(marker)) {
      failures.push(`Dev supervisor safety marker is missing: ${marker}`);
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

  [
    "/api/health",
    "/api/dev/health",
    "Cockpitを修復",
    "結果を再取り込み",
    "running Codex job",
    "browser"
  ].forEach((marker) => {
    if (!cockpitHealthQaText.includes(marker)) {
      failures.push(`Cockpit health QA doc is missing marker: ${marker}`);
    }
  });

  [
    "outboxImportKey",
    "bronze candidate",
    "IndexedDB",
    "exact duplicate",
    "Retry import",
    "ui-smoke"
  ].forEach((marker) => {
    if (!dedupeQaText.includes(marker)) {
      failures.push(`Bronze candidate dedupe QA doc is missing marker: ${marker}`);
    }
  });

  [
    "SettingsModal",
    "settings-trigger",
    "buildImageCockpitEnvironmentReport",
    "redactEnvironmentReportText",
    "settingsTabFromSearch",
    "shouldOpenSettingsFromSearch",
    "imagegenSmokeState",
    "Copy Markdown",
    "Copy JSON",
    "Environment Report"
  ].forEach((marker) => {
    if (!appText.includes(marker)) {
      failures.push(`Settings recovery/report app marker is missing: ${marker}`);
    }
  });

  [
    "procedural, SVG, canvas, diagram, geometric, or placeholder image",
    "reasonKind=imagegen_unavailable",
    '"reasonKind": "policy_or_safety" | "imagegen_unavailable" | "unknown"'
  ].forEach((marker) => {
    if (!serverText.includes(marker)) {
      failures.push(`Server imagegen-unavailable guard marker is missing: ${marker}`);
    }
  });

  [
    "imagegen unavailable sidecar",
    "imagegen_unavailable",
    "should not create a fake image",
    "built-in imagegen / image_gen",
    "procedural, SVG, canvas, diagram, geometric, or placeholder image"
  ].forEach((marker) => {
    if (!smokeText.includes(marker)) {
      failures.push(`Smoke imagegen-unavailable guard marker is missing: ${marker}`);
    }
  });

  [
    "assertSettingsRecoveryEnvironmentReport",
    "assertImagegenUnavailableSidecar",
    "settings trigger next to language selector",
    "Copy Markdown",
    "Copy JSON",
    "imagegen smoke: not_run",
    "Open Safe Mode",
    "Open Reset Local State",
    "Imagegen unavailable sidecar should not create a fake history image"
  ].forEach((marker) => {
    if (!uiSmokeText.includes(marker)) {
      failures.push(`UI smoke settings/recovery/report marker is missing: ${marker}`);
    }
  });

  [
    "Settings / Recovery / Environment Report QA",
    "Settings",
    "Recovery",
    "Environment Report",
    "imagegen_unavailable",
    "not_run",
    "?safe=1",
    "/reset-local-state.html",
    "Copy Markdown",
    "Copy JSON",
    "ui-smoke",
    "browser",
    "main merge前"
  ].forEach((marker) => {
    if (!settingsQaText?.includes(marker)) {
      failures.push(`Settings recovery/report QA doc is missing marker: ${marker}`);
    }
  });

  [
    "findReadyDirectionSplitArtifacts",
    "findLatestReadyDirectionSplitArtifact",
    "directionSplitJobIdFromOutboxResultName",
    "isDirectionSplitComponentOutboxName",
    "isGenericStaticImageResult",
    "isDirectionSplitArtifactAlreadyImported",
    "importReadyDirectionSplitArtifact",
    "directionSplitRecoveryJobFromArtifact",
    "direction-split-animation-sheet.png"
  ].forEach((marker) => {
    if (!appText.includes(marker)) {
      failures.push(`Direction split completion hotfix app marker is missing: ${marker}`);
    }
  });

  [
    "assertDetachedDirectionSplitRecoverResults",
    "writeDetachedDirectionSplitFixture",
    "makeDirectionSplitFixturePng",
    "Detached direction split final sheet should be 2048x1280",
    "Detached direction split recovery should not add raw front direction file as history",
    "Detached direction split recovery should not duplicate the final sheet"
  ].forEach((marker) => {
    if (!uiSmokeText.includes(marker)) {
      failures.push(`Direction split completion hotfix UI smoke marker is missing: ${marker}`);
    }
  });

  [
    "Animation Direction Split Completion Hotfix QA",
    "032 hotfix",
    "image-cockpit.direction-split-animation.v1",
    "pending job",
    "Recover Results",
    "2048x1280",
    "1024x512",
    "raw direction",
    "ui-smoke",
    "main merge前"
  ].forEach((marker) => {
    if (!directionSplitHotfixQaText?.includes(marker)) {
      failures.push(`Direction split completion hotfix QA doc is missing marker: ${marker}`);
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
      file: "docs/prompt-examples/chibi-boy-prompts.md",
      prefix: "chibi-boy",
      expectedCount: 5,
      sampleTitles: ["Copper-Haired Scout", "Blue-Curled Noble"],
      requireLocalizedTitles: true
    },
    {
      file: "docs/prompt-examples/chibi-girl-prompts.md",
      prefix: "chibi-girl",
      expectedCount: 5,
      sampleTitles: ["Auburn-Pigtail Farmer", "Violet-Braided Alchemist"],
      requireLocalizedTitles: true
    },
    {
      file: "docs/prompt-examples/animal-prompts.md",
      prefix: "animal",
      expectedCount: 10,
      sampleTitles: ["Loyal Dog", "Red Panda"],
      requireLocalizedTitles: true
    },
    {
      file: "docs/prompt-examples/beastfolk-prompts.md",
      prefix: "beastfolk",
      expectedCount: 10,
      sampleTitles: ["Wolf Beastfolk", "Red Panda Beastfolk"],
      requireLocalizedTitles: true
    },
    {
      file: "docs/prompt-examples/monster-prompts.md",
      prefix: "monster",
      expectedCount: 30,
      sampleTitles: ["Classic Green Slime", "Earth Spirit"]
    },
    {
      file: "docs/prompt-examples/monster-girl-prompts.md",
      prefix: "monster-girl",
      expectedCount: 20,
      sampleTitles: ["Slime Scout Girl", "Shark Pirate Girl"]
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
      heading: match[1].trim(),
      title: parsePromptExampleTitle(match[1]),
      prompt: match[2].trim()
    }));
    if (examples.length !== catalog.expectedCount) {
      failures.push(`${catalog.file} should include ${catalog.expectedCount} prompt examples, got ${examples.length}.`);
    }
    catalog.sampleTitles.forEach((title) => {
      if (!examples.some((example) => example.title.en === title)) {
        failures.push(`${catalog.file} should include sample prompt: ${title}`);
      }
    });
    examples.forEach((example) => {
      if (catalog.requireLocalizedTitles && example.title.en === example.title.ja) {
        failures.push(`${catalog.file} should use an English Title / 日本語名 heading: ${example.heading}`);
      }
      if (!example.prompt.includes("transparent background preferred")) {
        failures.push(`${catalog.file} prompt should prefer transparent background: ${example.title.en}`);
      }
      const imageFile = `public/prompt-examples/${catalog.prefix}-${slugPromptExampleTitle(example.title.en)}.png`;
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

function checkPromptPresetAssetQa() {
  const qaFile = "docs/qa/prompt-examples/animal-chibi-beastfolk-presets/asset-qc.json";
  const qaText = readText(qaFile);
  if (!qaText) return;

  let qa;
  try {
    qa = JSON.parse(qaText);
  } catch {
    failures.push(`${qaFile} should contain valid JSON.`);
    return;
  }

  const expectedFiles = [
    ...promptPreviewFilesFromMarkdown("docs/prompt-examples/animal-prompts.md", "animal"),
    ...promptPreviewFilesFromMarkdown("docs/prompt-examples/chibi-boy-prompts.md", "chibi-boy"),
    ...promptPreviewFilesFromMarkdown("docs/prompt-examples/chibi-girl-prompts.md", "chibi-girl"),
    ...promptPreviewFilesFromMarkdown("docs/prompt-examples/beastfolk-prompts.md", "beastfolk")
  ].sort();
  const assets = Array.isArray(qa.assets) ? qa.assets : [];

  if (qa.expectedCount !== expectedFiles.length || qa.actualCount !== expectedFiles.length || assets.length !== expectedFiles.length) {
    failures.push(`${qaFile} should describe exactly ${expectedFiles.length} prompt preview assets.`);
  }
  if (qa.allChecksPass !== true) {
    failures.push(`${qaFile} should report allChecksPass=true.`);
  }

  const seenFiles = new Set();
  assets.forEach((asset) => {
    const file = typeof asset.file === "string" ? asset.file.replace(/\\/g, "/") : "";
    if (!file || seenFiles.has(file)) {
      failures.push(`${qaFile} should contain one unique file entry per asset: ${file || "<missing>"}`);
      return;
    }
    seenFiles.add(file);
    if (!expectedFiles.includes(file)) {
      failures.push(`${qaFile} contains an unexpected prompt preview: ${file}`);
      return;
    }

    const checks = asset.checks && typeof asset.checks === "object" ? Object.values(asset.checks) : [];
    const margins = asset.margins && typeof asset.margins === "object" ? Object.values(asset.margins) : [];
    if (
      asset.mode !== "RGBA" ||
      asset.transparentPixels <= 0 ||
      asset.edgeTouch !== false ||
      asset.checks?.centered !== true ||
      !Number.isFinite(asset.centerOffsetX) ||
      !Number.isFinite(asset.centerOffsetY) ||
      Math.abs(asset.centerOffsetX) > 1 ||
      Math.abs(asset.centerOffsetY) > 1 ||
      checks.length === 0 ||
      checks.some((value) => value !== true) ||
      margins.length !== 4 ||
      margins.some((value) => !Number.isFinite(value) || value < 32) ||
      !Array.isArray(asset.cornerAlpha) ||
      asset.cornerAlpha.length !== 4 ||
      asset.cornerAlpha.some((value) => value !== 0)
    ) {
      failures.push(`${qaFile} contains a failed transparency, padding, edge, or debris check: ${file}`);
    }

    const imagePath = join(root, file);
    if (!existsSync(imagePath)) return;
    const image = readFileSync(imagePath);
    const width = image.length > 24 ? image.readUInt32BE(16) : 0;
    const height = image.length > 24 ? image.readUInt32BE(20) : 0;
    const sha256 = createHash("sha256").update(image).digest("hex");
    if (asset.width !== width || asset.height !== height || asset.byteLength !== image.length || asset.sha256 !== sha256) {
      failures.push(`${qaFile} is stale or does not match the current PNG bytes: ${file}`);
    }
  });

  expectedFiles.forEach((file) => {
    if (!seenFiles.has(file)) failures.push(`${qaFile} is missing prompt preview QA: ${file}`);
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
  const releaseNotes018 = readText("docs/release/v0.1.8-release-notes.md");
  const releaseNotes017Bugfix = readText("docs/release/v0.1.7bugfix-release-notes.md");
  const releaseNotes017 = readText("docs/release/v0.1.7-release-notes.md");
  const releaseNotes016 = readText("docs/release/v0.1.6-release-notes.md");
  const releaseNotes015 = readText("docs/release/v0.1.5-release-notes.md");
  const releaseNotes014 = readText("docs/release/v0.1.4-release-notes.md");
  const releaseNotes013 = readText("docs/release/v0.1.3-release-notes.md");
  const releaseNotes012 = readText("docs/release/v0.1.2-release-notes.md");
  const releaseNotes011 = readText("docs/release/v0.1.1-release-notes.md");
  const releasePrepQa018 = readText("docs/qa/v0.1.8-release-prep.md");
  const releasePrepQa017 = readText("docs/qa/v0.1.7-release-prep.md");
  const releasePrepQa016 = readText("docs/qa/v0.1.6-release-prep.md");
  const releasePrepQa015 = readText("docs/qa/v0.1.5-release-prep.md");
  const releasePrepQa014 = readText("docs/qa/v0.1.4-release-prep.md");
  const releasePrepQa013 = readText("docs/qa/v0.1.3-release-prep.md");
  const releasePrepQa012 = readText("docs/qa/v0.1.2-release-prep.md");
  const releasePrepQa = readText("docs/qa/v0.1.1-release-prep.md");
  const ownerReview = readText("docs/release/v0.1.0-owner-review.md");
  const finalAudit = readText("docs/release/v0.1.0-final-audit.md");
  const acceptanceEvidence = readText("docs/release/v0.1.0-acceptance-evidence.md");
  const ownerDecision = readText("docs/release/v0.1.0-owner-decision.md");
  const manualHandoff = readText("docs/usage/manual-handoff.md");
  if (!readme || !checklist || !runbook || !releaseNotes || !releaseNotes018 || !releaseNotes017Bugfix || !releaseNotes017 || !releaseNotes016 || !releaseNotes015 || !releaseNotes014 || !releaseNotes013 || !releaseNotes012 || !releaseNotes011 || !releasePrepQa018 || !releasePrepQa017 || !releasePrepQa016 || !releasePrepQa015 || !releasePrepQa014 || !releasePrepQa013 || !releasePrepQa012 || !releasePrepQa || !ownerReview || !finalAudit || !acceptanceEvidence || !ownerDecision || !manualHandoff) return;

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
    "v0.1.8",
    "First Qualified Wins",
    "zero quality warnings",
    "score of at least 3300",
    "identity score of at least 85",
    "`shadowWouldBlock: false`",
    "Restored queued tournaments",
    "semantic duplicates",
    "global three-runner pool",
    "The app still does not call OpenAI APIs directly",
    "No model weights, API keys, tokens",
    "npm run verify",
    "npm run ui:smoke"
  ].forEach((line) => {
    if (!releaseNotes018.includes(line)) {
      failures.push(`v0.1.8 release notes are missing expected content: ${line}`);
    }
  });

  [
    "v0.1.8 Release Prep QA",
    "Source branch: `codex/v0.1.8-first-qualified-wins`",
    "package.json version: `0.1.8`",
    "package-lock.json root version: `0.1.8`",
    "docs/release/v0.1.8-release-notes.md",
    "bugfix commit `4c6fa1e`",
    "score `>= 3300`",
    "identity score `>= 85`",
    "`shadowWouldBlock: false`",
    "first-qualified",
    "Main merge, tag push, and GitHub Release remain blocked",
    "npm run doctor",
    "npm run typecheck",
    "npm test",
    "npm run build",
    "npm run smoke",
    "npm run release:audit",
    "npm run ui:smoke",
    "git diff --check"
  ].forEach((line) => {
    if (!releasePrepQa018.includes(line)) {
      failures.push(`v0.1.8 release prep QA is missing expected content: ${line}`);
    }
  });

  [
    "v0.1.7bugfix",
    "Package, App, and API version: `0.1.7`",
    "Restored tournament auto-start",
    "current UI session",
    "Balanced tournament",
    "synchronous in-flight guard",
    "stable semantic key",
    "process-wide registration lock",
    "one canonical tournament",
    "stale manifest",
    "Motion Pilot fallback",
    "eight concurrent equivalent registrations",
    "Full browser UI smoke"
  ].forEach((line) => {
    if (!releaseNotes017Bugfix.includes(line)) {
      failures.push(`v0.1.7bugfix release notes are missing expected content: ${line}`);
    }
  });

  [
    "v0.1.7",
    "1 direction",
    "front three-quarter",
    "back three-quarter",
    "side remains the default",
    "16f and 20f",
    "Experimental",
    "4x4",
    "4x5",
    "Animation Pack v2",
    "history restoration",
    "Motion Pilot Tournament",
    "Best remains the fresh-session default",
    "58 minutes 24 seconds",
    "The app still does not call OpenAI APIs directly",
    "No model weights, API keys, tokens",
    "npm run verify",
    "npm run ui:smoke"
  ].forEach((line) => {
    if (!releaseNotes017.includes(line)) {
      failures.push(`v0.1.7 release notes are missing expected content: ${line}`);
    }
  });

  [
    "v0.1.7 Release Prep QA",
    "Release approval",
    "Source branch: `codex/selectable-single-animation-direction`",
    "package.json version: `0.1.7`",
    "package-lock.json root version: `0.1.7`",
    "docs/release/v0.1.7-release-notes.md",
    "203 Vitest tests",
    "docs/qa/single-horizontal-direction.md",
    "docs/qa/experimental-16-20-frame-animation.md",
    "docs/qa/selectable-single-animation-direction.md",
    "npm run doctor",
    "npm run typecheck",
    "npm test",
    "npm run build",
    "npm run smoke",
    "npm run release:audit",
    "npm run ui:smoke",
    "git diff --check",
    "Tag push",
    "GitHub Release"
  ].forEach((line) => {
    if (!releasePrepQa017.includes(line)) {
      failures.push(`v0.1.7 release prep QA is missing expected content: ${line}`);
    }
  });

  [
    "v0.1.6",
    "Quality Gate v2",
    "Fast / Balanced / Best",
    "Direction Repair",
    "Batch Matrix",
    "22 recipes",
    "Animation Timeline Review/Edit",
    "Animation Pack v2",
    "Animation Review Cockpit",
    "VFX Composite Stage",
    "Motion Pilot Tournament",
    "default OFF",
    "16px",
    "The app still does not call OpenAI APIs directly",
    "No model weights, API keys, tokens",
    "npm run verify",
    "npm run ui:smoke"
  ].forEach((line) => {
    if (!releaseNotes016.includes(line)) {
      failures.push(`v0.1.6 release notes are missing expected content: ${line}`);
    }
  });

  [
    "v0.1.6 Release Prep QA",
    "Release approval",
    "Source branch: `codex/animation-uplift-sequence`",
    "package.json version: `0.1.6`",
    "package-lock.json root version: `0.1.6`",
    "docs/release/v0.1.6-release-notes.md",
    "184 Vitest tests",
    "codex-handoff/",
    "npm run doctor",
    "npm run typecheck",
    "npm test",
    "npm run build",
    "npm run smoke",
    "npm run release:audit",
    "npm run ui:smoke",
    "git diff --check",
    "Tag push",
    "GitHub Release"
  ].forEach((line) => {
    if (!releasePrepQa016.includes(line)) {
      failures.push(`v0.1.6 release prep QA is missing expected content: ${line}`);
    }
  });

  [
    "v0.1.5",
    "Monster Girl Chibi",
    "モンスター娘ちび",
    "20 generated transparent PNG preview assets",
    "107 prompt example cards",
    "front idle",
    "side idle",
    "side run",
    "side walk",
    "side attack",
    "80 unique generated animation jobs",
    "The app still does not call OpenAI APIs directly",
    "No model weights, API keys, tokens",
    "npm run verify",
    "npm run ui:smoke"
  ].forEach((line) => {
    if (!releaseNotes015.includes(line)) {
      failures.push(`v0.1.5 release notes are missing expected content: ${line}`);
    }
  });

  [
    "v0.1.5 Release Prep QA",
    "Release approval",
    "Source branch: `codex/monster-girl-prompt-animation-batch`",
    "package.json version: `0.1.5`",
    "package-lock.json root version: `0.1.5`",
    "docs/release/v0.1.5-release-notes.md",
    "docs/prompt-examples/monster-girl-prompts.md",
    "20 Monster Girl Chibi prompt examples",
    "107 prompt cards",
    "100 slots",
    "80 unique generated animation jobs",
    "codex-handoff/",
    "npm run doctor",
    "npm run typecheck",
    "npm test",
    "npm run build",
    "npm run smoke",
    "npm run release:audit",
    "npm run ui:smoke",
    "git diff --check",
    "Tag push"
  ].forEach((line) => {
    if (!releasePrepQa015.includes(line)) {
      failures.push(`v0.1.5 release prep QA is missing expected content: ${line}`);
    }
  });

  [
    "v0.1.4",
    "experimental",
    "Effect Animation",
    "Slash Arc",
    "Hit Spark",
    "Magic Cast",
    "Projectile",
    "Impact",
    "transparent sheet",
    "GIF preview",
    "Animated APNG",
    "Effect APNG",
    "compact Effect result cards",
    "Vite watcher",
    "The app still does not call OpenAI APIs directly",
    "No model weights, API keys, tokens",
    "npm run verify",
    "npm run ui:smoke"
  ].forEach((line) => {
    if (!releaseNotes014.includes(line)) {
      failures.push(`v0.1.4 release notes are missing expected content: ${line}`);
    }
  });

  [
    "v0.1.4 Release Prep QA",
    "Experimental tag approval",
    "Target commit before release-prep changes: `a3d2a0c`",
    "package.json version: `0.1.4`",
    "package-lock.json root version: `0.1.4`",
    "docs/release/v0.1.4-release-notes.md",
    "docs/qa/effect-animation-mvp.md",
    "Effect Animation",
    "Animated APNG",
    "compact Effect result cards",
    "npm run doctor",
    "npm run typecheck",
    "npm test",
    "npm run build",
    "npm run smoke",
    "npm run release:audit",
    "npm run ui:smoke",
    "git diff --check",
    "Tag push"
  ].forEach((line) => {
    if (!releasePrepQa014.includes(line)) {
      failures.push(`v0.1.4 release prep QA is missing expected content: ${line}`);
    }
  });

  [
    "v0.1.3",
    "Recursive animation QA",
    "index.html",
    "failed-sprite-sheets.html",
    "animated GIF previews",
    "Idle Breathing",
    "Run Cycle",
    "Walk Cycle",
    "quality gates",
    "source restoration",
    "generated-output rights",
    "The app still does not call OpenAI APIs directly",
    "No model weights, API keys, tokens",
    "npm run verify",
    "npm run ui:smoke"
  ].forEach((line) => {
    if (!releaseNotes013.includes(line)) {
      failures.push(`v0.1.3 release notes are missing expected content: ${line}`);
    }
  });

  [
    "v0.1.3 Release Prep QA",
    "Target commit before release-prep changes: `4ba43b7`",
    "package.json version: `0.1.3`",
    "package-lock.json root version: `0.1.3`",
    "docs/release/v0.1.3-release-notes.md",
    "docs/qa/image-animation-recursive-browser-test-loop/20260630-0150/index.html",
    "failed-sprite-sheets.html",
    "npm run doctor",
    "npm run typecheck",
    "npm test",
    "npm run build",
    "npm run smoke",
    "npm run release:audit",
    "npm run ui:smoke",
    "git diff --check",
    "Tag push / GitHub Release"
  ].forEach((line) => {
    if (!releasePrepQa013.includes(line)) {
      failures.push(`v0.1.3 release prep QA is missing expected content: ${line}`);
    }
  });

  [
    "v0.1.2",
    "Animation delivery reliability",
    "running Codex job progress indicators",
    "first two usable candidates",
    "quality gate",
    "detached direction-split outputs",
    "current-regime animation delivery rollup",
    "browser UI smoke",
    "package.json",
    "package-lock.json",
    "The app still does not call OpenAI APIs directly",
    "No model weights, API keys, tokens",
    "npm run verify",
    "npm run ui:smoke"
  ].forEach((line) => {
    if (!releaseNotes012.includes(line)) {
      failures.push(`v0.1.2 release notes are missing expected content: ${line}`);
    }
  });

  [
    "v0.1.2 Release Prep QA",
    "Target commit before release-prep changes: `91d75e4`",
    "package.json version: `0.1.2`",
    "package-lock.json root version: `0.1.2`",
    "docs/release/v0.1.2-release-notes.md",
    "npm run doctor",
    "npm run typecheck",
    "npm test",
    "npm run build",
    "npm run smoke",
    "npm run release:audit",
    "npm run ui:smoke",
    "git diff --check",
    "Tag push / GitHub Release"
  ].forEach((line) => {
    if (!releasePrepQa012.includes(line)) {
      failures.push(`v0.1.2 release prep QA is missing expected content: ${line}`);
    }
  });

  [
    "v0.1.1",
    "package.json",
    "package-lock.json",
    "/?safe=1",
    "/reset-local-state.html",
    "IndexedDB-backed persistence",
    "Codex generation concurrency to 3 active jobs",
    "Codex log cards",
    "completed Codex job imports",
    "direction-split animation artifact staging",
    "Image Editing source-image fitting",
    "official preset coverage to 16 sample sheets",
    "Cockpit health repair supervisor",
    "bronze-candidate duplicate import prevention",
    "Local Inbox imports now use stable import keys",
    "The app still does not call OpenAI APIs directly",
    "No model weights, API keys, tokens",
    "including the Cockpit health repair supervisor and bronze-candidate duplicate import prevention",
    "npm run verify",
    "npm run ui:smoke"
  ].forEach((line) => {
    if (!releaseNotes011.includes(line)) {
      failures.push(`v0.1.1 release notes are missing expected content: ${line}`);
    }
  });

  [
    "v0.1.1 Release Prep QA",
    "Target commit",
    "027/028",
    "included in this v0.1.1 prep",
    "ca537c4",
    "npm run doctor",
    "npm run typecheck",
    "npm test",
    "npm run build",
    "npm run smoke",
    "npm run release:audit",
    "npm run ui:smoke",
    "git diff --check",
    "/?safe=1",
    "/reset-local-state.html",
    "Tag push / GitHub Release"
  ].forEach((line) => {
    if (!releasePrepQa.includes(line)) {
      failures.push(`v0.1.1 release prep QA is missing expected content: ${line}`);
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
      if (isIgnoredQaBinaryEvidence(file)) return;
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
