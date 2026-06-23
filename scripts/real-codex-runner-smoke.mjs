import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readdir, readFile, rm, stat } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const nodeCommand = process.execPath;
const keepArtifacts = process.env.IMAGE_COCKPIT_REAL_CODEX_SMOKE_KEEP === "1";
const timeoutMs = Number(process.env.IMAGE_COCKPIT_REAL_CODEX_SMOKE_TIMEOUT_MS ?? 180000);
const handoffDir = await createHandoffDir();
const port = await getOpenPort();
const server = startServer({ port, handoffDir });

try {
  await waitForServer(server, port);

  const runnerPreflight = await getJson(port, "/api/codex/runner");
  assert(runnerPreflight.runner?.state === "ready", `Codex runner preflight was not ready: ${JSON.stringify(runnerPreflight.runner)}`);

  const job = await postJson(port, "/api/codex/jobs", {
    workflowMode: "image-generate",
    prompt:
      "Runner smoke verification only. Do not generate or fetch an image. Read this handoff job, then write a small Markdown sidecar file into the configured outbox. Name it with the provided job id and suffix -runner-smoke.md. The file should contain the job id and the phrase runner smoke ok.",
    negativePrompt: "",
    jobNotes: "This is a no-image runner smoke test. Produce only the Markdown sidecar in outbox.",
    selectedImageName: "",
    selectedImageSize: "",
    selectedImageSource: "",
    selectedImageDataUrl: "",
    annotations: [],
    grid: { columns: 1, rows: 1, gutter: 0 },
    action: "",
    frames: 0
  });

  assert(job.runner?.state === "running", `Real Codex runner should start as running: ${JSON.stringify(job.runner)}`);
  const finalStatus = await waitForTerminalStatus(port, job.id);
  assert(finalStatus.state === "completed", `Real Codex runner did not complete: ${JSON.stringify(finalStatus)}`);
  assert(finalStatus.exitCode === 0, `Real Codex runner exit code should be 0: ${JSON.stringify(finalStatus)}`);

  const outboxDir = join(handoffDir, "outbox");
  const outboxFiles = existsSync(outboxDir) ? await readdir(outboxDir) : [];
  const sidecarName = `${job.id}-runner-smoke.md`;
  assert(outboxFiles.includes(sidecarName), `Expected outbox sidecar ${sidecarName}; found ${outboxFiles.join(", ") || "<none>"}`);

  const sidecarPath = join(outboxDir, sidecarName);
  const sidecarText = await readFile(sidecarPath, "utf8");
  assert(sidecarText.includes(job.id), "Runner smoke sidecar should contain the job id");
  assert(sidecarText.includes("runner smoke ok"), "Runner smoke sidecar should contain the success phrase");
  assert(finalStatus.logPath, "Real Codex runner status should include a log path");
  await stat(finalStatus.logPath);

  console.log("Real Codex runner smoke passed.");
  console.log(`jobId=${job.id}`);
  console.log(`handoffDir=${handoffDir}`);
  console.log(`logPath=${finalStatus.logPath}`);
  console.log(`outboxSidecar=${sidecarPath}`);
} finally {
  await stopServer(server);
  if (!keepArtifacts) await rm(handoffDir, { recursive: true, force: true });
}

async function createHandoffDir() {
  if (process.env.IMAGE_COCKPIT_REAL_CODEX_SMOKE_DIR) {
    const dir = resolve(process.env.IMAGE_COCKPIT_REAL_CODEX_SMOKE_DIR);
    await mkdir(dir, { recursive: true });
    return dir;
  }
  return mkdtemp(join(tmpdir(), "image-cockpit-real-codex-smoke-"));
}

function startServer({ port, handoffDir }) {
  const child = spawn(nodeCommand, ["node_modules/tsx/dist/cli.mjs", "server/index.ts"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      IMAGE_COCKPIT_API_PORT: String(port),
      IMAGE_COCKPIT_HANDOFF_DIR: handoffDir,
      IMAGE_COCKPIT_CODEX_AUTORUN: "1"
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });
  child.output = "";
  child.stdout.on("data", (chunk) => {
    child.output += chunk.toString("utf8");
  });
  child.stderr.on("data", (chunk) => {
    child.output += chunk.toString("utf8");
  });
  return child;
}

async function waitForServer(child, apiPort) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    try {
      await getJson(apiPort, "/api/providers");
      return;
    } catch {
      await delay(200);
    }
  }
  throw new Error(`API server did not become ready.\n${child.output}`);
}

async function waitForTerminalStatus(apiPort, jobId) {
  const deadline = Date.now() + timeoutMs;
  let lastStatus;
  while (Date.now() < deadline) {
    const response = await getJson(apiPort, `/api/codex/jobs/${encodeURIComponent(jobId)}/status`);
    lastStatus = response.status;
    if (["completed", "failed", "unavailable", "disabled", "unknown"].includes(lastStatus?.state)) return lastStatus;
    await delay(1500);
  }
  throw new Error(`Job ${jobId} did not finish in ${timeoutMs}ms. Last status: ${JSON.stringify(lastStatus)}`);
}

async function getJson(apiPort, path) {
  const response = await fetch(`http://127.0.0.1:${apiPort}${path}`);
  if (!response.ok) throw new Error(`${path} failed: ${response.status} ${await response.text()}`);
  return response.json();
}

async function postJson(apiPort, path, body) {
  const response = await fetch(`http://127.0.0.1:${apiPort}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!response.ok) throw new Error(`${path} failed: ${response.status} ${await response.text()}`);
  return response.json();
}

async function stopServer(child) {
  if (!child || child.exitCode !== null || child.killed) return;
  child.kill("SIGTERM");
  await Promise.race([
    new Promise((resolveStop) => child.once("close", resolveStop)),
    delay(1500)
  ]);
}

function getOpenPort() {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => {
        if (address && typeof address === "object") {
          resolvePort(address.port);
          return;
        }
        reject(new Error("Could not allocate an open port"));
      });
    });
    server.on("error", reject);
  });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function delay(ms) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}
