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

export interface Annotation {
  id: string;
  tool: Exclude<ToolMode, "select">;
  color: string;
  width: number;
  number?: number;
  comment?: string;
  points: Array<{ x: number; y: number }>;
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
  createdAt: string;
  runner?: CodexRunnerStatus;
}

export type CodexRunnerState = "running" | "completed" | "failed" | "unavailable" | "disabled" | "unknown";
export type CodexRunnerPreflightState = "ready" | "disabled" | "unavailable";
export type CodexFailureKind =
  | "policy_or_safety"
  | "imagegen_unavailable"
  | "runner_failed"
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
