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
  "docs/review/mvp-review-report.md",
  "docs/roadmap/release-roadmap.md",
  "docs/release/v0.1.0-checklist.md",
  "docs/release/v0.1.0-runbook.md",
  "docs/release/v0.1.0-release-notes.md",
  "docs/release/v0.1.0-acceptance-evidence.md",
  "docs/usage/manual-handoff.md",
  "docs/demo/mvp-demo.gif",
  "docs/qa/simple-image-generate-import-latest-1280x720.png",
  "docs/qa/simple-image-generate-import-latest-mobile-390x844.png",
  "docs/qa/simple-sprite-generate-actions-1280x720.png"
];

const requiredEnvKeys = [
  "IMAGE_COCKPIT_API_PORT",
  "IMAGE_COCKPIT_HANDOFF_DIR",
  "IMAGE_COCKPIT_CODEX_AUTORUN",
  "IMAGE_COCKPIT_CODEX_COMMAND",
  "IMAGE_COCKPIT_CODEX_SANDBOX",
  "IMAGE_COCKPIT_CODEX_APPROVAL"
];

const requiredWorkflowIds = ["image-generate", "image-edit", "sprite-generate", "sprite-edit"];
const requiredGitignorePatterns = ["node_modules/", "dist/", "coverage/", ".env", ".env.", "!.env.example", "codex-handoff/"];
const requiredPackageScripts = ["doctor", "typecheck", "test", "build", "smoke", "release:audit"];
const requiredReadmeLinks = [
  "CHANGELOG.md",
  "docs/release/v0.1.0-release-notes.md",
  "docs/release/v0.1.0-acceptance-evidence.md",
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
checkSimpleLocalInboxAction();
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
  if (!appText || !smokeText) return;

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

  if (!smokeText.includes("/api/codex/results")) {
    failures.push("Smoke test should cover Local Inbox outbox result listing/import.");
  }

  [
    "sprite generation job should include sprite frame count",
    "sprite edit job should include sprite frame count",
    "sprite generation job should not carry edit annotations",
    "sprite edit job should not carry edit annotations"
  ].forEach((marker) => {
    if (!smokeText.includes(marker)) {
      failures.push(`Smoke test should cover sprite handoff detail: ${marker}`);
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

function checkCiWorkflow() {
  const workflow = readText(".github/workflows/ci.yml");
  if (!workflow) return;

  [
    "actions/checkout@v4",
    "actions/setup-node@v4",
    "npm ci",
    "npm run doctor",
    "npm run typecheck",
    "npm test",
    "npm run build",
    "npm run smoke",
    "npm run release:audit"
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
  const manualHandoff = readText("docs/usage/manual-handoff.md");
  if (!readme || !checklist || !runbook || !releaseNotes || !acceptanceEvidence || !manualHandoff) return;

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
    "Image generation",
    "Image editing",
    "Sprite sheet generation",
    "Sprite sheet editing",
    "The app itself does not call OpenAI APIs directly",
    "manual handoff",
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
    "Remaining Gates",
    "codex exec",
    "npm run smoke"
  ].forEach((line) => {
    if (!acceptanceEvidence.includes(line)) {
      failures.push(`Acceptance evidence is missing expected content: ${line}`);
    }
  });
  checkAcceptanceEvidencePaths(acceptanceEvidence);

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
