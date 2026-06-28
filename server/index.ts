import { spawn } from "node:child_process";
import { closeSync, createWriteStream, existsSync, openSync, readFileSync, readSync, readdirSync } from "node:fs";
import { copyFile, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { delimiter, extname, join, resolve, sep } from "node:path";
import { generateLocalImages, type LocalGenerationRequest } from "./local-generator.js";

loadDotEnv(resolve(".env"));

const port = Number(process.env.IMAGE_COCKPIT_API_PORT ?? 8787);
const handoffRoot = resolve(process.env.IMAGE_COCKPIT_HANDOFF_DIR ?? "codex-handoff");
const inboxDir = join(handoffRoot, "inbox");
const outboxDir = join(handoffRoot, "outbox");
const tournamentWorkRootDir = join(outboxDir, ".tournaments");
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
const runnerStaleTimeoutMs = parsePositiveNumber("IMAGE_COCKPIT_CODEX_STALE_MS", 15 * 60 * 1000);
const runnerStaleLogIdleMs = parsePositiveNumber("IMAGE_COCKPIT_CODEX_STALE_LOG_IDLE_MS", 5 * 60 * 1000);
const runnerLogTailDefaultBytes = 24 * 1024;
const runnerLogTailMaxBytes = 96 * 1024;
const resultRoutePrefix = "/api/codex/results/";
const runnerPreflightTimeoutMs = 4000;
const directionSplitSlugs = ["front", "front-three-quarter", "side", "back-three-quarter", "back"];
const directionSplitNames = ["front", "front three-quarter", "side", "back three-quarter", "back"];
const directionSplitManifestSchema = "image-cockpit.direction-split-animation.v1";
const artifactStableMs = parsePositiveNumber("IMAGE_COCKPIT_ARTIFACT_STABLE_MS", 1500);

const runnerStatuses = new Map<string, CodexRunnerStatus>();
const runnerProcesses = new Map<string, ReturnType<typeof spawn>>();
const cancellingRunnerJobIds = new Set<string>();

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
  spriteVariant?: string;
  directions?: unknown;
  tournamentId?: string;
  tournamentCandidateIndex?: number;
  tournamentCandidateCount?: number;
};

type CodexWorkflowMode = "image-generate" | "image-edit" | "sprite-generate" | "sprite-edit";
type CodexRunnerState = "running" | "completed" | "failed" | "unavailable" | "disabled" | "unknown";
type CodexRunnerPreflightState = "ready" | "disabled" | "unavailable";
type CodexFailureKind =
  | "policy_or_safety"
  | "usage_limit"
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
  outboxDir?: string;
  diagnostic?: CodexJobDiagnostic;
};

type CodexArtifactQuality = "gold" | "silver" | "bronze" | "blocked" | "waiting";

type CodexResultQualityClassification =
  | "usable-final"
  | "quality-failed"
  | "quarantined-candidate"
  | "debug-artifact"
  | "running"
  | "failed";

type CodexResultQualityGate = {
  classification: CodexResultQualityClassification;
  reason: string;
  code?: string;
  historyAllowed: boolean;
  downloadAllowed: boolean;
  retryable: boolean;
  warnings?: string[];
};

type CodexResultQualityGateRequest = {
  classification?: unknown;
  reason?: unknown;
  code?: unknown;
  warnings?: unknown;
};

type CodexArtifactStatus = {
  jobId: string;
  artifactKind: "direction-split";
  detected: boolean;
  ready: boolean;
  verified: boolean;
  quality: CodexArtifactQuality;
  reason: string;
  missingDirections: string[];
  warnings: string[];
  files: string[];
  manifestName?: string;
  stable: boolean;
  candidateCount: number;
  qualityGate?: CodexResultQualityGate;
  chromaKey?: {
    expected?: string;
    manifest?: string;
    warning?: string;
  };
};

type DirectionSplitCandidateFile = {
  slug: string;
  name: string;
  finalName: string;
  path: string;
  size: number;
  mtimeMs: number;
  modifiedAt: string;
  fromStaging: boolean;
};

type DirectionSplitSourceManifest = {
  path: string;
  name: string;
  parsed: Record<string, unknown>;
  mtimeMs: number;
  fromStaging: boolean;
} | null;

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

    if (request.method === "GET" && pathname === "/api/health") {
      const runner = await checkCodexRunnerPreflight();
      sendJson(response, 200, {
        app: "image-cockpit",
        version: "0.1.1",
        role: "api",
        port,
        handoffRoot,
        inboxReadable: await isDirectoryReadable(inboxDir),
        outboxReadable: await isDirectoryReadable(outboxDir),
        statusReadable: await isDirectoryReadable(statusDir),
        logsReadable: await isDirectoryReadable(logsDir),
        runner: {
          state: runner.state,
          message: runner.message,
          checkedAt: runner.checkedAt,
          autorun: runner.autorun
        }
      });
      return;
    }

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

    const jobCancelMatch = pathname.match(/^\/api\/codex\/jobs\/([^/]+)\/cancel$/);
    if (request.method === "POST" && jobCancelMatch) {
      const jobId = decodeURIComponent(jobCancelMatch[1]);
      if (!isSafeJobId(jobId)) {
        sendJson(response, 400, { error: "Unsupported or unsafe job id" });
        return;
      }
      sendJson(response, 200, await cancelCodexRunner(jobId));
      return;
    }

    const jobLogMatch = pathname.match(/^\/api\/codex\/jobs\/([^/]+)\/log$/);
    if (request.method === "GET" && jobLogMatch) {
      const jobId = decodeURIComponent(jobLogMatch[1]);
      if (!isSafeJobId(jobId)) {
        sendJson(response, 400, { error: "Unsupported or unsafe job id" });
        return;
      }
      const requestedBytes = Number(requestUrl.searchParams.get("bytes") ?? runnerLogTailDefaultBytes);
      sendJson(response, 200, await readRunnerLogTail(jobId, requestedBytes));
      return;
    }

    const qualityGateMatch = pathname.match(/^\/api\/codex\/artifacts\/([^/]+)\/quality-gate$/);
    if (request.method === "POST" && qualityGateMatch) {
      const jobId = decodeURIComponent(qualityGateMatch[1]);
      if (!isSafeJobId(jobId)) {
        sendJson(response, 400, { error: "Unsupported or unsafe job id" });
        return;
      }
      const gate = qualityGateFromRequest((await readJson(request)) as CodexResultQualityGateRequest);
      const writeResult = await writeDirectionSplitQualityGate(jobId, gate);
      sendJson(response, 200, writeResult);
      return;
    }

    if (request.method === "GET" && pathname === "/api/codex/results") {
      const requestedLimit = Number(requestUrl.searchParams.get("limit") ?? 20);
      const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(Math.floor(requestedLimit), 1), 200) : 20;
      sendJson(response, 200, {
        outboxPath: outboxDir,
        results: (await listOutboxResults()).slice(0, limit)
      });
      return;
    }

    const jobResultsMatch = pathname.match(/^\/api\/codex\/jobs\/([^/]+)\/results$/);
    if (request.method === "GET" && jobResultsMatch) {
      const jobId = decodeURIComponent(jobResultsMatch[1]);
      if (!isSafeJobId(jobId)) {
        sendJson(response, 400, { error: "Unsupported or unsafe job id" });
        return;
      }
      const jobOutboxDir = await resolveJobOutboxDir(jobId);
      if (!jobOutboxDir) {
        sendJson(response, 404, { error: "Job outbox was not found" });
        return;
      }
      const requestedLimit = Number(requestUrl.searchParams.get("limit") ?? 20);
      const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(Math.floor(requestedLimit), 1), 200) : 20;
      sendJson(response, 200, {
        outboxPath: jobOutboxDir,
        results: (await listOutboxResults(jobOutboxDir)).slice(0, limit)
      });
      return;
    }

    if (request.method === "GET" && pathname.startsWith(resultRoutePrefix)) {
      const name = decodeURIComponent(pathname.slice(resultRoutePrefix.length));
      const filePath = resolveOutboxFile(name);
      const mimeType = mimeTypeForOutboxResult(name);
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

    const jobResultFileMatch = pathname.match(/^\/api\/codex\/jobs\/([^/]+)\/results\/(.+)$/);
    if (request.method === "GET" && jobResultFileMatch) {
      const jobId = decodeURIComponent(jobResultFileMatch[1]);
      const name = decodeURIComponent(jobResultFileMatch[2]);
      if (!isSafeJobId(jobId)) {
        sendJson(response, 400, { error: "Unsupported or unsafe job id" });
        return;
      }
      const jobOutboxDir = await resolveJobOutboxDir(jobId);
      const filePath = jobOutboxDir ? resolveOutboxFileInDir(jobOutboxDir, name) : null;
      const mimeType = mimeTypeForOutboxResult(name);
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

    const tournamentWinnerMatch = pathname.match(/^\/api\/codex\/tournaments\/([^/]+)\/winner$/);
    if (request.method === "POST" && tournamentWinnerMatch) {
      const tournamentId = decodeURIComponent(tournamentWinnerMatch[1]);
      const body = (await readJson(request)) as { jobId?: unknown };
      const jobId = typeof body.jobId === "string" ? body.jobId : "";
      if (!isSafeTournamentId(tournamentId) || !isSafeJobId(jobId)) {
        sendJson(response, 400, { error: "Unsupported or unsafe tournament winner request" });
        return;
      }
      const result = await publishTournamentWinner(tournamentId, jobId);
      sendJson(response, 200, result);
      return;
    }

    if (request.method === "POST" && pathname === "/api/codex/jobs") {
      const body = (await readJson(request)) as CodexJobRequest;
      if (!body.prompt?.trim()) {
        sendJson(response, 400, { error: "Prompt is required for a Codex handoff job" });
        return;
      }

      const createdAt = new Date().toISOString();
      const id = createCodexJobId(createdAt);
      const workflowMode = normalizeWorkflowMode(body.workflowMode);
      const includeSelectedImage = workflowUsesSelectedImage(workflowMode);
      const includeSpriteContext = workflowUsesSpriteContext(workflowMode);
      const includeAnnotations = workflowMode === "image-edit";
      const tournamentId = resolveTournamentIdForJobRequest(workflowMode, body);
      const jobOutboxDir = tournamentId ? tournamentJobOutboxDir(tournamentId, id) : outboxDir;
      if (tournamentId) await mkdir(jobOutboxDir, { recursive: true });
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
          coordinateSpace: "Image Cockpit canvas coordinates plus source image normalized and pixel rectangles",
          canvasSize: { width: 920, height: 520 }
        },
        spriteContext: {
          action: includeSpriteContext ? body.action ?? "" : "",
          frames: includeSpriteContext ? body.frames ?? 0 : 0,
          grid: includeSpriteContext ? body.grid ?? null : null,
          cell: includeSpriteContext ? body.cell ?? null : null,
          chromaKey: includeSpriteContext ? body.chromaKey ?? "" : "",
          variant: includeSpriteContext ? body.spriteVariant ?? "standard" : "",
          directions: includeSpriteContext && Array.isArray(body.directions) ? body.directions : []
        },
        tournament: tournamentId
          ? {
              id: tournamentId,
              candidateIndex: normalizeCandidateIndex(body.tournamentCandidateIndex),
              candidateCount: normalizeCandidateCount(body.tournamentCandidateCount),
              hiddenOutbox: true
            }
          : undefined,
        returnTo: {
          outboxDir: jobOutboxDir,
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
      const runner = await startCodexRunner({ id, createdAt, path, outboxDir: jobOutboxDir });
      sendJson(response, 200, { id, path, inboxPath: inboxDir, outboxPath: jobOutboxDir, createdAt, runner });
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
  await mkdir(join(outboxDir, ".staging"), { recursive: true });
  await mkdir(tournamentWorkRootDir, { recursive: true });
  await mkdir(assetsDir, { recursive: true });
  await mkdir(statusDir, { recursive: true });
  await mkdir(logsDir, { recursive: true });
}

async function isDirectoryReadable(path: string) {
  try {
    await readdir(path);
    return true;
  } catch {
    return false;
  }
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
    "If built-in imagegen / image_gen is unavailable, do not create any procedural, SVG, canvas, diagram, geometric, or placeholder image. Return a blocked JSON sidecar with reasonKind=imagegen_unavailable instead. If image generation/editing is blocked by safety or policy, do not create a placeholder image. Write only a small JSON sidecar with status=blocked, reasonKind, userMessage, and suggestion.";
  if (mode === "image-edit") {
    return [
      "Use selectedImage.assetPath as the source image when present.",
      "Use imagegen / built-in image_gen editing when available so the result is a real edited raster image.",
      "Use annotationContext.annotations, numbered region comments, prompt, and jobNotes as the user's edit instructions.",
      "Use annotationContext.annotations[].imageRectNormalized and imageRectPixels when present to target the source image region, while retaining the original canvas coordinate rect for visual context.",
      "Preserve the original canvas size and aspect ratio. Do not zoom in, crop, or reframe the image into a portrait/detail shot.",
      "Keep the full character visible, including head, hair, hands, equipment, and both feet.",
      "Treat selectedImage.assetPath as the exact base image to edit, not inspiration for a new variant.",
      "Preserve transparency when present; if transparency cannot be preserved, use a flat chroma fallback background.",
      "Preserve unrelated pixels when possible, change only requested regions, and return the edited image as a real PNG or WebP with the job id filename prefix.",
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
      "The default direction-row order is front, front three-quarter, side, back three-quarter, back.",
      "Every cell must contain exactly one full-body character with head, hair, hands, equipment, and both feet visible, centered with at least 10% inner padding.",
      "Reject and retry the sprite sheet if any cell has a cropped head, missing feet, multiple heads, a head below the feet, inconsistent scale, body fragments, or a different character.",
      "Use the requested chroma-key background color as a flat simple background in every cell so Image Cockpit can remove it after import.",
      "For standard direction-split output, keep every intermediate, source, QA, and candidate file under outbox/.staging/<job-id>/ or another non-root work folder while work is still in progress. Do not write, copy, or manifest any root outbox <job-id>-*.png or <job-id>-manifest.json until all five directions are normalized, self-checked, and no further regeneration is planned. The final step must publish only the five final direction PNG/WebP files plus the final manifest into the root outbox, with the manifest written last. Keep *-qa.json, work files, temporary files, contact sheets, comparison sheets, and debug images outside the root.",
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
    "For character or creature assets, keep the full body inside the image with clear transparent or chroma-key padding around the head, hair, hands, props, and both feet; reject and retry if the subject is cropped by the canvas edge.",
    "Create a real raster image. Do not create a procedural placeholder, SVG, diagram, or text-only result.",
    "Avoid readable text, logos, watermarks, labels, UI words, and numbers unless the user explicitly asks for them.",
    "If the first result contains unwanted text or numbers, retry once with stricter no-text/no-number constraints.",
    "Write the final image with the job id prefix. If you include notes, prefer a short Markdown sidecar and do not place *-qa.json, work files, temporary files, contact sheets, comparison sheets, or debug images in the outbox root.",
    blockerSidecarNote,
    "This is a text-to-image style generation job. Do not treat the current UI sample image as a source image unless selectedImage.assetPath is populated.",
    "Use prompt, negativePrompt, generationHints, and jobNotes as the generation brief."
  ];
}

async function startCodexRunner(job: { id: string; createdAt: string; path: string; outboxDir: string }) {
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
    logPath,
    outboxDir: job.outboxDir
  };
  runnerStatuses.set(job.id, status);
  await writeRunnerStatus(status);

  const logStream = createWriteStream(logPath, { flags: "a" });
  const prompt = buildCodexRunnerPrompt(job);
  logStream.write(`[${startedAt}] Starting ${codexLaunchCommand} exec for ${job.id}\n`);
  logStream.write(`Job path: ${job.path}\n`);
  logStream.write(`Outbox: ${job.outboxDir}\n\n`);

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
          IMAGE_COCKPIT_OUTBOX_DIR: job.outboxDir
        },
        windowsHide: true
      }
    );

    runnerProcesses.set(job.id, child);
    child.stdout.pipe(logStream, { end: false });
    child.stderr.pipe(logStream, { end: false });
    child.stdin.on("error", () => {
      // Spawn errors are captured by the child error handler; avoid noisy EPIPE crashes.
    });
    child.stdin.end(prompt, "utf8");

    child.on("error", (error: NodeJS.ErrnoException) => {
      if (settled) return;
      settled = true;
      runnerProcesses.delete(job.id);
      cancellingRunnerJobIds.delete(job.id);
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
      runnerProcesses.delete(job.id);
      const wasCancelled = cancellingRunnerJobIds.delete(job.id);
      const finishedAt = new Date().toISOString();
      const completedStatus: CodexRunnerStatus = {
        ...status,
        state: wasCancelled ? "failed" : exitCode === 0 ? "completed" : "failed",
        message: wasCancelled ? "Codex runner cancelled after an animation tournament winner was chosen." : exitCode === 0 ? "Codex exec completed" : `Codex exec exited with code ${exitCode}`,
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

function parsePositiveNumber(envKey: string, fallback: number) {
  const rawValue = process.env[envKey];
  if (!rawValue) return fallback;
  const parsed = Number(rawValue);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
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

function buildCodexRunnerPrompt(job: { id: string; path: string; outboxDir: string }) {
  return [
    "You are processing an Image Cockpit for Codex Workflows handoff job.",
    "",
    `Read this local JSON job file: ${job.path}`,
    "If selectedImage.assetPath is populated, inspect that source image before editing it.",
    "If selectedImage.assetPath is empty, treat the job as prompt-only unless the job notes say otherwise.",
    "Trust the job JSON as the generation contract. Do not perform broad repository audits or read unrelated project docs/source files when the job prompt and jobNotes already provide the needed contract.",
    "On Windows, do not use System.Drawing for image inspection because it may be unavailable. Use Python/Pillow, PNG header bytes, or another local image tool instead.",
    "For workflowMode=image-generate, use the imagegen skill default built-in image generation path with built-in image_gen when available. Create a real raster image from the job prompt, never a procedural placeholder and never a procedural, SVG, canvas, diagram, geometric, or placeholder image.",
    "For workflowMode=image-generate, if built-in imagegen / image_gen is unavailable, write only a small blocked JSON sidecar into the outbox with reasonKind=imagegen_unavailable and do not create a fake image.",
    "For workflowMode=image-edit, inspect selectedImage.assetPath, use imagegen / built-in image_gen editing when available, follow numbered annotationContext region comments plus prompt/jobNotes, use imageRectNormalized/imageRectPixels when present, preserve the original canvas size/aspect ratio, keep the full character including head, hair, hands, equipment, and both feet visible, do not zoom, crop, or reframe into a portrait/detail shot, preserve transparency or use a flat chroma fallback, change only requested regions when possible, and return a real edited PNG or WebP with the job id filename prefix. Never create a procedural, SVG, canvas, diagram, geometric, or placeholder image.",
    "For workflowMode=sprite-generate, inspect selectedImage.assetPath, then use imagegen / built-in image_gen when available to create the requested sprite sheet assets from the source character image. Never create a procedural, SVG, canvas, diagram, geometric, or placeholder image.",
    "For workflowMode=sprite-generate, follow spriteContext.grid, spriteContext.cell, spriteContext.directions, spriteContext.variant, and spriteContext.chromaKey exactly. Keep one full-body character centered inside each strict cell with padding, no cropping, no duplicated heads, and no body parts crossing cells.",
    "For workflowMode=sprite-generate with spriteContext.variant=standard, return exactly five separate direction PNG/WebP images using the suffixes front, front-three-quarter, side, back-three-quarter, and back. Each direction image must be 4 columns x 2 rows, 256x256 cells unless spriteContext.cell says otherwise. Do not return only one combined 5x8 sheet.",
    "For standard direction-split output, keep generated direction images, source manifests, contact sheets, comparison sheets, QA files, and all candidates under outbox/.staging/<job-id>/ or another non-root work folder while work is still in progress. Do not write, copy, or manifest root outbox <job-id>-*.png or <job-id>-manifest.json until the complete five-direction set is normalized, self-checked, and no further regeneration is planned. The final runner step must publish only the five final direction PNG/WebP files into the root outbox and write the final <job-id>-manifest.json last. Image Cockpit will verify artifacts after the runner has finished and may rewrite the manifest after completion.",
    "For workflowMode=sprite-generate, inspect all cells before writing the final file and retry if any head is cut off, feet are missing, a head appears below feet, scale changes wildly, or the background is not flat chroma key.",
    "For workflowMode=sprite-generate with spriteContext.variant=hatch-pet, use the installed hatch-pet skill/scripts when available. Build a Codex pet atlas with 8 columns x 9 rows, 192x208 cells, 1536x1872 total, transparent unused cells, contact-sheet QA, and final spritesheet PNG/WebP returned with the job id filename prefix. Include pet.json as a sidecar if produced.",
    "For workflowMode=sprite-generate with spriteContext.variant=directional-hatch-pet, use the installed hatch-pet skill/scripts when available and return exactly five separate Codex pet atlas images: direction-01-front, direction-02-front-three-quarter, direction-03-side, direction-04-back-three-quarter, and direction-05-back. Each atlas must be 8 columns x 9 rows, 192x208 cells, 1536x1872 total, transparent unused cells, and use the job id filename prefix plus the direction suffix. Do not return only one giant combined sheet.",
    "Use jobNotes, annotationContext, and spriteContext only when those fields are populated for the workflow.",
    `Write final image result files only into this outbox directory: ${job.outboxDir}`,
    `Use this filename prefix for returned assets: ${job.id}`,
    "",
    "Important constraints:",
    "- The Image Cockpit app itself must not call OpenAI APIs directly.",
    "- Do not modify project source files, package files, docs, git metadata, or configuration.",
    "- Do not run git status, git diff, git clean, Remove-Item cleanup, or other repository/cleanup commands for this handoff job.",
    "- Do not write API keys, access tokens, model weights, or license-unclear assets.",
    "- If built-in imagegen / image_gen is unavailable in this Codex environment, write no procedural, SVG, canvas, diagram, geometric, or placeholder image.",
    "- Prefer PNG or WebP for still images. If you produce notes, write them as a small Markdown sidecar in the outbox. Do not place *-qa.json, work files, .tmp files, candidate-contact sheets, contact sheets, preview grids, AB galleries, or debug images in the outbox root.",
    "- If image generation/editing is blocked by safety, policy, or unavailable imagegen capability, do not create a placeholder image.",
    "- Write a small JSON blocker sidecar only, using this schema:",
    '{ "status": "blocked", "reasonKind": "policy_or_safety" | "usage_limit" | "imagegen_unavailable" | "unknown", "userMessage": "A short user-safe reason.", "suggestion": "A short retry suggestion." }',
    "- Do not include hidden policy text, internal traces, API keys, access tokens, local absolute paths, or the full prompt in the blocker sidecar.",
    "",
    "When finished, make sure all required usable image files are present in the outbox if generation/editing succeeded."
  ].join("\n");
}

async function writeRunnerStatus(status: CodexRunnerStatus) {
  runnerStatuses.set(status.jobId, status);
  const enrichedStatus = await enrichRunnerStatus(status);
  runnerStatuses.set(enrichedStatus.jobId, enrichedStatus);
  const statusPath = enrichedStatus.statusPath ?? join(statusDir, `${enrichedStatus.jobId}.json`);
  await writeFile(statusPath, JSON.stringify(enrichedStatus, null, 2), "utf8");
}

async function cancelCodexRunner(jobId: string) {
  const currentStatus = await getRunnerStatus(jobId);
  const child = runnerProcesses.get(jobId);
  if (!child) {
    return {
      ok: false,
      jobId,
      status: currentStatus,
      message: currentStatus.state === "running" ? "Runner process is not tracked by this server instance." : "Runner is not running."
    };
  }

  const finishedAt = new Date().toISOString();
  cancellingRunnerJobIds.add(jobId);
  const cancelledStatus: CodexRunnerStatus = {
    ...currentStatus,
    state: "failed",
    message: "Codex runner cancelled after an animation tournament winner was chosen.",
    finishedAt,
    exitCode: null,
    signal: "SIGTERM"
  };
  await writeRunnerStatus(cancelledStatus);
  child.kill("SIGTERM");
  setTimeout(() => {
    if (runnerProcesses.get(jobId) === child) child.kill("SIGKILL");
  }, 5000);
  return {
    ok: true,
    jobId,
    status: cancelledStatus
  };
}

async function getRunnerStatus(jobId: string): Promise<CodexRunnerStatus> {
  const liveStatus = runnerStatuses.get(jobId);
  if (liveStatus) return enrichRunnerStatus(await normalizeRunningStatus(liveStatus));

  const statusPath = join(statusDir, `${jobId}.json`);
  try {
    return enrichRunnerStatus(await normalizeRunningStatus(JSON.parse(await readFile(statusPath, "utf8")) as CodexRunnerStatus));
  } catch {
    return enrichRunnerStatus({
      jobId,
      state: "unknown",
      message: "No runner status has been recorded for this job.",
      statusPath
    });
  }
}

async function normalizeRunningStatus(status: CodexRunnerStatus): Promise<CodexRunnerStatus> {
  if (status.state !== "running") return status;

  const stale = await isRunnerStatusStale(status);
  if (!stale) return status;

  if (await hasOutboxImageForJob(status.jobId, status.outboxDir ?? outboxDir)) {
    return {
      ...status,
      state: "completed",
      message: "Codex returned an image before runner status could be finalized.",
      finishedAt: new Date().toISOString(),
      exitCode: null
    };
  }

  return {
    ...status,
    state: "failed",
    message: "Codex runner timed out after log output stopped; no outbox result was returned.",
    finishedAt: new Date().toISOString(),
    exitCode: null
  };
}

async function isRunnerStatusStale(status: CodexRunnerStatus) {
  if (runnerStaleTimeoutMs <= 0) return false;

  const startedAtMs = status.startedAt ? Date.parse(status.startedAt) : NaN;
  if (!Number.isFinite(startedAtMs)) return false;

  const now = Date.now();
  if (now - startedAtMs < runnerStaleTimeoutMs) return false;

  if (!status.logPath) return true;

  try {
    const logStats = await stat(status.logPath);
    return now - logStats.mtimeMs >= runnerStaleLogIdleMs;
  } catch {
    return true;
  }
}

async function isRunnerStatusActivelyRunning(jobId: string) {
  let status = runnerStatuses.get(jobId);
  if (!status) {
    try {
      status = JSON.parse(await readFile(join(statusDir, `${jobId}.json`), "utf8")) as CodexRunnerStatus;
    } catch {
      return false;
    }
  }
  if (status.state !== "running") return false;
  return !(await isRunnerStatusStale(status));
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
  const resultDir = status.outboxDir ?? outboxDir;
  const [sidecar, logText, hasReturnedImage] = await Promise.all([
    findJobSidecar(status.jobId, resultDir),
    readShortFile(status.logPath),
    hasOutboxImageForJob(status.jobId, resultDir)
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
  if (status.state === "completed" && !hasReturnedImage) return "no_image_returned";
  if (
    !hasReturnedImage &&
    matchesAny(text, ["stale", "timed out", "no outbox result", "without returning an outbox image", "no returned image was found"])
  ) {
    return "no_image_returned";
  }
  if (matchesAny(text, ["you've hit your usage limit", "you have hit your usage limit", "hit your usage limit", "usage limit", "upgrade to plus"])) {
    return "usage_limit";
  }
  if (matchesAny(text, ["policy", "safety", "content policy", "disallowed", "not allowed", "blocked", "moderation", "cannot comply", "can't help"])) {
    return "policy_or_safety";
  }
  if (matchesAny(text, ["imagegen unavailable", "image generation unavailable", "built-in image_gen unavailable", "tool unavailable", "image_gen unavailable"])) {
    return "imagegen_unavailable";
  }
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
  if (kind === "usage_limit") {
    return {
      kind,
      title: "Codex usage limit reached",
      userMessage: "Codex runner could not start generation because this Codex environment has reached its usage limit.",
      suggestion: "Wait until the reset time shown in the Codex log, then retry the job."
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
      userMessage: "Codex runner finished or stopped, but no returned image was found.",
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

async function findJobSidecar(jobId: string, resultDir = outboxDir) {
  try {
    const entries = await readdir(resultDir, { withFileTypes: true });
    const candidates = entries
      .filter((entry) => entry.isFile())
      .filter((entry) => isJobOutboxFileName(jobId, entry.name))
      .filter((entry) => !shouldIgnoreOutboxResultName(entry.name))
      .filter((entry) => !isDirectionSplitManifestFileName(entry.name))
      .filter((entry) => [".json", ".md", ".txt"].includes(extname(entry.name).toLowerCase()))
      .sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of candidates) {
      const path = join(resultDir, entry.name);
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

async function hasOutboxImageForJob(jobId: string, resultDir = outboxDir) {
  try {
    const directionSplitArtifact = await inspectDirectionSplitArtifact(jobId, resultDir);
    if (directionSplitArtifact.detected) {
      const classification = directionSplitArtifact.qualityGate?.classification;
      return (
        directionSplitArtifact.ready ||
        directionSplitArtifact.files.length > 0 ||
        directionSplitArtifact.quality === "bronze" ||
        classification === "quality-failed" ||
        classification === "quarantined-candidate"
      );
    }

    const entries = await readdir(resultDir, { withFileTypes: true });
    const names = entries
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .filter((name) => isJobOutboxFileName(jobId, name))
      .filter((name) => !shouldIgnoreOutboxResultName(name));
    return names.some((name) => Boolean(mimeTypeForImage(name)) && !isDirectionSplitDirectionFileName(name, jobId));
  } catch {
    return false;
  }
}

function isJobOutboxFileName(jobId: string, name: string) {
  return name.startsWith(`${jobId}-`) || name.startsWith(`${jobId}.`);
}

function hasCompleteDirectionSplitOutboxFileSet(names: string[], jobId: string) {
  if (!names.some((name) => isDirectionSplitManifestFileName(name) && name === `${jobId}-manifest.json`)) return false;
  return directionSplitSlugs.every((slug) => names.some((name) => isDirectionSplitDirectionFileName(name, jobId, slug)));
}

function isDirectionSplitDirectionFileName(name: string, jobId: string, expectedSlug?: string) {
  if (!mimeTypeForImage(name)) return false;
  const normalized = name
    .toLowerCase()
    .replace(/\.[^.]+$/, "")
    .replace(jobId.toLowerCase(), "")
    .replace(/[_\s]+/g, "-")
    .replace(/^-+/, "");
  return expectedSlug
    ? normalized === expectedSlug
    : directionSplitSlugs.some((slug) => normalized === slug);
}

function directionSplitJobIdFromFileName(name: string) {
  const lowerName = name.toLowerCase();
  if (lowerName.endsWith("-manifest.json")) {
    const jobId = name.replace(/-manifest\.json$/i, "");
    return isSafeJobId(jobId) ? jobId : null;
  }
  const baseName = name.replace(/\.[^.]+$/, "");
  const matchedSlug = directionSplitSlugs
    .slice()
    .sort((left, right) => right.length - left.length)
    .find((slug) => baseName.toLowerCase().endsWith(`-${slug}`));
  if (!matchedSlug) return null;
  const jobId = baseName.slice(0, -(matchedSlug.length + 1));
  return isSafeJobId(jobId) ? jobId : null;
}

async function inspectAllDirectionSplitArtifacts(resultDir = outboxDir) {
  const jobIds = new Set<string>();
  try {
    const entries = await readdir(resultDir, { withFileTypes: true });
    entries
      .filter((entry) => entry.isFile())
      .map((entry) => directionSplitJobIdFromFileName(entry.name))
      .filter((jobId): jobId is string => Boolean(jobId))
      .forEach((jobId) => jobIds.add(jobId));
  } catch {
    // Missing outbox is handled by ensureHandoffDirs on request entry.
  }

  try {
    const stagingEntries = await readdir(join(resultDir, ".staging"), { withFileTypes: true });
    stagingEntries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .filter(isSafeJobId)
      .forEach((jobId) => jobIds.add(jobId));
  } catch {
    // No staging candidates yet.
  }

  const statuses = await Promise.all(Array.from(jobIds).map((jobId) => inspectDirectionSplitArtifact(jobId, resultDir)));
  return new Map(statuses.filter((status) => status.detected).map((status) => [status.jobId, status]));
}

async function inspectDirectionSplitArtifact(jobId: string, resultDir = outboxDir): Promise<CodexArtifactStatus> {
  const missingDirections: string[] = [];
  const warnings: string[] = [];
  const files: string[] = [];
  const bySlug = new Map<string, DirectionSplitCandidateFile>();
  let sourceManifest: DirectionSplitSourceManifest = null;

  for (const slug of directionSplitSlugs) {
    const candidate = await findDirectionSplitCandidateFile(jobId, slug, resultDir);
    if (candidate) {
      bySlug.set(slug, candidate);
      files.push(candidate.finalName);
    } else {
      missingDirections.push(directionSplitNames[directionSplitSlugs.indexOf(slug)] ?? slug);
    }
  }

  sourceManifest = await findDirectionSplitSourceManifest(jobId, resultDir);
  const detected = bySlug.size > 0 || Boolean(sourceManifest);
  if (!detected) return emptyDirectionSplitArtifactStatus(jobId);

  const candidateCount = bySlug.size + (sourceManifest ? 1 : 0);
  const expectedChromaKey = await readJobExpectedChromaKey(jobId);
  const manifestChromaKey = normalizeChromaKeyValue(readManifestChromaKey(sourceManifest?.parsed));
  const manifestQualityGate = sourceManifest ? qualityGateFromManifest(sourceManifest.parsed) : null;
  const newestCandidateMtimeMs = Math.max(0, ...Array.from(bySlug.values()).map((candidate) => candidate.mtimeMs));
  const manifestQualityGateIsStale =
    sourceManifest &&
    manifestQualityGate &&
    manifestQualityGate.classification !== "usable-final" &&
    newestCandidateMtimeMs > manifestQualityGateRecordedMtimeMs(sourceManifest) + 50;
  const manifestQualityGateWasSuperseded =
    manifestQualityGate &&
    manifestQualityGate.classification !== "usable-final" &&
    isSupersededSoftClientQualityGate(manifestQualityGate);
  const chromaWarning =
    expectedChromaKey && manifestChromaKey && expectedChromaKey !== manifestChromaKey
      ? `manifest chroma key ${manifestChromaKey} differs from pending job chroma key ${expectedChromaKey}`
      : undefined;
  if (chromaWarning) warnings.push(chromaWarning);
  if (manifestQualityGateIsStale) {
    warnings.push("stale manifest quality gate was ignored because newer direction image candidates were detected");
  }
  if (manifestQualityGateWasSuperseded) {
    warnings.push("soft client bbox variation quality gate was rechecked under the current animation QA policy");
  }
  if (manifestQualityGate && !manifestQualityGateIsStale && !manifestQualityGateWasSuperseded && manifestQualityGate.classification !== "usable-final") {
    return {
      jobId,
      artifactKind: "direction-split",
      detected: true,
      ready: false,
      verified: false,
      quality: manifestQualityGate.classification === "quarantined-candidate" ? "bronze" : "blocked",
      reason: manifestQualityGate.reason,
      missingDirections,
      warnings,
      files,
      manifestName: sourceManifest?.name,
      stable: false,
      candidateCount,
      qualityGate: manifestQualityGate,
      chromaKey: {
        expected: expectedChromaKey,
        manifest: manifestChromaKey,
        warning: chromaWarning
      }
    };
  }

  if (missingDirections.length > 0) {
    const reason = `missing ${missingDirections.join(", ")}`;
    return {
      jobId,
      artifactKind: "direction-split",
      detected: true,
      ready: false,
      verified: false,
      quality: "waiting",
      reason,
      missingDirections,
      warnings,
      files,
      manifestName: sourceManifest?.name,
      stable: false,
      candidateCount,
      qualityGate: makeQualityGate("running", reason, "direction-split-missing-directions", false, false, true, warnings),
      chromaKey: {
        expected: expectedChromaKey,
        manifest: manifestChromaKey,
        warning: chromaWarning
      }
    };
  }

  const candidates = directionSplitSlugs.map((slug) => bySlug.get(slug)).filter((candidate): candidate is DirectionSplitCandidateFile => Boolean(candidate));
  const newestMtimeMs = Math.max(...candidates.map((candidate) => candidate.mtimeMs), sourceManifest?.mtimeMs ?? 0);
  const stable = artifactStableMs <= 0 || Date.now() - newestMtimeMs >= artifactStableMs;
  if (!stable) {
    const reason = "waiting for stable verified artifacts";
    return {
      jobId,
      artifactKind: "direction-split",
      detected: true,
      ready: false,
      verified: false,
      quality: "waiting",
      reason,
      missingDirections,
      warnings,
      files,
      manifestName: sourceManifest?.name,
      stable,
      candidateCount,
      qualityGate: makeQualityGate("running", reason, "direction-split-waiting-stable", false, false, true, warnings),
      chromaKey: {
        expected: expectedChromaKey,
        manifest: manifestChromaKey,
        warning: chromaWarning
      }
    };
  }

  const imageInfos = await Promise.all(candidates.map((candidate) => readImageDimensions(candidate.path).then(
    (dimensions) => ({ candidate, dimensions, error: "" }),
    (error) => ({ candidate, dimensions: null, error: error instanceof Error ? error.message : "image decode failed" })
  )));
  const decodeFailures = imageInfos.filter((info) => info.error);
  if (decodeFailures.length > 0) {
    const reason = `raw direction candidate needs review: ${decodeFailures.map((info) => `${info.candidate.slug} ${info.error}`).join("; ")}`;
    return {
      jobId,
      artifactKind: "direction-split",
      detected: true,
      ready: false,
      verified: false,
      quality: "bronze",
      reason,
      missingDirections,
      warnings,
      files,
      manifestName: sourceManifest?.name,
      stable,
      candidateCount,
      qualityGate: makeQualityGate("quarantined-candidate", reason, "raw-direction-decode-failed", false, false, true, warnings),
      chromaKey: {
        expected: expectedChromaKey,
        manifest: manifestChromaKey,
        warning: chromaWarning
      }
    };
  }

  const firstDimensions = imageInfos[0]?.dimensions;
  if (firstDimensions) {
    const mismatched = imageInfos.filter((info) => info.dimensions && (info.dimensions.width !== firstDimensions.width || info.dimensions.height !== firstDimensions.height));
    if (mismatched.length > 0) {
      warnings.push(`direction image dimensions differ: ${mismatched.map((info) => `${info.candidate.slug} ${info.dimensions?.width}x${info.dimensions?.height}`).join(", ")}`);
    }
  }

  const manifestOrderWarning =
    sourceManifest && sourceManifest.mtimeMs < Math.max(...candidates.map((candidate) => candidate.mtimeMs))
      ? "source manifest was older than one or more direction images; server manifest was regenerated"
      : undefined;
  if (manifestOrderWarning) warnings.push(manifestOrderWarning);

  if (await isRunnerStatusActivelyRunning(jobId)) {
    const reason = "waiting for Codex runner to finish finalizing direction artifacts";
    return {
      jobId,
      artifactKind: "direction-split",
      detected: true,
      ready: false,
      verified: false,
      quality: "waiting",
      reason,
      missingDirections,
      warnings,
      files,
      manifestName: sourceManifest?.name,
      stable: true,
      candidateCount,
      qualityGate: makeQualityGate("running", reason, "direction-split-runner-finalizing", false, false, true, warnings),
      chromaKey: {
        expected: expectedChromaKey,
        manifest: manifestChromaKey,
        warning: chromaWarning
      }
    };
  }

  const manifestName = await publishVerifiedDirectionSplitArtifact(jobId, candidates, sourceManifest, expectedChromaKey, warnings, resultDir);
  const reason = warnings.length > 0 ? "server verified with warnings" : "server verified";
  return {
    jobId,
    artifactKind: "direction-split",
    detected: true,
    ready: true,
    verified: true,
    quality: warnings.length > 0 ? "silver" : "gold",
    reason,
    missingDirections,
    warnings,
    files: directionSplitSlugs.map((slug) => `${jobId}-${slug}${extname(bySlug.get(slug)?.finalName ?? ".png") || ".png"}`),
    manifestName,
    stable: true,
    candidateCount,
    qualityGate: makeQualityGate("usable-final", reason, "direction-split-server-verified", true, true, false, warnings),
    chromaKey: {
      expected: expectedChromaKey,
      manifest: manifestChromaKey,
      warning: chromaWarning
    }
  };
}

function emptyDirectionSplitArtifactStatus(jobId: string): CodexArtifactStatus {
  return {
    jobId,
    artifactKind: "direction-split",
    detected: false,
    ready: false,
    verified: false,
    quality: "waiting",
    reason: "no direction split candidate",
    missingDirections: directionSplitNames.slice(),
    warnings: [],
    files: [],
    stable: false,
    candidateCount: 0,
    qualityGate: makeQualityGate("running", "no direction split candidate", "direction-split-not-detected", false, false, true)
  };
}

async function findDirectionSplitCandidateFile(jobId: string, slug: string, resultDir = outboxDir): Promise<DirectionSplitCandidateFile | null> {
  const candidateNames = directionSplitCandidateNames(jobId, slug);
  const stagingDir = join(resultDir, ".staging", jobId);
  const candidates: DirectionSplitCandidateFile[] = [];
  for (const candidateName of candidateNames.outbox) {
    const candidate = await statDirectionSplitCandidate(join(resultDir, candidateName), slug, candidateName, candidateName, false);
    if (candidate) candidates.push(candidate);
  }
  for (const candidateName of candidateNames.staging) {
    const finalName = `${jobId}-${slug}${extname(candidateName) || ".png"}`;
    const candidate = await statDirectionSplitCandidate(join(stagingDir, candidateName), slug, candidateName, finalName, true);
    if (candidate) candidates.push(candidate);
  }
  return candidates.sort(sortDirectionSplitCandidates)[0] ?? null;
}

function sortDirectionSplitCandidates(left: DirectionSplitCandidateFile, right: DirectionSplitCandidateFile) {
  const timeDifference = right.mtimeMs - left.mtimeMs;
  if (Math.abs(timeDifference) > 1) return timeDifference;
  if (left.fromStaging !== right.fromStaging) return left.fromStaging ? -1 : 1;
  return left.name.localeCompare(right.name);
}

function directionSplitCandidateNames(jobId: string, slug: string) {
  const extensions = [".png", ".webp", ".jpg", ".jpeg"];
  const directionIndex = directionSplitSlugs.indexOf(slug) + 1;
  return {
    outbox: extensions.map((extension) => `${jobId}-${slug}${extension}`),
    staging: extensions.flatMap((extension) => [
      `${jobId}-${slug}${extension}`,
      `${slug}${extension}`,
      `direction-${String(directionIndex).padStart(2, "0")}-${slug}${extension}`,
      `direction-${directionIndex}-${slug}${extension}`
    ])
  };
}

async function statDirectionSplitCandidate(path: string, slug: string, name: string, finalName: string, fromStaging: boolean): Promise<DirectionSplitCandidateFile | null> {
  try {
    const fileStat = await stat(path);
    if (!fileStat.isFile()) return null;
    return {
      slug,
      name,
      finalName,
      path,
      size: fileStat.size,
      mtimeMs: fileStat.mtimeMs,
      modifiedAt: fileStat.mtime.toISOString(),
      fromStaging
    };
  } catch {
    return null;
  }
}

async function findDirectionSplitSourceManifest(jobId: string, resultDir = outboxDir): Promise<DirectionSplitSourceManifest> {
  const candidates = [
    { path: join(resultDir, `${jobId}-manifest.json`), name: `${jobId}-manifest.json`, fromStaging: false },
    { path: join(resultDir, ".staging", jobId, `${jobId}-manifest.json`), name: `${jobId}-manifest.json`, fromStaging: true },
    { path: join(resultDir, ".staging", jobId, "manifest.json"), name: "manifest.json", fromStaging: true }
  ];
  const loaded: Array<NonNullable<DirectionSplitSourceManifest>> = [];
  for (const candidate of candidates) {
    try {
      const [text, fileStat] = await Promise.all([readFile(candidate.path, "utf8"), stat(candidate.path)]);
      const parsed = JSON.parse(text) as Record<string, unknown>;
      loaded.push({
        ...candidate,
        parsed,
        mtimeMs: fileStat.mtimeMs
      });
    } catch {
      // Try the next manifest candidate.
    }
  }
  return loaded.sort(sortDirectionSplitManifests)[0] ?? null;
}

function sortDirectionSplitManifests(left: NonNullable<DirectionSplitSourceManifest>, right: NonNullable<DirectionSplitSourceManifest>) {
  const timeDifference = right.mtimeMs - left.mtimeMs;
  if (Math.abs(timeDifference) > 1) return timeDifference;
  if (left.fromStaging !== right.fromStaging) return left.fromStaging ? 1 : -1;
  return left.name.localeCompare(right.name);
}

async function publishVerifiedDirectionSplitArtifact(
  jobId: string,
  candidates: DirectionSplitCandidateFile[],
  sourceManifest: DirectionSplitSourceManifest,
  expectedChromaKey: string | undefined,
  warnings: string[],
  targetDir = outboxDir
) {
  await mkdir(targetDir, { recursive: true });
  for (const candidate of candidates) {
    const targetPath = join(targetDir, candidate.finalName);
    if (resolve(candidate.path) !== resolve(targetPath)) await copyFile(candidate.path, targetPath);
  }

  const manifestName = `${jobId}-manifest.json`;
  const manifestPath = join(targetDir, manifestName);
  const sourceManifestVerified = sourceManifest?.parsed?.serverVerified === true;
  const manifestIsCurrent =
    sourceManifest &&
    !sourceManifest.fromStaging &&
    sourceManifest.name === manifestName &&
    resolve(sourceManifest.path) === resolve(manifestPath) &&
    sourceManifestVerified &&
    sourceManifest.mtimeMs >= Math.max(...candidates.map((candidate) => candidate.mtimeMs));
  if (!manifestIsCurrent) {
    const serverManifest = {
      schema: directionSplitManifestSchema,
      jobId,
      serverVerified: true,
      verifiedAt: new Date().toISOString(),
      quality: warnings.length > 0 ? "silver" : "gold",
      qualityGate: makeQualityGate(
        "usable-final",
        warnings.length > 0 ? "server verified with warnings" : "server verified",
        "direction-split-server-verified",
        true,
        true,
        false,
        warnings
      ),
      warnings,
      directions: directionSplitNames,
      framesPerDirection: 8,
      files: Object.fromEntries(directionSplitSlugs.map((slug, index) => [directionSplitNames[index], `${jobId}-${slug}${extname(candidates[index]?.finalName ?? ".png") || ".png"}`])),
      chromaKey: expectedChromaKey ? { name: expectedChromaKey } : undefined,
      sourceManifest: sourceManifest
        ? {
            name: sourceManifest.name,
            fromStaging: sourceManifest.fromStaging,
            serverRewritten: true
          }
        : undefined
    };
    await writeFile(manifestPath, JSON.stringify(serverManifest, null, 2), "utf8");
  }
  return manifestName;
}

async function readJobExpectedChromaKey(jobId: string) {
  try {
    const text = await readFile(join(inboxDir, `${jobId}.json`), "utf8");
    const parsed = JSON.parse(text) as { spriteContext?: { chromaKey?: unknown } };
    return normalizeChromaKeyValue(parsed.spriteContext?.chromaKey);
  } catch {
    return undefined;
  }
}

function readManifestChromaKey(manifest?: Record<string, unknown>) {
  if (!manifest) return undefined;
  const chromaKey = manifest.chromaKey;
  if (typeof chromaKey === "string") return chromaKey;
  if (chromaKey && typeof chromaKey === "object") {
    const value = chromaKey as Record<string, unknown>;
    return value.name ?? value.color ?? value.hex;
  }
  const image = manifest.image;
  if (image && typeof image === "object") {
    const value = image as Record<string, unknown>;
    return value.background ?? value.chromaKey;
  }
  return manifest.background;
}

function normalizeChromaKeyValue(value: unknown) {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return undefined;
  if (normalized.includes("magenta") || normalized.includes("#ff00ff") || normalized.includes("255,0,255")) return "magenta";
  if (normalized.includes("green") || normalized.includes("#00ff00") || normalized.includes("0,255,0")) return "green";
  return undefined;
}

async function readImageDimensions(path: string) {
  const bytes = await readFile(path);
  if (bytes.length >= 24 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), format: "png" };
  }
  if (bytes.length >= 10 && bytes.subarray(0, 3).toString("ascii") === "GIF") {
    return { width: bytes.readUInt16LE(6), height: bytes.readUInt16LE(8), format: "gif" };
  }
  if (bytes.length >= 30 && bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP") {
    const chunk = bytes.subarray(12, 16).toString("ascii");
    if (chunk === "VP8X") {
      const width = 1 + bytes.readUIntLE(24, 3);
      const height = 1 + bytes.readUIntLE(27, 3);
      return { width, height, format: "webp" };
    }
    if (chunk === "VP8 " && bytes.length >= 30) {
      return { width: bytes.readUInt16LE(26) & 0x3fff, height: bytes.readUInt16LE(28) & 0x3fff, format: "webp" };
    }
    if (chunk === "VP8L" && bytes.length >= 25) {
      const bits = bytes.readUInt32LE(21);
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1, format: "webp" };
    }
  }
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset < bytes.length - 9) {
      if (bytes[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = bytes[offset + 1];
      const length = bytes.readUInt16BE(offset + 2);
      if (marker >= 0xc0 && marker <= 0xc3) {
        return { width: bytes.readUInt16BE(offset + 7), height: bytes.readUInt16BE(offset + 5), format: "jpeg" };
      }
      offset += 2 + length;
    }
  }
  throw new Error("unsupported or unreadable image header");
}

async function readShortFile(path?: string) {
  if (!path) return "";
  try {
    return (await readFile(path, "utf8")).slice(0, 32768);
  } catch {
    return "";
  }
}

async function readRunnerLogTail(jobId: string, requestedBytes: number) {
  const logPath = join(logsDir, `${jobId}.log`);
  const bytesToRead = clampRunnerLogBytes(requestedBytes);
  const readAt = new Date().toISOString();

  try {
    const logStats = await stat(logPath);
    const fileSize = logStats.size;
    const readLength = Math.min(bytesToRead, fileSize);
    const start = Math.max(0, fileSize - readLength);
    const buffer = Buffer.alloc(readLength);
    const fd = openSync(logPath, "r");
    try {
      readSync(fd, buffer, 0, readLength, start);
    } finally {
      closeSync(fd);
    }

    return {
      jobId,
      exists: true,
      path: logPath,
      size: fileSize,
      modifiedAt: logStats.mtime.toISOString(),
      readAt,
      truncated: start > 0,
      text: sanitizeRunnerLogText(buffer.toString("utf8"))
    };
  } catch {
    return {
      jobId,
      exists: false,
      path: logPath,
      size: 0,
      modifiedAt: "",
      readAt,
      truncated: false,
      text: ""
    };
  }
}

function clampRunnerLogBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return runnerLogTailDefaultBytes;
  return Math.min(Math.max(Math.floor(value), 1024), runnerLogTailMaxBytes);
}

function sanitizeRunnerLogText(text: string) {
  const userProfile = process.env.USERPROFILE ?? "";
  const shortenedRoots = [
    [userProfile, "~"],
    [handoffRoot, "<handoff>"]
  ] as const;
  let sanitized = text.replace(/\u001b\[[0-9;]*m/g, "");
  for (const [from, to] of shortenedRoots) {
    if (!from) continue;
    sanitized = sanitized.split(from).join(to);
  }
  sanitized = sanitized
    .split(/\r?\n/)
    .slice(-240)
    .map((line) => {
      const cleanLine = line.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "");
      return cleanLine.length > 720 ? `${cleanLine.slice(0, 720)} ...[truncated]` : cleanLine;
    })
    .join("\n");
  return sanitized.trimEnd();
}

function normalizeFailureKind(value: unknown): CodexFailureKind | null {
  if (
    value === "policy_or_safety" ||
    value === "usage_limit" ||
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

function makeQualityGate(
  classification: CodexResultQualityClassification,
  reason: string,
  code: string = classification,
  historyAllowed = classification === "usable-final",
  downloadAllowed = classification === "usable-final",
  retryable = classification !== "usable-final",
  warnings?: string[]
): CodexResultQualityGate {
  return {
    classification,
    reason,
    code,
    historyAllowed,
    downloadAllowed,
    retryable,
    warnings: warnings && warnings.length > 0 ? warnings : undefined
  };
}

function qualityGateFromManifest(manifest: Record<string, unknown>) {
  const explicitGate = manifest.qualityGate;
  if (explicitGate && typeof explicitGate === "object") {
    const gate = explicitGate as Partial<CodexResultQualityGate>;
    const classification = normalizeQualityClassification(gate.classification);
    if (classification) {
      return makeQualityGate(
        classification,
        typeof gate.reason === "string" && gate.reason.trim() ? gate.reason : qualityGateDefaultReason(classification),
        typeof gate.code === "string" ? gate.code : `manifest-${classification}`,
        gate.historyAllowed === true,
        gate.downloadAllowed === true,
        gate.retryable !== false,
        Array.isArray(gate.warnings) ? gate.warnings.filter((warning): warning is string => typeof warning === "string") : undefined
      );
    }
  }

  const quality = normalizeQualityClassification(manifest.classification ?? manifest.quality ?? manifest.status);
  if (!quality || quality === "usable-final" || quality === "running") return null;
  return makeQualityGate(quality, qualityGateDefaultReason(quality), `manifest-${quality}`, false, false, quality !== "debug-artifact");
}

function manifestQualityGateRecordedMtimeMs(sourceManifest: NonNullable<DirectionSplitSourceManifest>) {
  const recordedAt = sourceManifest.parsed.qualityGateRecordedAt;
  const recordedTime = typeof recordedAt === "string" ? Date.parse(recordedAt) : NaN;
  return Number.isFinite(recordedTime) ? recordedTime : sourceManifest.mtimeMs;
}

function isSupersededSoftClientQualityGate(qualityGate: CodexResultQualityGate) {
  if (qualityGate.code !== "client-quality-gate-failed") return false;
  const reason = qualityGate.reason.toLowerCase();
  if (!/\bbbox (?:width|height) variation\b/.test(reason)) return false;
  return !/chroma key removal failed|transparency damage|detached component|blank normalized cell|no primary character|no character pixels|feet touch|top margin|expected \d+x\d+, got|missing direction|could not|decode failed/i.test(reason);
}

function qualityGateFromRequest(body: CodexResultQualityGateRequest) {
  const requested = normalizeQualityClassification(body.classification);
  const classification = requested && requested !== "usable-final" && requested !== "running" ? requested : "quality-failed";
  const reason =
    typeof body.reason === "string" && body.reason.trim()
      ? trimQualityGateText(body.reason, 600)
      : qualityGateDefaultReason(classification);
  const code = typeof body.code === "string" && body.code.trim() ? trimQualityGateText(body.code, 120) : `client-${classification}`;
  const warnings = Array.isArray(body.warnings)
    ? body.warnings
      .filter((warning): warning is string => typeof warning === "string" && warning.trim().length > 0)
      .map((warning) => trimQualityGateText(warning, 220))
      .slice(0, 12)
    : undefined;
  return makeQualityGate(classification, reason, code, false, false, classification !== "debug-artifact", warnings);
}

function trimQualityGateText(value: string, maxLength: number) {
  return value.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, " ").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

async function writeDirectionSplitQualityGate(jobId: string, qualityGate: CodexResultQualityGate) {
  const manifestPaths = [
    join(outboxDir, `${jobId}-manifest.json`),
    join(outboxDir, ".staging", jobId, `${jobId}-manifest.json`),
    join(outboxDir, ".staging", jobId, "manifest.json")
  ];
  const written: string[] = [];
  for (const manifestPath of manifestPaths) {
    const existing = await readManifestObject(manifestPath);
    if (!existing && written.length > 0) continue;
    const manifest = existing ?? { schema: directionSplitManifestSchema, jobId };
    manifest.schema = typeof manifest.schema === "string" ? manifest.schema : directionSplitManifestSchema;
    manifest.jobId = typeof manifest.jobId === "string" ? manifest.jobId : jobId;
    manifest.classification = qualityGate.classification;
    manifest.quality = qualityGate.classification === "quality-failed" || qualityGate.classification === "failed" ? "blocked" : "bronze";
    manifest.serverVerified = false;
    manifest.qualityGate = qualityGate;
    manifest.qualityGateRecordedAt = new Date().toISOString();
    await mkdir(resolve(manifestPath, ".."), { recursive: true });
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    written.push(manifestPath);
  }
  if (written.length === 0) {
    const manifestPath = manifestPaths[0];
    const manifest = {
      schema: directionSplitManifestSchema,
      jobId,
      classification: qualityGate.classification,
      quality: qualityGate.classification === "quality-failed" || qualityGate.classification === "failed" ? "blocked" : "bronze",
      serverVerified: false,
      qualityGate,
      qualityGateRecordedAt: new Date().toISOString()
    };
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    written.push(manifestPath);
  }
  return { ok: true, jobId, qualityGate, written };
}

async function readManifestObject(path: string): Promise<Record<string, unknown> | null> {
  try {
    await stat(path);
    const parsed = JSON.parse(await readFile(path, "utf8"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return null;
  }
}

function normalizeQualityClassification(value: unknown): CodexResultQualityClassification | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase().replace(/[_\s]+/g, "-");
  if (normalized === "usable-final" || normalized === "gold" || normalized === "silver" || normalized === "verified") return "usable-final";
  if (normalized === "quality-failed" || normalized === "failed" || normalized === "blocked" || normalized === "rejected") return "quality-failed";
  if (normalized === "quarantined-candidate" || normalized === "quarantine" || normalized === "quarantined" || normalized === "bronze") return "quarantined-candidate";
  if (normalized === "debug-artifact" || normalized === "debug") return "debug-artifact";
  if (normalized === "running" || normalized === "waiting" || normalized === "pending") return "running";
  return null;
}

function qualityGateDefaultReason(classification: CodexResultQualityClassification) {
  if (classification === "quality-failed") return "Animation result failed the material quality gate.";
  if (classification === "quarantined-candidate") return "Candidate was quarantined and is not a final usable result.";
  if (classification === "debug-artifact") return "Debug or QA artifact is not a final usable result.";
  if (classification === "failed") return "Generation failed before producing a usable final result.";
  if (classification === "running") return "Generation is still waiting for final verified artifacts.";
  return "Usable final result.";
}

async function listOutboxResults(resultDir = outboxDir) {
  const artifactStatuses = await inspectAllDirectionSplitArtifacts(resultDir);
  const entries = await readdir(resultDir, { withFileTypes: true });
  const results = await Promise.all(
    entries
      .filter((entry) => entry.isFile())
      .filter((entry) => !shouldIgnoreOutboxResultName(entry.name))
      .map(async (entry) => {
        const mimeType = mimeTypeForOutboxResult(entry.name);
        if (!mimeType) return null;
        const filePath = join(resultDir, entry.name);
        const fileStat = await stat(filePath);
        const artifact = artifactStatuses.get(directionSplitJobIdFromFileName(entry.name) ?? "");
        return {
          name: entry.name,
          path: filePath,
          size: fileStat.size,
          modifiedAt: fileStat.mtime.toISOString(),
          mimeType,
          qualityGate: qualityGateForOutboxResultName(entry.name, artifact),
          artifact
        };
      })
  );
  return results
    .filter((result): result is NonNullable<(typeof results)[number]> => Boolean(result))
    .sort((a, b) => Date.parse(b.modifiedAt) - Date.parse(a.modifiedAt));
}

function qualityGateForOutboxResultName(name: string, artifact?: CodexArtifactStatus): CodexResultQualityGate {
  const filterName = normalizeOutboxResultNameForFiltering(name);
  if (filterName.includes("bronze-candidate")) {
    return makeQualityGate(
      "quarantined-candidate",
      "Bronze candidate is available for diagnostics only and is not a final usable result.",
      "bronze-candidate",
      false,
      false,
      true
    );
  }
  if (artifact?.qualityGate) return artifact.qualityGate;
  if (directionSplitJobIdFromFileName(name) && !isDirectionSplitManifestFileName(name)) {
    return makeQualityGate(
      "quarantined-candidate",
      "Raw direction image is a component candidate; import the verified direction-split manifest to create the final sheet.",
      "raw-direction-component",
      false,
      false,
      true
    );
  }
  return makeQualityGate("usable-final", "Usable final result.", "usable-final", true, true, false);
}

function resolveTournamentIdForJobRequest(workflowMode: CodexWorkflowMode, body: CodexJobRequest) {
  const spriteVariant = body.spriteVariant ?? "standard";
  return workflowMode === "sprite-generate" && spriteVariant === "standard" && isSafeTournamentId(body.tournamentId)
    ? body.tournamentId
    : "";
}

function normalizeCandidateIndex(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
}

function normalizeCandidateCount(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : 1;
}

function tournamentJobOutboxDir(tournamentId: string, jobId: string) {
  return join(tournamentWorkRootDir, tournamentId, jobId);
}

async function resolveJobOutboxDir(jobId: string) {
  const liveStatus = runnerStatuses.get(jobId);
  const liveOutbox = resolveSafeOutboxSubdir(liveStatus?.outboxDir);
  if (liveOutbox) return liveOutbox;

  try {
    const parsed = JSON.parse(await readFile(join(inboxDir, `${jobId}.json`), "utf8")) as {
      returnTo?: { outboxDir?: unknown };
    };
    return resolveSafeOutboxSubdir(parsed.returnTo?.outboxDir) ?? outboxDir;
  } catch {
    return null;
  }
}

function resolveSafeOutboxSubdir(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;
  const rootDir = resolve(outboxDir);
  const resolved = resolve(value);
  const root = rootDir.endsWith(sep) ? rootDir : `${rootDir}${sep}`;
  return resolved === rootDir || resolved.startsWith(root) ? resolved : null;
}

async function publishTournamentWinner(tournamentId: string, jobId: string) {
  const jobOutboxDir = await resolveJobOutboxDir(jobId);
  const expectedOutboxDir = tournamentJobOutboxDir(tournamentId, jobId);
  if (!jobOutboxDir || resolve(jobOutboxDir) !== resolve(expectedOutboxDir)) {
    throw new Error("Tournament winner job does not belong to the requested hidden work outbox.");
  }

  const artifact = await inspectDirectionSplitArtifact(jobId, jobOutboxDir);
  if (!artifact.ready || !artifact.verified) {
    throw new Error(`Tournament winner is not ready for root publish: ${artifact.reason}`);
  }
  const candidates = (await Promise.all(directionSplitSlugs.map((slug) => findDirectionSplitCandidateFile(jobId, slug, jobOutboxDir))))
    .filter((candidate): candidate is DirectionSplitCandidateFile => Boolean(candidate));
  if (candidates.length !== directionSplitSlugs.length) {
    throw new Error("Tournament winner is missing one or more direction files.");
  }
  const sourceManifest = await findDirectionSplitSourceManifest(jobId, jobOutboxDir);
  const expectedChromaKey = await readJobExpectedChromaKey(jobId);
  const manifestName = await publishVerifiedDirectionSplitArtifact(
    jobId,
    candidates,
    sourceManifest,
    expectedChromaKey,
    artifact.warnings,
    outboxDir
  );
  const publishedResults = (await listOutboxResults()).filter((result) => isJobOutboxFileName(jobId, result.name));
  return {
    ok: true,
    tournamentId,
    jobId,
    outboxPath: outboxDir,
    manifestName,
    files: artifact.files,
    results: publishedResults
  };
}

function resolveOutboxFile(name: string) {
  return resolveOutboxFileInDir(outboxDir, name);
}

function resolveOutboxFileInDir(resultDir: string, name: string) {
  if (!name || name.includes("/") || name.includes("\\") || name.includes("..")) return null;
  const rootDir = resolve(resultDir);
  const filePath = resolve(rootDir, name);
  const root = rootDir.endsWith(sep) ? rootDir : `${rootDir}${sep}`;
  return filePath.startsWith(root) ? filePath : null;
}

function isSafeJobId(jobId: string) {
  return /^codex-job-[A-Za-z0-9_-]+$/.test(jobId);
}

function isSafeTournamentId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,96}$/.test(value);
}

function createCodexJobId(createdAt: string) {
  const timestamp = createdAt.replace(/[:.]/g, "-");
  const suffix = Math.random().toString(36).slice(2, 8);
  return `codex-job-${timestamp}-${suffix}`;
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

function mimeTypeForOutboxResult(name: string) {
  if (shouldIgnoreOutboxResultName(name)) return null;
  return mimeTypeForImage(name) ?? (isDirectionSplitManifestFileName(name) ? "application/json" : null);
}

function isDirectionSplitManifestFileName(name: string) {
  return /-manifest\.json$/i.test(name);
}

function shouldIgnoreOutboxResultName(name: string) {
  const normalized = name.toLowerCase();
  const filterName = normalizeOutboxResultNameForFiltering(name);
  return (
    normalized.startsWith(".") ||
    filterName.startsWith("local-gen-") ||
    filterName.includes(".staging") ||
    hasTemporaryOutboxResultMarker(normalized) ||
    filterName.includes("-work-") ||
    filterName.endsWith("-qa.json") ||
    filterName.endsWith(".qa.json") ||
    hasQaOutboxResultMarker(filterName) ||
    hasDebugOutboxResultMarker(filterName) ||
    [
      "candidate-contact",
      "contact-sheet",
      "contact.tmp",
      "grid-qa",
      "mechanical-qa",
      "transparent-contact",
      "preview-grid",
      "ab-gallery"
    ].some((marker) => filterName.includes(marker))
  );
}

function normalizeOutboxResultNameForFiltering(name: string) {
  return name.toLowerCase().replace(/[_\s]+/g, "-");
}

function hasTemporaryOutboxResultMarker(normalizedName: string) {
  return /(^|[._-])tmp([._-]|$)/.test(normalizedName);
}

function hasQaOutboxResultMarker(filterName: string) {
  return /(^|[-.])qa([-.]|$)/.test(filterName);
}

function hasDebugOutboxResultMarker(filterName: string) {
  return /(^|[-.])debug([-.]|$)/.test(filterName);
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
