import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { copyFile, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { basename, join, resolve } from "node:path";

const nodeCommand = process.execPath;
const timeoutMs = Number(process.env.IMAGE_COCKPIT_DIRECT_TRANSPARENT_TIMEOUT_MS ?? 1800000);
const outputRoot = resolve(
  process.env.IMAGE_COCKPIT_DIRECT_TRANSPARENT_EXPERIMENT_DIR ??
    join("docs", "qa", "direct-transparent-animation-generation", timestampSlug())
);
const handoffDir = join(outputRoot, "handoff");
const sourceImagePath = resolve(process.env.IMAGE_COCKPIT_DIRECT_TRANSPARENT_SOURCE ?? "public/prompt-examples/forest-mage-idle.png");
const port = Number(process.env.IMAGE_COCKPIT_DIRECT_TRANSPARENT_API_PORT ?? await getOpenPort());
const server = startServer({ port, handoffDir });
const jobs = [
  {
    label: "baseline-chroma-key",
    backgroundMode: "chroma-key",
    prompt:
      "Baseline experiment: use the uploaded forest mage source image to create five separate direction PNG files for an idle-breathing 4x2 animation set. Use a perfectly flat #00ff00 chroma-key background in every cell, no drawn scenery, no shadows, no labels, no numbers, no UI.",
    jobNotes:
      "Baseline chroma-key run for Direct Transparent Animation Generation experiment. Return five direction PNG files and a manifest. Keep background flat green for postprocessing."
  },
  {
    label: "direct-transparent-a-empty-alpha",
    backgroundMode: "direct-transparent",
    prompt:
      "Direct transparent experiment variant A: use the uploaded forest mage source image to create five separate direction PNG files for an idle-breathing 4x2 animation set. Create real transparent PNG output with an alpha channel; the canvas outside the character is empty alpha 0. Each frame contains only the character sprite, no drawn background, no preview pattern, no guide grid, no floor, no backdrop, no labels, no numbers, no UI.",
    jobNotes:
      "Direct transparent variant A. Do not silently fallback to chroma key. If alpha output cannot be produced, return a blocked or failed alphaValidation sidecar/manifest instead of a fake success."
  },
  {
    label: "direct-transparent-b-no-checkerboard",
    backgroundMode: "direct-transparent",
    prompt:
      "Direct transparent experiment variant B: use the uploaded forest mage source image to create five separate direction PNG files for an idle-breathing 4x2 animation set as game-ready transparent PNGs. Use real alpha transparency outside each character. Do not draw a checkerboard, UI preview background, grid, floor, solid color backdrop, white background, black background, green screen, text, labels, or numbers.",
    jobNotes:
      "Direct transparent variant B explicitly negates checkerboard/preview-background language. Do not treat chroma-key or opaque output as successful direct transparent output."
  },
  {
    label: "direct-transparent-c-alpha-contract",
    backgroundMode: "direct-transparent",
    prompt:
      "Direct transparent experiment variant C: use the uploaded forest mage source image to create five separate direction PNG files for an idle-breathing 4x2 animation set. The final PNG files must have a real alpha channel: every pixel outside the character silhouette is alpha 0 transparent, not white, black, green, checkerboard, gray, scenery, floor, shadow, or a preview pattern. Preserve the character body, face, clothes, staff, and silhouette without internal transparent holes. No labels, no numbers, no UI.",
    jobNotes:
      "Direct transparent variant C restates the alpha contract and body-integrity requirement. Do not silently fallback to chroma key or opaque-background output."
  },
  {
    label: "direct-transparent-d-color-preserve",
    backgroundMode: "direct-transparent",
    prompt:
      "Direct transparent experiment variant D: use the uploaded forest mage source image to create five separate direction PNG files for an idle-breathing 4x2 animation set. Preserve the full-color pixel art appearance, facial features, green cloak, brown boots, wooden staff, glowing crystal, outlines, and shading from the source image; do not turn the character into a black silhouette or mask. Use real alpha transparency outside each character only: transparent alpha 0 background, no checkerboard, no green screen, no white/black/gray backdrop, no scenery, no floor, no shadow, no text, no labels, no UI.",
    jobNotes:
      "Direct transparent variant D checks whether native alpha can preserve full-color sprite detail. Silhouette or mask-like output should not be accepted as production-quality direct transparent output."
  }
];

try {
  await mkdir(outputRoot, { recursive: true });
  await mkdir(handoffDir, { recursive: true });
  await copyFile(sourceImagePath, join(outputRoot, basename(sourceImagePath)));
  await waitForServer(server, port);

  const runnerPreflight = await getJson(port, "/api/codex/runner");
  assert(runnerPreflight.runner?.state === "ready", `Codex runner preflight was not ready: ${JSON.stringify(runnerPreflight.runner)}`);

  const selectedImageDataUrl = await imageDataUrl(sourceImagePath);
  const records = await readExistingRecords();
  const completedLabels = new Set(records.map((record) => record.label));
  for (const jobSpec of jobs) {
    if (completedLabels.has(jobSpec.label)) {
      console.log(`Skipping existing experiment record: ${jobSpec.label}`);
      continue;
    }
    const record = await runExperimentJob(jobSpec, selectedImageDataUrl);
    records.push(record);
    await writeExperimentFiles(records);
  }

  await writeExperimentFiles(records);
  console.log("Direct transparent experiment jobs completed.");
  console.log(`outputRoot=${outputRoot}`);
  for (const record of records) {
    console.log(`${record.label}: ${record.jobId} ${record.status.state} results=${record.results.map((item) => item.name).join(", ")}`);
  }
} finally {
  await stopServer(server);
  if (process.env.IMAGE_COCKPIT_DIRECT_TRANSPARENT_CLEAN_ON_FAIL === "1") {
    await rm(handoffDir, { recursive: true, force: true });
  }
}

async function runExperimentJob(jobSpec, selectedImageDataUrl) {
  const job = await postJson(port, "/api/codex/jobs", {
    workflowMode: "sprite-generate",
    prompt: jobSpec.prompt,
    negativePrompt: "text, labels, numbers, watermark, logo, cropped head, cropped feet, extra characters, duplicated heads, scenery",
    jobNotes: jobSpec.jobNotes,
    selectedImageName: basename(sourceImagePath),
    selectedImageSize: "512x512",
    selectedImageSource: "experiment-source",
    selectedImageDataUrl,
    annotations: [],
    grid: { columns: 4, rows: 2, gutter: 0 },
    action: "idle",
    frames: 8,
    cell: { width: 256, height: 256 },
    chromaKey: "green",
    backgroundMode: jobSpec.backgroundMode,
    spriteVariant: "standard",
    directions: ["front", "front three-quarter", "side", "back three-quarter", "back"]
  });

  assert(job.runner?.state === "running", `${jobSpec.label} should start as running: ${JSON.stringify(job.runner)}`);
  const status = await waitForTerminalStatus(port, job.id);
  const resultsData = await getJson(port, "/api/codex/results?limit=300");
  const results = resultsData.results
    .filter((item) => item.name.startsWith(job.id))
    .map(({ name, path, size, modifiedAt, mimeType, artifact }) => ({ name, path, size, modifiedAt, mimeType, artifact }));
  const manifest = results.find((item) => item.name === `${job.id}-manifest.json`);
  const logPath = status.logPath ?? "";
  if (logPath) await stat(logPath);
  return {
    label: jobSpec.label,
    jobId: job.id,
    backgroundMode: jobSpec.backgroundMode,
    prompt: jobSpec.prompt,
    jobNotes: jobSpec.jobNotes,
    jobPath: job.path,
    logPath,
    status,
    manifest,
    results
  };
}

async function writeExperimentFiles(records) {
  await writeFile(join(outputRoot, "experiment-jobs.json"), JSON.stringify({
    createdAt: new Date().toISOString(),
    sourceImage: sourceImagePath,
    handoffDir,
    records
  }, null, 2), "utf8");
  await writeFile(join(outputRoot, "run-summary.md"), [
    "# Direct Transparent Animation Generation Experiment Run",
    "",
    `Source image: \`${sourceImagePath}\``,
    `Handoff dir: \`${handoffDir}\``,
    "",
    "| Label | Job ID | Background mode | Runner state | Exit | Results |",
    "| --- | --- | --- | --- | --- | --- |",
    ...records.map((record) => [
      record.label,
      record.jobId,
      record.backgroundMode,
      record.status.state,
      record.status.exitCode ?? "",
      record.results.map((item) => item.name).join("<br>")
    ].map((cell) => String(cell).replace(/\|/g, "\\|")).join(" | ")).map((row) => `| ${row} |`)
  ].join("\n"), "utf8");
}

async function readExistingRecords() {
  const jobsPath = join(outputRoot, "experiment-jobs.json");
  if (!existsSync(jobsPath)) return [];
  const parsed = JSON.parse(await readFile(jobsPath, "utf8"));
  if (!Array.isArray(parsed.records)) return [];
  return parsed.records;
}

function startServer({ port, handoffDir }) {
  const child = spawn(nodeCommand, ["node_modules/tsx/dist/cli.mjs", "server/index.ts"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      IMAGE_COCKPIT_API_PORT: String(port),
      IMAGE_COCKPIT_HANDOFF_DIR: handoffDir,
      IMAGE_COCKPIT_CODEX_AUTORUN: "1",
      IMAGE_COCKPIT_ARTIFACT_STABLE_MS: "0"
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
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try {
      await getJson(apiPort, "/api/providers");
      return;
    } catch {
      await delay(250);
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

async function imageDataUrl(path) {
  const bytes = await readFile(path);
  return `data:image/png;base64,${bytes.toString("base64")}`;
}

async function stopServer(child) {
  if (!child || child.exitCode !== null) return;
  child.kill();
  await new Promise((resolve) => {
    const timeout = setTimeout(resolve, 2000);
    child.once("exit", () => {
      clearTimeout(timeout);
      resolve();
    });
  });
}

async function getOpenPort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  await new Promise((resolve) => server.close(resolve));
  if (!address || typeof address === "string") throw new Error("Could not allocate a port");
  return address.port;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function timestampSlug() {
  const date = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    "-",
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds())
  ].join("");
}
