import { spawn } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { delimiter, extname, join, resolve } from "node:path";

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
const codexCommandCandidates = resolveCommandCandidates(codexCommand);
const codexLaunchCommand = selectCodexLaunchCommand(codexCommand, codexCommandCandidates);
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
  note(`launchCommand=${codexLaunchCommand}`);
  if (codexCommandCandidates.length > 0) {
    note(`resolved command path=${codexCommandCandidates[0]}`);
  } else {
    note("resolved command path=<not found on PATH>");
  }
  note(`sandbox=${codexSandbox}`);
  note(`approval=${codexApproval}`);

  if (!codexAutoRun) {
    ok("Codex autorun is disabled; manual handoff mode is active.");
    return;
  }

  const result = await tryRun(codexLaunchCommand, codexHelpArgs, runnerTimeoutMs);
  if (result.ok) {
    ok(`${codexLaunchCommand} ${codexHelpArgs.join(" ")} completed`);
    return;
  }

  warn(`${codexLaunchCommand} is not executable from this environment: ${result.message}`);
  if (result.code) warn(`runner error code: ${result.code}`);
  if ((result.code === "EPERM" || result.code === "EACCES") && isWindowsAppsLaunchLikely()) {
    note("The resolved Codex command is the WindowsApps Codex Desktop executable, which this environment cannot launch as a subprocess.");
    note("Use manual handoff, or set IMAGE_COCKPIT_CODEX_COMMAND to a terminal-runnable Codex CLI or wrapper when one is available.");
  }
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

function resolveCommandCandidates(command) {
  const hasPathSeparator = command.includes("/") || command.includes("\\");
  const commandNames = commandHasExtension(command) ? [command] : commandExtensions().map((extension) => `${command}${extension}`);
  const dirs = hasPathSeparator ? [""] : (process.env.PATH ?? "").split(delimiter).filter(Boolean);
  const candidates = [];

  dirs.forEach((dir) => {
    commandNames.forEach((name) => {
      const candidate = hasPathSeparator ? resolve(name) : join(dir, name);
      if (existsSync(candidate)) candidates.push(candidate);
    });
  });

  return Array.from(new Set([...candidates, ...knownCodexCliCandidates(command)]));
}

function selectCodexLaunchCommand(command, candidates) {
  if (command.includes("/") || command.includes("\\") || !isCodexCommandName(command)) return command;
  return candidates.find(isLocalOpenAiCodexCliCommand) ?? candidates.find((candidate) => !isWindowsAppsCodexCommand(candidate)) ?? command;
}

function knownCodexCliCandidates(command) {
  if (!isCodexCommandName(command)) return [];
  const roots = [process.env.LOCALAPPDATA, process.env.USERPROFILE ? join(process.env.USERPROFILE, "AppData", "Local") : ""]
    .filter(Boolean)
    .map((root) => join(root, "OpenAI", "Codex", "bin"));
  const candidates = [];

  roots.forEach((root) => {
    if (!existsSync(root)) return;
    try {
      readdirSync(root, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .forEach((entry) => {
          ["codex.exe", "codex"].forEach((file) => {
            const candidate = join(root, entry.name, file);
            if (existsSync(candidate)) candidates.push(candidate);
          });
        });
    } catch {
      // Ignore discovery failures; explicit IMAGE_COCKPIT_CODEX_COMMAND remains available.
    }
  });

  return candidates;
}

function commandExtensions() {
  if (process.platform !== "win32") return [""];
  const pathExt = process.env.PATHEXT?.split(";").filter(Boolean) ?? [".COM", ".EXE", ".BAT", ".CMD"];
  return ["", ...pathExt.map((extension) => extension.toLowerCase())];
}

function commandHasExtension(command) {
  return Boolean(extname(command));
}

function isCodexCommandName(command) {
  return /^codex(?:\.exe)?$/i.test(command);
}

function isLocalOpenAiCodexCliCommand(candidate) {
  return /[\\/]AppData[\\/]Local[\\/]OpenAI[\\/]Codex[\\/]bin[\\/][^\\/]+[\\/]codex(?:\.exe)?$/i.test(candidate);
}

function isWindowsAppsCodexCommand(candidate) {
  return /[\\/]WindowsApps[\\/]OpenAI\.Codex_/i.test(candidate) && /[\\/]codex(?:\.exe)?$/i.test(candidate);
}

function hasWindowsAppsCodexCandidate() {
  return codexCommandCandidates.some(isWindowsAppsCodexCommand);
}

function isWindowsAppsLaunchLikely() {
  const explicitLaunchCommandIsWindowsApps = isWindowsAppsCodexCommand(codexLaunchCommand);
  const bareCommandWouldResolveThroughWindowsApps =
    isCodexCommandName(codexLaunchCommand) && hasWindowsAppsCodexCandidate() && !codexCommandCandidates.some(isLocalOpenAiCodexCliCommand);
  return explicitLaunchCommandIsWindowsApps || bareCommandWouldResolveThroughWindowsApps;
}
