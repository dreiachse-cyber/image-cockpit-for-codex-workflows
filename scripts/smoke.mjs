import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const nodeCommand = process.execPath;
const port = String(8900 + Math.floor(Math.random() * 500));
const handoffDir = await mkdtemp(join(tmpdir(), "image-cockpit-smoke-"));
const server = spawn(nodeCommand, ["node_modules/tsx/dist/cli.mjs", "server/index.ts"], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    IMAGE_COCKPIT_API_PORT: port,
    IMAGE_COCKPIT_HANDOFF_DIR: handoffDir,
    IMAGE_COCKPIT_CODEX_AUTORUN: "0"
  },
  stdio: ["ignore", "pipe", "pipe"],
  windowsHide: true
});

let serverOutput = "";
server.stdout.on("data", (chunk) => {
  serverOutput += chunk;
});
server.stderr.on("data", (chunk) => {
  serverOutput += chunk;
});

try {
  await waitForServer(port);

  const providers = await getJson(port, "/api/providers");
  assert(Array.isArray(providers.providers), "providers response should include providers");
  assert(providers.providers.some((provider) => provider.id === "codex-handoff"), "codex-handoff provider missing");

  const runnerPreflight = await getJson(port, "/api/codex/runner");
  assert(runnerPreflight.runner?.state === "disabled", "autorun-off preflight should report disabled runner state");
  assert(runnerPreflight.runner?.autorun === false, "autorun-off preflight should include autorun=false");

  const tinyPng =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";
  const job = await postJson(port, "/api/codex/jobs", {
    workflowMode: "image-edit",
    prompt: "Smoke test edit",
    negativePrompt: "text",
    jobNotes: "Preserve silhouette and check annotations.",
    selectedImageName: "tiny.png",
    selectedImageSize: "1x1",
    selectedImageSource: "import",
    selectedImageDataUrl: tinyPng,
    annotations: [{ id: "ann-1", tool: "rect", color: "#ff0000", points: [{ x: 1, y: 2 }, { x: 3, y: 4 }] }],
    grid: { columns: 8, rows: 4, gutter: 0 },
    action: "idle",
    frames: 8
  });

  assert(job.runner?.state === "disabled", "autorun-off job should record disabled runner state");
  const jobJson = JSON.parse(await readFile(job.path, "utf8"));
  assert(jobJson.workflowMode === "image-edit", "job should include workflowMode");
  assert(jobJson.jobNotes.includes("Preserve silhouette"), "job should include edit notes");
  assert(jobJson.annotationContext.annotationCount === 1, "job should include annotation count");
  assert(jobJson.selectedImage.assetPath, "job should include selected image asset path");
  await stat(jobJson.selectedImage.assetPath);

  const status = await getJson(port, `/api/codex/jobs/${encodeURIComponent(job.id)}/status`);
  assert(status.status.state === "disabled", "status endpoint should return disabled runner state");

  console.log(`Smoke passed on port ${port}`);
} finally {
  server.kill("SIGTERM");
  await rm(handoffDir, { recursive: true, force: true });
}

async function waitForServer(apiPort) {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    try {
      await getJson(apiPort, "/api/providers");
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
  throw new Error(`API server did not become ready.\n${serverOutput}`);
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

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
