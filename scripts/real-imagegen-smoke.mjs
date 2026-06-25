import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const nodeCommand = process.execPath;
const keepArtifacts = process.env.IMAGE_COCKPIT_IMAGEGEN_SMOKE_KEEP === "1";
const timeoutMs = Number(process.env.IMAGE_COCKPIT_IMAGEGEN_SMOKE_TIMEOUT_MS ?? 900000);
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
      "Create one original pixel-art game asset concept image: a tiny clockwork mushroom courier carrying a glowing blue delivery satchel through a rainy neon forest, crisp readable silhouette, 16-bit pixel-art inspired rendering, transparent-game-asset feel, teal rain highlights, warm amber satchel glow, no readable text, no logo, no watermark, no numbers.",
    negativePrompt: "text, logo, watermark, numbers, photorealistic face, blurry silhouette, placeholder geometric-only output",
    jobNotes:
      "Real imagegen smoke. Use imagegen / built-in image_gen if available. Return a PNG with the job id prefix and a short sidecar summary. Do not create a placeholder image.",
    selectedImageName: "",
    selectedImageSize: "",
    selectedImageSource: "",
    selectedImageDataUrl: "",
    annotations: [],
    grid: { columns: 1, rows: 1, gutter: 0 },
    action: "",
    frames: 0
  });

  assert(job.runner?.state === "running", `Real imagegen job should start as running: ${JSON.stringify(job.runner)}`);
  const finalStatus = await waitForTerminalStatus(port, job.id);
  assert(finalStatus.state === "completed", `Real imagegen job did not complete: ${JSON.stringify(finalStatus)}`);
  const imageReturnedBeforeRunnerExit =
    finalStatus.exitCode === null &&
    typeof finalStatus.message === "string" &&
    finalStatus.message.includes("Codex returned an image while runner status was still running");
  assert(
    finalStatus.exitCode === 0 || imageReturnedBeforeRunnerExit,
    `Real imagegen job exit code should be 0 or image-returned-before-exit: ${JSON.stringify(finalStatus)}`
  );

  const list = await getJson(port, "/api/codex/results");
  const result = list.results.find((item) => item.name.startsWith(job.id) && item.mimeType === "image/png");
  assert(result, `Expected a returned PNG with prefix ${job.id}; found ${list.results.map((item) => item.name).join(", ") || "<none>"}`);
  assert(result.size > 20000, `Returned PNG should be larger than a placeholder; size=${result.size}`);

  const imported = await getJson(port, `/api/codex/results/${encodeURIComponent(result.name)}`);
  const pngBytes = Buffer.from(imported.dataUrl.split(",")[1], "base64");
  const dimensions = readPngDimensions(pngBytes);
  assert(dimensions.width >= 256 && dimensions.height >= 256, `Returned PNG should be at least 256x256; got ${dimensions.width}x${dimensions.height}`);

  const jobJson = JSON.parse(await readFile(job.path, "utf8"));
  assert(jobJson.notes.some((note) => note.includes("built-in image generation path")), "Job JSON should include imagegen instructions");
  assert(finalStatus.logPath, "Real imagegen status should include a log path");
  await stat(finalStatus.logPath);

  console.log("Real imagegen smoke passed.");
  console.log(`jobId=${job.id}`);
  console.log(`handoffDir=${handoffDir}`);
  console.log(`image=${result.path}`);
  console.log(`dimensions=${dimensions.width}x${dimensions.height}`);
  console.log(`exitCode=${finalStatus.exitCode ?? "image-returned-before-exit"}`);
  console.log(`logPath=${finalStatus.logPath}`);
} finally {
  await stopServer(server);
  if (!keepArtifacts) await rm(handoffDir, { recursive: true, force: true });
}

async function createHandoffDir() {
  if (process.env.IMAGE_COCKPIT_IMAGEGEN_SMOKE_DIR) {
    const dir = resolve(process.env.IMAGE_COCKPIT_IMAGEGEN_SMOKE_DIR);
    await mkdir(dir, { recursive: true });
    return dir;
  }
  return mkdtemp(join(tmpdir(), "image-cockpit-real-imagegen-smoke-"));
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
    await delay(5000);
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

function readPngDimensions(bytes) {
  assert(bytes.subarray(1, 4).toString("ascii") === "PNG", "Returned image should be PNG data");
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20)
  };
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
