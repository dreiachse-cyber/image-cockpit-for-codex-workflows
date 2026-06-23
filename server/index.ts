import { spawn } from "node:child_process";
import { createWriteStream, existsSync, readFileSync, readdirSync } from "node:fs";
import { copyFile, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { delimiter, extname, join, resolve, sep } from "node:path";
import { generateLocalImages, type LocalGenerationRequest } from "./local-generator.js";

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
const codexCommandCandidates = resolveCommandCandidates(codexCommand);
const codexLaunchCommand = selectCodexLaunchCommand(codexCommand, codexCommandCandidates);
const codexSandbox = process.env.IMAGE_COCKPIT_CODEX_SANDBOX ?? "workspace-write";
const codexApproval = process.env.IMAGE_COCKPIT_CODEX_APPROVAL ?? "never";
const codexHelpArgs = parseJsonStringArray("IMAGE_COCKPIT_CODEX_HELP_ARGS_JSON", ["--help"]);
const codexExecArgs = parseJsonStringArray("IMAGE_COCKPIT_CODEX_EXEC_ARGS_JSON", [
  "exec",
  "-c",
  `approval_policy=${JSON.stringify(codexApproval)}`,
  "--sandbox",
  codexSandbox,
  "-"
]);
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
  cell?: unknown;
  chromaKey?: string;
  directions?: unknown;
};

type CodexWorkflowMode = "image-generate" | "image-edit" | "sprite-generate" | "sprite-edit";
type CodexRunnerState = "running" | "completed" | "failed" | "unavailable" | "disabled" | "unknown";
type CodexRunnerPreflightState = "ready" | "disabled" | "unavailable";
type CodexFailureKind =
  | "policy_or_safety"
  | "imagegen_unavailable"
  | "runner_failed"
  | "no_image_returned"
  | "unknown";

type CodexJobDiagnostic = {
  kind: CodexFailureKind;
  title: string;
  userMessage: string;
  suggestion?: string;
  sidecarPath?: string;
  logPath?: string;
};

type CodexRunnerStatus = {
  jobId: string;
  state: CodexRunnerState;
  message: string;
  command?: string;
  requestedCommand?: string;
  startedAt?: string;
  finishedAt?: string;
  exitCode?: number | null;
  signal?: NodeJS.Signals | null;
  logPath?: string;
  statusPath?: string;
  diagnostic?: CodexJobDiagnostic;
};

type CodexRunnerPreflight = {
  state: CodexRunnerPreflightState;
  message: string;
  command: string;
  launchCommand: string;
  checkedAt: string;
  autorun: boolean;
  sandbox: string;
  approval: string;
  resolvedCommandPaths: string[];
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
            id: "local-generator",
            label: "Local Generator",
            enabled: true,
            path: outboxDir,
            message: "Generate local PNG images without external services"
          },
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

    if (request.method === "POST" && pathname === "/api/generate") {
      const body = (await readJson(request)) as LocalGenerationRequest;
      if (!body.prompt?.trim()) {
        sendJson(response, 400, { error: "Prompt is required for local generation" });
        return;
      }
      const createdAt = new Date().toISOString();
      const id = `local-gen-${createdAt.replace(/[:.]/g, "-")}`;
      const results = await generateLocalImages(body, outboxDir, id);
      const responseResults = await Promise.all(
        results.map(async (result) => {
          const [bytes, fileStat] = await Promise.all([readFile(result.path), stat(result.path)]);
          return {
            ...result,
            size: fileStat.size,
            modifiedAt: fileStat.mtime.toISOString(),
            dataUrl: `data:${result.mimeType};base64,${bytes.toString("base64")}`
          };
        })
      );
      sendJson(response, 200, { id, createdAt, outboxPath: outboxDir, results: responseResults });
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
      const includeAnnotations = workflowMode === "image-edit";
      const selectedImageAsset = includeSelectedImage ? await writeSelectedImageAsset(id, body) : null;
      const annotations = includeAnnotations && Array.isArray(body.annotations) ? body.annotations : [];
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
          grid: includeSpriteContext ? body.grid ?? null : null,
          cell: includeSpriteContext ? body.cell ?? null : null,
          chromaKey: includeSpriteContext ? body.chromaKey ?? "" : "",
          directions: includeSpriteContext && Array.isArray(body.directions) ? body.directions : []
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
  return mode === "image-edit" || mode === "sprite-generate";
}

function workflowUsesSpriteContext(mode: CodexWorkflowMode) {
  return mode === "sprite-generate" || mode === "sprite-edit";
}

function workflowIntent(mode: CodexWorkflowMode) {
  if (mode === "image-edit") {
    return "Ask local Codex to revise the selected source image using annotations and edit notes, then return image files to the outbox.";
  }
  if (mode === "sprite-generate") {
    return "Ask local Codex to inspect the selected source image and use imagegen / built-in image_gen to create a chroma-key animation sprite sheet.";
  }
  if (mode === "sprite-edit") {
    return "Ask local Codex to revise sprite-sheet frames or metadata when available, or record sprite edit context for manual handoff.";
  }
  return "Ask local Codex to use imagegen / built-in image_gen to generate a real pixel-art image from the prompt, then return image files to the outbox.";
}

function workflowNotes(mode: CodexWorkflowMode) {
  const blockerSidecarNote =
    "If image generation/editing is blocked by safety, policy, or unavailable imagegen capability, do not create a placeholder image. Write only a small JSON sidecar with status=blocked, reasonKind, userMessage, and suggestion.";
  if (mode === "image-edit") {
    return [
      "Use selectedImage.assetPath as the source image when present.",
      "Use imagegen / built-in image_gen editing when available so the result is a real edited raster image.",
      "Use annotationContext.annotations, numbered region comments, prompt, and jobNotes as the user's edit instructions.",
      "Preserve unrelated pixels when possible, and return the edited image as a real PNG or WebP with the job id filename prefix.",
      "Do not create a placeholder, SVG, diagram, or text-only result.",
      blockerSidecarNote
    ];
  }
  if (mode === "sprite-generate") {
    return [
      "Use selectedImage.assetPath as the source character image.",
      "Use imagegen / built-in image_gen when available to create a real raster sprite sheet from that source image; never create a procedural placeholder.",
      "Extract only the character from the source image, then generate the requested motion as a sprite sheet.",
      "Use spriteContext.grid, spriteContext.cell, spriteContext.action, spriteContext.frames, spriteContext.directions, and spriteContext.chromaKey exactly when they are populated.",
      "Treat spriteContext.grid and spriteContext.cell as strict cut lines: no gutters, no extra sheet margin, no character pixels crossing cell borders.",
      "The default direction-row order is front, back, back three-quarter, front three-quarter, side.",
      "Every cell must contain exactly one full-body character with head, hair, hands, equipment, and both feet visible, centered with at least 10% inner padding.",
      "Reject and retry the sprite sheet if any cell has a cropped head, missing feet, multiple heads, a head below the feet, inconsistent scale, body fragments, or a different character.",
      "Use the requested chroma-key background color as a flat simple background in every cell so Image Cockpit can remove it after import.",
      "Avoid readable text, logos, watermarks, labels, UI words, numbers, scenery, and complex backgrounds.",
      blockerSidecarNote
    ];
  }
  if (mode === "sprite-edit") {
    return [
      "Use spriteContext.grid, spriteContext.action, and spriteContext.frames when they are populated.",
      "Use jobNotes for frame, transparency, anchor, or export requirements."
    ];
  }
  return [
    "For prompt-only pixel art generation, use the imagegen skill default built-in image generation path when it is available.",
    "Use the job prompt as the creative brief. Interpret complex prompts literally and preserve concrete subject, style, palette, composition, and production constraints.",
    "Create a real raster image. Do not create a procedural placeholder, SVG, diagram, or text-only result.",
    "Avoid readable text, logos, watermarks, labels, UI words, and numbers unless the user explicitly asks for them.",
    "If the first result contains unwanted text or numbers, retry once with stricter no-text/no-number constraints.",
    "Write the final image with the job id prefix, and write a short Markdown or JSON sidecar that states whether image_gen was used.",
    blockerSidecarNote,
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
    command: codexLaunchCommand,
    requestedCommand: codexCommand,
    startedAt,
    statusPath,
    logPath
  };
  runnerStatuses.set(job.id, status);
  await writeRunnerStatus(status);

  const logStream = createWriteStream(logPath, { flags: "a" });
  const prompt = buildCodexRunnerPrompt(job);
  logStream.write(`[${startedAt}] Starting ${codexLaunchCommand} exec for ${job.id}\n`);
  logStream.write(`Job path: ${job.path}\n`);
  logStream.write(`Outbox: ${outboxDir}\n\n`);

  let settled = false;
  try {
    const child = spawn(
      codexLaunchCommand,
      codexExecArgs,
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
      child = spawn(codexLaunchCommand, codexHelpArgs, {
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
            message: `${codexLaunchCommand} is executable from the local handoff server.`
          });
          return;
        }

        finish({
          state: "unavailable",
          message: stderrText.trim() || `${codexLaunchCommand} ${codexHelpArgs.join(" ")} exited with code ${exitCode}`,
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
    launchCommand: codexLaunchCommand,
    checkedAt: new Date().toISOString(),
    autorun: codexAutoRun,
    sandbox: codexSandbox,
    approval: codexApproval,
    resolvedCommandPaths: codexCommandCandidates.slice(0, 8)
  };
}

function parseJsonStringArray(envKey: string, fallback: string[]) {
  const rawValue = process.env[envKey];
  if (!rawValue) return fallback;
  try {
    const parsed = JSON.parse(rawValue);
    if (Array.isArray(parsed) && parsed.every((item) => typeof item === "string")) {
      return parsed;
    }
  } catch {
    // Fall through to fallback; doctor/release docs explain the JSON form for wrappers.
  }
  return fallback;
}

function codexRunnerSetupHint(error?: unknown) {
  if (error && typeof error === "object" && "code" in error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return "Install Codex CLI or set IMAGE_COCKPIT_CODEX_COMMAND to the full executable path.";
    }
    if (code === "EACCES" || code === "EPERM") {
      if (isWindowsAppsLaunchLikely()) {
        return "The resolved Codex command is the WindowsApps Codex Desktop executable, which may be blocked from subprocess launch. Use manual handoff, or set IMAGE_COCKPIT_CODEX_COMMAND to a terminal-runnable Codex CLI or wrapper.";
      }
      return "Check that the configured Codex command can run from this shell, or set IMAGE_COCKPIT_CODEX_COMMAND to a runnable executable path.";
    }
  }

  return "Set IMAGE_COCKPIT_CODEX_COMMAND to a runnable Codex CLI path, or set IMAGE_COCKPIT_CODEX_AUTORUN=0 for manual handoff.";
}

function resolveCommandCandidates(command: string) {
  const hasPathSeparator = command.includes("/") || command.includes("\\");
  const commandNames = commandHasExtension(command) ? [command] : commandExtensions().map((extension) => `${command}${extension}`);
  const dirs = hasPathSeparator ? [""] : (process.env.PATH ?? "").split(delimiter).filter(Boolean);
  const candidates: string[] = [];

  dirs.forEach((dir) => {
    commandNames.forEach((name) => {
      const candidate = hasPathSeparator ? resolve(name) : join(dir, name);
      if (existsSync(candidate)) candidates.push(candidate);
    });
  });

  return Array.from(new Set([...candidates, ...knownCodexCliCandidates(command)]));
}

function selectCodexLaunchCommand(command: string, candidates: string[]) {
  if (command.includes("/") || command.includes("\\") || !isCodexCommandName(command)) return command;
  return candidates.find(isLocalOpenAiCodexCliCommand) ?? candidates.find((candidate) => !isWindowsAppsCodexCommand(candidate)) ?? command;
}

function knownCodexCliCandidates(command: string) {
  if (!isCodexCommandName(command)) return [];
  const roots = [process.env.LOCALAPPDATA, process.env.USERPROFILE ? join(process.env.USERPROFILE, "AppData", "Local") : ""]
    .filter(Boolean)
    .map((root) => join(root as string, "OpenAI", "Codex", "bin"));
  const candidates: string[] = [];

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

function commandHasExtension(command: string) {
  return Boolean(extname(command));
}

function isCodexCommandName(command: string) {
  return /^codex(?:\.exe)?$/i.test(command);
}

function isLocalOpenAiCodexCliCommand(candidate: string) {
  return /[\\/]AppData[\\/]Local[\\/]OpenAI[\\/]Codex[\\/]bin[\\/][^\\/]+[\\/]codex(?:\.exe)?$/i.test(candidate);
}

function isWindowsAppsCodexCommand(candidate: string) {
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

function buildCodexRunnerPrompt(job: { id: string; path: string }) {
  return [
    "You are processing an Image Cockpit for Codex Workflows handoff job.",
    "",
    `Read this local JSON job file: ${job.path}`,
    "If selectedImage.assetPath is populated, inspect that source image before editing it.",
    "If selectedImage.assetPath is empty, treat the job as prompt-only unless the job notes say otherwise.",
    "For workflowMode=image-generate, use the imagegen skill default built-in image generation path with built-in image_gen when available. Create a real raster image from the job prompt, never a procedural placeholder or SVG.",
    "For workflowMode=image-generate, if image generation is unavailable, write only a small blocker sidecar into the outbox and do not create a fake image.",
    "For workflowMode=image-edit, inspect selectedImage.assetPath, use imagegen / built-in image_gen editing when available, follow numbered annotationContext region comments plus prompt/jobNotes, and return a real edited PNG or WebP with the job id filename prefix. Never create a procedural placeholder or SVG.",
    "For workflowMode=sprite-generate, inspect selectedImage.assetPath, then use imagegen / built-in image_gen when available to create one complete chroma-key sprite sheet from the source character image. Never create a procedural placeholder or SVG.",
    "For workflowMode=sprite-generate, follow spriteContext.grid, spriteContext.cell, spriteContext.directions, and spriteContext.chromaKey exactly. Keep one full-body character centered inside each strict cell with padding, no cropping, no duplicated heads, and no body parts crossing cells. Return one usable PNG or WebP sprite sheet with the job id filename prefix.",
    "For workflowMode=sprite-generate, inspect all cells before writing the final file and retry if any head is cut off, feet are missing, a head appears below feet, scale changes wildly, or the background is not flat chroma key.",
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
    "- If image generation/editing is blocked by safety, policy, or unavailable imagegen capability, do not create a placeholder image.",
    "- Write a small JSON blocker sidecar only, using this schema:",
    '{ "status": "blocked", "reasonKind": "policy_or_safety" | "imagegen_unavailable" | "unknown", "userMessage": "A short user-safe reason.", "suggestion": "A short retry suggestion." }',
    "- Do not include hidden policy text, internal traces, API keys, access tokens, local absolute paths, or the full prompt in the blocker sidecar.",
    "",
    "When finished, make sure at least one usable image file is present in the outbox if generation/editing succeeded."
  ].join("\n");
}

async function writeRunnerStatus(status: CodexRunnerStatus) {
  const enrichedStatus = await enrichRunnerStatus(status);
  runnerStatuses.set(enrichedStatus.jobId, enrichedStatus);
  const statusPath = enrichedStatus.statusPath ?? join(statusDir, `${enrichedStatus.jobId}.json`);
  await writeFile(statusPath, JSON.stringify(enrichedStatus, null, 2), "utf8");
}

async function getRunnerStatus(jobId: string): Promise<CodexRunnerStatus> {
  const liveStatus = runnerStatuses.get(jobId);
  if (liveStatus) return enrichRunnerStatus(liveStatus);

  const statusPath = join(statusDir, `${jobId}.json`);
  try {
    return enrichRunnerStatus(JSON.parse(await readFile(statusPath, "utf8")) as CodexRunnerStatus);
  } catch {
    return enrichRunnerStatus({
      jobId,
      state: "unknown",
      message: "No runner status has been recorded for this job.",
      statusPath
    });
  }
}

async function enrichRunnerStatus(status: CodexRunnerStatus): Promise<CodexRunnerStatus> {
  if (!shouldBuildDiagnostic(status)) return status;
  const diagnostic = await getJobDiagnostic(status);
  if (diagnostic) return { ...status, diagnostic };
  const statusWithoutDiagnostic = { ...status };
  delete statusWithoutDiagnostic.diagnostic;
  return statusWithoutDiagnostic;
}

function shouldBuildDiagnostic(status: CodexRunnerStatus) {
  return status.state === "failed" || status.state === "unavailable" || status.state === "completed" || status.state === "unknown";
}

async function getJobDiagnostic(status: CodexRunnerStatus): Promise<CodexJobDiagnostic | null> {
  const [sidecar, logText, hasReturnedImage] = await Promise.all([
    findJobSidecar(status.jobId),
    readShortFile(status.logPath),
    hasOutboxImageForJob(status.jobId)
  ]);
  if (status.state === "completed" && hasReturnedImage) return null;

  const sidecarKind = normalizeFailureKind(sidecar?.reasonKind);
  const combinedText = [status.message, sidecar?.text, logText].filter(Boolean).join("\n").toLowerCase();
  const kind = sidecarKind ?? classifyFailureKind(status, combinedText, hasReturnedImage);
  if (!kind) return null;

  return {
    ...diagnosticForKind(kind),
    sidecarPath: sidecar?.path,
    logPath: status.logPath
  };
}

function classifyFailureKind(status: CodexRunnerStatus, text: string, hasReturnedImage: boolean): CodexFailureKind | null {
  if (matchesAny(text, ["policy", "safety", "content policy", "disallowed", "not allowed", "blocked", "moderation", "cannot comply", "can't help"])) {
    return "policy_or_safety";
  }
  if (matchesAny(text, ["imagegen unavailable", "image generation unavailable", "built-in image_gen unavailable", "tool unavailable", "image_gen unavailable"])) {
    return "imagegen_unavailable";
  }
  if (status.state === "completed" && !hasReturnedImage) return "no_image_returned";
  if (status.state === "failed" || status.state === "unavailable") return "runner_failed";
  if (status.state === "unknown") return "unknown";
  return null;
}

function diagnosticForKind(kind: CodexFailureKind): Omit<CodexJobDiagnostic, "sidecarPath" | "logPath"> {
  if (kind === "policy_or_safety") {
    return {
      kind,
      title: "Generation failed",
      userMessage: "The image could not be generated. It may have been blocked by safety or usage-policy checks.",
      suggestion: "Revise the prompt to remove sensitive, explicit, or disallowed details, then try again."
    };
  }
  if (kind === "imagegen_unavailable") {
    return {
      kind,
      title: "Image generation unavailable",
      userMessage: "Image generation is not available in this Codex environment.",
      suggestion: "Use manual handoff or another local provider, then return an image to the outbox."
    };
  }
  if (kind === "runner_failed") {
    return {
      kind,
      title: "Codex runner failed",
      userMessage: "Codex runner stopped before returning an image.",
      suggestion: "Check the runner setup or retry the job after adjusting the prompt."
    };
  }
  if (kind === "no_image_returned") {
    return {
      kind,
      title: "No image returned",
      userMessage: "Codex runner completed, but no returned image was found.",
      suggestion: "Retry the job, or place a returned image with the job id prefix in the outbox."
    };
  }
  return {
    kind,
    title: "Generation failed",
    userMessage: "The image could not be generated, and no specific reason was returned.",
    suggestion: "Retry with a simpler prompt or use manual handoff."
  };
}

async function findJobSidecar(jobId: string) {
  try {
    const entries = await readdir(outboxDir, { withFileTypes: true });
    const candidates = entries
      .filter((entry) => entry.isFile())
      .filter((entry) => entry.name.startsWith(`${jobId}-`) || entry.name.startsWith(`${jobId}.`))
      .filter((entry) => [".json", ".md", ".txt"].includes(extname(entry.name).toLowerCase()))
      .sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of candidates) {
      const path = join(outboxDir, entry.name);
      const text = await readShortFile(path);
      if (!text) continue;
      return {
        path,
        text,
        reasonKind: readSidecarReasonKind(entry.name, text)
      };
    }
  } catch {
    // Missing or unreadable sidecars should not block runner status.
  }
  return null;
}

function readSidecarReasonKind(name: string, text: string) {
  if (extname(name).toLowerCase() !== ".json") return undefined;
  try {
    const parsed = JSON.parse(text) as { reasonKind?: unknown; kind?: unknown };
    return typeof parsed.reasonKind === "string" ? parsed.reasonKind : typeof parsed.kind === "string" ? parsed.kind : undefined;
  } catch {
    return undefined;
  }
}

async function hasOutboxImageForJob(jobId: string) {
  try {
    const entries = await readdir(outboxDir, { withFileTypes: true });
    return entries.some(
      (entry) =>
        entry.isFile() &&
        entry.name.startsWith(`${jobId}-`) &&
        Boolean(mimeTypeForImage(entry.name))
    );
  } catch {
    return false;
  }
}

async function readShortFile(path?: string) {
  if (!path) return "";
  try {
    return (await readFile(path, "utf8")).slice(0, 32768);
  } catch {
    return "";
  }
}

function normalizeFailureKind(value: unknown): CodexFailureKind | null {
  if (
    value === "policy_or_safety" ||
    value === "imagegen_unavailable" ||
    value === "runner_failed" ||
    value === "no_image_returned" ||
    value === "unknown"
  ) {
    return value;
  }
  return null;
}

function matchesAny(value: string, markers: string[]) {
  return markers.some((marker) => value.includes(marker));
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
