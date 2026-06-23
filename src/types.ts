export type ProviderId = "local-file" | "codex-handoff" | "local-inbox";

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
  points: Array<{ x: number; y: number }>;
}

export interface GridSettings {
  columns: number;
  rows: number;
  gutter: number;
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
