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
    assert(providers.providers.some((provider) => provider.id === "local-generator"), "local-generator provider missing");
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

    const localImages = await postJson(port, "/api/generate", {
      workflowMode: "image-generate",
      prompt: "Smoke test forest mage local image",
      negativePrompt: "text",
      jobNotes: "transparent background and centered subject",
      seed: "smoke-image",
      size: "512x512",
      count: 2
    });
    assert(localImages.results.length === 2, "local image generation should return requested image count");
    const firstLocalImage = localImages.results[0];
    assert(firstLocalImage.mimeType === "image/png", "local image generation should return PNG");
    assertPngDimensions(firstLocalImage.dataUrl, 512, 512, "local generated image dimensions");
    await stat(firstLocalImage.path);

    const localSpriteSheet = await postJson(port, "/api/generate", {
      workflowMode: "sprite-generate",
      prompt: "Smoke test local sprite sheet",
      negativePrompt: "text",
      jobNotes: "4x2 idle sheet",
      seed: "smoke-sprite",
      grid: { columns: 4, rows: 2, gutter: 0 },
      cell: { width: 64, height: 48 },
      action: "idle",
      frames: 8
    });
    assert(localSpriteSheet.results.length === 1, "local sprite generation should return one sheet");
    assert(localSpriteSheet.results[0].mimeType === "image/png", "local sprite generation should return PNG");
    assertPngDimensions(localSpriteSheet.results[0].dataUrl, 256, 96, "local generated sprite sheet dimensions");
    await stat(localSpriteSheet.results[0].path);

    const job = await postJson(port, "/api/codex/jobs", {
      workflowMode: "image-edit",
      prompt: "Smoke test edit",
      negativePrompt: "text",
      jobNotes: "Preserve silhouette and check annotations.",
      selectedImageName: "tiny.png",
      selectedImageSize: "1x1",
      selectedImageSource: "import",
      selectedImageDataUrl: tinyPng,
      annotations: [{ id: "ann-1", tool: "rect", color: "#ff0000", number: 1, comment: "Add the text X here", points: [{ x: 1, y: 2 }, { x: 3, y: 4 }] }],
      grid: { columns: 8, rows: 4, gutter: 0 },
      action: "idle",
      frames: 8
    });

    assert(job.runner?.state === "disabled", "autorun-off job should record disabled runner state");
    const jobJson = JSON.parse(await readFile(job.path, "utf8"));
    assert(jobJson.workflowMode === "image-edit", "job should include workflowMode");
    assert(jobJson.jobNotes.includes("Preserve silhouette"), "job should include edit notes");
    assert(jobJson.annotationContext.annotationCount === 1, "job should include annotation count");
    assert(jobJson.annotationContext.annotations[0].number === 1, "job should include numbered edit annotations");
    assert(jobJson.annotationContext.annotations[0].comment.includes("text X"), "job should include numbered edit comments");
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
    assert(generateJobJson.intent.includes("imagegen"), "generation job should include imagegen generation intent");
    assert(!generateJobJson.selectedImage.assetPath, "generation job should not attach the current selected image");
    assert(generateJobJson.annotationContext.annotationCount === 0, "generation job should not carry edit annotations");
    assert(generateJobJson.spriteContext.frames === 0, "generation job should not carry sprite context");
    assert(
      generateJobJson.notes.some((note) => note.includes("built-in image generation path")),
      "generation job should instruct Codex to use the imagegen built-in image generation path"
    );
    assert(
      generateJobJson.notes.some((note) => note.includes("Do not create a procedural placeholder")),
      "generation job should forbid procedural placeholder images"
    );

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
      frames: 8,
      cell: { width: 512, height: 512 },
      chromaKey: "green",
      spriteVariant: "standard",
      directions: ["front", "back", "back three-quarter", "front three-quarter", "side"]
    });
    const spriteGenerateJobJson = JSON.parse(await readFile(spriteGenerateJob.path, "utf8"));
    assert(spriteGenerateJobJson.workflowMode === "sprite-generate", "sprite generation job should include workflowMode");
    assert(spriteGenerateJobJson.intent.includes("chroma-key animation sprite sheet"), "sprite generation job should include sprite intent");
    assert(spriteGenerateJobJson.spriteContext.frames === 8, "sprite generation job should include sprite frame count");
    assert(spriteGenerateJobJson.spriteContext.grid.columns === 4, "sprite generation job should include sprite grid columns");
    assert(spriteGenerateJobJson.spriteContext.action === "idle", "sprite generation job should include action");
    assert(spriteGenerateJobJson.spriteContext.cell.width === 512, "sprite generation job should include cell size");
    assert(spriteGenerateJobJson.spriteContext.chromaKey === "green", "sprite generation job should include chroma key");
    assert(spriteGenerateJobJson.spriteContext.variant === "standard", "sprite generation job should include the standard variant");
    assert(spriteGenerateJobJson.spriteContext.directions.length === 5, "sprite generation job should include five direction rows");
    assert(spriteGenerateJobJson.selectedImage.assetPath, "sprite generation job should attach the source image");
    assert(spriteGenerateJobJson.annotationContext.annotationCount === 0, "sprite generation job should not carry edit annotations");
    assert(
      spriteGenerateJobJson.notes.some((note) => note.includes("built-in image_gen")),
      "sprite generation job should instruct Codex to use built-in image generation"
    );

    const hatchPetJob = await postJson(port, "/api/codex/jobs", {
      workflowMode: "sprite-generate",
      prompt: "Smoke test hatch-pet atlas generation with a canonical base identity",
      negativePrompt: "text, logo, shadows",
      jobNotes: "Experimental hatch-pet sprite workflow. Expected atlas: 8 columns x 9 rows, 192x208 per cell, 1536x1872 total.",
      selectedImageName: "tiny.png",
      selectedImageSize: "1x1",
      selectedImageSource: "sample",
      selectedImageDataUrl: tinyPng,
      grid: { columns: 8, rows: 9, gutter: 0 },
      action: "hatch-pet-atlas",
      frames: 72,
      cell: { width: 192, height: 208 },
      chromaKey: "magenta",
      spriteVariant: "hatch-pet",
      directions: ["idle", "running-right", "running-left", "waving", "jumping", "failed", "waiting", "running", "review"]
    });
    const hatchPetJobJson = JSON.parse(await readFile(hatchPetJob.path, "utf8"));
    assert(hatchPetJobJson.workflowMode === "sprite-generate", "hatch-pet job should still use sprite generation workflow");
    assert(hatchPetJobJson.spriteContext.variant === "hatch-pet", "hatch-pet job should include hatch-pet variant");
    assert(hatchPetJobJson.spriteContext.frames === 72, "hatch-pet job should include 72 atlas cells");
    assert(hatchPetJobJson.spriteContext.cell.width === 192, "hatch-pet job should include 192px cell width");
    assert(hatchPetJobJson.spriteContext.cell.height === 208, "hatch-pet job should include 208px cell height");
    assert(hatchPetJobJson.spriteContext.grid.rows === 9, "hatch-pet job should include 9 state rows");
    assert(hatchPetJobJson.spriteContext.directions.includes("review"), "hatch-pet job should include Codex pet state rows");
    assert(
      hatchPetJobJson.jobNotes.includes("hatch-pet"),
      "hatch-pet job should instruct Codex to use the hatch-pet workflow"
    );

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
        "-c",
        'approval_policy="never"',
        "--sandbox",
        "workspace-write",
        "-"
      ])
    }
  });

  try {
    await waitForServer(server, port);

    const runnerPreflight = await getJson(port, "/api/codex/runner");
    assert(runnerPreflight.runner?.state === "ready", "mock autorun preflight should report ready");
    assert(runnerPreflight.runner?.autorun === true, "mock autorun preflight should include autorun=true");
    assert(
      runnerPreflight.runner?.resolvedCommandPaths?.some((path) => path === nodeCommand),
      "mock autorun preflight should expose resolved command path"
    );

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

    const blockedJob = await postJson(port, "/api/codex/jobs", {
      workflowMode: "image-generate",
      prompt: "Smoke test policy blocked sidecar",
      negativePrompt: "text",
      jobNotes: "Trigger policy_or_safety diagnostic.",
      annotations: [],
      grid: { columns: 1, rows: 1, gutter: 0 },
      action: "",
      frames: 0
    });
    const blockedStatus = await waitForJobDiagnostic(port, blockedJob.id, "policy_or_safety");
    assert(blockedStatus.status.state === "completed", "policy sidecar job should complete without a placeholder image");
    assert(blockedStatus.status.diagnostic?.kind === "policy_or_safety", "blocked sidecar should return policy_or_safety diagnostic");
    const blockedOutbox = await getJson(port, "/api/codex/results");
    assert(!blockedOutbox.results.some((result) => result.name.startsWith(`${blockedJob.id}-`)), "blocked sidecar should not create a fake image");

    const failedJob = await postJson(port, "/api/codex/jobs", {
      workflowMode: "image-generate",
      prompt: "Smoke test policy runner failed",
      negativePrompt: "text",
      jobNotes: "Trigger failed runner diagnostic.",
      annotations: [],
      grid: { columns: 1, rows: 1, gutter: 0 },
      action: "",
      frames: 0
    });
    const failedStatus = await waitForJobDiagnostic(port, failedJob.id, "policy_or_safety");
    assert(failedStatus.status.state === "failed", "policy stderr job should fail runner");
    assert(failedStatus.status.diagnostic?.kind === "policy_or_safety", "policy stderr should return policy_or_safety diagnostic");

    const noImageJob = await postJson(port, "/api/codex/jobs", {
      workflowMode: "image-generate",
      prompt: "Smoke test no image returned",
      negativePrompt: "text",
      jobNotes: "Trigger no_image_returned diagnostic.",
      annotations: [],
      grid: { columns: 1, rows: 1, gutter: 0 },
      action: "",
      frames: 0
    });
    const noImageStatus = await waitForJobDiagnostic(port, noImageJob.id, "no_image_returned");
    assert(noImageStatus.status.state === "completed", "no-image job should complete");
    assert(noImageStatus.status.diagnostic?.kind === "no_image_returned", "no-image job should return no_image_returned diagnostic");
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

async function waitForJobDiagnostic(apiPort, jobId, expectedKind) {
  const deadline = Date.now() + 8000;
  let lastStatus;
  while (Date.now() < deadline) {
    lastStatus = await getJson(apiPort, `/api/codex/jobs/${encodeURIComponent(jobId)}/status`);
    if (lastStatus.status?.diagnostic?.kind === expectedKind) return lastStatus;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`Job ${jobId} did not return diagnostic ${expectedKind}. Last status: ${JSON.stringify(lastStatus)}`);
}

function assertPngDimensions(dataUrl, width, height, label) {
  const bytes = Buffer.from(dataUrl.split(",")[1], "base64");
  assert(bytes.subarray(1, 4).toString("ascii") === "PNG", `${label} should be PNG data`);
  assert(bytes.readUInt32BE(16) === width, `${label} expected width ${width}, got ${bytes.readUInt32BE(16)}`);
  assert(bytes.readUInt32BE(20) === height, `${label} expected height ${height}, got ${bytes.readUInt32BE(20)}`);
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

if (!stdin.includes("imagegen") || !stdin.includes("never a procedural placeholder")) {
  console.error("missing imagegen runner instructions");
  process.exit(5);
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

if (job.prompt.includes("policy blocked sidecar")) {
  await writeFile(join(outboxDir, \`\${jobId}-blocked.json\`), JSON.stringify({
    status: "blocked",
    reasonKind: "policy_or_safety",
    userMessage: "The image could not be generated.",
    suggestion: "Revise the prompt and try again."
  }, null, 2), "utf8");
  console.log(\`mock blocked sidecar \${jobId}\`);
  process.exit(0);
}

if (job.prompt.includes("policy runner failed")) {
  console.error("content policy safety blocked by image generation");
  process.exit(12);
}

if (job.prompt.includes("no image returned")) {
  console.log(\`mock completed without image \${jobId}\`);
  process.exit(0);
}

await writeFile(join(outboxDir, \`\${jobId}-mock.png\`), Buffer.from(tinyPng.split(",")[1], "base64"));
console.log(\`mock completed \${jobId}\`);
`;
}
