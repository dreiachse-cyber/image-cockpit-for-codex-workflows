import { spawn } from "node:child_process";
import { createWriteStream, existsSync, readFileSync } from "node:fs";
import { copyFile, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { extname, join, resolve, sep } from "node:path";

loadDotEnv(resolve(".env"));

const port = Number(process.env.IMAGE_COCKPIT_API_PORT ?? 8787);
const handoffRoot = resolve(process.env.IMAGE_COCKPIT_HANDOFF_DIR ?? "codex-handoff");
const inboxDir = join(handoffRoot, "inbox");
const outboxDir = join(handoffRoot, "outbox");
const assetsDir = join(handoffRoot, "assets");
const statusDir = join(handoffRoot, "status");
const logsDir = join(handoffRoot, "logs");
const codexAutoRun = process.env.IMAGE_COCKPIT_CODEX_AUTORUN !== "0";
const codexCommand = process.env.IMAGE_COCKPIT_CODEX_COMMAND ?? "codex";
const codexSandbox = process.env.IMAGE_COCKPIT_CODEX_SANDBOX ?? "workspace-write";
const codexApproval = process.env.IMAGE_COCKPIT_CODEX_APPROVAL ?? "never";
const resultRoutePrefix = "/api/codex/results/";
const runnerPreflightTimeoutMs = 4000;

const runnerStatuses = new Map<string, CodexRunnerStatus>();

type CodexJobRequest = {
  workflowMode?: string;
  prompt?: string;
  negativePrompt?: string;
  jobNotes?: string;
  seed?: string;
  size?: string;
  count?: number;
  quality?: string;
  selectedImageName?: string;
  selectedImageSize?: string;
  selectedImageSource?: string;
  selectedImageDataUrl?: string;
  annotations?: unknown[];
  grid?: unknown;
  action?: string;
  frames?: number;
};

type CodexWorkflowMode = "image-generate" | "image-edit" | "sprite-generate" | "sprite-edit";
type CodexRunnerState = "running" | "completed" | "failed" | "unavailable" | "disabled" | "unknown";
type CodexRunnerPreflightState = "ready" | "disabled" | "unavailable";

type CodexRunnerStatus = {
  jobId: string;
  state: CodexRunnerState;
  message: string;
  command?: string;
  startedAt?: string;
  finishedAt?: string;
  exitCode?: number | null;
  signal?: NodeJS.Signals | null;
  logPath?: string;
  statusPath?: string;
};

type CodexRunnerPreflight = {
  state: CodexRunnerPreflightState;
  message: string;
  command: string;
  checkedAt: string;
  autorun: boolean;
  sandbox: string;
  approval: string;
  errorCode?: string;
  setupHint?: string;
};

const server = createServer(async (request, response) => {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }

  try {
    await ensureHandoffDirs();
    const requestUrl = new URL(request.url ?? "/", `http://${request.headers.host ?? "127.0.0.1"}`);
    const pathname = requestUrl.pathname;

    if (request.method === "GET" && pathname === "/api/providers") {
      sendJson(response, 200, {
        providers: [
          { id: "local-file", label: "Local File", enabled: true, message: "Use images from this machine" },
          {
            id: "codex-handoff",
            label: "Codex Handoff",
            enabled: true,
            path: inboxDir,
            message: codexAutoRun
              ? `Write local jobs and start ${codexCommand} exec when available`
              : "Write local jobs for manual Codex pickup"
          },
          {
            id: "local-inbox",
            label: "Local Inbox",
            enabled: true,
            path: outboxDir,
            message: "Import results returned by Codex"
          }
        ]
      });
      return;
    }

    if (request.method === "GET" && pathname === "/api/codex/runner") {
      sendJson(response, 200, { runner: await checkCodexRunnerPreflight() });
      return;
    }

    if (request.method === "GET" && pathname === "/api/codex/jobs") {
      const files = await readdir(inboxDir);
      sendJson(response, 200, {
        inboxPath: inboxDir,
        jobs: files.filter((file) => file.endsWith(".json")).sort().reverse().slice(0, 20)
      });
      return;
    }

    const jobStatusMatch = pathname.match(/^\/api\/codex\/jobs\/([^/]+)\/status$/);
    if (request.method === "GET" && jobStatusMatch) {
      const jobId = decodeURIComponent(jobStatusMatch[1]);
      if (!isSafeJobId(jobId)) {
        sendJson(response, 400, { error: "Unsupported or unsafe job id" });
        return;
      }
      sendJson(response, 200, { status: await getRunnerStatus(jobId) });
      return;
    }

    if (request.method === "GET" && pathname === "/api/codex/results") {
      sendJson(response, 200, {
        outboxPath: outboxDir,
        results: (await listOutboxResults()).slice(0, 20)
      });
      return;
    }

    if (request.method === "GET" && pathname.startsWith(resultRoutePrefix)) {
      const name = decodeURIComponent(pathname.slice(resultRoutePrefix.length));
      const filePath = resolveOutboxFile(name);
      const mimeType = mimeTypeForImage(name);
      if (!filePath || !mimeType) {
        sendJson(response, 400, { error: "Unsupported or unsafe outbox file" });
        return;
      }
      const [bytes, fileStat] = await Promise.all([readFile(filePath), stat(filePath)]);
      sendJson(response, 200, {
        name,
        path: filePath,
        size: fileStat.size,
        modifiedAt: fileStat.mtime.toISOString(),
        mimeType,
        dataUrl: `data:${mimeType};base64,${bytes.toString("base64")}`
      });
      return;
    }

    if (request.method === "POST" && pathname === "/api/codex/jobs") {
      const body = (await readJson(request)) as CodexJobRequest;
      if (!body.prompt?.trim()) {
        sendJson(response, 400, { error: "Prompt is required for a Codex handoff job" });
        return;
      }

      const createdAt = new Date().toISOString();
      const id = `codex-job-${createdAt.replace(/[:.]/g, "-")}`;
      const workflowMode = normalizeWorkflowMode(body.workflowMode);
      const includeSelectedImage = workflowUsesSelectedImage(workflowMode);
      const includeSpriteContext = workflowUsesSpriteContext(workflowMode);
      const selectedImageAsset = includeSelectedImage ? await writeSelectedImageAsset(id, body) : null;
      const annotations = includeSelectedImage && Array.isArray(body.annotations) ? body.annotations : [];
      const job = {
        id,
        createdAt,
        kind: "image-cockpit.codex-handoff",
        workflowMode,
        intent: workflowIntent(workflowMode),
        prompt: body.prompt,
        negativePrompt: body.negativePrompt ?? "",
        jobNotes: body.jobNotes ?? "",
        generationHints: {
          seed: body.seed ?? "",
          size: body.size ?? "1024x1024",
          count: body.count ?? 1,
          quality: body.quality ?? "auto"
        },
        selectedImage: {
          name: includeSelectedImage ? body.selectedImageName ?? "" : "",
          size: includeSelectedImage ? body.selectedImageSize ?? "" : "",
          source: includeSelectedImage ? body.selectedImageSource ?? "" : "",
          assetPath: selectedImageAsset?.path ?? "",
          mimeType: selectedImageAsset?.mimeType ?? "",
          originalSource: selectedImageAsset?.source ?? ""
        },
        annotationContext: {
          annotations,
          annotationCount: annotations.length,
          coordinateSpace: "Image Cockpit canvas coordinates",
          canvasSize: { width: 920, height: 520 }
        },
        spriteContext: {
          action: includeSpriteContext ? body.action ?? "" : "",
          frames: includeSpriteContext ? body.frames ?? 0 : 0,
          grid: includeSpriteContext ? body.grid ?? null : null
        },
        returnTo: {
          outboxDir,
          expected: ["png", "webp", "gif", "json"]
        },
        notes: [
          "This app does not call OpenAI APIs directly.",
          "Codex or the user should perform generation/editing externally and place results in the outbox or import them through the UI.",
          ...workflowNotes(workflowMode)
        ]
      };
      const path = join(inboxDir, `${id}.json`);
      await writeFile(path, JSON.stringify(job, null, 2), "utf8");
      const runner = await startCodexRunner({ id, createdAt, path });
      sendJson(response, 200, { id, path, inboxPath: inboxDir, createdAt, runner });
      return;
    }

    sendJson(response, 404, { error: "Not found" });
  } catch (error) {
    sendJson(response, 500, { error: error instanceof Error ? error.message : "Internal server error" });
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Image Cockpit local handoff server listening on http://127.0.0.1:${port}`);
  console.log(`Codex handoff inbox: ${inboxDir}`);
});

async function ensureHandoffDirs() {
  await mkdir(inboxDir, { recursive: true });
  await mkdir(outboxDir, { recursive: true });
  await mkdir(assetsDir, { recursive: true });
  await mkdir(statusDir, { recursive: true });
  await mkdir(logsDir, { recursive: true });
}

async function writeSelectedImageAsset(jobId: string, body: CodexJobRequest) {
  const value = body.selectedImageDataUrl;
  if (!value) return null;

  const dataUrlMatch = value.match(/^data:([^;,]+);base64,(.+)$/);
  if (dataUrlMatch) {
    const mimeType = dataUrlMatch[1];
    const extension = extensionForMimeType(mimeType);
    if (!extension) return null;
    const path = join(assetsDir, `${jobId}-selected${extension}`);
    await writeFile(path, Buffer.from(dataUrlMatch[2], "base64"));
    return { path, mimeType, source: "data-url" };
  }

  if (value.startsWith("/")) {
    const sourcePath = resolve("public", value.replace(/^\/+/, ""));
    const root = `${resolve("public")}${sep}`;
    if (!sourcePath.startsWith(root)) return null;
    const mimeType = mimeTypeForImage(sourcePath);
    const extension = extname(sourcePath).toLowerCase();
    if (!mimeType || !extension) return null;
    const path = join(assetsDir, `${jobId}-selected${extension}`);
    await copyFile(sourcePath, path);
    return { path, mimeType, source: value };
  }

  return null;
}

function normalizeWorkflowMode(value?: string): CodexWorkflowMode {
  if (
    value === "image-generate" ||
    value === "image-edit" ||
    value === "sprite-generate" ||
    value === "sprite-edit"
  ) {
    return value;
  }
  return "image-generate";
}

function workflowUsesSelectedImage(mode: CodexWorkflowMode) {
  return mode === "image-edit";
}

function workflowUsesSpriteContext(mode: CodexWorkflowMode) {
  return mode === "sprite-generate" || mode === "sprite-edit";
}

function workflowIntent(mode: CodexWorkflowMode) {
  if (mode === "image-edit") {
    return "Ask local Codex to revise the selected source image using annotations and edit notes, then return image files to the outbox.";
  }
  if (mode === "sprite-generate") {
    return "Ask local Codex to create a sprite sheet asset when available, or record sprite generation context for manual handoff.";
  }
  if (mode === "sprite-edit") {
    return "Ask local Codex to revise sprite-sheet frames or metadata when available, or record sprite edit context for manual handoff.";
  }
  return "Ask local Codex to generate a new image from the prompt, then return image files to the outbox.";
}

function workflowNotes(mode: CodexWorkflowMode) {
  if (mode === "image-edit") {
    return [
      "Use selectedImage.assetPath as the source image when present.",
      "Use annotationContext.annotations and jobNotes as the user's edit instructions."
    ];
  }
  if (mode === "sprite-generate" || mode === "sprite-edit") {
    return [
      "Use spriteContext.grid, spriteContext.action, and spriteContext.frames when they are populated.",
      "Use jobNotes for frame, transparency, anchor, or export requirements."
    ];
  }
  return [
    "This is a text-to-image style generation job. Do not treat the current UI sample image as a source image unless selectedImage.assetPath is populated.",
    "Use prompt, negativePrompt, generationHints, and jobNotes as the generation brief."
  ];
}

async function startCodexRunner(job: { id: string; createdAt: string; path: string }) {
  const statusPath = join(statusDir, `${job.id}.json`);
  const logPath = join(logsDir, `${job.id}.log`);

  if (!codexAutoRun) {
    const status: CodexRunnerStatus = {
      jobId: job.id,
      state: "disabled",
      message: "Codex autorun is disabled. Run the job manually or set IMAGE_COCKPIT_CODEX_AUTORUN=1.",
      statusPath,
      logPath
    };
    await writeRunnerStatus(status);
    return status;
  }

  const startedAt = new Date().toISOString();
  const status: CodexRunnerStatus = {
    jobId: job.id,
    state: "running",
    message: `Started ${codexCommand} exec for ${job.id}`,
    command: codexCommand,
    startedAt,
    statusPath,
    logPath
  };
  runnerStatuses.set(job.id, status);
  await writeRunnerStatus(status);

  const logStream = createWriteStream(logPath, { flags: "a" });
  const prompt = buildCodexRunnerPrompt(job);
  logStream.write(`[${startedAt}] Starting ${codexCommand} exec for ${job.id}\n`);
  logStream.write(`Job path: ${job.path}\n`);
  logStream.write(`Outbox: ${outboxDir}\n\n`);

  let settled = false;
  try {
    const child = spawn(
      codexCommand,
      ["exec", "--sandbox", codexSandbox, "--ask-for-approval", codexApproval, "-"],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          IMAGE_COCKPIT_JOB_ID: job.id,
          IMAGE_COCKPIT_JOB_PATH: job.path,
          IMAGE_COCKPIT_OUTBOX_DIR: outboxDir
        },
        windowsHide: true
      }
    );

    child.stdout.pipe(logStream, { end: false });
    child.stderr.pipe(logStream, { end: false });
    child.stdin.on("error", () => {
      // Spawn errors are captured by the child error handler; avoid noisy EPIPE crashes.
    });
    child.stdin.end(prompt, "utf8");

    child.on("error", (error: NodeJS.ErrnoException) => {
      if (settled) return;
      settled = true;
      const finishedAt = new Date().toISOString();
      const errorStatus: CodexRunnerStatus = {
        ...status,
        state: isRunnerUnavailableError(error) ? "unavailable" : "failed",
        message: error.message,
        finishedAt
      };
      void writeRunnerStatus(errorStatus);
      logStream.write(`\n[${finishedAt}] Runner error: ${error.message}\n`);
      logStream.end();
    });

    child.on("close", (exitCode, signal) => {
      if (settled) return;
      settled = true;
      const finishedAt = new Date().toISOString();
      const completedStatus: CodexRunnerStatus = {
        ...status,
        state: exitCode === 0 ? "completed" : "failed",
        message: exitCode === 0 ? "Codex exec completed" : `Codex exec exited with code ${exitCode}`,
        finishedAt,
        exitCode,
        signal
      };
      void writeRunnerStatus(completedStatus);
      logStream.write(`\n[${finishedAt}] ${completedStatus.message}\n`);
      logStream.end();
    });
  } catch (error) {
    const finishedAt = new Date().toISOString();
    const errorStatus: CodexRunnerStatus = {
      ...status,
      state: isRunnerUnavailableError(error) ? "unavailable" : "failed",
      message: error instanceof Error ? error.message : "Could not start Codex exec",
      finishedAt
    };
    await writeRunnerStatus(errorStatus);
    logStream.write(`\n[${finishedAt}] ${errorStatus.message}\n`);
    logStream.end();
    return errorStatus;
  }

  return status;
}

async function checkCodexRunnerPreflight(): Promise<CodexRunnerPreflight> {
  const base = createRunnerPreflightBase();
  if (!codexAutoRun) {
    return {
      ...base,
      state: "disabled",
      message: "Codex autorun is disabled. Jobs will be written for manual pickup.",
      setupHint: "Set IMAGE_COCKPIT_CODEX_AUTORUN=1 to let Image Cockpit try to start codex exec."
    };
  }

  return new Promise((resolve) => {
    let settled = false;
    let stderrText = "";
    let timeoutId: NodeJS.Timeout | undefined;
    let child: ReturnType<typeof spawn> | null = null;

    const finish = (preflight: Pick<CodexRunnerPreflight, "state" | "message"> & Partial<CodexRunnerPreflight>) => {
      if (settled) return;
      settled = true;
      if (timeoutId) clearTimeout(timeoutId);
      resolve({ ...base, ...preflight });
    };

    timeoutId = setTimeout(() => {
      if (child && !child.killed) child.kill();
      finish({
        state: "unavailable",
        message: `Codex runner check timed out after ${runnerPreflightTimeoutMs}ms.`,
        setupHint: codexRunnerSetupHint()
      });
    }, runnerPreflightTimeoutMs);

    try {
      child = spawn(codexCommand, ["--help"], {
        cwd: process.cwd(),
        stdio: ["ignore", "ignore", "pipe"],
        windowsHide: true
      });

      child.stderr?.on("data", (chunk: Buffer) => {
        stderrText = `${stderrText}${chunk.toString("utf8")}`.slice(0, 1200);
      });

      child.on("error", (error: NodeJS.ErrnoException) => {
        finish({
          state: "unavailable",
          message: error.message,
          errorCode: error.code,
          setupHint: codexRunnerSetupHint(error)
        });
      });

      child.on("close", (exitCode) => {
        if (exitCode === 0) {
          finish({
            state: "ready",
            message: `${codexCommand} is executable from the local handoff server.`
          });
          return;
        }

        finish({
          state: "unavailable",
          message: stderrText.trim() || `${codexCommand} --help exited with code ${exitCode}`,
          errorCode: exitCode === null ? undefined : String(exitCode),
          setupHint: codexRunnerSetupHint()
        });
      });
    } catch (error) {
      finish({
        state: "unavailable",
        message: error instanceof Error ? error.message : "Could not start Codex runner check.",
        errorCode: error && typeof error === "object" && "code" in error ? String((error as NodeJS.ErrnoException).code) : undefined,
        setupHint: codexRunnerSetupHint(error)
      });
    }
  });
}

function createRunnerPreflightBase() {
  return {
    state: "unavailable" as CodexRunnerPreflightState,
    message: "",
    command: codexCommand,
    checkedAt: new Date().toISOString(),
    autorun: codexAutoRun,
    sandbox: codexSandbox,
    approval: codexApproval
  };
}

function codexRunnerSetupHint(error?: unknown) {
  if (error && typeof error === "object" && "code" in error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return "Install Codex CLI or set IMAGE_COCKPIT_CODEX_COMMAND to the full executable path.";
    }
    if (code === "EACCES" || code === "EPERM") {
      return "Check that the configured Codex command can run from this shell, or set IMAGE_COCKPIT_CODEX_COMMAND to a runnable executable path.";
    }
  }

  return "Set IMAGE_COCKPIT_CODEX_COMMAND to a runnable Codex CLI path, or set IMAGE_COCKPIT_CODEX_AUTORUN=0 for manual handoff.";
}

function buildCodexRunnerPrompt(job: { id: string; path: string }) {
  return [
    "You are processing an Image Cockpit for Codex Workflows handoff job.",
    "",
    `Read this local JSON job file: ${job.path}`,
    "If selectedImage.assetPath is populated, inspect that source image before editing it.",
    "If selectedImage.assetPath is empty, treat the job as prompt-only unless the job notes say otherwise.",
    "Use jobNotes, annotationContext, and spriteContext only when those fields are populated for the workflow.",
    `Write final image result files only into this outbox directory: ${outboxDir}`,
    `Use this filename prefix for returned assets: ${job.id}`,
    "",
    "Important constraints:",
    "- The Image Cockpit app itself must not call OpenAI APIs directly.",
    "- Do not modify project source files, package files, docs, git metadata, or configuration.",
    "- Do not write API keys, access tokens, model weights, or license-unclear assets.",
    "- If image generation or editing is unavailable in this Codex environment, write no placeholder image.",
    "- Prefer PNG or WebP for still images. If you produce notes, write them as a small JSON or Markdown sidecar in the outbox.",
    "",
    "When finished, make sure at least one usable image file is present in the outbox if generation/editing succeeded."
  ].join("\n");
}

async function writeRunnerStatus(status: CodexRunnerStatus) {
  runnerStatuses.set(status.jobId, status);
  const statusPath = status.statusPath ?? join(statusDir, `${status.jobId}.json`);
  await writeFile(statusPath, JSON.stringify(status, null, 2), "utf8");
}

async function getRunnerStatus(jobId: string): Promise<CodexRunnerStatus> {
  const liveStatus = runnerStatuses.get(jobId);
  if (liveStatus) return liveStatus;

  const statusPath = join(statusDir, `${jobId}.json`);
  try {
    return JSON.parse(await readFile(statusPath, "utf8")) as CodexRunnerStatus;
  } catch {
    return {
      jobId,
      state: "unknown",
      message: "No runner status has been recorded for this job.",
      statusPath
    };
  }
}

async function listOutboxResults() {
  const entries = await readdir(outboxDir, { withFileTypes: true });
  const results = await Promise.all(
    entries
      .filter((entry) => entry.isFile())
      .map(async (entry) => {
        const mimeType = mimeTypeForImage(entry.name);
        if (!mimeType) return null;
        const filePath = join(outboxDir, entry.name);
        const fileStat = await stat(filePath);
        return {
          name: entry.name,
          path: filePath,
          size: fileStat.size,
          modifiedAt: fileStat.mtime.toISOString(),
          mimeType
        };
      })
  );
  return results
    .filter((result): result is NonNullable<(typeof results)[number]> => Boolean(result))
    .sort((a, b) => Date.parse(b.modifiedAt) - Date.parse(a.modifiedAt));
}

function resolveOutboxFile(name: string) {
  if (!name || name.includes("/") || name.includes("\\") || name.includes("..")) return null;
  const filePath = resolve(outboxDir, name);
  const root = outboxDir.endsWith(sep) ? outboxDir : `${outboxDir}${sep}`;
  return filePath.startsWith(root) ? filePath : null;
}

function isSafeJobId(jobId: string) {
  return /^codex-job-[A-Za-z0-9_-]+$/.test(jobId);
}

function isRunnerUnavailableError(error: unknown) {
  if (!error || typeof error !== "object" || !("code" in error)) return false;
  const code = (error as NodeJS.ErrnoException).code;
  return code === "ENOENT" || code === "EACCES" || code === "EPERM";
}

function mimeTypeForImage(name: string) {
  const extension = extname(name).toLowerCase();
  if (extension === ".png") return "image/png";
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  if (extension === ".webp") return "image/webp";
  if (extension === ".gif") return "image/gif";
  return null;
}

function extensionForMimeType(mimeType: string) {
  if (mimeType === "image/png") return ".png";
  if (mimeType === "image/jpeg") return ".jpg";
  if (mimeType === "image/webp") return ".webp";
  if (mimeType === "image/gif") return ".gif";
  return null;
}

function readJson(request: IncomingMessage) {
  return new Promise<unknown>((resolve, reject) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      try {
        const text = Buffer.concat(chunks).toString("utf8");
        resolve(text ? JSON.parse(text) : {});
      } catch (error) {
        reject(error);
      }
    });
    request.on("error", reject);
  });
}

function sendJson(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}

function loadDotEnv(path: string) {
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
