import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const nodeCommand = process.execPath;
const tinyPng =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";
const tinyPngBytes = Buffer.from(tinyPng.split(",")[1], "base64");

await runManualHandoffSmoke();
await runMockAutorunSmoke();

console.log("Smoke passed.");

async function runManualHandoffSmoke() {
  const port = String(8900 + Math.floor(Math.random() * 400));
  const handoffDir = await mkdtemp(join(tmpdir(), "image-cockpit-smoke-manual-"));
  const server = startServer({
    port,
    handoffDir,
    env: {
      IMAGE_COCKPIT_CODEX_AUTORUN: "0"
    }
  });

  try {
    await waitForServer(server, port);

    const providers = await getJson(port, "/api/providers");
    assert(Array.isArray(providers.providers), "providers response should include providers");
    assert(providers.providers.some((provider) => provider.id === "codex-handoff"), "codex-handoff provider missing");

    const runnerPreflight = await getJson(port, "/api/codex/runner");
    assert(runnerPreflight.runner?.state === "disabled", "autorun-off preflight should report disabled runner state");
    assert(runnerPreflight.runner?.autorun === false, "autorun-off preflight should include autorun=false");

    await writeFile(join(handoffDir, "outbox", "manual-return.png"), tinyPngBytes);
    await writeFile(join(handoffDir, "outbox", "manual-notes.txt"), "not an image", "utf8");

    const outboxList = await getJson(port, "/api/codex/results");
    assert(outboxList.results.some((result) => result.name === "manual-return.png"), "outbox image should be listed");
    assert(!outboxList.results.some((result) => result.name === "manual-notes.txt"), "non-image outbox file should be ignored");
    const importedOutbox = await getJson(port, "/api/codex/results/manual-return.png");
    assert(importedOutbox.mimeType === "image/png", "outbox import should preserve image MIME type");
    assert(importedOutbox.dataUrl === tinyPng, "outbox import should return a data URL");

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

    const generateJob = await postJson(port, "/api/codex/jobs", {
      workflowMode: "image-generate",
      prompt: "Smoke test generation",
      negativePrompt: "text",
      jobNotes: "Transparent background and centered subject.",
      selectedImageName: "tiny.png",
      selectedImageSize: "1x1",
      selectedImageSource: "sample",
      selectedImageDataUrl: tinyPng,
      annotations: [{ id: "ann-ignored", tool: "rect", color: "#ff0000", points: [{ x: 0, y: 0 }] }],
      grid: { columns: 8, rows: 4, gutter: 0 },
      action: "idle",
      frames: 8
    });
    const generateJobJson = JSON.parse(await readFile(generateJob.path, "utf8"));
    assert(generateJobJson.workflowMode === "image-generate", "generation job should include workflowMode");
    assert(generateJobJson.intent.includes("generate a new image"), "generation job should include generation intent");
    assert(!generateJobJson.selectedImage.assetPath, "generation job should not attach the current selected image");
    assert(generateJobJson.annotationContext.annotationCount === 0, "generation job should not carry edit annotations");
    assert(generateJobJson.spriteContext.frames === 0, "generation job should not carry sprite context");

    const spriteGenerateJob = await postJson(port, "/api/codex/jobs", {
      workflowMode: "sprite-generate",
      prompt: "Smoke test sprite sheet generation",
      negativePrompt: "text",
      jobNotes: "Create a 4x2 idle sheet with transparent background.",
      selectedImageName: "tiny.png",
      selectedImageSize: "1x1",
      selectedImageSource: "sample",
      selectedImageDataUrl: tinyPng,
      annotations: [{ id: "ann-sprite-ignored", tool: "rect", color: "#00ff00", points: [{ x: 0, y: 0 }] }],
      grid: { columns: 4, rows: 2, gutter: 1 },
      action: "idle",
      frames: 8
    });
    const spriteGenerateJobJson = JSON.parse(await readFile(spriteGenerateJob.path, "utf8"));
    assert(spriteGenerateJobJson.workflowMode === "sprite-generate", "sprite generation job should include workflowMode");
    assert(spriteGenerateJobJson.intent.includes("create a sprite sheet asset"), "sprite generation job should include sprite intent");
    assert(spriteGenerateJobJson.spriteContext.frames === 8, "sprite generation job should include sprite frame count");
    assert(spriteGenerateJobJson.spriteContext.grid.columns === 4, "sprite generation job should include sprite grid columns");
    assert(spriteGenerateJobJson.spriteContext.action === "idle", "sprite generation job should include action");
    assert(!spriteGenerateJobJson.selectedImage.assetPath, "sprite generation job should not attach the current selected image");
    assert(spriteGenerateJobJson.annotationContext.annotationCount === 0, "sprite generation job should not carry edit annotations");

    const spriteEditJob = await postJson(port, "/api/codex/jobs", {
      workflowMode: "sprite-edit",
      prompt: "Smoke test sprite sheet editing",
      negativePrompt: "text",
      jobNotes: "Normalize anchors and clean magenta key color.",
      selectedImageName: "tiny.png",
      selectedImageSize: "1x1",
      selectedImageSource: "sample",
      selectedImageDataUrl: tinyPng,
      annotations: [{ id: "ann-sprite-edit-ignored", tool: "rect", color: "#0000ff", points: [{ x: 0, y: 0 }] }],
      grid: { columns: 8, rows: 4, gutter: 0 },
      action: "walk",
      frames: 32
    });
    const spriteEditJobJson = JSON.parse(await readFile(spriteEditJob.path, "utf8"));
    assert(spriteEditJobJson.workflowMode === "sprite-edit", "sprite edit job should include workflowMode");
    assert(spriteEditJobJson.intent.includes("revise sprite-sheet frames"), "sprite edit job should include sprite edit intent");
    assert(spriteEditJobJson.spriteContext.frames === 32, "sprite edit job should include sprite frame count");
    assert(spriteEditJobJson.spriteContext.grid.rows === 4, "sprite edit job should include sprite grid rows");
    assert(spriteEditJobJson.spriteContext.action === "walk", "sprite edit job should include action");
    assert(!spriteEditJobJson.selectedImage.assetPath, "sprite edit job should not attach the current selected image");
    assert(spriteEditJobJson.annotationContext.annotationCount === 0, "sprite edit job should not carry edit annotations");

    const status = await getJson(port, `/api/codex/jobs/${encodeURIComponent(job.id)}/status`);
    assert(status.status.state === "disabled", "status endpoint should return disabled runner state");
  } finally {
    await stopServer(server);
    await rm(handoffDir, { recursive: true, force: true });
  }
}

async function runMockAutorunSmoke() {
  const port = String(9300 + Math.floor(Math.random() * 400));
  const handoffDir = await mkdtemp(join(tmpdir(), "image-cockpit-smoke-autorun-"));
  const mockRunnerPath = join(handoffDir, "mock-codex-runner.mjs");
  await writeFile(mockRunnerPath, mockRunnerSource(), "utf8");

  const server = startServer({
    port,
    handoffDir,
    env: {
      IMAGE_COCKPIT_CODEX_AUTORUN: "1",
      IMAGE_COCKPIT_CODEX_COMMAND: nodeCommand,
      IMAGE_COCKPIT_CODEX_HELP_ARGS_JSON: JSON.stringify([mockRunnerPath, "--help"]),
      IMAGE_COCKPIT_CODEX_EXEC_ARGS_JSON: JSON.stringify([
        mockRunnerPath,
        "exec",
        "--sandbox",
        "workspace-write",
        "--ask-for-approval",
        "never",
        "-"
      ])
    }
  });

  try {
    await waitForServer(server, port);

    const runnerPreflight = await getJson(port, "/api/codex/runner");
    assert(runnerPreflight.runner?.state === "ready", "mock autorun preflight should report ready");
    assert(runnerPreflight.runner?.autorun === true, "mock autorun preflight should include autorun=true");

    const job = await postJson(port, "/api/codex/jobs", {
      workflowMode: "image-generate",
      prompt: "Smoke test mock autorun generation",
      negativePrompt: "text",
      jobNotes: "Return a tiny PNG for smoke verification.",
      selectedImageName: "",
      selectedImageSize: "",
      selectedImageSource: "",
      selectedImageDataUrl: "",
      annotations: [],
      grid: { columns: 1, rows: 1, gutter: 0 },
      action: "",
      frames: 0
    });

    assert(job.runner?.state === "running", "mock autorun job should start in running state");

    const completedStatus = await waitForJobState(port, job.id, "completed");
    assert(completedStatus.status.logPath, "completed mock autorun status should include log path");
    await stat(completedStatus.status.logPath);

    const outboxList = await getJson(port, "/api/codex/results");
    const resultName = `${job.id}-mock.png`;
    assert(outboxList.results.some((result) => result.name === resultName), "mock autorun result image should be listed");
    const importedResult = await getJson(port, `/api/codex/results/${encodeURIComponent(resultName)}`);
    assert(importedResult.dataUrl === tinyPng, "mock autorun result should import as expected PNG data URL");
  } finally {
    await stopServer(server);
    await rm(handoffDir, { recursive: true, force: true });
  }
}

function startServer({ port, handoffDir, env }) {
  const server = spawn(nodeCommand, ["node_modules/tsx/dist/cli.mjs", "server/index.ts"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      ...env,
      IMAGE_COCKPIT_API_PORT: port,
      IMAGE_COCKPIT_HANDOFF_DIR: handoffDir
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });

  server.output = "";
  server.stdout.on("data", (chunk) => {
    server.output += chunk;
  });
  server.stderr.on("data", (chunk) => {
    server.output += chunk;
  });
  return server;
}

async function stopServer(server) {
  if (server.exitCode !== null || server.killed) return;
  server.kill("SIGTERM");
  await new Promise((resolve) => {
    const timeout = setTimeout(resolve, 1000);
    server.once("close", () => {
      clearTimeout(timeout);
      resolve();
    });
  });
}

async function waitForServer(server, apiPort) {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    try {
      await getJson(apiPort, "/api/providers");
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
  throw new Error(`API server did not become ready.\n${server.output}`);
}

async function waitForJobState(apiPort, jobId, expectedState) {
  const deadline = Date.now() + 8000;
  let lastStatus;
  while (Date.now() < deadline) {
    lastStatus = await getJson(apiPort, `/api/codex/jobs/${encodeURIComponent(jobId)}/status`);
    if (lastStatus.status?.state === expectedState) return lastStatus;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`Job ${jobId} did not reach ${expectedState}. Last status: ${JSON.stringify(lastStatus)}`);
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

function mockRunnerSource() {
  return `import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const tinyPng = "${tinyPng}";

if (process.argv.includes("--help")) {
  console.log("mock codex runner");
  process.exit(0);
}

let stdin = "";
process.stdin.setEncoding("utf8");
for await (const chunk of process.stdin) {
  stdin += chunk;
}

if (!stdin.includes("Image Cockpit for Codex Workflows")) {
  console.error("missing Image Cockpit prompt");
  process.exit(2);
}

const jobId = process.env.IMAGE_COCKPIT_JOB_ID;
const jobPath = process.env.IMAGE_COCKPIT_JOB_PATH;
const outboxDir = process.env.IMAGE_COCKPIT_OUTBOX_DIR;
if (!jobId || !jobPath || !outboxDir) {
  console.error("missing Image Cockpit runner environment");
  process.exit(3);
}

const job = JSON.parse(await readFile(jobPath, "utf8"));
if (job.id !== jobId) {
  console.error("job id mismatch");
  process.exit(4);
}

await writeFile(join(outboxDir, \`\${jobId}-mock.png\`), Buffer.from(tinyPng.split(",")[1], "base64"));
console.log(\`mock completed \${jobId}\`);
`;
}
