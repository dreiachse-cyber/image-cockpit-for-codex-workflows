import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { join, resolve } from "node:path";

const nodeCommand = process.execPath;
const supervisorPort = readPort("IMAGE_COCKPIT_SUPERVISOR_PORT", 8793);
const apiPort = readPort("IMAGE_COCKPIT_API_PORT", 8794);
const vitePort = readPort("IMAGE_COCKPIT_VITE_PORT", 5181);
const apiTarget = `http://127.0.0.1:${apiPort}`;
const handoffRoot = resolve(process.env.IMAGE_COCKPIT_HANDOFF_DIR ?? "codex-handoff");
const statusDir = join(handoffRoot, "status");
const apiScript = resolve("server", "index.ts");
const tsxCli = resolve("node_modules", "tsx", "dist", "cli.mjs");
const viteCli = resolve("node_modules", "vite", "bin", "vite.js");

const children = {
  api: createProcessSlot("api", apiPort),
  vite: createProcessSlot("vite", vitePort)
};

let shuttingDown = false;

startApi();
startVite();

const server = createServer(async (request, response) => {
  setCorsHeaders(request, response);

  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }

  if (!isLocalRequest(request)) {
    sendJson(response, 403, { ok: false, error: "Dev supervisor only accepts loopback requests." });
    return;
  }

  const requestUrl = new URL(request.url ?? "/", `http://${request.headers.host ?? `127.0.0.1:${supervisorPort}`}`);
  const pathname = requestUrl.pathname;

  try {
    if (request.method === "GET" && pathname === "/api/dev/health") {
      sendJson(response, 200, buildHealth());
      return;
    }

    if (request.method === "POST" && pathname === "/api/dev/repair") {
      const result = await repairCockpit();
      sendJson(response, 200, result);
      return;
    }

    if (request.method === "POST" && pathname === "/api/dev/restart-vite") {
      const result = await restartVite();
      sendJson(response, 200, result);
      return;
    }

    if (request.method === "POST" && pathname === "/api/dev/restart-api") {
      const result = await restartApi();
      sendJson(response, result.skipped ? 409 : 200, result);
      return;
    }

    if (request.method === "POST" && pathname === "/api/dev/restart-all") {
      const apiResult = await restartApi();
      const viteResult = await restartVite();
      sendJson(response, apiResult.skipped ? 409 : 200, {
        ok: !apiResult.skipped && viteResult.ok,
        action: "restart-all",
        api: apiResult,
        vite: viteResult,
        health: buildHealth()
      });
      return;
    }

    sendJson(response, 404, { ok: false, error: "Not found" });
  } catch (error) {
    sendJson(response, 500, { ok: false, error: error instanceof Error ? error.message : "Dev supervisor error" });
  }
});

server.listen(supervisorPort, "127.0.0.1", () => {
  console.log("Image Cockpit dev supervisor");
  console.log(`Supervisor: http://127.0.0.1:${supervisorPort}`);
  console.log(`API:        ${apiTarget}`);
  console.log(`Vite:       http://127.0.0.1:${vitePort}`);
  console.log(`API target: ${apiTarget}`);
  console.log(`Handoff:    ${handoffRoot}`);
});

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

async function repairCockpit() {
  const before = buildHealth();
  const actions = [];

  if (!isProcessRunning(children.api)) {
    startApi();
    actions.push("started-api");
  }

  const viteResult = await restartVite();
  actions.push(viteResult.action);

  await waitForHttp(`${apiTarget}/api/health`, "API health", 8000).catch(() => undefined);
  await waitForHttp(`http://127.0.0.1:${vitePort}/`, "Vite", 8000).catch(() => undefined);

  return {
    ok: true,
    action: "repair",
    actions,
    before,
    after: buildHealth()
  };
}

async function restartApi() {
  if (await hasRunningCodexJobs()) {
    return {
      ok: false,
      skipped: true,
      action: "restart-api",
      reason: "Running Codex job status was found; API restart was skipped."
    };
  }

  await stopChild("api");
  startApi();
  await waitForHttp(`${apiTarget}/api/health`, "API health", 8000).catch(() => undefined);
  return { ok: true, action: "restart-api", health: buildHealth() };
}

async function restartVite() {
  await stopChild("vite");
  startVite();
  await waitForHttp(`http://127.0.0.1:${vitePort}/`, "Vite", 8000).catch(() => undefined);
  return { ok: true, action: "restart-vite", health: buildHealth() };
}

function startApi() {
  if (isProcessRunning(children.api)) return;
  const child = spawn(nodeCommand, [tsxCli, apiScript], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      IMAGE_COCKPIT_API_PORT: String(apiPort),
      IMAGE_COCKPIT_HANDOFF_DIR: handoffRoot
    },
    stdio: "inherit",
    windowsHide: true
  });
  attachChild("api", child);
}

function startVite() {
  if (isProcessRunning(children.vite)) return;
  const child = spawn(
    nodeCommand,
    [viteCli, "--host", "127.0.0.1", "--port", String(vitePort), "--strictPort"],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        IMAGE_COCKPIT_API_TARGET: apiTarget,
        VITE_IMAGE_COCKPIT_SUPERVISOR_PORT: String(supervisorPort)
      },
      stdio: "inherit",
      windowsHide: true
    }
  );
  attachChild("vite", child);
}

function attachChild(name, child) {
  const slot = children[name];
  slot.child = child;
  slot.state = "running";
  slot.pid = child.pid ?? null;
  slot.startedAt = new Date().toISOString();
  slot.lastExitCode = null;
  slot.lastSignal = null;
  child.on("exit", (code, signal) => {
    slot.child = null;
    slot.pid = null;
    slot.state = shuttingDown ? "stopped" : "exited";
    slot.lastExitCode = code;
    slot.lastSignal = signal;
  });
  child.on("error", (error) => {
    slot.child = null;
    slot.pid = null;
    slot.state = "exited";
    slot.lastError = error.message;
  });
}

async function stopChild(name) {
  const slot = children[name];
  const child = slot.child;
  if (!child || child.killed || child.exitCode !== null) {
    slot.child = null;
    slot.pid = null;
    slot.state = "stopped";
    return;
  }

  await new Promise((resolve) => {
    const timeout = setTimeout(resolve, 4000);
    child.once("exit", () => {
      clearTimeout(timeout);
      resolve();
    });
    child.kill("SIGTERM");
  });
}

function buildHealth() {
  const mismatches = [];
  if (!isProcessRunning(children.api)) mismatches.push(`API server is ${children.api.state}.`);
  if (!isProcessRunning(children.vite)) mismatches.push(`Vite server is ${children.vite.state}.`);
  if (!existsSync(tsxCli)) mismatches.push("tsx CLI is missing.");
  if (!existsSync(viteCli)) mismatches.push("Vite CLI is missing.");

  return {
    app: "image-cockpit",
    role: "supervisor",
    devOnly: true,
    checkedAt: new Date().toISOString(),
    supervisor: {
      port: supervisorPort,
      pid: process.pid,
      state: "running"
    },
    vite: processHealth(children.vite),
    api: processHealth(children.api),
    apiTarget,
    handoffRoot,
    mismatches
  };
}

function processHealth(slot) {
  return {
    port: slot.port,
    pid: slot.pid,
    state: slot.state,
    lastExitCode: slot.lastExitCode,
    lastSignal: slot.lastSignal
  };
}

function createProcessSlot(name, port) {
  return {
    name,
    port,
    child: null,
    pid: null,
    state: "starting",
    startedAt: "",
    lastExitCode: null,
    lastSignal: null,
    lastError: ""
  };
}

function isProcessRunning(slot) {
  return Boolean(slot.child && slot.pid && slot.state === "running" && slot.child.exitCode === null);
}

async function hasRunningCodexJobs() {
  try {
    const entries = await readdir(statusDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
      try {
        const raw = await readFile(join(statusDir, entry.name), "utf8");
        const parsed = JSON.parse(raw.replace(/^\uFEFF/, ""));
        if (parsed?.state === "running") return true;
      } catch {
        continue;
      }
    }
  } catch {
    return false;
  }
  return false;
}

async function waitForHttp(url, label, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
      lastError = new Error(`${label} returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw lastError instanceof Error ? lastError : new Error(`${label} did not become ready.`);
}

function setCorsHeaders(request, response) {
  const origin = request.headers.origin;
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (typeof origin === "string" && isLocalOrigin(origin)) {
    response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Vary", "Origin");
  } else {
    response.setHeader("Access-Control-Allow-Origin", `http://127.0.0.1:${vitePort}`);
  }
}

function isLocalRequest(request) {
  const remoteAddress = request.socket.remoteAddress ?? "";
  const host = request.headers.host ?? "";
  const origin = request.headers.origin;
  return (
    isLoopbackAddress(remoteAddress) &&
    isLocalHost(host) &&
    (typeof origin !== "string" || isLocalOrigin(origin))
  );
}

function isLoopbackAddress(value) {
  return value === "127.0.0.1" || value === "::1" || value === "::ffff:127.0.0.1";
}

function isLocalHost(value) {
  const host = value.split(":")[0]?.toLowerCase();
  return host === "127.0.0.1" || host === "localhost" || host === "[::1]";
}

function isLocalOrigin(value) {
  try {
    const url = new URL(value);
    return (url.hostname === "127.0.0.1" || url.hostname === "localhost" || url.hostname === "::1") &&
      (url.protocol === "http:" || url.protocol === "https:");
  } catch {
    return false;
  }
}

function sendJson(response, status, payload) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload, null, 2));
}

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  server.close();
  await Promise.all([stopChild("vite"), stopChild("api")]);
  process.exit(signal === "SIGINT" ? 130 : 143);
}

function readPort(envKey, fallback) {
  const parsed = Number(process.env[envKey]);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}
