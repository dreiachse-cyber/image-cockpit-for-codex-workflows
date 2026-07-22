import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { closeSync, createWriteStream, existsSync, openSync, readFileSync, readSync, readdirSync } from "node:fs";
import { copyFile, mkdir, readFile, readdir, rename, stat, writeFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { basename, delimiter, extname, join, resolve, sep } from "node:path";
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
const codexRunnerMode = detectCodexRunnerMode(codexCommand, codexLaunchCommand, codexHelpArgs, codexExecArgs);
const allowMockRunner = process.env.IMAGE_COCKPIT_ALLOW_MOCK_RUNNER === "1";
const runnerStaleTimeoutMs = parsePositiveNumber("IMAGE_COCKPIT_CODEX_STALE_MS", 30 * 60 * 1000);
const runnerStaleLogIdleMs = parsePositiveNumber("IMAGE_COCKPIT_CODEX_STALE_LOG_IDLE_MS", 5 * 60 * 1000);
const runnerCapacityCooldownMs = parsePositiveNumber("IMAGE_COCKPIT_CODEX_CAPACITY_COOLDOWN_MS", 15 * 60 * 1000);
const runnerLogTailDefaultBytes = 24 * 1024;
const runnerLogTailMaxBytes = 96 * 1024;
const resultRoutePrefix = "/api/codex/results/";
const runnerPreflightTimeoutMs = 4000;
const directionSplitSlugs = ["front", "front-three-quarter", "side", "back-three-quarter", "back"];
const directionSplitNames = ["front", "front three-quarter", "side", "back three-quarter", "back"];
const directionSplitManifestSchema = "image-cockpit.direction-split-animation.v1";
const artifactStableMs = parsePositiveNumber("IMAGE_COCKPIT_ARTIFACT_STABLE_MS", 1500);
const maxActiveCodexJobs = 3;

const runnerStatuses = new Map<string, CodexRunnerStatus>();
const runnerProcesses = new Map<string, ReturnType<typeof spawn>>();
const resumingRunnerJobs = new Map<string, Promise<CodexRunnerStatus>>();
const cancellingRunnerJobIds = new Set<string>();
const animationTournamentLocks = new Map<string, Promise<void>>();
let cachedRunnerCapacityBlock: RunnerCapacityBlock | null = null;

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
  framesPerDirection?: number;
  cell?: unknown;
  chromaKey?: string;
  spriteVariant?: string;
  directions?: unknown;
  tournamentId?: string;
  tournamentCandidateIndex?: number;
  tournamentCandidateCount?: number;
  generationProfile?: AnimationGenerationProfile;
  idempotencyKey?: string;
  sourceFingerprint?: string;
  motionRecipeId?: string;
  motionRecipeVersion?: number;
  motionRecipeCompilerVersion?: string;
  motionRecipeQualityProfile?: string;
  motionRecipe?: unknown;
  presetId?: string;
  selectedImageAssetPath?: string;
  repairDirections?: unknown;
  repairOfJobId?: string;
  effectContext?: unknown;
};

type MotionRecipeContext = {
  id: string;
  version: number;
  compilerVersion: string;
  qualityProfile?: string;
  bodyTopology?: string;
  frameCount?: number;
  modifiers?: Record<string, string>;
  experimental?: boolean;
};

type AnimationGenerationProfile = "fast" | "balanced" | "best";
type AnimationTournamentCandidateState = "queued" | "running" | "artifact-ready" | "quality-evaluated" | "accepted" | "repairing" | "failed" | "cancelled";
type AnimationTournamentDirectionState = AnimationTournamentCandidateState;
type MotionPilotState = "piloting" | "review" | "expanding" | "completed" | "fallback" | "failed";

type AnimationTournamentCandidate = {
  index: number;
  state: AnimationTournamentCandidateState;
  idempotencyKey: string;
  jobId?: string;
  createdAt?: string;
  updatedAt: string;
  qualityReportRef?: string;
  score?: number;
  warningCount?: number;
  reason?: string;
  repairDirections?: string[];
};

type AnimationHumanReviewDecision = {
  jobId: string;
  decision: "winner" | "reject" | "hold";
  reasonTags: string[];
  note: string;
};

type AnimationHumanReview = {
  updatedAt: string;
  manualWinnerJobId?: string;
  decisions: AnimationHumanReviewDecision[];
};

type AnimationTournamentManifest = {
  schema: "image-cockpit.animation-tournament.v1";
  schemaVersion: 1;
  tournamentId: string;
  idempotencyKey: string;
  sourceFingerprint: string;
  sourceAssetRef?: string;
  motionRecipeId?: string;
  motionRecipeVersion?: number;
  motionRecipeCompilerVersion?: string;
  presetId?: string;
  generationProfile: AnimationGenerationProfile;
  requestedDirections: string[];
  maximumCandidateCount: number;
  initialCandidateCount: number;
  candidates: AnimationTournamentCandidate[];
  directionStates: Record<string, { state: AnimationTournamentDirectionState; updatedAt: string; jobId?: string; reason?: string }>;
  qualityReportRefs: string[];
  winnerCandidateId?: string;
  acceptedDirectionHashes: Record<string, string>;
  retryCount: number;
  thirdCandidateReason?: string;
  humanReview?: AnimationHumanReview;
  pilotMode?: boolean;
  pilotState?: MotionPilotState;
  pilotDirection?: string;
  pilotCandidateIds?: string[];
  pilotWinnerId?: string;
  expansionDirectionIds?: string[];
  expansionJobId?: string;
  fallbackReason?: string;
  fallbackTournamentId?: string;
  directionOutputCount?: number;
  totalCandidateJobs?: number;
  elapsedTime?: number;
  repairCount?: number;
  state: "queued" | "running" | "pilot-review" | "pilot-expanding" | "accepted" | "failed" | "cancelled";
  templateRef: string;
  clientContext?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

type AnimationTournamentRegistrationRequest = {
  tournamentId?: unknown;
  idempotencyKey?: unknown;
  sourceFingerprint?: unknown;
  motionRecipeId?: unknown;
  motionRecipeVersion?: unknown;
  motionRecipeCompilerVersion?: unknown;
  presetId?: unknown;
  generationProfile?: unknown;
  requestedDirections?: unknown;
  maximumCandidateCount?: unknown;
  initialCandidateCount?: unknown;
  pilotMode?: unknown;
  pilotDirection?: unknown;
  jobTemplate?: unknown;
  clientContext?: unknown;
};

type CodexWorkflowMode = "image-generate" | "image-edit" | "sprite-generate" | "sprite-edit" | "effect-animation";
type CodexRunnerState = "running" | "completed" | "failed" | "unavailable" | "disabled" | "unknown";
type CodexRunnerPreflightState = "ready" | "disabled" | "unavailable";
type CodexRunnerMode = "codex" | "custom" | "mock";
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
  initialStartedAt?: string;
  resumedAt?: string;
  resumeCount?: number;
  finishedAt?: string;
  exitCode?: number | null;
  signal?: NodeJS.Signals | null;
  logPath?: string;
  statusPath?: string;
  outboxDir?: string;
  diagnostic?: CodexJobDiagnostic;
};

type RunnerCapacityBlock = {
  kind: Extract<CodexFailureKind, "usage_limit">;
  title: string;
  userMessage: string;
  suggestion?: string;
  jobId?: string;
  seenAt: string;
  expiresAt: string;
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

type AnimationQualityReportV2 = Record<string, unknown> & {
  metricVersion: "image-cockpit.animation-quality.v2";
  policyVersion: string;
};

type AnimationQualityReportRequest = {
  report?: unknown;
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
  animationQuality?: AnimationQualityReportV2;
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
  mode: CodexRunnerMode;
  mockRunnerAllowed: boolean;
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
        version: "0.1.6",
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
          autorun: runner.autorun,
          mode: runner.mode,
          mockRunnerAllowed: runner.mockRunnerAllowed
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
      const rawBody = await readJson(request);
      const validation = validateLocalGenerationRequest(rawBody);
      if (!validation.ok) {
        sendJson(response, 400, { error: validation.error });
        return;
      }
      const body = validation.request;
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

    const animationQualityMatch = pathname.match(/^\/api\/codex\/artifacts\/([^/]+)\/animation-quality$/);
    if (request.method === "POST" && animationQualityMatch) {
      const jobId = decodeURIComponent(animationQualityMatch[1]);
      if (!isSafeJobId(jobId)) {
        sendJson(response, 400, { error: "Unsupported or unsafe job id" });
        return;
      }
      const report = animationQualityFromRequest((await readJson(request)) as AnimationQualityReportRequest);
      if (!report) {
        sendJson(response, 400, { error: "Invalid or unsupported animation quality report" });
        return;
      }
      sendJson(response, 200, await writeDirectionSplitAnimationQuality(jobId, report));
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

    if (request.method === "GET" && pathname === "/api/codex/tournaments") {
      const manifests = await listAnimationTournamentManifests();
      sendJson(response, 200, { tournaments: manifests });
      return;
    }

    if (request.method === "POST" && pathname === "/api/codex/tournaments") {
      const registration = (await readJson(request)) as AnimationTournamentRegistrationRequest;
      const result = await registerAnimationTournament(registration);
      sendJson(response, result.created ? 201 : 200, result);
      return;
    }

    const tournamentManifestMatch = pathname.match(/^\/api\/codex\/tournaments\/([^/]+)$/);
    if (request.method === "GET" && tournamentManifestMatch) {
      const tournamentId = decodeURIComponent(tournamentManifestMatch[1]);
      if (!isSafeTournamentId(tournamentId)) {
        sendJson(response, 400, { error: "Unsupported or unsafe tournament id" });
        return;
      }
      const manifest = await refreshAnimationTournamentManifest(tournamentId);
      if (!manifest) {
        sendJson(response, 404, { error: "Tournament manifest was not found" });
        return;
      }
      sendJson(response, 200, { tournament: manifest });
      return;
    }

    const tournamentCandidateMatch = pathname.match(/^\/api\/codex\/tournaments\/([^/]+)\/candidates$/);
    if (request.method === "POST" && tournamentCandidateMatch) {
      const tournamentId = decodeURIComponent(tournamentCandidateMatch[1]);
      const body = (await readJson(request)) as { candidateIndex?: unknown; reason?: unknown };
      const candidateIndex = normalizeCandidateIndex(body.candidateIndex);
      if (!isSafeTournamentId(tournamentId)) {
        sendJson(response, 400, { error: "Unsupported or unsafe tournament candidate request" });
        return;
      }
      const result = await startAnimationTournamentCandidate(
        tournamentId,
        candidateIndex,
        typeof body.reason === "string" ? body.reason : undefined
      );
      sendJson(response, result.reused ? 200 : 201, result);
      return;
    }

    const tournamentEvaluationMatch = pathname.match(/^\/api\/codex\/tournaments\/([^/]+)\/evaluation$/);
    if (request.method === "POST" && tournamentEvaluationMatch) {
      const tournamentId = decodeURIComponent(tournamentEvaluationMatch[1]);
      if (!isSafeTournamentId(tournamentId)) {
        sendJson(response, 400, { error: "Unsupported or unsafe tournament evaluation request" });
        return;
      }
      const body = (await readJson(request)) as {
        jobId?: unknown;
        ready?: unknown;
        score?: unknown;
        warningCount?: unknown;
        qualityReportRef?: unknown;
        reason?: unknown;
      };
      sendJson(response, 200, {
        tournament: await recordAnimationTournamentEvaluation(tournamentId, body)
      });
      return;
    }

    const tournamentCancelMatch = pathname.match(/^\/api\/codex\/tournaments\/([^/]+)\/cancel$/);
    if (request.method === "POST" && tournamentCancelMatch) {
      const tournamentId = decodeURIComponent(tournamentCancelMatch[1]);
      if (!isSafeTournamentId(tournamentId)) {
        sendJson(response, 400, { error: "Unsupported or unsafe tournament cancel request" });
        return;
      }
      sendJson(response, 200, await cancelAnimationTournament(tournamentId));
      return;
    }

    const tournamentRepairMatch = pathname.match(/^\/api\/codex\/tournaments\/([^/]+)\/repairs$/);
    if (request.method === "POST" && tournamentRepairMatch) {
      const tournamentId = decodeURIComponent(tournamentRepairMatch[1]);
      const body = (await readJson(request)) as { directions?: unknown };
      if (!isSafeTournamentId(tournamentId)) {
        sendJson(response, 400, { error: "Unsupported or unsafe tournament repair request" });
        return;
      }
      const result = await startAnimationDirectionRepair(tournamentId, body.directions);
      sendJson(response, result.reused ? 200 : 201, result);
      return;
    }

    const tournamentRepairAcceptMatch = pathname.match(/^\/api\/codex\/tournaments\/([^/]+)\/repairs\/accept$/);
    if (request.method === "POST" && tournamentRepairAcceptMatch) {
      const tournamentId = decodeURIComponent(tournamentRepairAcceptMatch[1]);
      const body = (await readJson(request)) as { jobId?: unknown };
      const jobId = typeof body.jobId === "string" ? body.jobId : "";
      if (!isSafeTournamentId(tournamentId) || !isSafeJobId(jobId)) {
        sendJson(response, 400, { error: "Unsupported or unsafe tournament repair acceptance request" });
        return;
      }
      sendJson(response, 200, await acceptAnimationDirectionRepair(tournamentId, jobId));
      return;
    }

    const tournamentReviewMatch = pathname.match(/^\/api\/codex\/tournaments\/([^/]+)\/review$/);
    if (request.method === "POST" && tournamentReviewMatch) {
      const tournamentId = decodeURIComponent(tournamentReviewMatch[1]);
      if (!isSafeTournamentId(tournamentId)) {
        sendJson(response, 400, { error: "Unsupported or unsafe tournament review request" });
        return;
      }
      const body = (await readJson(request)) as { review?: unknown };
      sendJson(response, 200, { tournament: await recordAnimationHumanReview(tournamentId, body.review) });
      return;
    }

    const motionPilotExpandMatch = pathname.match(/^\/api\/codex\/tournaments\/([^/]+)\/pilot\/expand$/);
    if (request.method === "POST" && motionPilotExpandMatch) {
      const tournamentId = decodeURIComponent(motionPilotExpandMatch[1]);
      const body = (await readJson(request)) as { jobId?: unknown };
      const jobId = typeof body.jobId === "string" ? body.jobId : "";
      if (!isSafeTournamentId(tournamentId) || !isSafeJobId(jobId)) {
        sendJson(response, 400, { error: "Unsupported or unsafe Motion Pilot expansion request" });
        return;
      }
      const result = await startMotionPilotExpansion(tournamentId, jobId);
      sendJson(response, result.reused ? 200 : 201, result);
      return;
    }

    const motionPilotFallbackMatch = pathname.match(/^\/api\/codex\/tournaments\/([^/]+)\/pilot\/fallback$/);
    if (request.method === "POST" && motionPilotFallbackMatch) {
      const tournamentId = decodeURIComponent(motionPilotFallbackMatch[1]);
      const body = (await readJson(request)) as { reason?: unknown };
      if (!isSafeTournamentId(tournamentId)) {
        sendJson(response, 400, { error: "Unsupported or unsafe Motion Pilot fallback request" });
        return;
      }
      sendJson(response, 201, await fallbackMotionPilotTournament(tournamentId, normalizeShortText(body.reason) ?? "human review requested fallback"));
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
      const { result, tournament } = await publishAndAcceptTournamentWinner(tournamentId, jobId);
      sendJson(response, 200, { ...result, tournament });
      return;
    }

    if (request.method === "POST" && pathname === "/api/codex/jobs") {
      const body = (await readJson(request)) as CodexJobRequest;
      if (!body.prompt?.trim()) {
        sendJson(response, 400, { error: "Prompt is required for a Codex handoff job" });
        return;
      }

      const result = await createCodexJob(body);
      sendJson(response, result.reused ? 200 : 201, result);
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

async function createCodexJob(body: CodexJobRequest) {
  const workflowMode = normalizeWorkflowMode(body.workflowMode);
  const tournamentId = resolveTournamentIdForJobRequest(workflowMode, body);
  if (tournamentId && body.idempotencyKey) {
    const manifest = await readAnimationTournamentManifest(tournamentId);
    const existing = manifest?.candidates.find((candidate) => candidate.idempotencyKey === body.idempotencyKey && candidate.jobId);
    if (existing?.jobId) return codexJobResponse(existing.jobId, true);
  }

  const createdAt = new Date().toISOString();
  const id = createCodexJobId(createdAt);
  const includeSelectedImage = workflowUsesSelectedImage(workflowMode);
  const includeSpriteContext = workflowUsesSpriteContext(workflowMode);
  const includeAnnotations = workflowMode === "image-edit";
  const jobOutboxDir = tournamentId ? tournamentJobOutboxDir(tournamentId, id) : outboxDir;
  if (tournamentId) await mkdir(jobOutboxDir, { recursive: true });
  const selectedImageAsset = includeSelectedImage ? await writeSelectedImageAsset(id, body) : null;
  const annotations = includeAnnotations && Array.isArray(body.annotations) ? body.annotations : [];
  const repairDirections = normalizeDirectionNames(body.repairDirections);
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
      fingerprint: selectedImageAsset?.fingerprint ?? body.sourceFingerprint ?? "",
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
      framesPerDirection: includeSpriteContext ? normalizeMotionFrameCount(body.framesPerDirection) : undefined,
      grid: includeSpriteContext ? body.grid ?? null : null,
      cell: includeSpriteContext ? body.cell ?? null : null,
      chromaKey: includeSpriteContext ? body.chromaKey ?? "" : "",
      variant: includeSpriteContext ? body.spriteVariant ?? "standard" : "",
      directions: includeSpriteContext && Array.isArray(body.directions) ? body.directions : [],
      motionRecipe: includeSpriteContext ? normalizeMotionRecipeContext(body) : undefined
    },
    effectContext: workflowMode === "effect-animation" ? body.effectContext ?? null : null,
    tournament: tournamentId
      ? {
          id: tournamentId,
          candidateIndex: normalizeCandidateIndex(body.tournamentCandidateIndex),
          candidateCount: normalizeCandidateCount(body.tournamentCandidateCount),
          generationProfile: normalizeAnimationGenerationProfile(body.generationProfile),
          idempotencyKey: body.idempotencyKey ?? "",
          repairOfJobId: isSafeJobId(body.repairOfJobId ?? "") ? body.repairOfJobId : undefined,
          repairDirections,
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
  if (tournamentId) {
    await attachJobToAnimationTournament(tournamentId, normalizeCandidateIndex(body.tournamentCandidateIndex), id, createdAt, runner, repairDirections);
  }
  return { id, path, inboxPath: inboxDir, outboxPath: jobOutboxDir, createdAt, runner, reused: false };
}

async function codexJobResponse(jobId: string, reused: boolean) {
  const path = join(inboxDir, `${jobId}.json`);
  const parsed = parseJsonText<{ createdAt?: string; returnTo?: { outboxDir?: string } }>(await readFile(path, "utf8"));
  const runner = await getRunnerStatus(jobId);
  return {
    id: jobId,
    path,
    inboxPath: inboxDir,
    outboxPath: resolveSafeOutboxSubdir(parsed.returnTo?.outboxDir) ?? outboxDir,
    createdAt: parsed.createdAt ?? runner.startedAt ?? new Date().toISOString(),
    runner,
    reused
  };
}

function animationTournamentDir(tournamentId: string) {
  return join(tournamentWorkRootDir, tournamentId);
}

function animationTournamentManifestPath(tournamentId: string) {
  return join(animationTournamentDir(tournamentId), "tournament.json");
}

function animationTournamentTemplatePath(tournamentId: string) {
  return join(animationTournamentDir(tournamentId), "template.json");
}

async function registerAnimationTournament(registration: AnimationTournamentRegistrationRequest) {
  const tournamentId = typeof registration.tournamentId === "string" ? registration.tournamentId : "";
  const idempotencyKey = typeof registration.idempotencyKey === "string" ? registration.idempotencyKey.trim() : "";
  if (!isSafeTournamentId(tournamentId) || !isSafeIdempotencyKey(idempotencyKey)) {
    throw new Error("Tournament id and idempotency key are required and must be safe.");
  }
  const existing = await readAnimationTournamentManifest(tournamentId);
  if (existing) {
    if (existing.idempotencyKey !== idempotencyKey) throw new Error("Tournament id already exists with a different idempotency key.");
    return { created: false, tournament: await refreshAnimationTournamentManifest(tournamentId) };
  }

  const profile = normalizeAnimationGenerationProfile(registration.generationProfile);
  const profilePlan = animationGenerationProfilePlan(profile);
  const maximumCandidateCount = normalizeBoundedInteger(registration.maximumCandidateCount, profilePlan.maximumCandidates, 1, 3);
  const initialCandidateCount = normalizeBoundedInteger(registration.initialCandidateCount, profilePlan.initialCandidates, 1, maximumCandidateCount);
  const requestedDirections = normalizeDirectionNames(registration.requestedDirections);
  if (![1, 3, 5].includes(requestedDirections.length)) throw new Error("Animation tournaments require 1, 3, or 5 directions.");
  if (requestedDirections.length === 1 && requestedDirections[0] !== "side") {
    throw new Error("Single-direction animation tournaments require the side direction.");
  }
  const pilotMode = registration.pilotMode === true;
  if (pilotMode && requestedDirections.length === 1) {
    throw new Error("Motion Pilot requires more than one requested direction.");
  }
  const requestedPilotDirection = normalizeDirectionNames([registration.pilotDirection])[0];
  const pilotDirection = pilotMode
    ? requestedDirections.includes(requestedPilotDirection) ? requestedPilotDirection : requestedDirections.includes("side") ? "side" : requestedDirections[0]
    : undefined;
  if (!registration.jobTemplate || typeof registration.jobTemplate !== "object") throw new Error("Tournament job template is required.");
  const jobTemplate = JSON.parse(JSON.stringify(registration.jobTemplate)) as CodexJobRequest;
  if (!jobTemplate.prompt?.trim()) throw new Error("Tournament job template prompt is required.");
  const selectedImageAsset = await writeSelectedImageAsset(tournamentId, jobTemplate);
  const sourceFingerprint = typeof registration.sourceFingerprint === "string" && registration.sourceFingerprint.trim()
    ? registration.sourceFingerprint.trim()
    : selectedImageAsset?.fingerprint ?? "";
  if (!sourceFingerprint) throw new Error("Tournament source fingerprint is required.");
  jobTemplate.selectedImageDataUrl = "";
  jobTemplate.selectedImageAssetPath = selectedImageAsset?.path;
  jobTemplate.sourceFingerprint = sourceFingerprint;
  jobTemplate.generationProfile = profile;
  jobTemplate.directions = requestedDirections;
  const now = new Date().toISOString();
  const manifest: AnimationTournamentManifest = {
    schema: "image-cockpit.animation-tournament.v1",
    schemaVersion: 1,
    tournamentId,
    idempotencyKey,
    sourceFingerprint,
    sourceAssetRef: selectedImageAsset?.path ? basename(selectedImageAsset.path) : undefined,
    motionRecipeId: normalizeShortText(registration.motionRecipeId),
    motionRecipeVersion: normalizePositiveInteger(registration.motionRecipeVersion),
    motionRecipeCompilerVersion: normalizeShortText(registration.motionRecipeCompilerVersion),
    presetId: normalizeShortText(registration.presetId),
    generationProfile: profile,
    requestedDirections,
    maximumCandidateCount,
    initialCandidateCount,
    candidates: Array.from({ length: maximumCandidateCount }, (_, index) => ({
      index,
      state: "queued" as const,
      idempotencyKey: `${idempotencyKey}:candidate:${index}`,
      updatedAt: now
    })),
    directionStates: Object.fromEntries(requestedDirections.map((direction) => [direction, { state: "queued" as const, updatedAt: now }])),
    qualityReportRefs: [],
    acceptedDirectionHashes: {},
    retryCount: 0,
    pilotMode,
    pilotState: pilotMode ? "piloting" : undefined,
    pilotDirection,
    pilotCandidateIds: pilotMode ? [] : undefined,
    expansionDirectionIds: pilotMode ? requestedDirections.filter((direction) => direction !== pilotDirection) : undefined,
    directionOutputCount: 0,
    totalCandidateJobs: 0,
    repairCount: 0,
    state: "queued",
    templateRef: "template.json",
    clientContext: registration.clientContext && typeof registration.clientContext === "object"
      ? JSON.parse(JSON.stringify(registration.clientContext)) as Record<string, unknown>
      : undefined,
    createdAt: now,
    updatedAt: now
  };
  await mkdir(animationTournamentDir(tournamentId), { recursive: true });
  await writeJsonAtomic(animationTournamentTemplatePath(tournamentId), jobTemplate);
  await writeAnimationTournamentManifest(manifest);
  return { created: true, tournament: manifest };
}

async function startAnimationTournamentCandidate(tournamentId: string, candidateIndex: number, reason?: string) {
  return withAnimationTournamentLock(tournamentId, () => startAnimationTournamentCandidateUnlocked(tournamentId, candidateIndex, reason));
}

async function startAnimationTournamentCandidateUnlocked(tournamentId: string, candidateIndex: number, reason?: string) {
  const manifest = await readAnimationTournamentManifestRequired(tournamentId);
  const candidate = manifest.candidates[candidateIndex];
  if (!candidate) throw new Error("Tournament candidate index is outside the registered plan.");
  if (candidate.jobId) return { reused: true, job: await codexJobResponse(candidate.jobId, true), tournament: await refreshAnimationTournamentManifest(tournamentId) };
  await assertCodexRunnerSlotAvailable();
  const template = parseJsonText<CodexJobRequest>(await readFile(animationTournamentTemplatePath(tournamentId), "utf8"));
  const candidateLabel = `candidate ${candidateIndex + 1}/${manifest.maximumCandidateCount}`;
  const pilotDirections = manifest.pilotMode && manifest.pilotDirection ? [manifest.pilotDirection] : undefined;
  const candidateDirections = pilotDirections ?? manifest.requestedDirections;
  const candidateFrameCount = normalizeMotionFrameCount(template.framesPerDirection) ?? 8;
  const body: CodexJobRequest = {
    ...template,
    directions: candidateDirections,
    grid: { columns: candidateFrameCount, rows: candidateDirections.length, gutter: 0 },
    frames: candidateFrameCount * candidateDirections.length,
    framesPerDirection: candidateFrameCount,
    jobNotes: [
      template.jobNotes ?? "",
      `Animation tournament ${tournamentId}, ${candidateLabel}, profile ${manifest.generationProfile}.`,
      "Generate this candidate independently from the same source and motion contract. Do not copy another candidate.",
      manifest.pilotMode
        ? `Motion Pilot experimental candidate. Generate only representative direction ${manifest.pilotDirection}. Preserve the full Recipe phase contract so the accepted pilot can expand to ${manifest.expansionDirectionIds?.join(", ")}.`
        : "",
      reason ? `Adaptive candidate reason: ${reason}.` : ""
    ].filter(Boolean).join("\n"),
    tournamentId,
    tournamentCandidateIndex: candidateIndex,
    tournamentCandidateCount: manifest.maximumCandidateCount,
    generationProfile: manifest.generationProfile,
    idempotencyKey: candidate.idempotencyKey,
    sourceFingerprint: manifest.sourceFingerprint
  };
  if (candidateIndex >= manifest.initialCandidateCount && reason) manifest.thirdCandidateReason = reason;
  candidate.reason = reason;
  candidate.updatedAt = new Date().toISOString();
  await writeAnimationTournamentManifest(manifest);
  const job = await createCodexJob(body);
  return { reused: false, job, tournament: await refreshAnimationTournamentManifest(tournamentId) };
}

async function attachJobToAnimationTournament(
  tournamentId: string,
  candidateIndex: number,
  jobId: string,
  createdAt: string,
  runner: CodexRunnerStatus,
  repairDirections: string[] = []
) {
  const manifest = await readAnimationTournamentManifest(tournamentId);
  const candidate = manifest?.candidates[candidateIndex];
  if (!manifest || !candidate) return;
  candidate.jobId = candidate.jobId ?? jobId;
  candidate.createdAt = candidate.createdAt ?? createdAt;
  candidate.state = runner.state === "running" ? "running" : runner.state === "completed" ? "artifact-ready" : "failed";
  candidate.updatedAt = new Date().toISOString();
  if (manifest.pilotMode && !candidate.repairDirections?.length && !manifest.pilotCandidateIds?.includes(jobId)) {
    manifest.pilotCandidateIds = [...(manifest.pilotCandidateIds ?? []), jobId];
  }
  manifest.totalCandidateJobs = manifest.candidates.filter((item) => Boolean(item.jobId)).length;
  manifest.state = candidate.state === "running"
    ? manifest.pilotMode && candidate.repairDirections?.length ? "pilot-expanding" : "running"
    : manifest.state;
  if (candidate.state === "running") {
    const activeDirections = repairDirections.length > 0
      ? repairDirections
      : manifest.pilotMode && manifest.pilotDirection
        ? [manifest.pilotDirection]
        : manifest.requestedDirections;
    activeDirections.forEach((direction) => {
      manifest.directionStates[direction] = { state: "running", updatedAt: candidate.updatedAt, jobId };
    });
  }
  await writeAnimationTournamentManifest(manifest);
}

async function recordAnimationTournamentEvaluation(
  tournamentId: string,
  body: { jobId?: unknown; ready?: unknown; score?: unknown; warningCount?: unknown; qualityReportRef?: unknown; reason?: unknown }
) {
  return withAnimationTournamentLock(tournamentId, () => recordAnimationTournamentEvaluationUnlocked(tournamentId, body));
}

function normalizeAnimationHumanReviewForManifest(value: unknown, manifest: AnimationTournamentManifest): AnimationHumanReview {
  if (!value || typeof value !== "object") throw new Error("Animation human review payload is required.");
  const source = value as { manualWinnerJobId?: unknown; decisions?: unknown };
  const candidateIds = new Set(manifest.candidates.flatMap((candidate) => candidate.jobId ? [candidate.jobId] : []));
  const manualWinnerJobId = typeof source.manualWinnerJobId === "string" && candidateIds.has(source.manualWinnerJobId)
    ? source.manualWinnerJobId
    : undefined;
  const decisions: AnimationHumanReviewDecision[] = Array.isArray(source.decisions)
    ? source.decisions.flatMap((entry) => {
        if (!entry || typeof entry !== "object") return [];
        const item = entry as { jobId?: unknown; decision?: unknown; reasonTags?: unknown; note?: unknown };
        if (typeof item.jobId !== "string" || !candidateIds.has(item.jobId)) return [];
        const decision = item.decision === "winner" || item.decision === "reject" ? item.decision : "hold";
        const reasonTags = Array.isArray(item.reasonTags)
          ? [...new Set(item.reasonTags.filter((tag): tag is string => typeof tag === "string" && tag.trim().length > 0).map((tag) => tag.trim().slice(0, 48)))].slice(0, 12)
          : [];
        return [{
          jobId: item.jobId,
          decision,
          reasonTags,
          note: typeof item.note === "string" ? item.note.trim().slice(0, 1000) : ""
        }];
      })
    : [];
  return {
    updatedAt: new Date().toISOString(),
    ...(manualWinnerJobId ? { manualWinnerJobId } : {}),
    decisions
  };
}

async function recordAnimationHumanReview(tournamentId: string, value: unknown) {
  return withAnimationTournamentLock(tournamentId, async () => {
    const manifest = await readAnimationTournamentManifestRequired(tournamentId);
    manifest.humanReview = normalizeAnimationHumanReviewForManifest(value, manifest);
    await writeAnimationTournamentManifest(manifest);
    return manifest;
  });
}

async function recordAnimationTournamentEvaluationUnlocked(
  tournamentId: string,
  body: { jobId?: unknown; ready?: unknown; score?: unknown; warningCount?: unknown; qualityReportRef?: unknown; reason?: unknown }
) {
  const manifest = await readAnimationTournamentManifestRequired(tournamentId);
  const jobId = typeof body.jobId === "string" ? body.jobId : "";
  const candidate = manifest.candidates.find((item) => item.jobId === jobId);
  if (!candidate) throw new Error("Tournament evaluation job was not registered.");
  if (manifest.state === "accepted" && manifest.winnerCandidateId && !manifest.pilotMode && !candidate.repairDirections?.length) {
    const terminalState: AnimationTournamentCandidateState = candidate.jobId === manifest.winnerCandidateId ? "accepted" : "cancelled";
    if (candidate.state !== terminalState) {
      candidate.state = terminalState;
      candidate.updatedAt = new Date().toISOString();
      await writeAnimationTournamentManifest(manifest);
    }
    return manifest;
  }
  // Candidate artifacts are immutable after terminal publication. Once a candidate has
  // passed evaluation, a later transient read/stability failure must not downgrade the
  // persisted score or replace its warning count with the client failure sentinel.
  if (body.ready !== true && candidate.state === "quality-evaluated") return manifest;
  candidate.state = body.ready === true ? "quality-evaluated" : "failed";
  candidate.score = typeof body.score === "number" && Number.isFinite(body.score) ? body.score : undefined;
  candidate.warningCount = body.ready === true && typeof body.warningCount === "number" && Number.isFinite(body.warningCount)
    ? Math.min(999, Math.max(0, Math.floor(body.warningCount)))
    : 0;
  candidate.reason = typeof body.reason === "string" ? body.reason.slice(0, 400) : candidate.reason;
  candidate.qualityReportRef = typeof body.qualityReportRef === "string" ? body.qualityReportRef.slice(0, 200) : candidate.qualityReportRef;
  if (candidate.qualityReportRef && !manifest.qualityReportRefs.includes(candidate.qualityReportRef)) manifest.qualityReportRefs.push(candidate.qualityReportRef);
  candidate.updatedAt = new Date().toISOString();
  if (body.ready === true && manifest.state === "failed" && !manifest.winnerCandidateId) {
    manifest.state = "running";
  }
  const evaluationDirections = candidate.repairDirections?.length
    ? candidate.repairDirections
    : manifest.pilotMode && manifest.pilotDirection
      ? [manifest.pilotDirection]
      : manifest.requestedDirections;
  if (body.ready === true) {
    evaluationDirections.forEach((direction) => {
      manifest.directionStates[direction] = {
        state: "quality-evaluated",
        updatedAt: candidate.updatedAt,
        jobId,
        reason: candidate.warningCount ? `${candidate.warningCount} candidate warning(s)` : "candidate passed Quality Gate v2"
      };
    });
  }
  if (candidate.repairDirections?.length && manifest.winnerCandidateId) {
    manifest.state = manifest.pilotMode && manifest.pilotState === "expanding" ? "pilot-expanding" : "accepted";
    if (manifest.pilotMode && body.ready === true) {
      manifest.directionOutputCount = (manifest.pilotCandidateIds?.length ?? manifest.initialCandidateCount) + candidate.repairDirections.length;
      manifest.totalCandidateJobs = manifest.candidates.filter((item) => Boolean(item.jobId)).length;
    }
    manifest.requestedDirections
      .filter((direction) => body.ready !== true || !candidate.repairDirections?.includes(direction))
      .forEach((direction) => {
        const acceptedPilotDirection = manifest.pilotMode && direction === manifest.pilotDirection;
        manifest.directionStates[direction] = {
          state: acceptedPilotDirection || !manifest.pilotMode ? "accepted" : manifest.directionStates[direction]?.state ?? "queued",
          updatedAt: candidate.updatedAt,
          jobId: manifest.winnerCandidateId,
          reason: acceptedPilotDirection
            ? "accepted pilot direction preserved during expansion"
            : body.ready === true ? "untargeted direction preserved from accepted winner" : "restored accepted winner after failed Direction Repair"
        };
      });
  }
  if (manifest.pilotMode && !candidate.repairDirections?.length && !manifest.pilotWinnerId) {
    const pilotCandidates = manifest.candidates.slice(0, manifest.initialCandidateCount);
    const allPilotCandidatesTerminal = pilotCandidates.every((item) => item.state === "quality-evaluated" || item.state === "failed");
    if (allPilotCandidatesTerminal) {
      const usablePilotCandidates = pilotCandidates.filter((item) => item.state === "quality-evaluated");
      manifest.directionOutputCount = usablePilotCandidates.length;
      manifest.totalCandidateJobs = pilotCandidates.filter((item) => Boolean(item.jobId)).length;
      manifest.pilotState = usablePilotCandidates.length > 0 ? "review" : "failed";
      manifest.state = usablePilotCandidates.length > 0 ? "pilot-review" : "failed";
      if (usablePilotCandidates.length === 0) manifest.fallbackReason = "all pilot candidates failed Quality Gate v2";
    }
  }
  await writeAnimationTournamentManifest(manifest);
  return manifest;
}

async function acceptAnimationTournamentWinner(tournamentId: string, jobId: string) {
  const manifest = await readAnimationTournamentManifestRequired(tournamentId);
  const winner = manifest.candidates.find((candidate) => candidate.jobId === jobId);
  if (!winner) throw new Error("Tournament winner job is not registered in the tournament manifest.");
  const jobOutboxDir = tournamentJobOutboxDir(tournamentId, jobId);
  const hashes: Record<string, string> = {};
  for (const direction of manifest.requestedDirections) {
    const slug = directionSlug(direction);
    const candidate = await findDirectionSplitCandidateFile(jobId, slug, jobOutboxDir);
    if (!candidate) throw new Error(`Tournament winner is missing ${direction}.`);
    hashes[direction] = await hashFile(candidate.path);
    manifest.directionStates[direction] = { state: "accepted", updatedAt: new Date().toISOString(), jobId };
  }
  manifest.acceptedDirectionHashes = hashes;
  manifest.winnerCandidateId = jobId;
  manifest.state = "accepted";
  manifest.candidates.forEach((candidate) => {
    candidate.state = candidate.jobId === jobId ? "accepted" : candidate.jobId ? "cancelled" : candidate.state;
    candidate.updatedAt = new Date().toISOString();
  });
  await writeAnimationTournamentManifest(manifest);
  return manifest;
}

async function cancelAnimationTournament(tournamentId: string) {
  return withAnimationTournamentLock(tournamentId, () => cancelAnimationTournamentUnlocked(tournamentId));
}

async function cancelAnimationTournamentUnlocked(tournamentId: string) {
  const manifest = await readAnimationTournamentManifestRequired(tournamentId);
  const results = [];
  for (const candidate of manifest.candidates) {
    if (!candidate.jobId) {
      candidate.state = "cancelled";
      continue;
    }
    const status = await getRunnerStatus(candidate.jobId);
    if (status.state === "running") results.push(await cancelCodexRunner(candidate.jobId));
    candidate.state = "cancelled";
    candidate.updatedAt = new Date().toISOString();
  }
  manifest.state = "cancelled";
  await writeAnimationTournamentManifest(manifest);
  return { ok: true, tournament: manifest, results };
}

async function startMotionPilotExpansion(tournamentId: string, winnerJobId: string) {
  return withAnimationTournamentLock(tournamentId, () => startMotionPilotExpansionUnlocked(tournamentId, winnerJobId));
}

async function startMotionPilotExpansionUnlocked(tournamentId: string, winnerJobId: string) {
  const manifest = await readAnimationTournamentManifestRequired(tournamentId);
  if (!manifest.pilotMode || !manifest.pilotDirection || manifest.pilotState !== "review") {
    throw new Error("Motion Pilot expansion requires pilot candidates in human review.");
  }
  const winner = manifest.candidates.find((candidate) => candidate.jobId === winnerJobId && !candidate.repairDirections?.length);
  if (!winner || winner.state !== "quality-evaluated") throw new Error("Motion Pilot winner must pass Quality Gate v2 before expansion.");
  if (manifest.humanReview?.manualWinnerJobId && manifest.humanReview.manualWinnerJobId !== winnerJobId) {
    throw new Error("Motion Pilot winner differs from the saved human review winner.");
  }
  if (manifest.expansionJobId) {
    return { reused: true, job: await codexJobResponse(manifest.expansionJobId, true), tournament: await refreshAnimationTournamentManifest(tournamentId) };
  }
  await assertCodexRunnerSlotAvailable();

  const winnerDir = tournamentJobOutboxDir(tournamentId, winnerJobId);
  const pilotFile = await findDirectionSplitCandidateFile(winnerJobId, directionSlug(manifest.pilotDirection), winnerDir);
  if (!pilotFile) throw new Error(`Motion Pilot winner is missing ${manifest.pilotDirection}.`);
  const pilotHash = await hashFile(pilotFile.path);
  const expansionDirections = manifest.requestedDirections.filter((direction) => direction !== manifest.pilotDirection);
  if (expansionDirections.length === 0) throw new Error("Motion Pilot has no remaining directions to expand.");

  const template = parseJsonText<CodexJobRequest>(await readFile(animationTournamentTemplatePath(tournamentId), "utf8"));
  const frameCount = normalizeMotionFrameCount(template.framesPerDirection) ?? 8;
  const expansionIndex = manifest.candidates.length;
  const idempotencyKey = `${manifest.idempotencyKey}:pilot-expansion:${directionSlug(manifest.pilotDirection)}`;
  const now = new Date().toISOString();
  manifest.winnerCandidateId = winnerJobId;
  manifest.pilotWinnerId = winnerJobId;
  manifest.pilotState = "expanding";
  manifest.state = "pilot-expanding";
  manifest.expansionDirectionIds = expansionDirections;
  manifest.acceptedDirectionHashes = { [manifest.pilotDirection]: pilotHash };
  manifest.directionStates[manifest.pilotDirection] = { state: "accepted", updatedAt: now, jobId: winnerJobId, reason: "human-reviewed Motion Pilot winner" };
  expansionDirections.forEach((direction) => {
    manifest.directionStates[direction] = { state: "repairing", updatedAt: now, reason: "expanding accepted pilot winner" };
  });
  manifest.candidates.forEach((candidate) => {
    if (candidate.repairDirections?.length) return;
    candidate.state = candidate.jobId === winnerJobId ? "accepted" : candidate.jobId ? "cancelled" : candidate.state;
    candidate.updatedAt = now;
  });
  manifest.candidates.push({
    index: expansionIndex,
    state: "repairing",
    idempotencyKey,
    updatedAt: now,
    repairDirections: expansionDirections,
    reason: "Motion Pilot winner expansion"
  });
  await writeAnimationTournamentManifest(manifest);

  const body: CodexJobRequest = {
    ...template,
    directions: expansionDirections,
    grid: { columns: frameCount, rows: expansionDirections.length, gutter: 0 },
    frames: frameCount * expansionDirections.length,
    framesPerDirection: frameCount,
    tournamentId,
    tournamentCandidateIndex: expansionIndex,
    tournamentCandidateCount: expansionIndex + 1,
    generationProfile: manifest.generationProfile,
    idempotencyKey,
    sourceFingerprint: manifest.sourceFingerprint,
    repairDirections: expansionDirections,
    repairOfJobId: winnerJobId,
    jobNotes: [
      template.jobNotes ?? "",
      `Motion Pilot expansion for tournament ${tournamentId}.`,
      `Accepted pilot winner: ${winnerJobId}; reference direction: ${manifest.pilotDirection}; SHA-256: ${pilotHash}.`,
      `Generate only remaining directions: ${expansionDirections.join(", ")}.`,
      `Treat the accepted pilot frames in ${winnerDir} as the locked identity, palette, silhouette, timing, motion phase, topology, and contact reference.`,
      "Do not regenerate the accepted pilot direction. Preserve the full Motion Recipe phase contract across every expansion direction."
    ].filter(Boolean).join("\n")
  };
  const job = await createCodexJob(body);
  const updated = await readAnimationTournamentManifestRequired(tournamentId);
  updated.expansionJobId = job.id;
  updated.directionOutputCount = updated.pilotCandidateIds?.length ?? updated.initialCandidateCount;
  updated.totalCandidateJobs = (updated.pilotCandidateIds?.length ?? updated.initialCandidateCount) + 1;
  updated.repairCount = updated.retryCount;
  await writeAnimationTournamentManifest(updated);
  return { reused: false, job, tournament: updated };
}

async function fallbackMotionPilotTournament(tournamentId: string, reason: string) {
  return withAnimationTournamentLock(tournamentId, async () => {
    const manifest = await readAnimationTournamentManifestRequired(tournamentId);
    if (!manifest.pilotMode || (manifest.pilotState !== "review" && manifest.pilotState !== "failed")) {
      throw new Error("Motion Pilot fallback requires review-ready or failed pilot candidates.");
    }
    const template = parseJsonText<CodexJobRequest>(await readFile(animationTournamentTemplatePath(tournamentId), "utf8"));
    const fallbackTournamentId = `${tournamentId}-fallback`.slice(0, 96);
    const fallback = await registerAnimationTournament({
      tournamentId: fallbackTournamentId,
      idempotencyKey: `${manifest.idempotencyKey}:fallback:balanced`,
      sourceFingerprint: manifest.sourceFingerprint,
      motionRecipeId: manifest.motionRecipeId,
      motionRecipeVersion: manifest.motionRecipeVersion,
      motionRecipeCompilerVersion: manifest.motionRecipeCompilerVersion,
      presetId: manifest.presetId,
      generationProfile: "balanced",
      requestedDirections: manifest.requestedDirections,
      maximumCandidateCount: 3,
      initialCandidateCount: 2,
      pilotMode: false,
      jobTemplate: template,
      clientContext: { ...(manifest.clientContext ?? {}), motionPilotFallbackFrom: tournamentId, fallbackReason: reason }
    });
    manifest.pilotState = "fallback";
    manifest.fallbackReason = reason;
    manifest.fallbackTournamentId = fallbackTournamentId;
    manifest.state = "cancelled";
    manifest.elapsedTime = Math.max(0, Date.now() - Date.parse(manifest.createdAt));
    manifest.directionOutputCount = manifest.candidates
      .slice(0, manifest.initialCandidateCount)
      .filter((candidate) => Boolean(candidate.jobId && candidate.qualityReportRef))
      .length;
    manifest.totalCandidateJobs = manifest.candidates.filter((candidate) => Boolean(candidate.jobId)).length;
    manifest.repairCount = manifest.retryCount;
    manifest.candidates.forEach((candidate) => {
      if (candidate.state !== "accepted") candidate.state = "cancelled";
      candidate.updatedAt = new Date().toISOString();
    });
    await writeAnimationTournamentManifest(manifest);
    return { ok: true, tournament: manifest, fallbackTournament: fallback.tournament };
  });
}

async function startAnimationDirectionRepair(tournamentId: string, requestedDirections: unknown) {
  return withAnimationTournamentLock(tournamentId, () => startAnimationDirectionRepairUnlocked(tournamentId, requestedDirections));
}

async function startAnimationDirectionRepairUnlocked(tournamentId: string, requestedDirections: unknown) {
  const manifest = await readAnimationTournamentManifestRequired(tournamentId);
  if (manifest.state !== "accepted" || !manifest.winnerCandidateId) throw new Error("Direction Repair requires an accepted tournament winner.");
  if (manifest.retryCount >= 2) throw new Error("Direction Repair retry limit reached; return to human review.");
  const directions = normalizeDirectionNames(requestedDirections).filter((direction) => manifest.requestedDirections.includes(direction));
  if (directions.length === 0) throw new Error("Select at least one accepted direction to repair.");
  const existing = manifest.candidates.find((candidate) =>
    candidate.repairDirections?.length === directions.length &&
    candidate.repairDirections.every((direction) => directions.includes(direction)) &&
    candidate.state !== "failed" && candidate.state !== "cancelled"
  );
  if (existing?.jobId) {
    return { reused: true, job: await codexJobResponse(existing.jobId, true), tournament: await refreshAnimationTournamentManifest(tournamentId) };
  }

  const template = parseJsonText<CodexJobRequest>(await readFile(animationTournamentTemplatePath(tournamentId), "utf8"));
  const repairFrameCount = normalizeMotionFrameCount(template.framesPerDirection) ?? 8;
  const repairIndex = manifest.candidates.length;
  const idempotencyKey = `${manifest.idempotencyKey}:repair:${manifest.retryCount + 1}:${directions.map(directionSlug).sort().join("+")}`;
  const now = new Date().toISOString();
  manifest.retryCount += 1;
  manifest.candidates.push({
    index: repairIndex,
    state: "repairing",
    idempotencyKey,
    updatedAt: now,
    repairDirections: directions,
    reason: "direction repair requested"
  });
  directions.forEach((direction) => {
    manifest.directionStates[direction] = { state: "repairing", updatedAt: now, reason: "direction repair requested" };
  });
  await writeAnimationTournamentManifest(manifest);

  const body: CodexJobRequest = {
    ...template,
    directions,
    grid: { columns: repairFrameCount, rows: directions.length, gutter: 0 },
    frames: repairFrameCount * directions.length,
    framesPerDirection: repairFrameCount,
    tournamentId,
    tournamentCandidateIndex: repairIndex,
    tournamentCandidateCount: repairIndex + 1,
    generationProfile: manifest.generationProfile,
    idempotencyKey,
    sourceFingerprint: manifest.sourceFingerprint,
    repairDirections: directions,
    repairOfJobId: manifest.winnerCandidateId,
    jobNotes: [
      template.jobNotes ?? "",
      `Direction Repair ${manifest.retryCount}/2 for tournament ${tournamentId}.`,
      `Regenerate only: ${directions.join(", ")}.`,
      `Accepted winner: ${manifest.winnerCandidateId}. Preserve all untargeted direction hashes exactly.`,
      `Accepted direction hashes: ${JSON.stringify(manifest.acceptedDirectionHashes)}.`,
      `Use the same source fingerprint, motion recipe or preset, ${repairFrameCount}-frame contract, cell size, chroma key, adjacent direction pose language, timing, palette, silhouette, and topology-specific contact line.`
    ].filter(Boolean).join("\n")
  };
  const job = await createCodexJob(body);
  return { reused: false, job, tournament: await refreshAnimationTournamentManifest(tournamentId) };
}

async function acceptAnimationDirectionRepair(tournamentId: string, repairJobId: string) {
  return withAnimationTournamentLock(tournamentId, () => acceptAnimationDirectionRepairUnlocked(tournamentId, repairJobId));
}

async function acceptAnimationDirectionRepairUnlocked(tournamentId: string, repairJobId: string) {
  const manifest = await readAnimationTournamentManifestRequired(tournamentId);
  const repair = manifest.candidates.find((candidate) => candidate.jobId === repairJobId && candidate.repairDirections?.length);
  if (!repair?.repairDirections || !manifest.winnerCandidateId) throw new Error("Direction Repair job is not registered or the winner is missing.");
  const isPilotExpansion = manifest.pilotMode && manifest.pilotState === "expanding" && manifest.expansionJobId === repairJobId;
  const repairStatus = await getRunnerStatus(repairJobId);
  if (repairStatus.state === "running") throw new Error("Direction Repair is still running.");
  const repairDir = tournamentJobOutboxDir(tournamentId, repairJobId);
  const repairArtifact = await inspectDirectionSplitArtifact(repairJobId, repairDir);
  if (!repairArtifact.ready || !repairArtifact.verified) throw new Error(`Direction Repair is not a verified artifact: ${repairArtifact.reason}`);
  if (!repairArtifact.animationQuality) throw new Error("Direction Repair must pass client Quality Gate v2 evaluation before acceptance.");

  const winnerJobId = manifest.winnerCandidateId;
  const winnerDir = tournamentJobOutboxDir(tournamentId, winnerJobId);
  const beforeHashes = { ...manifest.acceptedDirectionHashes };
  for (const direction of repair.repairDirections) {
    const slug = directionSlug(direction);
    const [repairFile, existingWinnerFile] = await Promise.all([
      findDirectionSplitCandidateFile(repairJobId, slug, repairDir),
      findDirectionSplitCandidateFile(winnerJobId, slug, winnerDir)
    ]);
    if (!repairFile) throw new Error(`Direction Repair is missing ${direction}.`);
    const winnerPath = existingWinnerFile?.path ?? (isPilotExpansion
      ? join(winnerDir, repairFile.finalName.replace(repairJobId, winnerJobId))
      : "");
    if (!winnerPath) throw new Error(`Accepted winner is missing ${direction}.`);
    await copyFile(repairFile.path, winnerPath);
  }

  const afterHashes: Record<string, string> = {};
  const changedUntargeted: string[] = [];
  for (const direction of manifest.requestedDirections) {
    const winnerFile = await findDirectionSplitCandidateFile(winnerJobId, directionSlug(direction), winnerDir);
    if (!winnerFile) throw new Error(`Accepted winner is missing ${direction} after repair.`);
    afterHashes[direction] = await hashFile(winnerFile.path);
    if (!repair.repairDirections.includes(direction) && beforeHashes[direction] && beforeHashes[direction] !== afterHashes[direction]) changedUntargeted.push(direction);
  }
  if (changedUntargeted.length > 0) throw new Error(`Direction Repair changed untargeted directions: ${changedUntargeted.join(", ")}`);

  if (isPilotExpansion) await updateMotionPilotWinnerExpectedDirections(winnerJobId, manifest.requestedDirections);
  await new Promise((resolveDelay) => setTimeout(resolveDelay, Math.min(artifactStableMs + 50, 2000)));
  const published = await publishTournamentWinnerUnlocked(tournamentId, winnerJobId);
  const updated = await readAnimationTournamentManifestRequired(tournamentId);
  updated.acceptedDirectionHashes = afterHashes;
  repair.state = "accepted";
  repair.updatedAt = new Date().toISOString();
  repair.repairDirections.forEach((direction) => {
    updated.directionStates[direction] = { state: "accepted", updatedAt: new Date().toISOString(), jobId: repairJobId };
  });
  updated.requestedDirections
    .filter((direction) => !repair.repairDirections?.includes(direction))
    .forEach((direction) => {
      updated.directionStates[direction] = {
        state: "accepted",
        updatedAt: new Date().toISOString(),
        jobId: winnerJobId,
        reason: "untargeted direction preserved from accepted winner"
      };
    });
  const updatedRepair = updated.candidates.find((candidate) => candidate.jobId === repairJobId);
  if (updatedRepair) {
    updatedRepair.state = "accepted";
    updatedRepair.updatedAt = new Date().toISOString();
  }
  updated.state = "accepted";
  if (isPilotExpansion) {
    updated.pilotState = "completed";
    updated.expansionDirectionIds = repair.repairDirections;
    updated.expansionJobId = repairJobId;
    updated.directionOutputCount = (updated.pilotCandidateIds?.length ?? updated.initialCandidateCount) + repair.repairDirections.length;
    updated.totalCandidateJobs = (updated.pilotCandidateIds?.length ?? updated.initialCandidateCount) + 1;
    updated.elapsedTime = Math.max(0, Date.now() - Date.parse(updated.createdAt));
    updated.repairCount = updated.retryCount;
  }
  await writeAnimationTournamentManifest(updated);
  return {
    ok: true,
    tournament: updated,
    published,
    repairedDirections: repair.repairDirections,
    beforeHashes,
    afterHashes,
    unchangedDirections: manifest.requestedDirections.filter((direction) => !repair.repairDirections?.includes(direction))
  };
}

async function updateMotionPilotWinnerExpectedDirections(jobId: string, directions: string[]) {
  const path = join(inboxDir, `${jobId}.json`);
  const job = parseJsonText<Record<string, unknown>>(await readFile(path, "utf8"));
  const spriteContext = job.spriteContext && typeof job.spriteContext === "object"
    ? job.spriteContext as Record<string, unknown>
    : {};
  const framesPerDirection = normalizeMotionFrameCount(spriteContext.framesPerDirection) ?? 8;
  job.spriteContext = {
    ...spriteContext,
    directions,
    grid: { columns: framesPerDirection, rows: directions.length, gutter: 0 },
    frames: framesPerDirection * directions.length
  };
  await writeFile(path, JSON.stringify(job, null, 2), "utf8");
}

async function refreshAnimationTournamentManifest(tournamentId: string) {
  const manifest = await readAnimationTournamentManifest(tournamentId);
  if (!manifest) return null;
  let changed = false;
  for (const candidate of manifest.candidates) {
    if (typeof candidate.warningCount === "number" && (!Number.isFinite(candidate.warningCount) || candidate.warningCount > 999)) {
      candidate.warningCount = 0;
      changed = true;
    }
    if (!candidate.jobId || candidate.state === "accepted" || candidate.state === "cancelled") continue;
    const status = await getRunnerStatus(candidate.jobId);
    let nextState = candidate.state;
    if (status.state === "running") nextState = "running";
    else if (status.state === "completed") {
      const artifact = await inspectDirectionSplitArtifact(candidate.jobId, tournamentJobOutboxDir(tournamentId, candidate.jobId));
      nextState = artifact.ready ? (artifact.animationQuality ? "quality-evaluated" : "artifact-ready") : "failed";
      if (artifact.animationQuality) {
        candidate.qualityReportRef = `${candidate.jobId}-manifest.json#animationQuality`;
        if (!manifest.qualityReportRefs.includes(candidate.qualityReportRef)) manifest.qualityReportRefs.push(candidate.qualityReportRef);
      }
      candidate.reason = artifact.reason;
    } else if (status.state === "failed" || status.state === "unavailable" || status.state === "disabled") nextState = "failed";
    if (nextState !== candidate.state) {
      candidate.state = nextState;
      candidate.updatedAt = new Date().toISOString();
      changed = true;
    }
  }
  if (manifest.state !== "accepted" && manifest.state !== "cancelled" && manifest.state !== "pilot-review" && manifest.state !== "pilot-expanding") {
    const started = manifest.candidates.filter((candidate) => candidate.jobId);
    const hasActiveCandidate = started.some((candidate) => ["running", "artifact-ready", "quality-evaluated", "repairing"].includes(candidate.state));
    const nextState = hasActiveCandidate
      ? "running"
      : manifest.winnerCandidateId
        ? "accepted"
      : started.length > 0 && started.every((candidate) => candidate.state === "failed")
        ? "failed"
        : manifest.state;
    if (nextState !== manifest.state) {
      manifest.state = nextState;
      changed = true;
    }
    if (nextState === "failed") {
      const updatedAt = new Date().toISOString();
      manifest.requestedDirections.forEach((direction) => {
        const directionState = manifest.directionStates[direction];
        if (directionState?.state === "failed") return;
        manifest.directionStates[direction] = {
          state: "failed",
          updatedAt,
          reason: "all tournament candidates reached a failed terminal state"
        };
        changed = true;
      });
    }
  }
  if (manifest.pilotMode && manifest.pilotState === "review" && manifest.state !== "pilot-review") {
    manifest.state = "pilot-review";
    changed = true;
  }
  if (manifest.pilotMode && manifest.pilotState === "expanding" && manifest.state !== "pilot-expanding") {
    manifest.state = "pilot-expanding";
    changed = true;
  }
  const hasPendingDirectionRepair = manifest.candidates.some((candidate) =>
    candidate.repairDirections?.length && ["running", "repairing", "artifact-ready", "quality-evaluated"].includes(candidate.state)
  );
  if (manifest.state === "accepted" && manifest.winnerCandidateId && !hasPendingDirectionRepair) {
    const updatedAt = new Date().toISOString();
    manifest.requestedDirections.forEach((direction) => {
      const directionState = manifest.directionStates[direction];
      if (directionState?.state === "accepted") return;
      manifest.directionStates[direction] = {
        state: "accepted",
        updatedAt,
        jobId: manifest.winnerCandidateId,
        reason: "restored accepted winner after terminal Direction Repair"
      };
      changed = true;
    });
  }
  if (manifest.pilotMode && !manifest.pilotWinnerId) {
    const completedPilotOutputs = manifest.candidates
      .slice(0, manifest.initialCandidateCount)
      .filter((candidate) => Boolean(candidate.jobId && candidate.qualityReportRef))
      .length;
    if (manifest.directionOutputCount !== completedPilotOutputs) {
      manifest.directionOutputCount = completedPilotOutputs;
      changed = true;
    }
  }
  const totalCandidateJobs = manifest.candidates.filter((candidate) => Boolean(candidate.jobId)).length;
  if (manifest.totalCandidateJobs !== totalCandidateJobs) {
    manifest.totalCandidateJobs = totalCandidateJobs;
    changed = true;
  }
  if (manifest.repairCount !== manifest.retryCount) {
    manifest.repairCount = manifest.retryCount;
    changed = true;
  }
  if (changed) await writeAnimationTournamentManifest(manifest);
  return manifest;
}

async function listAnimationTournamentManifests() {
  const entries = await readdir(tournamentWorkRootDir, { withFileTypes: true });
  const manifests = await Promise.all(entries
    .filter((entry) => entry.isDirectory() && isSafeTournamentId(entry.name))
    .map((entry) => refreshAnimationTournamentManifest(entry.name).catch(() => null)));
  return manifests.filter((manifest): manifest is AnimationTournamentManifest => Boolean(manifest))
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
}

async function readAnimationTournamentManifest(tournamentId: string) {
  try {
    const manifest = parseJsonText<AnimationTournamentManifest>(await readFile(animationTournamentManifestPath(tournamentId), "utf8"));
    return manifest.schema === "image-cockpit.animation-tournament.v1" ? manifest : null;
  } catch {
    return null;
  }
}

async function readAnimationTournamentManifestRequired(tournamentId: string) {
  const manifest = await readAnimationTournamentManifest(tournamentId);
  if (!manifest) throw new Error("Tournament manifest was not found.");
  return manifest;
}

async function writeAnimationTournamentManifest(manifest: AnimationTournamentManifest) {
  manifest.updatedAt = new Date().toISOString();
  await mkdir(animationTournamentDir(manifest.tournamentId), { recursive: true });
  await writeJsonAtomic(animationTournamentManifestPath(manifest.tournamentId), manifest);
}

async function writeJsonAtomic(path: string, value: unknown) {
  const temporaryPath = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporaryPath, JSON.stringify(value, null, 2), "utf8");
  await rename(temporaryPath, path);
}

async function withAnimationTournamentLock<T>(tournamentId: string, action: () => Promise<T>) {
  const previous = animationTournamentLocks.get(tournamentId) ?? Promise.resolve();
  let release = () => {};
  const current = new Promise<void>((resolveLock) => {
    release = resolveLock;
  });
  const queued = previous.then(() => current);
  animationTournamentLocks.set(tournamentId, queued);
  await previous;
  try {
    return await action();
  } finally {
    release();
    if (animationTournamentLocks.get(tournamentId) === queued) animationTournamentLocks.delete(tournamentId);
  }
}

function normalizeAnimationGenerationProfile(value: unknown): AnimationGenerationProfile {
  return value === "fast" || value === "balanced" || value === "best" ? value : "best";
}

function animationGenerationProfilePlan(profile: AnimationGenerationProfile) {
  if (profile === "fast") return { initialCandidates: 1, maximumCandidates: 1 };
  if (profile === "balanced") return { initialCandidates: 2, maximumCandidates: 3 };
  return { initialCandidates: 3, maximumCandidates: 3 };
}

function normalizeDirectionNames(value: unknown) {
  if (!Array.isArray(value)) return [];
  const allowed = new Set(directionSplitNames);
  return Array.from(new Set(value.filter((item): item is string => typeof item === "string" && allowed.has(item))));
}

function normalizeBoundedInteger(value: unknown, fallback: number, minimum: number, maximum: number) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(maximum, Math.max(minimum, Math.floor(value)))
    : fallback;
}

function normalizeMotionFrameCount(value: unknown) {
  const parsed = typeof value === "number" && Number.isFinite(value) ? Math.floor(value) : Number(value);
  return parsed === 4 || parsed === 6 || parsed === 8 || parsed === 12 ? parsed : undefined;
}

function directionSplitGridForFrameCount(value: number) {
  if (value === 6) return { columns: 3, rows: 2, gutter: 0 };
  return { columns: 4, rows: Math.max(1, Math.ceil(value / 4)), gutter: 0 };
}

function normalizeShortText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 160) : undefined;
}

function normalizePositiveInteger(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : undefined;
}

function normalizeMotionRecipeContext(body: CodexJobRequest) {
  const raw = body.motionRecipe && typeof body.motionRecipe === "object"
    ? body.motionRecipe as Record<string, unknown>
    : undefined;
  const id = normalizeShortText(raw?.id ?? body.motionRecipeId ?? body.presetId);
  if (!id) return undefined;
  const modifiers = raw?.modifiers && typeof raw.modifiers === "object"
    ? Object.fromEntries(Object.entries(raw.modifiers as Record<string, unknown>)
        .filter((entry): entry is [string, string] => typeof entry[1] === "string")
        .slice(0, 12))
    : undefined;
  return {
    id,
    version: normalizePositiveInteger(raw?.version ?? body.motionRecipeVersion) ?? 1,
    compilerVersion: normalizeShortText(raw?.compilerVersion ?? body.motionRecipeCompilerVersion) ?? "unknown",
    qualityProfile: normalizeShortText(raw?.qualityProfile ?? body.motionRecipeQualityProfile),
    bodyTopology: normalizeShortText(raw?.bodyTopology),
    frameCount: normalizeMotionFrameCount(raw?.frameCount ?? body.framesPerDirection),
    modifiers,
    experimental: raw?.experimental === true || undefined
  };
}

function isSafeIdempotencyKey(value: string) {
  return /^[A-Za-z0-9_.:-]{8,200}$/.test(value);
}

function directionSlug(direction: string) {
  const index = directionSplitNames.indexOf(direction);
  return directionSplitSlugs[index] ?? direction.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

async function hashFile(path: string) {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

async function writeSelectedImageAsset(jobId: string, body: CodexJobRequest) {
  const existingAssetPath = resolveSafeAssetPath(body.selectedImageAssetPath);
  if (existingAssetPath) {
    const bytes = await readFile(existingAssetPath);
    const mimeType = mimeTypeForImage(existingAssetPath) ?? "application/octet-stream";
    return { path: existingAssetPath, mimeType, source: "content-addressed-asset", fingerprint: createHash("sha256").update(bytes).digest("hex") };
  }
  const value = body.selectedImageDataUrl;
  if (!value) return null;

  const dataUrlMatch = value.match(/^data:([^;,]+);base64,(.+)$/);
  if (dataUrlMatch) {
    const mimeType = dataUrlMatch[1];
    const extension = extensionForMimeType(mimeType);
    if (!extension) return null;
    const bytes = Buffer.from(dataUrlMatch[2], "base64");
    const fingerprint = createHash("sha256").update(bytes).digest("hex");
    const path = join(assetsDir, `source-${fingerprint}${extension}`);
    if (!existsSync(path)) await writeFile(path, bytes);
    return { path, mimeType, source: "data-url", fingerprint };
  }

  if (value.startsWith("/")) {
    const sourcePath = resolve("public", value.replace(/^\/+/, ""));
    const root = `${resolve("public")}${sep}`;
    if (!sourcePath.startsWith(root)) return null;
    const mimeType = mimeTypeForImage(sourcePath);
    const extension = extname(sourcePath).toLowerCase();
    if (!mimeType || !extension) return null;
    const bytes = await readFile(sourcePath);
    const fingerprint = createHash("sha256").update(bytes).digest("hex");
    const path = join(assetsDir, `source-${fingerprint}${extension}`);
    if (!existsSync(path)) await copyFile(sourcePath, path);
    return { path, mimeType, source: value, fingerprint };
  }

  return null;
}

function resolveSafeAssetPath(value: unknown) {
  if (typeof value !== "string" || !value) return null;
  const rootDir = resolve(assetsDir);
  const candidate = resolve(value);
  const root = rootDir.endsWith(sep) ? rootDir : `${rootDir}${sep}`;
  return candidate.startsWith(root) && existsSync(candidate) ? candidate : null;
}

function normalizeWorkflowMode(value?: string): CodexWorkflowMode {
  if (
    value === "image-generate" ||
    value === "image-edit" ||
    value === "sprite-generate" ||
    value === "sprite-edit" ||
    value === "effect-animation"
  ) {
    return value;
  }
  return "image-generate";
}

function workflowUsesSelectedImage(mode: CodexWorkflowMode) {
  return mode === "image-edit" || mode === "sprite-generate";
}

function workflowUsesSpriteContext(mode: CodexWorkflowMode) {
  return mode === "sprite-generate" || mode === "sprite-edit" || mode === "effect-animation";
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
  if (mode === "effect-animation") {
    return "Ask local Codex to use imagegen / built-in image_gen to create a transparent game VFX animation sheet and metadata.";
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
      "Each direction image is an animation sheet, not a still direction reference image: all populated cells must show the requested action progressing over time. Do not paste, upscale, or lightly nudge one still pose into every frame.",
      "Before publishing standard animation output, compare neighboring frames in each direction. If the frame-to-frame motion is nearly identical, regenerate that direction with clearer pose, limb, cloth, hair, equipment, or breathing changes while keeping the same character and grounded baseline.",
      "Reject and retry the sprite sheet if any cell has a cropped head, missing feet, multiple heads, a head below the feet, inconsistent scale, body fragments, or a different character.",
      "Use the requested chroma-key background color as a flat simple background in every cell so Image Cockpit can remove it after import.",
      "For standard direction-split output, keep every intermediate, source, QA, and candidate file under outbox/.staging/<job-id>/ or another non-root work folder while work is still in progress. Do not write, copy, or manifest any root outbox <job-id>-*.png or <job-id>-manifest.json until the complete requested direction set is normalized, self-checked, and no further regeneration is planned. The final step must publish only the requested final direction PNG/WebP files plus the final manifest into the root outbox, with the manifest written last. Keep *-qa.json, work files, temporary files, contact sheets, comparison sheets, and debug images outside the root.",
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
  if (mode === "effect-animation") {
    return [
      "Use imagegen / built-in image_gen when available to create a real raster transparent PNG sprite sheet for a game visual effect.",
      "Use effectContext as the strict output contract: category, type, style, palette, frameCount, frameSize, layout, loopMode, anchor, blendMode, and sheetSize.",
      "Return one final transparent PNG sheet with the job id filename prefix. Include metadata JSON and preview GIF when feasible.",
      "The final sheet must use real alpha transparency. Do not bake checkerboard, solid matte backgrounds, UI panels, labels, frame numbers, text, logos, watermarks, or border guides into the image.",
      "Each populated frame must show visible temporal progression. Do not copy one still effect into every frame.",
      "Keep the effect inside each cell with alpha padding, no clipping at bounds, no overlap into neighboring cells, and no extra gutters.",
      blockerSidecarNote
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

async function startCodexRunner(
  job: { id: string; createdAt: string; path: string; outboxDir: string },
  resume?: { initialStartedAt?: string; resumeCount?: number }
) {
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

  const capacityBlock = await getRunnerCapacityBlock();
  if (capacityBlock) {
    const finishedAt = new Date().toISOString();
    const status: CodexRunnerStatus = {
      jobId: job.id,
      state: "unavailable",
      message: capacityBlock.userMessage,
      statusPath,
      logPath,
      finishedAt,
      diagnostic: diagnosticFromRunnerCapacityBlock(capacityBlock)
    };
    await writeFile(
      logPath,
      `[${finishedAt}] Codex runner was not started: ${capacityBlock.title}: ${capacityBlock.userMessage}\n`,
      "utf8"
    );
    await writeRunnerStatus(status);
    return status;
  }

  if (isMockRunnerBlocked()) {
    const finishedAt = new Date().toISOString();
    const diagnostic = mockRunnerBlockedDiagnostic();
    const status: CodexRunnerStatus = {
      jobId: job.id,
      state: "unavailable",
      message: diagnostic.userMessage,
      command: codexLaunchCommand,
      requestedCommand: codexCommand,
      statusPath,
      logPath,
      outboxDir: job.outboxDir,
      finishedAt,
      diagnostic
    };
    await writeFile(
      logPath,
      `[${finishedAt}] Codex runner was not started: ${diagnostic.title}: ${diagnostic.userMessage}\n`,
      "utf8"
    );
    await writeRunnerStatus(status);
    return status;
  }

  const startedAt = new Date().toISOString();
  const status: CodexRunnerStatus = {
    jobId: job.id,
    state: "running",
    message: resume ? `Resumed ${codexCommand} exec for ${job.id} after the API process restarted` : `Started ${codexCommand} exec for ${job.id}`,
    command: codexLaunchCommand,
    requestedCommand: codexCommand,
    startedAt,
    initialStartedAt: resume?.initialStartedAt ?? startedAt,
    resumedAt: resume ? startedAt : undefined,
    resumeCount: resume?.resumeCount ?? 0,
    statusPath,
    logPath,
    outboxDir: job.outboxDir
  };
  runnerStatuses.set(job.id, status);
  await writeRunnerStatus(status);

  const logStream = createWriteStream(logPath, { flags: "a" });
  const prompt = buildCodexRunnerPrompt(job, Boolean(resume));
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

  const capacityBlock = await getRunnerCapacityBlock();
  if (capacityBlock) {
    return {
      ...base,
      state: "unavailable",
      message: capacityBlock.userMessage,
      errorCode: capacityBlock.kind,
      setupHint: capacityBlock.suggestion
    };
  }

  if (isMockRunnerBlocked()) {
    const diagnostic = mockRunnerBlockedDiagnostic();
    return {
      ...base,
      state: "unavailable",
      message: diagnostic.userMessage,
      errorCode: "mock_runner",
      setupHint: diagnostic.suggestion
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
            message:
              codexRunnerMode === "mock"
                ? "Mock/test runner is executable. This does not prove that Codex imagegen is available."
                : `${codexLaunchCommand} is executable from the local handoff server.`
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
    mode: codexRunnerMode,
    mockRunnerAllowed: allowMockRunner,
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

function detectCodexRunnerMode(
  command: string,
  launchCommand: string,
  helpArgs: readonly string[],
  execArgs: readonly string[]
): CodexRunnerMode {
  const modeProbe = [
    command,
    launchCommand,
    ...helpArgs,
    ...execArgs,
    process.env.IMAGE_COCKPIT_MOCK_RUNNER_DELAY_MS ? "IMAGE_COCKPIT_MOCK_RUNNER_DELAY_MS" : ""
  ]
    .join("\n")
    .toLowerCase();
  if (
    modeProbe.includes("mock-codex-runner") ||
    modeProbe.includes("review-mock-runner") ||
    modeProbe.includes("image-cockpit-ui-smoke") ||
    modeProbe.includes("image_cockpit_mock_runner_delay_ms")
  ) {
    return "mock";
  }

  if (isCodexCommandName(basename(command)) || isCodexCommandName(basename(launchCommand))) return "codex";
  return "custom";
}

function isMockRunnerBlocked() {
  return codexRunnerMode === "mock" && !allowMockRunner;
}

function mockRunnerBlockedDiagnostic(): CodexJobDiagnostic {
  return {
    kind: "runner_failed",
    title: "Mock runner configured",
    userMessage:
      "A mock/test Codex runner is configured, so Image Cockpit did not start it as a real image generation backend.",
    suggestion:
      "Use a real Codex CLI command for imagegen, or set IMAGE_COCKPIT_CODEX_AUTORUN=0 for manual handoff. Set IMAGE_COCKPIT_ALLOW_MOCK_RUNNER=1 only for automated smoke tests."
  };
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

function buildCodexRunnerPrompt(job: { id: string; path: string; outboxDir: string }, resumed = false) {
  return [
    "You are processing an Image Cockpit for Codex Workflows handoff job.",
    "",
    `Read this local JSON job file: ${job.path}`,
    ...(resumed ? [
      "This is a resumable retry after the API process restarted. Inspect the exact job outbox and its .staging subtree before generating anything new.",
      "Reuse direction sheets and intermediate files that already belong to this job and pass the job contract. Continue only missing or invalid directions, then verify the full set and write the final manifest last.",
      "Do not restart completed direction generation merely because this is a fresh Codex process, and never borrow files from another candidate or job."
    ] : []),
    "If selectedImage.assetPath is populated, inspect that source image before editing it.",
    "If selectedImage.assetPath is empty, treat the job as prompt-only unless the job notes say otherwise.",
    "Trust the job JSON as the generation contract. Do not perform broad repository audits or read unrelated project docs/source files when the job prompt and jobNotes already provide the needed contract.",
    "On Windows, do not use System.Drawing for image inspection because it may be unavailable. Use Python/Pillow, PNG header bytes, or another local image tool instead.",
    "For workflowMode=image-generate, use the imagegen skill default built-in image generation path with built-in image_gen when available. Create a real raster image from the job prompt, never a procedural placeholder and never a procedural, SVG, canvas, diagram, geometric, or placeholder image.",
    "For workflowMode=image-generate, if built-in imagegen / image_gen is unavailable, write only a small blocked JSON sidecar into the outbox with reasonKind=imagegen_unavailable and do not create a fake image.",
    "For workflowMode=image-edit, inspect selectedImage.assetPath, use imagegen / built-in image_gen editing when available, follow numbered annotationContext region comments plus prompt/jobNotes, use imageRectNormalized/imageRectPixels when present, preserve the original canvas size/aspect ratio, keep the full character including head, hair, hands, equipment, and both feet visible, do not zoom, crop, or reframe into a portrait/detail shot, preserve transparency or use a flat chroma fallback, change only requested regions when possible, and return a real edited PNG or WebP with the job id filename prefix. Never create a procedural, SVG, canvas, diagram, geometric, or placeholder image.",
    "For workflowMode=sprite-generate, inspect selectedImage.assetPath, then use imagegen / built-in image_gen when available to create the requested sprite sheet assets from the source character image. Never create a procedural, SVG, canvas, diagram, geometric, or placeholder image.",
    "For workflowMode=sprite-generate, follow spriteContext.grid, spriteContext.cell, spriteContext.directions, spriteContext.variant, and spriteContext.chromaKey exactly. Keep one full-body character centered inside each strict cell with padding, no cropping, no duplicated heads, and no body parts crossing cells.",
    "For workflowMode=sprite-generate with spriteContext.variant=standard, return exactly one separate direction PNG/WebP image per entry in spriteContext.directions, using the direction name with spaces replaced by dashes as the filename suffix (full set: front, front-three-quarter, side, back-three-quarter, back). If spriteContext.directions is empty, return all five. Follow spriteContext.framesPerDirection exactly: 4 frames use 4x1, 6 frames use 3x2, 8 frames use 4x2, and 12 frames use 4x3, with spriteContext.cell dimensions and no gutters. Do not return only one combined multi-direction sheet, and do not return directions that were not requested.",
    "For workflowMode=sprite-generate with spriteContext.variant=standard, every populated cell in each direction image must be a distinct animation frame for spriteContext.action, not a repeated still pose. Static or nearly static rows are failed material even when the directions, padding, and chroma key are otherwise correct.",
    "For workflowMode=sprite-generate with spriteContext.motionRecipe.bodyTopology, use its topology-specific contact and anchor contract. Never invent humanoid feet for quadruped, serpentine/body-contact, floating, winged-flying, or multi-leg characters; evaluate paw contact, body contact, hover height, wing beat, or multi-contact support instead.",
    "For idle breathing, the feet must stay planted but most of the requested direction sheets must show readable frame-to-frame breathing or secondary motion: 2-4px shoulder/chest/head change plus hair, scarf, cape, cloth, or equipment follow-through. Regenerate any direction whose frames look nearly identical before writing the final manifest.",
    "For standard direction-split output, keep generated direction images, source manifests, contact sheets, comparison sheets, QA files, and all candidates under outbox/.staging/<job-id>/ or another non-root work folder while work is still in progress. Do not write, copy, or manifest root outbox <job-id>-*.png or <job-id>-manifest.json until the complete requested direction set is normalized, self-checked, and no further regeneration is planned. The final runner step must publish only the requested final direction PNG/WebP files into the root outbox and write the final <job-id>-manifest.json last. Image Cockpit will verify artifacts after the runner has finished and may rewrite the manifest after completion.",
    "For workflowMode=sprite-generate, inspect all cells before writing the final file and retry if any head is cut off, feet are missing, a head appears below feet, scale changes wildly, or the background is not flat chroma key.",
    "For workflowMode=sprite-generate with spriteContext.variant=hatch-pet, use the installed hatch-pet skill/scripts when available. Build a Codex pet atlas with 8 columns x 9 rows, 192x208 cells, 1536x1872 total, transparent unused cells, contact-sheet QA, and final spritesheet PNG/WebP returned with the job id filename prefix. Include pet.json as a sidecar if produced.",
    "For workflowMode=sprite-generate with spriteContext.variant=directional-hatch-pet, use the installed hatch-pet skill/scripts when available and return exactly five separate Codex pet atlas images: direction-01-front, direction-02-front-three-quarter, direction-03-side, direction-04-back-three-quarter, and direction-05-back. Each atlas must be 8 columns x 9 rows, 192x208 cells, 1536x1872 total, transparent unused cells, and use the job id filename prefix plus the direction suffix. Do not return only one giant combined sheet.",
    "For workflowMode=effect-animation, use imagegen / built-in image_gen when available to create one real transparent PNG game VFX animation sheet. Never create a procedural, SVG, canvas, diagram, geometric, or placeholder image.",
    "For workflowMode=effect-animation, follow effectContext exactly: frameCount, frameSize, layout columns/rows, sheetSize, loopMode, anchor, style, palette, category, type, and blendMode. The final PNG must use the job id filename prefix and preferably include '-effect-sheet' in the name.",
    "For workflowMode=effect-animation, do not bake checkerboard, solid matte backgrounds, preview backgrounds, UI panels, text, logos, watermarks, frame numbers, labels, arrows, or border guides into the image. Use real alpha transparency and no gutters.",
    "For workflowMode=effect-animation, every populated frame must show readable temporal progression. Reject and retry if frames are static copies, clipped at cell bounds, overlap neighboring cells, or do not match the requested sheet layout.",
    "For workflowMode=effect-animation, include a compact metadata JSON sidecar and a GIF preview when feasible, both using the same job id filename prefix. The PNG sheet is the required final artifact.",
    "Use jobNotes, annotationContext, spriteContext, and effectContext only when those fields are populated for the workflow.",
    "When using imagegen / built-in image_gen, isolate generated artifacts per job. Record the generated image path returned by the tool when available; otherwise record a before timestamp and only copy files created after that invocation. Do not blindly copy the newest file from CODEX_HOME/generated_images, because multiple tournament candidates may run in parallel. If you cannot confidently identify the image produced for this exact job and direction, regenerate that direction or return a blocker sidecar instead of mixing another candidate's image.",
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
    '{ "status": "blocked", "reasonKind": "policy_or_safety" | "imagegen_unavailable" | "unknown", "userMessage": "A short user-safe reason.", "suggestion": "A short retry suggestion." }',
    "- Do not include hidden policy text, internal traces, API keys, access tokens, local absolute paths, or the full prompt in the blocker sidecar.",
    "",
    "When finished, make sure all required usable image files are present in the outbox if generation/editing succeeded."
  ].join("\n");
}

async function writeRunnerStatus(status: CodexRunnerStatus) {
  runnerStatuses.set(status.jobId, status);
  const enrichedStatus = await enrichRunnerStatus(status);
  runnerStatuses.set(enrichedStatus.jobId, enrichedStatus);
  rememberRunnerCapacityBlock(enrichedStatus);
  const statusPath = enrichedStatus.statusPath ?? join(statusDir, `${enrichedStatus.jobId}.json`);
  await writeFile(statusPath, JSON.stringify(enrichedStatus, null, 2), "utf8");
}

async function getRunnerCapacityBlock(): Promise<RunnerCapacityBlock | null> {
  if (isRunnerCapacityBlockActive(cachedRunnerCapacityBlock)) return cachedRunnerCapacityBlock;
  cachedRunnerCapacityBlock = null;
  if (runnerCapacityCooldownMs <= 0) return null;

  let latestBlock: RunnerCapacityBlock | null = null;
  try {
    const names = (await readdir(statusDir)).filter((name) => name.endsWith(".json"));
    await Promise.all(
      names.map(async (name) => {
        try {
          const status = parseJsonText<CodexRunnerStatus>(await readFile(join(statusDir, name), "utf8"));
          const block = runnerCapacityBlockFromStatus(status);
          if (!block) return;
          if (!latestBlock || Date.parse(block.seenAt) > Date.parse(latestBlock.seenAt)) latestBlock = block;
        } catch {
          // Ignore unreadable historical status files; preflight should still work.
        }
      })
    );
  } catch {
    return null;
  }
  cachedRunnerCapacityBlock = latestBlock;
  return latestBlock;
}

function rememberRunnerCapacityBlock(status: CodexRunnerStatus) {
  const block = runnerCapacityBlockFromStatus(status);
  if (block) {
    cachedRunnerCapacityBlock = block;
    return;
  }
  if (status.state === "completed" && !status.diagnostic) cachedRunnerCapacityBlock = null;
}

function runnerCapacityBlockFromStatus(status: CodexRunnerStatus): RunnerCapacityBlock | null {
  if (runnerCapacityCooldownMs <= 0 || status.diagnostic?.kind !== "usage_limit") return null;
  const seenAt = status.finishedAt ?? status.startedAt ?? new Date().toISOString();
  const seenAtMs = Date.parse(seenAt);
  if (!Number.isFinite(seenAtMs)) return null;
  const block: RunnerCapacityBlock = {
    kind: "usage_limit",
    title: status.diagnostic.title,
    userMessage: status.diagnostic.userMessage,
    suggestion: status.diagnostic.suggestion,
    jobId: status.jobId,
    seenAt,
    expiresAt: new Date(seenAtMs + runnerCapacityCooldownMs).toISOString()
  };
  return isRunnerCapacityBlockActive(block) ? block : null;
}

function isRunnerCapacityBlockActive(block: RunnerCapacityBlock | null): block is RunnerCapacityBlock {
  return Boolean(block && Date.parse(block.expiresAt) > Date.now());
}

function diagnosticFromRunnerCapacityBlock(block: RunnerCapacityBlock): CodexJobDiagnostic {
  return {
    kind: block.kind,
    title: block.title,
    userMessage: block.userMessage,
    suggestion: block.suggestion
  };
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

async function activeCodexRunnerCount() {
  const statusNames = await readdir(statusDir).catch(() => [] as string[]);
  const jobIds = statusNames
    .filter((name) => name.endsWith(".json"))
    .map((name) => name.slice(0, -5))
    .filter(isSafeJobId);
  const statuses = await Promise.all(jobIds.map((jobId) => getRunnerStatus(jobId).catch(() => null)));
  return statuses.filter((status) => status?.state === "running").length;
}

async function assertCodexRunnerSlotAvailable() {
  const activeCount = await activeCodexRunnerCount();
  if (activeCount >= maxActiveCodexJobs) {
    throw new Error(`Codex runner slots are full (${activeCount}/${maxActiveCodexJobs}). Wait for a job to finish before starting another.`);
  }
}

async function getRunnerStatus(jobId: string): Promise<CodexRunnerStatus> {
  const liveStatus = runnerStatuses.get(jobId);
  if (liveStatus) return enrichRunnerStatus(await normalizeRunningStatus(liveStatus));

  const statusPath = join(statusDir, `${jobId}.json`);
  try {
    return enrichRunnerStatus(await normalizeRunningStatus(parseJsonText<CodexRunnerStatus>(await readFile(statusPath, "utf8"))));
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

  if (!runnerProcesses.has(status.jobId)) {
    const resultDir = await resolveJobOutboxDir(status.jobId);
    if (resultDir) {
      const artifact = await inspectDirectionSplitArtifact(status.jobId, resultDir).catch(() => null);
      if (artifact?.ready && artifact.verified) {
        const recoveredStatus: CodexRunnerStatus = {
          ...status,
          state: "completed",
          message: "Recovered a verified artifact after the API process restarted.",
          finishedAt: new Date().toISOString(),
          exitCode: null
        };
        await writeRunnerStatus(recoveredStatus);
        return recoveredStatus;
      }
    }

    return resumeUntrackedCodexRunner(status);
  }

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
      status = parseJsonText<CodexRunnerStatus>(await readFile(join(statusDir, `${jobId}.json`), "utf8"));
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
  const [sidecar, logText, hasReturnedImage, directionSplitArtifact] = await Promise.all([
    findJobSidecar(status.jobId, resultDir),
    readShortFile(status.logPath),
    hasOutboxImageForJob(status.jobId, resultDir),
    inspectDirectionSplitArtifact(status.jobId, resultDir)
  ]);
  if (status.state === "completed" && (hasReturnedImage || directionSplitArtifact.detected)) return null;

  const sidecarKind = normalizeFailureKind(sidecar?.reasonKind);
  const diagnosticLogTail = logText.split(/\r?\n/).slice(-12).join("\n");
  const combinedText = [status.message, sidecar?.text, diagnosticLogTail].filter(Boolean).join("\n").toLowerCase();
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
  if (matchesAny(text, ["usage limit", "you've hit your usage limit", "try again at"])) {
    return "usage_limit";
  }
  if (matchesAny(text, ["selected model is at capacity", "model is at capacity", "model capacity is currently unavailable"])) {
    return "runner_failed";
  }
  if (
    matchesAny(text, [
      "imagegen unavailable",
      "imagegen is unavailable",
      "imagegen / image_gen is unavailable",
      "image generation unavailable",
      "image generation is not available",
      "built-in image generation is not available",
      "built-in image_gen unavailable",
      "built-in image_gen is unavailable",
      "tool unavailable",
      "image_gen unavailable",
      "image_gen is unavailable",
      "unavailable imagegen capability"
    ])
  ) {
    return "imagegen_unavailable";
  }
  if (matchesAny(text, ["policy", "safety", "content policy", "disallowed", "not allowed", "blocked", "moderation", "cannot comply", "can't help"])) {
    return "policy_or_safety";
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
      userMessage: "Codex could not run this generation because the configured account hit its usage limit.",
      suggestion: "Wait for the usage window to reset, upgrade the account, or switch to a runner/provider with available capacity."
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
    const entries = await readdir(resultDir, { withFileTypes: true });
    const directionSplitArtifact = await inspectDirectionSplitArtifact(jobId, resultDir);
    if (directionSplitArtifact.detected) {
      const classification = directionSplitArtifact.qualityGate?.classification;
      return (
        directionSplitArtifact.ready ||
        directionSplitArtifact.quality === "bronze" ||
        classification === "quality-failed" ||
        classification === "quarantined-candidate"
      );
    }

    const genericImageReturned = entries
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .some((name) => isGenericImageOutboxFileName(jobId, name));
    if (genericImageReturned) return true;

    return false;
  } catch {
    return false;
  }
}

function isGenericImageOutboxFileName(jobId: string, name: string) {
  return (
    isJobOutboxFileName(jobId, name) &&
    !shouldIgnoreOutboxResultName(name) &&
    Boolean(mimeTypeForImage(name)) &&
    !isDirectionSplitDirectionFileName(name, jobId)
  );
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

  const expectedSpriteContext = await readJobExpectedSpriteContext(jobId);
  const expectedSlugs = expectedSpriteContext.directionSlugs ?? directionSplitSlugs;

  for (const slug of expectedSlugs) {
    const candidate = await findDirectionSplitCandidateFile(jobId, slug, resultDir);
    if (candidate) {
      bySlug.set(slug, candidate);
      files.push(candidate.finalName);
    } else {
      missingDirections.push(directionNameForSlug(slug));
    }
  }

  sourceManifest = await findDirectionSplitSourceManifest(jobId, resultDir);
  const detected = bySlug.size > 0 || Boolean(sourceManifest);
  if (!detected) return emptyDirectionSplitArtifactStatus(jobId);

  const candidateCount = bySlug.size + (sourceManifest ? 1 : 0);
  const expectedChromaKey = expectedSpriteContext.chromaKey;
  const expectedAction = expectedSpriteContext.action ?? normalizeActionValue(sourceManifest?.parsed?.action);
  const expectedFramesPerDirection = expectedSpriteContext.framesPerDirection
    ?? normalizeMotionFrameCount(sourceManifest?.parsed?.framesPerDirection)
    ?? expectedSpriteContext.motionRecipe?.frameCount
    ?? 8;
  const manifestChromaKey = normalizeChromaKeyValue(readManifestChromaKey(sourceManifest?.parsed));
  const manifestQualityGate = sourceManifest ? qualityGateFromManifest(sourceManifest.parsed) : null;
  const animationQuality = sourceManifest ? animationQualityFromManifest(sourceManifest.parsed) : undefined;
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
      animationQuality,
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
      animationQuality,
      qualityGate: makeQualityGate("running", reason, "direction-split-missing-directions", false, false, true, warnings),
      chromaKey: {
        expected: expectedChromaKey,
        manifest: manifestChromaKey,
        warning: chromaWarning
      }
    };
  }

  const candidates = expectedSlugs.map((slug) => bySlug.get(slug)).filter((candidate): candidate is DirectionSplitCandidateFile => Boolean(candidate));
  // Stability protects partially written raster payloads. The manifest is mutable
  // metadata (Quality v2 and tournament evaluation are appended after inspection),
  // so its mtime must not restart the artifact-stability window and livelock publish.
  const newestMtimeMs = Math.max(...candidates.map((candidate) => candidate.mtimeMs));
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
      animationQuality,
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
      animationQuality,
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
      animationQuality,
      qualityGate: makeQualityGate("running", reason, "direction-split-runner-finalizing", false, false, true, warnings),
      chromaKey: {
        expected: expectedChromaKey,
        manifest: manifestChromaKey,
        warning: chromaWarning
      }
    };
  }

  const manifestName = await publishVerifiedDirectionSplitArtifact(jobId, candidates, sourceManifest, expectedChromaKey, expectedAction, expectedSpriteContext.motionRecipe, expectedFramesPerDirection, warnings, resultDir, expectedSlugs);
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
    files: expectedSlugs.map((slug) => `${jobId}-${slug}${extname(bySlug.get(slug)?.finalName ?? ".png") || ".png"}`),
    manifestName,
    stable: true,
    candidateCount,
    animationQuality,
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
      if (!isDirectionSplitSourceManifestObject(parsed)) continue;
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

function isDirectionSplitSourceManifestObject(value: Record<string, unknown>) {
  return value.schema === directionSplitManifestSchema;
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
  expectedAction: string | undefined,
  expectedMotionRecipe: MotionRecipeContext | undefined,
  expectedFramesPerDirection: number,
  warnings: string[],
  targetDir = outboxDir,
  expectedSlugs: string[] = directionSplitSlugs
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
      directions: expectedSlugs.map(directionNameForSlug),
      action: expectedAction,
      motionRecipe: expectedMotionRecipe ?? readManifestMotionRecipe(sourceManifest?.parsed),
      framesPerDirection: expectedFramesPerDirection,
      grid: directionSplitGridForFrameCount(expectedFramesPerDirection),
      files: Object.fromEntries(expectedSlugs.map((slug, index) => [directionNameForSlug(slug), `${jobId}-${slug}${extname(candidates[index]?.finalName ?? ".png") || ".png"}`])),
      chromaKey: expectedChromaKey ? { name: expectedChromaKey } : undefined,
      animationQuality: sourceManifest ? animationQualityFromManifest(sourceManifest.parsed) : undefined,
      animationQualityRecordedAt:
        sourceManifest && typeof sourceManifest.parsed.animationQualityRecordedAt === "string"
          ? sourceManifest.parsed.animationQualityRecordedAt
          : undefined,
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

async function readJobExpectedSpriteContext(jobId: string): Promise<{
  action?: string;
  chromaKey?: string;
  directionSlugs?: string[];
  motionRecipe?: MotionRecipeContext;
  framesPerDirection?: number;
}> {
  try {
    const text = await readFile(join(inboxDir, `${jobId}.json`), "utf8");
    const parsed = JSON.parse(text) as { spriteContext?: { action?: unknown; chromaKey?: unknown; directions?: unknown; motionRecipe?: unknown; framesPerDirection?: unknown } };
    return {
      action: normalizeActionValue(parsed.spriteContext?.action),
      chromaKey: normalizeChromaKeyValue(parsed.spriteContext?.chromaKey),
      directionSlugs: normalizeDirectionSlugsValue(parsed.spriteContext?.directions),
      motionRecipe: readManifestMotionRecipeValue(parsed.spriteContext?.motionRecipe),
      framesPerDirection: normalizeMotionFrameCount(parsed.spriteContext?.framesPerDirection)
    };
  } catch {
    return {};
  }
}

function directionSlugForName(name: string) {
  return name.trim().toLowerCase().replace(/[_\s]+/g, "-");
}

function directionNameForSlug(slug: string) {
  const index = directionSplitSlugs.indexOf(slug);
  return index >= 0 ? directionSplitNames[index] : slug;
}

function normalizeDirectionSlugsValue(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const requested = value
    .filter((item): item is string => typeof item === "string")
    .map(directionSlugForName);
  const ordered = directionSplitSlugs.filter((slug) => requested.includes(slug));
  return ordered.length > 0 && ordered.length < directionSplitSlugs.length ? ordered : undefined;
}

function normalizeActionValue(value: unknown) {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase();
  return normalized || undefined;
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

function readManifestMotionRecipe(manifest?: Record<string, unknown>) {
  return readManifestMotionRecipeValue(manifest?.motionRecipe);
}

function readManifestMotionRecipeValue(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const id = normalizeShortText(record.id);
  if (!id) return undefined;
  const modifiers = record.modifiers && typeof record.modifiers === "object" && !Array.isArray(record.modifiers)
    ? Object.fromEntries(Object.entries(record.modifiers as Record<string, unknown>)
        .filter((entry): entry is [string, string] => typeof entry[1] === "string")
        .slice(0, 12))
    : undefined;
  return {
    id,
    version: normalizePositiveInteger(record.version) ?? 1,
    compilerVersion: normalizeShortText(record.compilerVersion) ?? "unknown",
    qualityProfile: normalizeShortText(record.qualityProfile),
    bodyTopology: normalizeShortText(record.bodyTopology),
    frameCount: normalizeMotionFrameCount(record.frameCount),
    modifiers,
    experimental: record.experimental === true || undefined
  };
}

async function resumeUntrackedCodexRunner(status: CodexRunnerStatus) {
  const existing = resumingRunnerJobs.get(status.jobId);
  if (existing) return existing;

  const resumePromise = (async () => {
    const path = join(inboxDir, `${status.jobId}.json`);
    try {
      const job = parseJsonText<{
        createdAt?: string;
        returnTo?: { outboxDir?: string };
      }>(await readFile(path, "utf8"));
      const resolvedOutboxDir = resolveSafeOutboxSubdir(job.returnTo?.outboxDir) ?? status.outboxDir ?? outboxDir;
      const nextResumeCount = Math.max(0, status.resumeCount ?? 0) + 1;
      return startCodexRunner(
        {
          id: status.jobId,
          createdAt: job.createdAt ?? status.initialStartedAt ?? status.startedAt ?? new Date().toISOString(),
          path,
          outboxDir: resolvedOutboxDir
        },
        {
          initialStartedAt: status.initialStartedAt ?? status.startedAt,
          resumeCount: nextResumeCount
        }
      );
    } catch (error) {
      const failedStatus: CodexRunnerStatus = {
        ...status,
        state: "failed",
        message: `Could not resume the untracked Codex runner: ${error instanceof Error ? error.message : "unknown error"}`,
        finishedAt: new Date().toISOString(),
        exitCode: null
      };
      await writeRunnerStatus(failedStatus);
      return failedStatus;
    }
  })();
  resumingRunnerJobs.set(status.jobId, resumePromise);
  try {
    return await resumePromise;
  } finally {
    resumingRunnerJobs.delete(status.jobId);
  }
}

function animationQualityFromRequest(body: AnimationQualityReportRequest) {
  return normalizeAnimationQualityReport(body.report);
}

function animationQualityFromManifest(manifest: Record<string, unknown>) {
  return normalizeAnimationQualityReport(manifest.animationQuality) ?? undefined;
}

function normalizeAnimationQualityReport(value: unknown): AnimationQualityReportV2 | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const report = value as Record<string, unknown>;
  if (report.metricVersion !== "image-cockpit.animation-quality.v2" || report.policyVersion !== "shadow-v1") return null;
  if (report.hardGateUnchanged !== true) return null;
  try {
    const serialized = JSON.stringify(report);
    if (serialized.length > 512_000) return null;
    return JSON.parse(serialized) as AnimationQualityReportV2;
  } catch {
    return null;
  }
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
  const resultDir = await resolveJobOutboxDir(jobId) ?? outboxDir;
  const manifestPaths = [
    join(resultDir, `${jobId}-manifest.json`),
    join(resultDir, ".staging", jobId, `${jobId}-manifest.json`),
    join(resultDir, ".staging", jobId, "manifest.json")
  ];
  const written: string[] = [];
  const existingManifests = await Promise.all(manifestPaths.map(async (manifestPath) => ({
    manifestPath,
    manifest: await readManifestObject(manifestPath)
  })));
  const targets = existingManifests.some((item) => item.manifest)
    ? existingManifests.filter((item) => item.manifest)
    : [{ manifestPath: manifestPaths[0], manifest: { schema: directionSplitManifestSchema, jobId } }];
  for (const target of targets) {
    const manifestPath = target.manifestPath;
    const manifest = target.manifest ?? { schema: directionSplitManifestSchema, jobId };
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
  return { ok: true, jobId, qualityGate, written };
}

async function writeDirectionSplitAnimationQuality(jobId: string, animationQuality: AnimationQualityReportV2) {
  const resultDir = await resolveJobOutboxDir(jobId) ?? outboxDir;
  const manifestPaths = [...new Set([
    join(resultDir, `${jobId}-manifest.json`),
    join(resultDir, ".staging", jobId, `${jobId}-manifest.json`),
    join(resultDir, ".staging", jobId, "manifest.json"),
    join(outboxDir, `${jobId}-manifest.json`)
  ])];
  const written: string[] = [];
  const recordedAt = new Date().toISOString();
  const existingManifests = await Promise.all(manifestPaths.map(async (manifestPath) => ({
    manifestPath,
    manifest: await readManifestObject(manifestPath)
  })));
  const targets = existingManifests.some((item) => item.manifest)
    ? existingManifests.filter((item) => item.manifest)
    : [{ manifestPath: manifestPaths[0], manifest: { schema: directionSplitManifestSchema, jobId } }];
  for (const target of targets) {
    const manifestPath = target.manifestPath;
    const manifest = target.manifest ?? { schema: directionSplitManifestSchema, jobId };
    manifest.schema = typeof manifest.schema === "string" ? manifest.schema : directionSplitManifestSchema;
    manifest.jobId = typeof manifest.jobId === "string" ? manifest.jobId : jobId;
    manifest.animationQuality = animationQuality;
    manifest.animationQualityRecordedAt = recordedAt;
    await mkdir(resolve(manifestPath, ".."), { recursive: true });
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    written.push(manifestPath);
  }
  return { ok: true, jobId, animationQuality, written };
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
    const parsed = parseJsonText<{
      returnTo?: { outboxDir?: unknown };
    }>(await readFile(join(inboxDir, `${jobId}.json`), "utf8"));
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

async function publishAndAcceptTournamentWinner(tournamentId: string, jobId: string) {
  return withAnimationTournamentLock(tournamentId, async () => {
    const result = await publishTournamentWinnerUnlocked(tournamentId, jobId);
    const tournament = await readAnimationTournamentManifest(tournamentId)
      ? await acceptAnimationTournamentWinner(tournamentId, jobId)
      : undefined;
    return { result, tournament };
  });
}

async function publishTournamentWinnerUnlocked(tournamentId: string, jobId: string) {
  const jobOutboxDir = await resolveJobOutboxDir(jobId);
  const expectedOutboxDir = tournamentJobOutboxDir(tournamentId, jobId);
  if (!jobOutboxDir || resolve(jobOutboxDir) !== resolve(expectedOutboxDir)) {
    throw new Error("Tournament winner job does not belong to the requested hidden work outbox.");
  }

  const artifact = await inspectDirectionSplitArtifact(jobId, jobOutboxDir);
  if (!artifact.ready || !artifact.verified) {
    throw new Error(`Tournament winner is not ready for root publish: ${artifact.reason}`);
  }
  const expectedSpriteContext = await readJobExpectedSpriteContext(jobId);
  const expectedSlugs = expectedSpriteContext.directionSlugs ?? directionSplitSlugs;
  const candidates = (await Promise.all(expectedSlugs.map((slug) => findDirectionSplitCandidateFile(jobId, slug, jobOutboxDir))))
    .filter((candidate): candidate is DirectionSplitCandidateFile => Boolean(candidate));
  if (candidates.length !== expectedSlugs.length) {
    throw new Error("Tournament winner is missing one or more direction files.");
  }
  const sourceManifest = await findDirectionSplitSourceManifest(jobId, jobOutboxDir);
  const expectedChromaKey = expectedSpriteContext.chromaKey;
  const expectedAction = expectedSpriteContext.action ?? normalizeActionValue(sourceManifest?.parsed?.action);
  const manifestName = await publishVerifiedDirectionSplitArtifact(
    jobId,
    candidates,
    sourceManifest,
    expectedChromaKey,
    expectedAction,
    expectedSpriteContext.motionRecipe,
    expectedSpriteContext.framesPerDirection ?? 8,
    artifact.warnings,
    outboxDir,
    expectedSlugs
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

function parseJsonText<T = unknown>(text: string): T {
  return JSON.parse(text.replace(/^\uFEFF/, "")) as T;
}

type LocalGenerationRequestValidation =
  | { ok: true; request: LocalGenerationRequest }
  | { ok: false; error: string };

function validateLocalGenerationRequest(value: unknown): LocalGenerationRequestValidation {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, error: "Request body must be a JSON object." };
  }
  const body = value as Record<string, unknown>;
  const optionalStringFields = ["workflowMode", "prompt", "negativePrompt", "jobNotes", "seed", "size", "action"] as const;
  for (const field of optionalStringFields) {
    if (body[field] !== undefined && typeof body[field] !== "string") {
      return { ok: false, error: `Field "${field}" must be a string when provided.` };
    }
  }
  if (typeof body.prompt !== "string" || !body.prompt.trim()) {
    return { ok: false, error: "Prompt is required for local generation" };
  }
  if (body.size !== undefined && body.size !== "" && !/^\d{2,4}x\d{2,4}(\s*x\s*\d{1,2})?$/i.test(String(body.size).trim())) {
    return { ok: false, error: 'Field "size" must look like "512x512" when provided.' };
  }
  if (body.count !== undefined) {
    const count = body.count;
    if (typeof count !== "number" || !Number.isFinite(count) || !Number.isInteger(count) || count < 1 || count > 8) {
      return { ok: false, error: 'Field "count" must be an integer between 1 and 8 when provided.' };
    }
  }
  return { ok: true, request: body as LocalGenerationRequest };
}

function readJson(request: IncomingMessage) {
  return new Promise<unknown>((resolve, reject) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      try {
        const text = Buffer.concat(chunks).toString("utf8");
        resolve(text ? parseJsonText(text) : {});
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
