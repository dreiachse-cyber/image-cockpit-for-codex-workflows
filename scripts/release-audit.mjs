import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";

const root = process.cwd();
const failures = [];

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
  "scripts/ui-smoke.mjs",
  "src/App.test.ts",
  "docs/review/mvp-review-report.md",
  "docs/roadmap/release-roadmap.md",
  "docs/release/v0.1.0-checklist.md",
  "docs/release/v0.1.0-runbook.md",
  "docs/release/v0.1.0-release-notes.md",
  "docs/release/v0.1.0-acceptance-evidence.md",
  "docs/release/v0.1.0-owner-decision.md",
  "docs/usage/manual-handoff.md",
  "docs/demo/mvp-demo.gif",
  "docs/qa/simple-image-generate-import-latest-1280x720.png",
  "docs/qa/simple-image-generate-import-latest-mobile-390x844.png",
  "docs/qa/simple-sprite-generate-actions-1280x720.png",
  "docs/qa/manual-handoff-import-latest-1280x720.png",
  "docs/qa/real-codex-runner-smoke.md"
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
const requiredPackageScripts = ["doctor", "typecheck", "test", "build", "smoke", "ui:smoke", "release:audit", "verify"];
const requiredVerifyCommands = [
  "npm run doctor",
  "npm run typecheck",
  "npm test",
  "npm run build",
  "npm run smoke",
  "npm run release:audit"
];
const requiredReadmeLinks = [
  "CHANGELOG.md",
  "docs/release/v0.1.0-release-notes.md",
  "docs/release/v0.1.0-acceptance-evidence.md",
  "docs/release/v0.1.0-owner-decision.md",
  "docs/release/v0.1.0-checklist.md",
  "docs/release/v0.1.0-runbook.md",
  "docs/usage/manual-handoff.md",
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
checkNoDirectOpenAiIntegration();
checkWorkflowIds();
checkPendingJobCoverage();
checkSimpleLocalInboxAction();
checkCoreLocalization();
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
    failures.push("package.json must remain private until owner approval for the public release.");
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
  const smokeText = readText("scripts/smoke.mjs");
  const uiSmokeText = readText("scripts/ui-smoke.mjs");
  if (!appText || !smokeText || !uiSmokeText) return;

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
    "1. Image Generation",
    "2. Image Editing",
    "3. Sprite Sheet Generation",
    "4. Sprite Sheet Editing",
    "Guided Start should show four workflow options",
    "Route: Codex Handoff",
    "Route: Local File",
    "Route: Local Inbox",
    "Transparency Cleanup",
    "Export Sprite"
  ].forEach((marker) => {
    if (!uiSmokeText.includes(marker)) {
      failures.push(`UI smoke should cover guided workflow review: ${marker}`);
    }
  });

  if (!smokeText.includes("/api/codex/results")) {
    failures.push("Smoke test should cover Local Inbox outbox result listing/import.");
  }

  [
    "sprite generation job should include sprite frame count",
    "sprite edit job should include sprite frame count",
    "sprite generation job should not carry edit annotations",
    "sprite edit job should not carry edit annotations",
    "mock autorun preflight should report ready",
    "mock autorun job should start in running state",
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
    "shouldWaitForCodexRunner"
  ].forEach((marker) => {
    if (!appText.includes(marker) && !appTestText.includes(marker)) {
      failures.push(`Pending job coverage is missing marker: ${marker}`);
    }
  });
}

function checkSimpleLocalInboxAction() {
  const appText = readText("src/App.tsx");
  if (!appText) return;

  [
    'providerId !== "local-inbox"',
    'providerId !== "local-file"',
    "importLatestOutboxResult()",
    "{copy.importLatest}"
  ].forEach((marker) => {
    if (!appText.includes(marker)) {
      failures.push(`Simplified UI should expose Local Inbox import action: ${marker}`);
    }
  });
}

function checkCoreLocalization() {
  const appText = readText("src/App.tsx");
  const appTestText = readText("src/App.test.ts");
  if (!appText || !appTestText) return;

  [
    "resolveInitialLanguage",
    "copy.workflowPanelTitle",
    "copy.canvasGridTitle",
    "copy.canvasAnnotationTitle",
    "copy.canvasEmpty",
    "copy.exportSheetPng",
    "copy.exportMetadataJson",
    "formatImagesImportedStatus",
    "formatFramesAddedStatus",
    "キャンバスと注釈",
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
  const acceptanceEvidence = readText("docs/release/v0.1.0-acceptance-evidence.md");
  const ownerDecision = readText("docs/release/v0.1.0-owner-decision.md");
  const manualHandoff = readText("docs/usage/manual-handoff.md");
  if (!readme || !checklist || !runbook || !releaseNotes || !acceptanceEvidence || !ownerDecision || !manualHandoff) return;

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
    "Do not merge `main`, change repository visibility, or create a public release until the owner explicitly approves those actions.",
    "Do Not Ship If",
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
    "npm run ui:smoke",
    "Image generation",
    "Image editing",
    "Sprite sheet generation",
    "Sprite sheet editing",
    "The app itself does not call OpenAI APIs directly",
    "manual handoff",
    "terminal-runnable `%LOCALAPPDATA%\\OpenAI\\Codex\\bin\\...\\codex.exe` CLI",
    "codex exec -c approval_policy",
    "real no-image runner smoke",
    "npm run release:audit"
  ].forEach((line) => {
    if (!releaseNotes.includes(line)) {
      failures.push(`Release notes draft is missing expected content: ${line}`);
    }
  });

  [
    "Image generation",
    "Image editing",
    "Sprite sheet generation",
    "Sprite sheet editing",
    "Local-first boundary",
    "Manual handoff fallback",
    "Runner lifecycle wiring",
    "Codex command diagnostics",
    "Real Codex runner smoke",
    "terminal-runnable Codex CLI",
    "real-codex-runner-smoke.md",
    "manual-handoff-import-latest-1280x720.png",
    "docs/release/v0.1.0-owner-decision.md",
    "Remaining Gates",
    "codex exec",
    "npm run ui:smoke",
    "npm run smoke",
    "npm run verify"
  ].forEach((line) => {
    if (!acceptanceEvidence.includes(line)) {
      failures.push(`Acceptance evidence is missing expected content: ${line}`);
    }
  });
  checkAcceptanceEvidencePaths(acceptanceEvidence);

  [
    "Owner Decisions Still Required",
    "Do Not Proceed Without Approval",
    "Approve merge into `main`",
    "Approve changing repository visibility from private to public",
    "Approve creating the `v0.1.0` tag and GitHub release",
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

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
