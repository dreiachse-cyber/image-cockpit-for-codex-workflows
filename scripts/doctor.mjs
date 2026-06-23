import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

loadDotEnv(resolve(".env"));

const requiredFiles = [
  "README.md",
  "package.json",
  "package-lock.json",
  ".env.example",
  "server/index.ts",
  "src/App.tsx",
  "scripts/smoke.mjs",
  "scripts/release-audit.mjs",
  "docs/release/v0.1.0-runbook.md",
  "docs/release/v0.1.0-checklist.md"
];
const handoffRoot = resolve(process.env.IMAGE_COCKPIT_HANDOFF_DIR ?? "codex-handoff");
const handoffDirs = ["inbox", "outbox", "assets", "status", "logs"];
const codexAutoRun = process.env.IMAGE_COCKPIT_CODEX_AUTORUN !== "0";
const codexCommand = process.env.IMAGE_COCKPIT_CODEX_COMMAND ?? "codex";
const codexSandbox = process.env.IMAGE_COCKPIT_CODEX_SANDBOX ?? "workspace-write";
const codexApproval = process.env.IMAGE_COCKPIT_CODEX_APPROVAL ?? "never";
const codexHelpArgs = parseJsonStringArray("IMAGE_COCKPIT_CODEX_HELP_ARGS_JSON", ["--help"]);
const runnerTimeoutMs = 4000;

const hardFailures = [];
const warnings = [];
const notes = [];

console.log("Image Cockpit local doctor");
console.log("");

checkRequiredFiles();
checkNodeVersion();
await checkHandoffDirs();
await checkCodexCommand();

printSummary();

if (hardFailures.length > 0) {
  process.exit(1);
}

function checkRequiredFiles() {
  section("Project files");
  requiredFiles.forEach((file) => {
    if (existsSync(resolve(file))) {
      ok(`${file} exists`);
      return;
    }
    fail(`${file} is missing`);
  });
}

function checkNodeVersion() {
  section("Node runtime");
  const major = Number(process.versions.node.split(".")[0]);
  if (major >= 20) {
    ok(`Node ${process.versions.node}`);
    return;
  }
  fail(`Node ${process.versions.node} is too old. Use Node 20 or newer.`);
}

async function checkHandoffDirs() {
  section("Local handoff folders");
  for (const dir of handoffDirs) {
    const path = join(handoffRoot, dir);
    await mkdir(path, { recursive: true });
    ok(`${path}`);
  }

  const testPath = join(handoffRoot, `.doctor-write-test-${process.pid}`);
  try {
    await writeFile(testPath, "ok", "utf8");
    await rm(testPath, { force: true });
    ok(`${handoffRoot} is writable`);
  } catch (error) {
    fail(`${handoffRoot} is not writable: ${messageOf(error)}`);
  }
}

async function checkCodexCommand() {
  section("Codex runner");
  note(`autorun=${codexAutoRun}`);
  note(`command=${codexCommand}`);
  note(`sandbox=${codexSandbox}`);
  note(`approval=${codexApproval}`);

  if (!codexAutoRun) {
    ok("Codex autorun is disabled; manual handoff mode is active.");
    return;
  }

  const result = await tryRun(codexCommand, codexHelpArgs, runnerTimeoutMs);
  if (result.ok) {
    ok(`${codexCommand} ${codexHelpArgs.join(" ")} completed`);
    return;
  }

  warn(`${codexCommand} is not executable from this environment: ${result.message}`);
  if (result.code) warn(`runner error code: ${result.code}`);
  note("Jobs can still be written to codex-handoff/inbox and completed through manual handoff.");
  note("Set IMAGE_COCKPIT_CODEX_AUTORUN=0 to make manual handoff explicit.");
  note("Set IMAGE_COCKPIT_CODEX_COMMAND to a runnable Codex executable path when autorun is available.");
}

function tryRun(command, args, timeoutMs) {
  return new Promise((resolveResult) => {
    let child;
    let settled = false;
    let stderrText = "";

    const finish = (result) => {
      if (settled) return;
      settled = true;
      resolveResult(result);
    };

    const timeoutId = setTimeout(() => {
      if (child && !child.killed) child.kill();
      finish({ ok: false, message: `timed out after ${timeoutMs}ms`, code: "TIMEOUT" });
    }, timeoutMs);

    try {
      child = spawn(command, args, {
        cwd: process.cwd(),
        stdio: ["ignore", "ignore", "pipe"],
        windowsHide: true
      });

      child.stderr?.on("data", (chunk) => {
        stderrText = `${stderrText}${chunk.toString("utf8")}`.slice(0, 1200);
      });

      child.on("error", (error) => {
        clearTimeout(timeoutId);
        finish({ ok: false, message: error.message, code: error.code });
      });

      child.on("close", (exitCode) => {
        clearTimeout(timeoutId);
        if (exitCode === 0) {
          finish({ ok: true, message: "ok" });
          return;
        }
        finish({
          ok: false,
          message: stderrText.trim() || `${command} exited with code ${exitCode}`,
          code: exitCode === null ? undefined : String(exitCode)
        });
      });
    } catch (error) {
      clearTimeout(timeoutId);
      finish({
        ok: false,
        message: messageOf(error),
        code: error && typeof error === "object" && "code" in error ? String(error.code) : undefined
      });
    }
  });
}

function section(title) {
  console.log("");
  console.log(title);
}

function ok(message) {
  console.log(`[ok] ${message}`);
}

function warn(message) {
  warnings.push(message);
  console.log(`[warn] ${message}`);
}

function fail(message) {
  hardFailures.push(message);
  console.log(`[fail] ${message}`);
}

function note(message) {
  notes.push(message);
  console.log(`[note] ${message}`);
}

function printSummary() {
  section("Summary");
  if (hardFailures.length === 0) ok("No hard setup failures found.");
  if (warnings.length > 0) console.log(`[warn] ${warnings.length} warning(s).`);
  if (notes.length > 0) console.log(`[note] ${notes.length} note(s).`);
}

function messageOf(error) {
  return error instanceof Error ? error.message : String(error);
}

function loadDotEnv(path) {
  if (!existsSync(path)) return;
  const lines = readFileSync(path, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex <= 0) continue;
    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    if (process.env[key] !== undefined) continue;
    process.env[key] = rawValue.replace(/^["']|["']$/g, "");
  }
}

function parseJsonStringArray(envKey, fallback) {
  const rawValue = process.env[envKey];
  if (!rawValue) return fallback;
  try {
    const parsed = JSON.parse(rawValue);
    if (Array.isArray(parsed) && parsed.every((item) => typeof item === "string")) {
      return parsed;
    }
  } catch {
    // Invalid optional wrapper args fall back to Codex CLI defaults.
  }
  return fallback;
}
