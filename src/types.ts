export type ProviderId = "local-file" | "local-generator" | "codex-handoff" | "local-inbox";

export type ToolMode = "select" | "brush" | "rect" | "arrow";

export interface HistoryItem {
  id: string;
  name: string;
  dataUrl: string;
  provider: ProviderId;
  prompt: string;
  seed: string;
  size: string;
  createdAt: string;
  adopted: boolean;
  source: "sample" | "import" | "generate" | "annotated" | "inbox";
  derivedFromId?: string;
  derivedFromName?: string;
  outboxImportKey?: string;
  effectAnimation?: EffectAnimationMetadata;
}

export type EffectQualityRank = "gold" | "silver" | "bronze" | "failed" | "blocked";
export type EffectLoopMode = "one-shot" | "loop" | "ping-pong-loop";

export interface EffectAnimationMetadata {
  kind: "effect-animation";
  name: string;
  category: string;
  type: string;
  style: string;
  colorPalette: string;
  frameCount: number;
  frameSize: {
    width: number;
    height: number;
  };
  layout: {
    id?: string;
    columns: number;
    rows: number;
  };
  loopMode: EffectLoopMode;
  fps: number;
  anchor: {
    x: number;
    y: number;
    mode: string;
  };
  blendMode: "normal" | "additive" | string;
  background: "transparent";
  alphaPremultiplied: boolean;
  qualityRank: EffectQualityRank;
  warnings: string[];
  failureReason?: string;
  sourceJobId?: string;
  artifacts?: {
    sheet?: string;
    previewGif?: string;
    previewApng?: string;
    metadata?: string;
    frames?: string[];
  };
}

export interface SpriteFrame {
  id: string;
  name: string;
  dataUrl: string;
  width: number;
  height: number;
  sourceId?: string;
  index: number;
}

export interface SpriteAction {
  name: string;
  fps: number;
  loop: boolean;
  playbackMode?: "normal" | "ping-pong-reverse";
  frameIds: string[];
  cell: {
    width: number;
    height: number;
  };
  anchor: {
    x: number;
    y: number;
  };
}

export interface ImageRectCoordinates {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ImageSizeCoordinates {
  width: number;
  height: number;
}

export interface Annotation {
  id: string;
  tool: Exclude<ToolMode, "select">;
  color: string;
  width: number;
  number?: number;
  comment?: string;
  points: Array<{ x: number; y: number }>;
  displayedImageRect?: ImageRectCoordinates;
  imageRectNormalized?: ImageRectCoordinates;
  imageRectPixels?: ImageRectCoordinates;
  sourceImageNaturalSize?: ImageSizeCoordinates;
  imageRectClamped?: boolean;
}

export interface GridSettings {
  columns: number;
  rows: number;
  gutter: number;
}

export type AnimationLibraryKind = "official" | "user";

export interface AnimationPackManifest {
  schema: "image-cockpit.animation.v1";
  title: string;
  kind: AnimationLibraryKind;
  action: string;
  directions: string[];
  grid: GridSettings;
  cell: {
    width: number;
    height: number;
  };
  framesPerDirection: number;
  playback?: "normal" | "ping-pong-reverse";
  createdAt: string;
  createdWith: string;
  license?: string;
  sourceNote?: string;
  promptSummary?: string;
  tags?: string[];
  files: {
    sheet: string;
    previewGif?: string;
    previewWebp?: string;
    previewApng?: string;
    directionPreviews?: Array<{
      direction: string;
      gif?: string;
      webp?: string;
      apng?: string;
    }>;
    metadata?: string;
  };
}

export interface AnimationLibraryItem {
  id: string;
  kind: AnimationLibraryKind;
  title: string;
  action: string;
  manifest: AnimationPackManifest;
  previewDataUrl?: string;
  previewWebpDataUrl?: string;
  previewApngDataUrl?: string;
  sheetDataUrl: string;
  importedAt?: string;
  updatedAt?: string;
}

export interface ProviderStatus {
  id: ProviderId;
  label: string;
  enabled: boolean;
  message?: string;
  path?: string;
}

export interface CodexJobResponse {
  id: string;
  path: string;
  inboxPath: string;
  outboxPath?: string;
  createdAt: string;
  runner?: CodexRunnerStatus;
}

export type CodexRunnerState = "running" | "completed" | "failed" | "unavailable" | "disabled" | "unknown";
export type CodexRunnerPreflightState = "ready" | "disabled" | "unavailable";
export type CodexFailureKind =
  | "policy_or_safety"
  | "usage_limit"
  | "imagegen_unavailable"
  | "runner_failed"
  | "import_failed"
  | "no_image_returned"
  | "unknown";

export interface CodexJobDiagnostic {
  kind: CodexFailureKind;
  title: string;
  userMessage: string;
  suggestion?: string;
  sidecarPath?: string;
  logPath?: string;
}

export interface CodexRunnerStatus {
  jobId: string;
  state: CodexRunnerState;
  message: string;
  command?: string;
  startedAt?: string;
  finishedAt?: string;
  exitCode?: number | null;
  signal?: string | null;
  logPath?: string;
  statusPath?: string;
  outboxDir?: string;
  diagnostic?: CodexJobDiagnostic;
}

export interface CodexRunnerPreflight {
  state: CodexRunnerPreflightState;
  message: string;
  command: string;
  checkedAt: string;
  autorun: boolean;
  sandbox: string;
  approval: string;
  errorCode?: string;
  setupHint?: string;
}

export interface CodexRunnerPreflightResponse {
  runner: CodexRunnerPreflight;
}

export interface ImageCockpitApiHealth {
  app: "image-cockpit";
  version: string;
  role: "api";
  port: number;
  handoffRoot: string;
  inboxReadable: boolean;
  outboxReadable: boolean;
  statusReadable: boolean;
  logsReadable: boolean;
  runner: Pick<CodexRunnerPreflight, "state" | "message" | "checkedAt" | "autorun">;
}

export interface ImageCockpitDevSupervisorHealth {
  app: "image-cockpit";
  role: "supervisor";
  devOnly: true;
  checkedAt: string;
  supervisor: {
    port: number;
    pid: number;
    state: "running";
  };
  vite: {
    port: number;
    pid: number | null;
    state: "running" | "starting" | "stopped" | "exited";
    lastExitCode?: number | null;
    lastSignal?: string | null;
  };
  api: {
    port: number;
    pid: number | null;
    state: "running" | "starting" | "stopped" | "exited";
    lastExitCode?: number | null;
    lastSignal?: string | null;
  };
  apiTarget: string;
  handoffRoot: string;
  mismatches: string[];
}

export type CodexArtifactQuality = "gold" | "silver" | "bronze" | "blocked" | "waiting";

export type CodexResultQualityClassification =
  | "usable-final"
  | "quality-failed"
  | "quarantined-candidate"
  | "debug-artifact"
  | "running"
  | "failed";

export interface CodexResultQualityGate {
  classification: CodexResultQualityClassification;
  reason: string;
  code?: string;
  historyAllowed: boolean;
  downloadAllowed: boolean;
  retryable: boolean;
  warnings?: string[];
}

export interface CodexArtifactStatus {
  jobId: string;
  artifactKind: "direction-split" | "effect-animation";
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
}

export interface CodexJobStatusResponse {
  status: CodexRunnerStatus;
}

export interface CodexJobLogResponse {
  jobId: string;
  exists: boolean;
  path: string;
  size: number;
  modifiedAt: string;
  readAt: string;
  truncated: boolean;
  text: string;
}

export interface CodexOutboxResult {
  name: string;
  path: string;
  size: number;
  modifiedAt: string;
  mimeType: string;
  qualityGate?: CodexResultQualityGate;
  artifact?: CodexArtifactStatus;
}

export interface CodexOutboxImportResponse extends CodexOutboxResult {
  dataUrl: string;
}

export interface LocalGenerationResult extends CodexOutboxImportResponse {}

export interface LocalGenerationResponse {
  id: string;
  createdAt: string;
  outboxPath: string;
  results: LocalGenerationResult[];
}
