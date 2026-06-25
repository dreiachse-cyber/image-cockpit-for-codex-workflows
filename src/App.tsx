import {
  AlertTriangle,
  Archive,
  ArrowLeft,
  ArrowRight,
  Brush,
  CheckCircle2,
  Copy,
  FileArchive,
  FileImage,
  FileJson,
  Film,
  FolderOpen,
  Grid3X3,
  ImagePlus,
  Languages,
  Loader2,
  Maximize2,
  Minimize2,
  PanelRight,
  Pipette,
  Plug,
  Plus,
  RefreshCw,
  Scissors,
  Settings,
  Square,
  Terminal,
  Trash2,
  Upload,
  X
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, UIEvent } from "react";
import {
  createAnimatedWebpBlob,
  createGifBlob,
  exportAnimationPack,
  exportWebP,
  exportFramesZip,
  exportGif,
  exportMetadata,
  exportSpriteSheet
} from "./lib/exporters";
import { importAnimationPackBlob } from "./lib/animationPack";
import { createId, dataUrlToBlob, downloadBlob, loadImage, readFileAsDataUrl } from "./lib/image";
import { OFFICIAL_ANIMATION_LIBRARY } from "./lib/officialAnimations";
import { calculateGridCells, summarizeFrames } from "./lib/sprite";
import {
  loadActions,
  loadFrames,
  loadHistory,
  loadPersistedState,
  loadUserAnimationLibrary,
  MAX_USER_ANIMATION_LIBRARY_ITEMS,
  saveActions,
  saveFrames,
  saveHistory,
  saveUserAnimationLibrary
} from "./lib/storage";
import type {
  Annotation,
  AnimationLibraryItem,
  AnimationLibraryKind,
  AnimationPackManifest,
  CodexFailureKind,
  CodexJobDiagnostic,
  CodexJobLogResponse,
  GridSettings,
  HistoryItem,
  CodexJobResponse,
  CodexJobStatusResponse,
  CodexOutboxImportResponse,
  CodexOutboxResult,
  CodexRunnerPreflight,
  CodexRunnerPreflightResponse,
  CodexRunnerStatus,
  LocalGenerationResponse,
  ProviderId,
  ProviderStatus,
  SpriteAction,
  SpriteFrame,
  ToolMode
} from "./types";

const SAMPLE_URL = "/samples/forest-mage-sheet.png";
const CANVAS_WIDTH = 920;
const CANVAS_HEIGHT = 520;
const LANGUAGE_STORAGE_KEY = "image-cockpit.language";
const PENDING_CODEX_JOB_STORAGE_KEY = "image-cockpit.pendingCodexJob";
const SHOW_LOW_PRIORITY_CONTROLS = false;
const SHOW_SPRITE_ACTIONS_PANEL = false;
const SHOW_ANIMATION_LIBRARY = false;
const ANIMATION_FRAME_COUNT = 8;
const ANIMATION_DIRECTION_COUNT = 5;
const ANIMATION_CELL_SIZE = 256;
const MIN_ANIMATION_CELL_SIZE = ANIMATION_CELL_SIZE;
const MAX_ACTIVE_CODEX_JOBS = 2;
const CODEX_LOG_POLL_INTERVAL_MS = 2000;
const CODEX_LOG_TAIL_BYTES = 32768;
const CODEX_LOG_HISTORY_LIMIT = 4;
export const INITIAL_HISTORY_RENDER_COUNT = 100;
export const HISTORY_RENDER_BATCH_SIZE = 20;
const HISTORY_SCROLL_LOAD_THRESHOLD_PX = 160;
const ANIMATION_SHEET_GRID: GridSettings = { columns: ANIMATION_FRAME_COUNT, rows: ANIMATION_DIRECTION_COUNT, gutter: 0 };
const ANIMATION_DIRECTIONS = ["front", "front three-quarter", "side", "back three-quarter", "back"];
const DIRECTION_SPLIT_ANIMATION_SCHEMA = "image-cockpit.direction-split-animation.v1";
const DIRECTION_SPLIT_ANIMATION_GRID: GridSettings = { columns: 4, rows: 2, gutter: 0 };
const DIRECTION_SPLIT_ANIMATION_FILE_SLUGS = ["front", "front-three-quarter", "side", "back-three-quarter", "back"];
const DIRECTION_SPLIT_ANIMATION_RESULT_COUNT = ANIMATION_DIRECTION_COUNT;
const DIRECTION_SPLIT_DETACHED_WARN_DISTANCE = 80;
const DIRECTION_SPLIT_DETACHED_FAIL_DISTANCE = 250;
const DIRECTION_SPLIT_CENTER_WARN_DRIFT = 24;
const DIRECTION_SPLIT_CENTER_FAIL_DRIFT = 48;
const DIRECTION_SPLIT_BOTTOM_WARN_DRIFT = 16;
const DIRECTION_SPLIT_BOTTOM_FAIL_DRIFT = 32;
const STANDARD_ANIMATION_CELL: SpriteAction["cell"] = { width: ANIMATION_CELL_SIZE, height: ANIMATION_CELL_SIZE };
const STANDARD_ANIMATION_ANCHOR = { x: Math.round(ANIMATION_CELL_SIZE / 2), y: Math.round(ANIMATION_CELL_SIZE * 0.92) };
const HATCH_PET_CELL: SpriteAction["cell"] = { width: 192, height: 208 };
const HATCH_PET_GRID: GridSettings = { columns: 8, rows: 9, gutter: 0 };
const HATCH_PET_STATE_ROWS = [
  { id: "idle", frames: 6 },
  { id: "running-right", frames: 8 },
  { id: "running-left", frames: 8 },
  { id: "waving", frames: 4 },
  { id: "jumping", frames: 5 },
  { id: "failed", frames: 8 },
  { id: "waiting", frames: 6 },
  { id: "running", frames: 6 },
  { id: "review", frames: 6 }
];
const DIRECTIONAL_HATCH_PET_GRID: GridSettings = {
  columns: HATCH_PET_GRID.columns,
  rows: HATCH_PET_GRID.rows * ANIMATION_DIRECTION_COUNT,
  gutter: 0
};
const DIRECTIONAL_HATCH_PET_RESULT_COUNT = ANIMATION_DIRECTION_COUNT;
const DIRECTIONAL_HATCH_PET_PRIMARY_STATE = HATCH_PET_STATE_ROWS[0];

export const SUPPORTED_LANGUAGE_IDS = [
  "ja",
  "en",
  "zh-CN",
  "zh-TW",
  "ko",
  "ru",
  "es",
  "pt-BR",
  "de",
  "fr",
  "id",
  "tr",
  "vi",
  "pl",
  "it"
] as const;

type Language = (typeof SUPPORTED_LANGUAGE_IDS)[number];
type BaseLanguage = "ja" | "en";
type LocalizedText = Record<BaseLanguage, string> & Partial<Record<Language, string>>;
type AnimationGenerationMode = "standard" | "hatch-pet" | "directional-hatch-pet";
type AnimationChromaKeyName = "green" | "magenta";
type CodexJobQueueState = "queued" | "running";

interface AnimationChromaKey {
  name: AnimationChromaKeyName;
  label: string;
  hex: string;
  rgb: { r: number; g: number; b: number };
}

export interface FrameComponentMetrics {
  id: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  count: number;
  centerX: number;
  centerY: number;
  chromaResidueCount: number;
  softAlphaCount: number;
}

const animationChromaKeys: Record<AnimationChromaKeyName, AnimationChromaKey> = {
  green: { name: "green", label: "chroma-key green", hex: "#00ff00", rgb: { r: 0, g: 255, b: 0 } },
  magenta: { name: "magenta", label: "chroma-key magenta", hex: "#ff00ff", rgb: { r: 255, g: 0, b: 255 } }
};

const languageOptions: Array<{ id: Language; label: string }> = [
  { id: "ja", label: "日本語" },
  { id: "en", label: "English" },
  { id: "zh-CN", label: "简体中文" },
  { id: "zh-TW", label: "繁體中文" },
  { id: "ko", label: "한국어" },
  { id: "ru", label: "Русский" },
  { id: "es", label: "Español" },
  { id: "pt-BR", label: "Português (Brasil)" },
  { id: "de", label: "Deutsch" },
  { id: "fr", label: "Français" },
  { id: "id", label: "Bahasa Indonesia" },
  { id: "tr", label: "Türkçe" },
  { id: "vi", label: "Tiếng Việt" },
  { id: "pl", label: "Polski" },
  { id: "it", label: "Italiano" }
];
const supportedLanguageSet = new Set<string>(SUPPORTED_LANGUAGE_IDS);

type WorkflowMode = "image-generate" | "image-edit" | "sprite-generate" | "sprite-edit";

interface PromptExample {
  id: string;
  category: LocalizedText;
  title: LocalizedText;
  previewImage: string;
  summary: LocalizedText;
  prompt: string;
  negativePrompt: string;
  notes: string;
}

interface AnimationPresetExample {
  id: string;
  actionName: string;
  previewClassName: string;
  category: LocalizedText;
  title: LocalizedText;
  summary: LocalizedText;
  prompt: string;
  notes: string;
}

interface AnimationDirectionPreview {
  id: string;
  label: string;
  gifUrl: string;
}

interface AnimationPackExportDraft {
  title: string;
  tags: string;
  license: string;
  sourceNote: string;
  promptSummary: string;
  includePromptSummary: boolean;
}

interface FrameSplitOptions {
  normalizeOpaqueBounds?: boolean;
  residueChromaKey?: FrameResidueChromaKey;
}

type FrameResidueChromaKey = AnimationChromaKeyName | "both";

interface DirectionSplitAnimationManifest {
  schema: typeof DIRECTION_SPLIT_ANIMATION_SCHEMA;
  jobId?: string;
  action?: string;
  directions?: string[];
  framesPerDirection?: number;
  grid?: GridSettings;
  cell?: SpriteAction["cell"];
  files?: Record<string, string> | Array<{ direction?: string; file?: string; name?: string; path?: string }>;
}

interface DirectionSplitSelection {
  detected: boolean;
  manifestResult?: CodexOutboxResult;
  directionResults: CodexOutboxResult[];
  missingDirections: string[];
}

interface DirectionSplitPreparedCell {
  direction: string;
  directionIndex: number;
  frameIndex: number;
  sourceCanvas: HTMLCanvasElement;
  bounds: OpaqueBounds | null;
  warnings: string[];
  failures: string[];
}

interface DirectionSplitNormalizedCell {
  direction: string;
  directionIndex: number;
  frameIndex: number;
  canvas: HTMLCanvasElement;
  bounds: OpaqueBounds | null;
  warnings: string[];
  failures: string[];
}

interface PendingCodexJob {
  id: string;
  path: string;
  createdAt: string;
  label?: string;
  workflowMode?: WorkflowMode;
  actionName?: string;
  grid?: GridSettings;
  cell?: SpriteAction["cell"];
  chromaKey?: AnimationChromaKeyName;
  spriteVariant?: AnimationGenerationMode;
  sourceImageId?: string;
  sourceImageName?: string;
}

interface CodexJobDraft {
  workflowMode: WorkflowMode | null;
  prompt: string;
  negativePrompt: string;
  jobNotes: string;
  seed: string;
  size: string;
  count: number;
  quality: string;
  selectedImageName: string;
  selectedImageSize: string;
  selectedImageSource: string;
  selectedImageDataUrl: string;
  annotations: Annotation[];
  grid: GridSettings | null;
  action: string;
  frames: number;
  cell: SpriteAction["cell"] | null;
  chromaKey: AnimationChromaKeyName | "";
  spriteVariant?: AnimationGenerationMode;
  directions: string[];
  label: string;
  resultWorkflowMode?: WorkflowMode;
  resultActionName?: string;
  resultGrid?: GridSettings;
  resultCell?: SpriteAction["cell"];
  resultChromaKey?: AnimationChromaKeyName;
  resultSpriteVariant?: AnimationGenerationMode;
  resultSourceImageId?: string;
  resultSourceImageName?: string;
}

interface CodexJobQueueItem {
  id: string;
  state: CodexJobQueueState;
  label: string;
  createdAt: string;
  path?: string;
  request?: CodexJobDraft;
  queuedAt?: string;
  workflowMode?: WorkflowMode;
  actionName?: string;
  grid?: GridSettings;
  cell?: SpriteAction["cell"];
  chromaKey?: AnimationChromaKeyName;
  spriteVariant?: AnimationGenerationMode;
  sourceImageId?: string;
  sourceImageName?: string;
}

interface ImportLatestOptions {
  background?: boolean;
  newerThan?: string;
  quietEmpty?: boolean;
  job?: CodexJobQueueItem;
}

interface ImageEditComparison {
  before: HistoryItem;
  after?: HistoryItem;
  jobId?: string;
}

interface CodexFailureNotice {
  id: string;
  jobId: string;
  label: string;
  createdAt: string;
  workflowMode?: WorkflowMode;
  diagnostic: CodexJobDiagnostic;
}

interface CodexJobLogItem {
  jobId: string;
  label: string;
  state: CodexJobQueueState | CodexRunnerStatus["state"];
  createdAt: string;
  text: string;
  exists: boolean;
  truncated: boolean;
  size: number;
  modifiedAt: string;
  readAt: string;
  error?: string;
}

const baseUiCopy = {
  en: {
    language: "Language",
    project: "Project: Forest Mage",
    openWorkspace: "Open workspace",
    settings: "Settings",
    localWorkspace: "Local workspace",
    workflowPanelTitle: "Workflow",
    canvasGridTitle: "Animation Setup",
    canvasAnnotationTitle: "Preview",
    previewLabel: "Preview",
    canvasEmpty: "Import an image or generate one locally to start",
    columns: "Columns",
    rows: "Rows",
    frameWidth: "Frame W",
    frameHeight: "Frame H",
    showGrid: "Show Grid",
    showCenter: "Show Center",
    transparencyCleanup: "Transparency Cleanup",
    keyColor: "Key Color",
    tolerance: "Tolerance",
    applyChromaKey: "Apply Chroma Key",
    selectTool: "Select",
    brushTool: "Brush",
    rectangleTool: "Rectangle",
    arrowTool: "Arrow",
    exportAnnotationTitle: "Export annotation PNG",
    splitGridTitle: "Split grid into frames",
    useAsFrameTitle: "Use selected image as a sprite frame",
    frameLabel: "Frame",
    sizeLabel: "Size",
    anchorLabel: "Anchor",
    zoomLabel: "Zoom",
    zoomFit: "fit",
    exportSheetPng: "Export Sheet (PNG)",
    exportZipFrames: "Export ZIP (Frames)",
    exportGifLabel: "Export GIF",
    exportMetadataJson: "Export Metadata (JSON)",
    metadata: "Metadata",
    anchorX: "Anchor X",
    anchorY: "Anchor Y",
    moveFrameLeft: "Move frame left",
    moveFrameRight: "Move frame right",
    removeFrame: "Remove frame",
    noFrames: "No frames",
    promptExamples: "Prompt Examples",
    promptExamplesTitle: "Prompt Examples",
    promptExamplesIntro: "Pick by preview image, then copy or load the tuned prompt.",
    copyPrompt: "Copy Prompt",
    usePrompt: "Use Prompt",
    closePromptExamples: "Close",
    promptCopied: "Prompt copied",
    promptCopyFailed: "Could not copy prompt",
    promptExampleApplied: "Prompt example loaded into Pixel Art Generation",
    animationStepSourceTitle: "1. Upload Pixel Art",
    animationStepSourceBody: "Use a pixel-art image you generated or imported as the animation source.",
    animationMethodTitle: "Generation Method",
    animationStandardSheet: "5-Direction Sheet",
    animationStandardSheetBody: "Generate a fixed 5 rows x 8 columns game-animation sprite sheet.",
    animationStandardLockedSize: "Fixed cells: 256 x 256 px. Output sheet: 2048 x 1280 px.",
    animationHatchPet: "hatch-pet",
    animationHatchPetBody: "Experimental Codex pet atlas: 8 x 9, 192 x 208 cells, pet.json-ready.",
    animationDirectionalHatchPet: "5-Direction hatch-pet",
    animationDirectionalHatchPetBody: "Generate five separate hatch-pet atlases, one for each direction.",
    animationStepMotionTitle: "2. Choose Motion",
    animationStepMotionBody: "Pick one locked animation preset.",
    animationStepGenerateTitle: "3. Generate",
    animationStepGenerateBody: "Send the uploaded source to Codex and generate a 5-direction chroma-key sprite sheet.",
    hatchPetGenerateBody: "Send the uploaded source to Codex and try the hatch-pet workflow for a Codex pet atlas.",
    hatchPetLockedSize: "hatch-pet locks the atlas to 1536 x 1872 with 192 x 208 cells.",
    directionalHatchPetGenerateBody: "Send the uploaded source to Codex and generate five direction-specific hatch-pet atlases.",
    directionalHatchPetLockedSize: "Creates 5 files, each 1536 x 1872 with 192 x 208 cells, then combines them for preview/export.",
    animationStepDownloadTitle: "4. Download",
    animationStepDownloadBody: "Preview and export the transparent animated GIF, animated WebP, and sprite sheet.",
    hatchPetDownloadBody: "Export each Codex pet state as animated GIF/WebP, or download the full pet atlas.",
    directionalHatchPetDownloadBody: "Preview one animated state per direction, or download the combined 5-direction hatch-pet atlas.",
    uploadPixelArt: "Upload Pixel Art",
    selectedSource: "Selected source",
    noAnimationSource: "No pixel-art source uploaded yet",
    motionPreset: "Selected animation",
    chooseAnimation: "Choose Animation",
    animationPresetExamples: "Choose Animation",
    animationPresetExamplesTitle: "Choose Animation",
    animationPresetExamplesIntro: "Pick an animated sample, then use it as the motion preset.",
    useAnimationPreset: "Select Animation",
    animationPresetExampleApplied: "Animation selected",
    generationMayTakeMinutes: "Generation can take a few minutes.",
    animationReady: "Animation frames ready",
    animatedGif: "Animated GIF",
    animatedWebP: "Animated WebP",
    spriteSheetDownload: "Sprite Sheet",
    directionalPreviews: "Directional Previews",
    previewFront: "Front",
    previewBack: "Back",
    previewBackThreeQuarter: "Back 3/4",
    previewFrontThreeQuarter: "Front 3/4",
    previewSide: "Side",
    previewGif: "GIF Preview",
    previewWebP: "WebP Preview",
    previewSpriteSheet: "Sprite Sheet Preview",
    animationDownloadsLocked: "Generate animation frames before downloading.",
    animationPreviewsBuilding: "Preparing animation previews...",
    animationGeneratedFrom: "Generated from",
    animationSourceUnknown: "Source image not recorded",
    imageEditGeneratedFrom: "Edited from",
    imageEditSourceUnknown: "Edit source not recorded",
    openSourcePreview: "Open source",
    statusSourceSelectedForAnimation: "Source selected for animation generation",
    imageDownloadTitle: "Download",
    imageDownloadBody: "Export the image currently shown in the preview as PNG.",
    imageDownloadReady: "Selected image ready",
    imageDownloadLocked: "Select or generate an image before downloading.",
    downloadPng: "PNG",
    animationLibraryTitle: "Animation Library",
    animationLibraryBody: "Use official presets or imported user animation packs as reusable materials.",
    officialAnimations: "Official Animations",
    userAnimations: "User Animations",
    importAnimation: "Import Animation",
    exportAnimationPack: "Export Animation Pack",
    exportAnimationSample: "Export Sample",
    useAnimationLibraryItem: "Use",
    renameAnimation: "Rename",
    deleteAnimation: "Delete",
    animationLibraryEmpty: "No user animations yet. Import a local animation pack to reuse it here.",
    animationPackImported: "Animation pack imported",
    animationPackImportFailed: "Could not import animation pack",
    animationPackUsed: "Animation loaded from library",
    animationPackExported: "Animation pack exported",
    animationPackExportFailed: "Could not export animation pack",
    animationPackExportTitle: "Export Animation Pack",
    animationPackExportIntro: "Write a portable local ZIP with manifest, previews, sheet, and metadata.",
    animationPackTitleLabel: "Title",
    animationPackTagsLabel: "Tags",
    animationPackLicenseLabel: "License / usage note",
    animationPackSourceLabel: "Source note",
    animationPackPromptSummaryLabel: "Prompt summary",
    animationPackPromptToggle: "Include prompt summary",
    animationPackRightsHint: "Check rights before sharing imported or generated assets.",
    cancel: "Cancel",
    saveExport: "Export",
    uploadImageForEdit: "Upload Image",
    selectedEditSource: "Selected image",
    noEditSource: "No image selected yet",
    animationFinalNotEditableTitle: "Animation output",
    animationFinalNotEditableBody: "Animation results are final artifacts. Select an image from Pixel Art Generation or Image Editing before using numbered edit regions.",
    imageEditRegionsTitle: "Numbered edit regions",
    imageEditRegionsHelp: "Drag a rectangle on the preview. Each rectangle gets a number and a comment box.",
    noEditRegions: "No numbered regions yet. Drag on the preview to add #1.",
    editRegionLabel: "Region",
    editRegionPlaceholder: "Example: add the text X here / remove X from here",
    removeRegion: "Remove region",
    clearRegions: "Clear regions",
    imageEditRegionAdded: "Edit region added",
    editImage: "Edit Image",
    statusUsesImport: "uses Import or drag and drop",
    statusCodexJobWritten: "Codex job written",
    statusCodexJobError: "Could not create Codex handoff job",
    statusInboxEmpty: "No image files found in the Codex outbox",
    statusInboxImported: "Imported from Local Inbox",
    statusInboxError: "Could not import from Local Inbox",
    statusLocalGenerated: "Generated locally",
    statusLocalGenerateError: "Could not generate locally",
    statusAnimationSourceRequired: "Upload or select a pixel-art source before generating animation",
    statusAnimationGenerated: "Animation generated",
    statusAnimationFinalNotEditable: "Animation outputs are final artifacts. Select a generated or edited image to edit.",
    statusCodexJobPending: "Waiting for Codex to return an image",
    statusCodexRunnerUnavailable: "Codex runner unavailable. Return an outbox image, then use Import Latest",
    statusCodexRunnerFailed: "Codex runner stopped before returning an image",
    statusCodexRunnerCompletedNoImage: "Codex runner completed, but no returned image was found",
    codexFailureTitle: "Generation failed",
    codexFailurePolicyMessage: "The image could not be generated. It may have been blocked by safety or usage-policy checks.",
    codexFailurePolicySuggestion: "Revise the prompt to remove sensitive, explicit, or disallowed details, then try again.",
    codexFailureImagegenUnavailableTitle: "Image generation unavailable",
    codexFailureImagegenUnavailableMessage: "Image generation is not available in this Codex environment.",
    codexFailureImagegenUnavailableSuggestion: "Use manual handoff or another provider, then return an image to the outbox.",
    codexFailureRunnerFailedTitle: "Codex runner failed",
    codexFailureRunnerFailedMessage: "Codex runner failed before returning an image.",
    codexFailureRunnerFailedSuggestion: "Check the runner setup or retry with a simpler prompt.",
    codexFailureNoImageTitle: "No image returned",
    codexFailureNoImageMessage: "Codex runner completed, but no returned image was found.",
    codexFailureNoImageSuggestion: "Retry the job, or place a returned image with the job id prefix in the outbox.",
    codexFailureUnknownMessage: "The image could not be generated, and no specific reason was returned.",
    codexFailureUnknownSuggestion: "Retry with a simpler prompt or use manual handoff.",
    codexFailureRetryHint: "Retry suggestion",
    codexLogTitle: "Codex Log",
    codexLogLive: "stdout / stderr tail",
    codexLogEmpty: "No Codex log yet",
    codexLogWaiting: "Waiting for Codex log output...",
    codexLogElapsed: "Elapsed",
    codexLogUpdated: "Updated",
    codexLogNoOutput: "No output yet. Codex may be preparing image generation.",
    codexLogTruncated: "Showing latest log tail",
    codexLogCollapse: "Collapse logs",
    codexLogExpand: "Expand logs",
    codexLogFullscreen: "Full screen logs",
    codexLogExitFullscreen: "Exit full screen",
    runnerChecking: "Codex runner: checking",
    runnerReady: "Codex runner: ready",
    runnerDisabled: "Codex runner: manual handoff",
    runnerUnavailable: "Codex runner: unavailable",
    statusSelectedAsFrame: "Selected image added as a sprite frame",
    statusChromaApplied: "Chroma key applied to selected frame",
    createCodexJob: "Create Codex Job",
    generateLocalImage: "Generate Pixel Art",
    generateLocalSprite: "Generate Animation",
    waitingForCodexResult: "Waiting for Codex Result",
    importLatest: "Import Latest",
    importFile: "Import File",
    currentWorkflow: "Current workflow",
    selectedProvider: "Route",
    results: "Results",
    spriteActions: "Sprite Actions",
    exportSprite: "Export Sprite",
    splitSheet: "Split Sheet",
    addFrame: "Add Frame",
    annotatedPng: "Annotated PNG",
    jobNotes: "Edit Notes",
    jobNotesPlaceholder: "What should Codex preserve, fix, crop, split, or export?"
  },
  ja: {
    language: "言語",
    project: "プロジェクト: Forest Mage",
    openWorkspace: "ワークスペースを開く",
    settings: "設定",
    localWorkspace: "ローカルワークスペース",
    workflowPanelTitle: "ワークフロー",
    canvasGridTitle: "アニメーション設定",
    canvasAnnotationTitle: "プレビュー",
    previewLabel: "プレビュー",
    canvasEmpty: "画像を取り込むかローカル生成して開始",
    columns: "列",
    rows: "行",
    frameWidth: "フレーム幅",
    frameHeight: "フレーム高",
    showGrid: "グリッド表示",
    showCenter: "中心線表示",
    transparencyCleanup: "透過クリーンアップ",
    keyColor: "キー色",
    tolerance: "許容幅",
    applyChromaKey: "クロマキー適用",
    selectTool: "選択",
    brushTool: "ブラシ",
    rectangleTool: "矩形",
    arrowTool: "矢印",
    exportAnnotationTitle: "注釈PNGを書き出す",
    splitGridTitle: "グリッドをフレームへ分割",
    useAsFrameTitle: "選択画像をスプライトフレームに使う",
    frameLabel: "フレーム",
    sizeLabel: "サイズ",
    anchorLabel: "アンカー",
    zoomLabel: "ズーム",
    zoomFit: "全体表示",
    exportSheetPng: "シートPNGを書き出し",
    exportZipFrames: "フレームZIPを書き出し",
    exportGifLabel: "GIFを書き出し",
    exportMetadataJson: "メタデータJSONを書き出し",
    metadata: "メタデータ",
    anchorX: "アンカーX",
    anchorY: "アンカーY",
    moveFrameLeft: "フレームを左へ移動",
    moveFrameRight: "フレームを右へ移動",
    removeFrame: "フレーム削除",
    noFrames: "フレームなし",
    promptExamples: "プロンプト例",
    promptExamplesTitle: "プロンプト例",
    promptExamplesIntro: "仕上がり例を見て選び、調整済みpromptをコピーまたは入力できます。",
    copyPrompt: "プロンプトをコピー",
    usePrompt: "この例を使う",
    closePromptExamples: "閉じる",
    promptCopied: "プロンプトをコピーしました",
    promptCopyFailed: "プロンプトをコピーできませんでした",
    promptExampleApplied: "プロンプト例をピクセルアート生成へ入れました",
    animationStepSourceTitle: "1. ピクセルアートをアップロード",
    animationStepSourceBody: "生成または取り込んだピクセルアートをアニメーション元にします。",
    animationMethodTitle: "生成方式",
    animationStandardSheet: "5方向シート",
    animationStandardSheetBody: "5行 x 8列固定のゲーム用アニメーションsprite sheetを生成します。",
    animationStandardLockedSize: "1セルは256 x 256 px固定です。出力シートは2048 x 1280 pxです。",
    animationHatchPet: "hatch-pet",
    animationHatchPetBody: "実験版のCodex pet atlas。8 x 9、192 x 208セル、pet.json対応です。",
    animationDirectionalHatchPet: "5方向hatch-pet",
    animationDirectionalHatchPetBody: "5方向それぞれにhatch-pet atlasを生成します。",
    animationStepMotionTitle: "2. 動きを選ぶ",
    animationStepMotionBody: "固定プリセットから動きを選びます。",
    animationStepGenerateTitle: "3. 生成する",
    animationStepGenerateBody: "アップロード画像からanimation sheetとtimeline framesを生成します。",
    hatchPetGenerateBody: "アップロード画像をCodexに渡し、hatch-pet工程でCodex pet atlasを試作します。",
    hatchPetLockedSize: "hatch-petは1536 x 1872、192 x 208セルに固定します。",
    directionalHatchPetGenerateBody: "アップロード画像をCodexに渡し、方向別のhatch-pet atlasを5枚生成します。",
    directionalHatchPetLockedSize: "1536 x 1872、192 x 208セルのatlasを5枚作り、preview/export用に結合します。",
    animationStepDownloadTitle: "4. ダウンロード",
    animationStepDownloadBody: "生成結果をanimated GIF、animated WebP、sprite sheetで書き出します。",
    hatchPetDownloadBody: "Codex petの各状態をアニメGIF/WebPで書き出し、全体atlasもダウンロードできます。",
    directionalHatchPetDownloadBody: "方向ごとに代表stateをアニメGIF/WebPで確認し、結合済み5方向hatch-pet atlasもダウンロードできます。",
    uploadPixelArt: "ピクセルアートをアップロード",
    selectedSource: "選択中の元画像",
    noAnimationSource: "まだ元になるピクセルアートがありません",
    motionPreset: "選択中のアニメーション",
    chooseAnimation: "アニメーションを選ぶ",
    animationPresetExamples: "アニメーションを選ぶ",
    animationPresetExamplesTitle: "アニメーションを選ぶ",
    animationPresetExamplesIntro: "動いているサンプルを見て、使うアニメーションを選びます。",
    useAnimationPreset: "このアニメーションを選ぶ",
    animationPresetExampleApplied: "アニメーションを選択しました",
    generationMayTakeMinutes: "生成は数分かかります",
    animationReady: "アニメーションframes準備完了",
    animatedGif: "アニメGIF",
    animatedWebP: "アニメWebP",
    spriteSheetDownload: "スプライトシート",
    directionalPreviews: "5方向プレビュー",
    previewFront: "正面",
    previewBack: "背面",
    previewBackThreeQuarter: "斜め後ろ",
    previewFrontThreeQuarter: "斜め前",
    previewSide: "横",
    previewGif: "GIF Preview",
    previewWebP: "WebP Preview",
    previewSpriteSheet: "Sprite Sheet Preview",
    animationDownloadsLocked: "ダウンロード前にアニメーションを生成してください。",
    animationPreviewsBuilding: "アニメーションプレビューを準備中です...",
    animationGeneratedFrom: "生成元",
    animationSourceUnknown: "生成元画像が記録されていません",
    imageEditGeneratedFrom: "編集元",
    imageEditSourceUnknown: "編集元画像が記録されていません",
    openSourcePreview: "元画像を開く",
    statusSourceSelectedForAnimation: "アニメーション元画像を選択しました",
    imageDownloadTitle: "ダウンロード",
    imageDownloadBody: "プレビューに表示している画像をPNGで書き出します。",
    imageDownloadReady: "選択中の画像を書き出せます",
    imageDownloadLocked: "画像を生成または選択するとダウンロードできます。",
    downloadPng: "PNG",
    animationLibraryTitle: "アニメーションライブラリ",
    animationLibraryBody: "公式プリセットとインポートしたユーザー素材を、再利用できる棚として扱います。",
    officialAnimations: "Official Animations",
    userAnimations: "User Animations",
    importAnimation: "アニメーションをインポート",
    exportAnimationPack: "アニメーションパックを書き出し",
    exportAnimationSample: "サンプルを書き出し",
    useAnimationLibraryItem: "使う",
    renameAnimation: "名前変更",
    deleteAnimation: "削除",
    animationLibraryEmpty: "ユーザーアニメーションはまだありません。ローカルのアニメーションパックをインポートするとここに並びます。",
    animationPackImported: "アニメーションパックをインポートしました",
    animationPackImportFailed: "アニメーションパックをインポートできませんでした",
    animationPackUsed: "ライブラリからアニメーションを読み込みました",
    animationPackExported: "アニメーションパックを書き出しました",
    animationPackExportFailed: "アニメーションパックを書き出せませんでした",
    animationPackExportTitle: "アニメーションパックを書き出し",
    animationPackExportIntro: "manifest、プレビュー、シート、metadataを含むローカルZIPを書き出します。",
    animationPackTitleLabel: "タイトル",
    animationPackTagsLabel: "タグ",
    animationPackLicenseLabel: "ライセンス / 利用メモ",
    animationPackSourceLabel: "出所メモ",
    animationPackPromptSummaryLabel: "プロンプト要約",
    animationPackPromptToggle: "プロンプト要約を含める",
    animationPackRightsHint: "インポート素材や生成素材を共有する前に、権利関係を確認してください。",
    cancel: "キャンセル",
    saveExport: "書き出し",
    uploadImageForEdit: "画像をアップロード",
    selectedEditSource: "選択中の画像",
    noEditSource: "まだ画像が選択されていません",
    animationFinalNotEditableTitle: "アニメーション生成物",
    animationFinalNotEditableBody: "アニメーション結果は最終成果物です。番号付き編集範囲を使う場合は、画像生成または画像編集で作った画像を選択してください。",
    imageEditRegionsTitle: "番号付き編集範囲",
    imageEditRegionsHelp: "プレビュー上をドラッグして矩形選択します。矩形には番号が付き、番号ごとにコメントできます。",
    noEditRegions: "まだ編集範囲がありません。プレビュー上をドラッグして #1 を追加してください。",
    editRegionLabel: "範囲",
    editRegionPlaceholder: "例: ここにXというテキスト追加 / ここのXを削除",
    removeRegion: "範囲を削除",
    clearRegions: "範囲を全削除",
    imageEditRegionAdded: "編集範囲を追加しました",
    editImage: "画像編集",
    statusUsesImport: "はImportまたはドラッグ&ドロップを使います",
    statusCodexJobWritten: "Codexジョブを書き込みました",
    statusCodexJobError: "Codex handoffジョブを作成できませんでした",
    statusInboxEmpty: "Codex outboxに画像ファイルが見つかりません",
    statusInboxImported: "Local Inboxから取り込みました",
    statusInboxError: "Local Inboxから取り込めませんでした",
    statusLocalGenerated: "ローカル生成しました",
    statusLocalGenerateError: "ローカル生成できませんでした",
    statusAnimationSourceRequired: "アニメーション生成の前にピクセルアートをアップロードするか、生成結果を選択してください",
    statusAnimationGenerated: "アニメーションを生成しました",
    statusAnimationFinalNotEditable: "アニメーション結果は最終成果物です。編集する場合は生成画像または編集後画像を選択してください",
    statusCodexJobPending: "Codexから画像が戻るのを待っています",
    statusCodexRunnerUnavailable: "Codex runner起動不可。outboxへ画像を戻したらImport Latestを押してください",
    statusCodexRunnerFailed: "Codex runnerが画像を返す前に停止しました",
    statusCodexRunnerCompletedNoImage: "Codex runnerは完了しましたが、戻り画像が見つかりません",
    codexFailureTitle: "生成できませんでした",
    codexFailurePolicyMessage: "安全または利用ポリシーの確認により、この画像は生成できなかった可能性があります。",
    codexFailurePolicySuggestion: "センシティブ、露骨、または許可されない可能性のある表現を避けてpromptを調整し、再試行してください。",
    codexFailureImagegenUnavailableTitle: "imagegenを利用できません",
    codexFailureImagegenUnavailableMessage: "このCodex環境ではimagegenを利用できません。",
    codexFailureImagegenUnavailableSuggestion: "手動handoffまたは別providerを使い、outboxへ画像を戻してください。",
    codexFailureRunnerFailedTitle: "Codex runnerが失敗しました",
    codexFailureRunnerFailedMessage: "Codex runnerが画像を返す前に失敗しました。",
    codexFailureRunnerFailedSuggestion: "runner設定を確認するか、promptを簡単にして再試行してください。",
    codexFailureNoImageTitle: "戻り画像が見つかりません",
    codexFailureNoImageMessage: "Codex runnerは完了しましたが、戻り画像が見つかりませんでした。",
    codexFailureNoImageSuggestion: "ジョブを再試行するか、job id prefix付きの画像をoutboxへ置いてください。",
    codexFailureUnknownMessage: "画像を生成できませんでしたが、具体的な理由は返されませんでした。",
    codexFailureUnknownSuggestion: "promptを簡単にして再試行するか、手動handoffを使ってください。",
    codexFailureRetryHint: "再試行ヒント",
    codexLogTitle: "Codexログ",
    codexLogLive: "stdout / stderr の末尾",
    codexLogEmpty: "まだCodexログはありません",
    codexLogWaiting: "Codexのログ出力を待っています...",
    codexLogElapsed: "経過",
    codexLogUpdated: "更新",
    codexLogNoOutput: "まだ出力がありません。Codexが画像生成の準備中かもしれません。",
    codexLogTruncated: "最新ログの末尾を表示中",
    codexLogCollapse: "ログを閉じる",
    codexLogExpand: "ログを開く",
    codexLogFullscreen: "ログを全画面で見る",
    codexLogExitFullscreen: "全画面を閉じる",
    runnerChecking: "Codex runner: 確認中",
    runnerReady: "Codex runner: 使用可能",
    runnerDisabled: "Codex runner: 手動受け渡し",
    runnerUnavailable: "Codex runner: 起動不可",
    statusSelectedAsFrame: "選択画像をスプライトフレームに追加しました",
    statusChromaApplied: "選択フレームにクロマキーを適用しました",
    createCodexJob: "Codexジョブ作成",
    generateLocalImage: "ピクセルアート生成",
    generateLocalSprite: "アニメーション生成",
    waitingForCodexResult: "Codex結果待ち",
    importLatest: "最新を取り込み",
    importFile: "ファイル取り込み",
    currentWorkflow: "現在のワークフロー",
    selectedProvider: "受け渡し先",
    results: "結果",
    spriteActions: "スプライト動作",
    exportSprite: "スプライト書き出し",
    splitSheet: "シート分割",
    addFrame: "フレーム追加",
    annotatedPng: "注釈PNG",
    jobNotes: "編集メモ",
    jobNotesPlaceholder: "Codexに残してほしい点、直してほしい点、切り出し方、出力形式を書きます"
  }
} satisfies Record<BaseLanguage, Record<string, string>>;

type UiCopy = typeof baseUiCopy.en;

const uiCopy = {
  ...baseUiCopy,
  "zh-CN": withUiCopy({
    language: "语言",
    workflowPanelTitle: "工作流",
    canvasAnnotationTitle: "预览",
    previewLabel: "预览",
    canvasEmpty: "导入或生成图像后开始",
    promptExamples: "提示词示例",
    promptExamplesTitle: "提示词示例",
    promptExamplesIntro: "按示例图选择，然后复制或载入优化后的提示词。",
    copyPrompt: "复制提示词",
    usePrompt: "使用提示词",
    closePromptExamples: "关闭",
    promptCopied: "提示词已复制",
    promptExampleApplied: "提示词示例已载入像素艺术生成",
    animationStepSourceTitle: "1. 上传像素艺术",
    animationStepMotionTitle: "2. 选择动作",
    animationStepGenerateTitle: "3. 生成",
    animationStepDownloadTitle: "4. 下载",
    uploadPixelArt: "上传像素艺术",
    selectedSource: "已选来源",
    noAnimationSource: "尚未上传像素艺术来源",
    motionPreset: "已选动画",
    chooseAnimation: "选择动画",
    animationPresetExamples: "选择动画",
    animationPresetExamplesTitle: "选择动画",
    animationPresetExamplesIntro: "查看动态示例，然后选择动作预设。",
    useAnimationPreset: "选择动画",
    animationPresetExampleApplied: "已选择动画",
    generationMayTakeMinutes: "生成可能需要几分钟。",
    animationReady: "动画帧已准备好",
    animatedGif: "动画 GIF",
    animatedWebP: "动画 WebP",
    spriteSheetDownload: "精灵表",
    directionalPreviews: "方向预览",
    animationGeneratedFrom: "生成自",
    imageEditGeneratedFrom: "编辑自",
    imageDownloadTitle: "下载",
    imageDownloadBody: "将预览中的图像导出为 PNG。",
    imageDownloadReady: "已选图像可导出",
    imageDownloadLocked: "请先选择或生成图像。",
    downloadPng: "PNG",
    animationLibraryTitle: "动画库",
    animationLibraryBody: "将官方预设和导入的动画包作为可复用素材。",
    officialAnimations: "官方动画",
    userAnimations: "用户动画",
    importAnimation: "导入动画",
    exportAnimationPack: "导出动画包",
    exportAnimationSample: "导出示例",
    useAnimationLibraryItem: "使用",
    renameAnimation: "重命名",
    deleteAnimation: "删除",
    animationLibraryEmpty: "还没有用户动画。导入本地动画包后会显示在这里。",
    animationPackImported: "动画包已导入",
    animationPackImportFailed: "无法导入动画包",
    animationPackUsed: "已从库载入动画",
    animationPackExported: "动画包已导出",
    animationPackExportFailed: "无法导出动画包",
    animationPackExportTitle: "导出动画包",
    animationPackExportIntro: "写出包含清单、预览、精灵表和元数据的本地 ZIP。",
    cancel: "取消",
    saveExport: "导出",
    uploadImageForEdit: "上传图像",
    selectedEditSource: "已选图像",
    noEditSource: "尚未选择图像",
    imageEditRegionsTitle: "编号编辑区域",
    editImage: "编辑图像",
    statusAnimationSourceRequired: "生成动画前请上传或选择像素艺术来源",
    statusAnimationGenerated: "动画已生成",
    codexFailureTitle: "生成失败",
    createCodexJob: "创建 Codex 作业",
    generateLocalImage: "生成像素艺术",
    generateLocalSprite: "生成动画",
    waitingForCodexResult: "等待 Codex 结果",
    importLatest: "导入最新结果",
    importFile: "导入文件",
    currentWorkflow: "当前工作流",
    selectedProvider: "路线",
    results: "结果",
    jobNotes: "备注"
  }),
  "zh-TW": withUiCopy({
    language: "語言",
    workflowPanelTitle: "工作流程",
    canvasAnnotationTitle: "預覽",
    previewLabel: "預覽",
    canvasEmpty: "匯入或生成圖像後開始",
    promptExamples: "提示詞範例",
    promptExamplesTitle: "提示詞範例",
    promptExamplesIntro: "依範例圖選擇，然後複製或載入調整好的提示詞。",
    copyPrompt: "複製提示詞",
    usePrompt: "使用提示詞",
    closePromptExamples: "關閉",
    promptCopied: "提示詞已複製",
    promptExampleApplied: "提示詞範例已載入像素藝術生成",
    animationStepSourceTitle: "1. 上傳像素藝術",
    animationStepMotionTitle: "2. 選擇動作",
    animationStepGenerateTitle: "3. 生成",
    animationStepDownloadTitle: "4. 下載",
    uploadPixelArt: "上傳像素藝術",
    selectedSource: "已選來源",
    noAnimationSource: "尚未上傳像素藝術來源",
    motionPreset: "已選動畫",
    chooseAnimation: "選擇動畫",
    animationPresetExamples: "選擇動畫",
    animationPresetExamplesTitle: "選擇動畫",
    animationPresetExamplesIntro: "查看動態範例，然後選擇動作預設。",
    useAnimationPreset: "選擇動畫",
    animationPresetExampleApplied: "已選擇動畫",
    generationMayTakeMinutes: "生成可能需要幾分鐘。",
    animationReady: "動畫影格已準備好",
    animatedGif: "動畫 GIF",
    animatedWebP: "動畫 WebP",
    spriteSheetDownload: "精靈表",
    directionalPreviews: "方向預覽",
    animationGeneratedFrom: "生成自",
    imageEditGeneratedFrom: "編輯自",
    imageDownloadTitle: "下載",
    imageDownloadBody: "將預覽中的圖像匯出為 PNG。",
    imageDownloadReady: "已選圖像可匯出",
    imageDownloadLocked: "請先選擇或生成圖像。",
    downloadPng: "PNG",
    animationLibraryTitle: "動畫庫",
    animationLibraryBody: "將官方預設與匯入的動畫包作為可重用素材。",
    officialAnimations: "官方動畫",
    userAnimations: "使用者動畫",
    importAnimation: "匯入動畫",
    exportAnimationPack: "匯出動畫包",
    exportAnimationSample: "匯出範例",
    useAnimationLibraryItem: "使用",
    renameAnimation: "重新命名",
    deleteAnimation: "刪除",
    animationLibraryEmpty: "尚無使用者動畫。匯入本地動畫包後會顯示在這裡。",
    animationPackImported: "動畫包已匯入",
    animationPackImportFailed: "無法匯入動畫包",
    animationPackUsed: "已從庫載入動畫",
    animationPackExported: "動畫包已匯出",
    animationPackExportFailed: "無法匯出動畫包",
    animationPackExportTitle: "匯出動畫包",
    animationPackExportIntro: "寫出包含 manifest、預覽、精靈表與 metadata 的本地 ZIP。",
    cancel: "取消",
    saveExport: "匯出",
    uploadImageForEdit: "上傳圖像",
    selectedEditSource: "已選圖像",
    noEditSource: "尚未選擇圖像",
    imageEditRegionsTitle: "編號編輯區域",
    editImage: "編輯圖像",
    statusAnimationSourceRequired: "生成動畫前請上傳或選擇像素藝術來源",
    statusAnimationGenerated: "動畫已生成",
    codexFailureTitle: "生成失敗",
    createCodexJob: "建立 Codex 作業",
    generateLocalImage: "生成像素藝術",
    generateLocalSprite: "生成動畫",
    waitingForCodexResult: "等待 Codex 結果",
    importLatest: "匯入最新結果",
    importFile: "匯入檔案",
    currentWorkflow: "目前工作流程",
    selectedProvider: "路線",
    results: "結果",
    jobNotes: "備註"
  }),
  ko: withUiCopy({
    language: "언어",
    workflowPanelTitle: "워크플로",
    canvasAnnotationTitle: "미리보기",
    previewLabel: "미리보기",
    canvasEmpty: "이미지를 가져오거나 생성하면 시작할 수 있습니다",
    promptExamples: "프롬프트 예시",
    promptExamplesTitle: "프롬프트 예시",
    promptExamplesIntro: "예시 이미지를 보고 조정된 프롬프트를 복사하거나 불러옵니다.",
    copyPrompt: "프롬프트 복사",
    usePrompt: "프롬프트 사용",
    closePromptExamples: "닫기",
    promptCopied: "프롬프트를 복사했습니다",
    promptExampleApplied: "프롬프트 예시를 픽셀 아트 생성에 불러왔습니다",
    animationStepSourceTitle: "1. 픽셀 아트 업로드",
    animationStepMotionTitle: "2. 움직임 선택",
    animationStepGenerateTitle: "3. 생성",
    animationStepDownloadTitle: "4. 다운로드",
    uploadPixelArt: "픽셀 아트 업로드",
    selectedSource: "선택한 원본",
    noAnimationSource: "아직 픽셀 아트 원본이 없습니다",
    motionPreset: "선택한 애니메이션",
    chooseAnimation: "애니메이션 선택",
    animationPresetExamples: "애니메이션 선택",
    animationPresetExamplesTitle: "애니메이션 선택",
    animationPresetExamplesIntro: "움직이는 샘플을 보고 사용할 동작을 선택합니다.",
    useAnimationPreset: "애니메이션 선택",
    animationPresetExampleApplied: "애니메이션을 선택했습니다",
    generationMayTakeMinutes: "생성에는 몇 분이 걸릴 수 있습니다.",
    animationReady: "애니메이션 프레임 준비 완료",
    animatedGif: "애니메이션 GIF",
    animatedWebP: "애니메이션 WebP",
    spriteSheetDownload: "스프라이트 시트",
    directionalPreviews: "방향별 미리보기",
    animationGeneratedFrom: "생성 원본",
    imageEditGeneratedFrom: "편집 원본",
    imageDownloadTitle: "다운로드",
    imageDownloadBody: "미리보기의 이미지를 PNG로 내보냅니다.",
    imageDownloadReady: "선택한 이미지를 내보낼 수 있습니다",
    imageDownloadLocked: "먼저 이미지를 선택하거나 생성하세요.",
    animationLibraryTitle: "애니메이션 라이브러리",
    animationLibraryBody: "공식 프리셋과 가져온 사용자 애니메이션 팩을 재사용합니다.",
    officialAnimations: "공식 애니메이션",
    userAnimations: "사용자 애니메이션",
    importAnimation: "애니메이션 가져오기",
    exportAnimationPack: "애니메이션 팩 내보내기",
    exportAnimationSample: "샘플 내보내기",
    useAnimationLibraryItem: "사용",
    renameAnimation: "이름 변경",
    deleteAnimation: "삭제",
    animationLibraryEmpty: "사용자 애니메이션이 없습니다. 로컬 애니메이션 팩을 가져오면 여기에 표시됩니다.",
    cancel: "취소",
    saveExport: "내보내기",
    uploadImageForEdit: "이미지 업로드",
    imageEditRegionsTitle: "번호가 있는 편집 영역",
    editImage: "이미지 편집",
    statusAnimationSourceRequired: "애니메이션 생성 전에 픽셀 아트 원본을 업로드하거나 선택하세요",
    statusAnimationGenerated: "애니메이션 생성 완료",
    codexFailureTitle: "생성 실패",
    createCodexJob: "Codex 작업 만들기",
    generateLocalImage: "픽셀 아트 생성",
    generateLocalSprite: "애니메이션 생성",
    waitingForCodexResult: "Codex 결과 대기 중",
    importLatest: "최신 결과 가져오기",
    importFile: "파일 가져오기",
    currentWorkflow: "현재 워크플로",
    selectedProvider: "경로",
    results: "결과",
    jobNotes: "메모"
  }),
  ru: withUiCopy({
    language: "Язык",
    workflowPanelTitle: "Рабочий процесс",
    canvasAnnotationTitle: "Предпросмотр",
    previewLabel: "Предпросмотр",
    canvasEmpty: "Импортируйте или создайте изображение, чтобы начать",
    promptExamples: "Примеры промптов",
    promptExamplesTitle: "Примеры промптов",
    promptExamplesIntro: "Выберите пример по изображению, затем скопируйте или загрузите промпт.",
    copyPrompt: "Скопировать промпт",
    usePrompt: "Использовать промпт",
    closePromptExamples: "Закрыть",
    promptCopied: "Промпт скопирован",
    promptExampleApplied: "Пример промпта загружен в генерацию пиксель-арта",
    animationStepSourceTitle: "1. Загрузите пиксель-арт",
    animationStepMotionTitle: "2. Выберите движение",
    animationStepGenerateTitle: "3. Создать",
    animationStepDownloadTitle: "4. Скачать",
    uploadPixelArt: "Загрузить пиксель-арт",
    selectedSource: "Выбранный источник",
    noAnimationSource: "Источник пиксель-арта еще не загружен",
    motionPreset: "Выбранная анимация",
    chooseAnimation: "Выбрать анимацию",
    animationPresetExamples: "Выбрать анимацию",
    animationPresetExamplesTitle: "Выбрать анимацию",
    animationPresetExamplesIntro: "Посмотрите движущийся пример и выберите пресет.",
    useAnimationPreset: "Выбрать анимацию",
    animationPresetExampleApplied: "Анимация выбрана",
    generationMayTakeMinutes: "Создание может занять несколько минут.",
    animationReady: "Кадры анимации готовы",
    animatedGif: "Анимированный GIF",
    animatedWebP: "Анимированный WebP",
    spriteSheetDownload: "Спрайт-лист",
    directionalPreviews: "Предпросмотр направлений",
    animationGeneratedFrom: "Создано из",
    imageEditGeneratedFrom: "Отредактировано из",
    imageDownloadTitle: "Скачать",
    imageDownloadBody: "Экспортируйте изображение в предпросмотре как PNG.",
    imageDownloadReady: "Выбранное изображение готово",
    imageDownloadLocked: "Сначала выберите или создайте изображение.",
    animationLibraryTitle: "Библиотека анимаций",
    animationLibraryBody: "Используйте официальные пресеты и импортированные пакеты как материалы.",
    officialAnimations: "Официальные анимации",
    userAnimations: "Пользовательские анимации",
    importAnimation: "Импортировать анимацию",
    exportAnimationPack: "Экспорт пакета анимации",
    exportAnimationSample: "Экспорт примера",
    useAnimationLibraryItem: "Использовать",
    renameAnimation: "Переименовать",
    deleteAnimation: "Удалить",
    animationLibraryEmpty: "Пользовательских анимаций пока нет. Импортируйте локальный пакет.",
    cancel: "Отмена",
    saveExport: "Экспорт",
    uploadImageForEdit: "Загрузить изображение",
    imageEditRegionsTitle: "Нумерованные области правки",
    editImage: "Редактировать изображение",
    statusAnimationSourceRequired: "Перед созданием анимации загрузите или выберите пиксель-арт",
    statusAnimationGenerated: "Анимация создана",
    codexFailureTitle: "Не удалось создать",
    createCodexJob: "Создать задание Codex",
    generateLocalImage: "Создать пиксель-арт",
    generateLocalSprite: "Создать анимацию",
    waitingForCodexResult: "Ожидание результата Codex",
    importLatest: "Импортировать последнее",
    importFile: "Импортировать файл",
    currentWorkflow: "Текущий процесс",
    selectedProvider: "Маршрут",
    results: "Результаты",
    jobNotes: "Заметки"
  }),
  es: withUiCopy({
    language: "Idioma",
    workflowPanelTitle: "Flujo",
    canvasAnnotationTitle: "Vista previa",
    previewLabel: "Vista previa",
    canvasEmpty: "Importa o genera una imagen para empezar",
    promptExamples: "Ejemplos de prompts",
    promptExamplesTitle: "Ejemplos de prompts",
    copyPrompt: "Copiar prompt",
    usePrompt: "Usar prompt",
    closePromptExamples: "Cerrar",
    animationStepSourceTitle: "1. Sube pixel art",
    animationStepMotionTitle: "2. Elige movimiento",
    animationStepGenerateTitle: "3. Generar",
    animationStepDownloadTitle: "4. Descargar",
    uploadPixelArt: "Subir pixel art",
    motionPreset: "Animación seleccionada",
    chooseAnimation: "Elegir animación",
    useAnimationPreset: "Elegir animación",
    generationMayTakeMinutes: "La generación puede tardar unos minutos.",
    animationReady: "Fotogramas de animación listos",
    animatedGif: "GIF animado",
    animatedWebP: "WebP animado",
    spriteSheetDownload: "Sprite sheet",
    directionalPreviews: "Vistas por dirección",
    animationGeneratedFrom: "Generado desde",
    imageDownloadTitle: "Descargar",
    animationLibraryTitle: "Biblioteca de animaciones",
    officialAnimations: "Animaciones oficiales",
    userAnimations: "Animaciones de usuario",
    importAnimation: "Importar animación",
    exportAnimationPack: "Exportar paquete",
    exportAnimationSample: "Exportar muestra",
    useAnimationLibraryItem: "Usar",
    renameAnimation: "Renombrar",
    deleteAnimation: "Eliminar",
    cancel: "Cancelar",
    saveExport: "Exportar",
    uploadImageForEdit: "Subir imagen",
    editImage: "Editar imagen",
    statusAnimationGenerated: "Animación generada",
    codexFailureTitle: "Error al generar",
    createCodexJob: "Crear trabajo Codex",
    generateLocalImage: "Generar pixel art",
    generateLocalSprite: "Generar animación",
    importLatest: "Importar último resultado",
    importFile: "Importar archivo",
    currentWorkflow: "Flujo actual",
    results: "Resultados"
  }),
  "pt-BR": withUiCopy({
    language: "Idioma",
    workflowPanelTitle: "Fluxo",
    canvasAnnotationTitle: "Prévia",
    previewLabel: "Prévia",
    canvasEmpty: "Importe ou gere uma imagem para começar",
    promptExamples: "Exemplos de prompts",
    promptExamplesTitle: "Exemplos de prompts",
    copyPrompt: "Copiar prompt",
    usePrompt: "Usar prompt",
    closePromptExamples: "Fechar",
    animationStepSourceTitle: "1. Envie pixel art",
    animationStepMotionTitle: "2. Escolha o movimento",
    animationStepGenerateTitle: "3. Gerar",
    animationStepDownloadTitle: "4. Baixar",
    uploadPixelArt: "Enviar pixel art",
    motionPreset: "Animação selecionada",
    chooseAnimation: "Escolher animação",
    useAnimationPreset: "Escolher animação",
    generationMayTakeMinutes: "A geração pode levar alguns minutos.",
    animationReady: "Quadros da animação prontos",
    animatedGif: "GIF animado",
    animatedWebP: "WebP animado",
    spriteSheetDownload: "Sprite sheet",
    directionalPreviews: "Prévias por direção",
    animationGeneratedFrom: "Gerado de",
    imageDownloadTitle: "Baixar",
    animationLibraryTitle: "Biblioteca de animações",
    officialAnimations: "Animações oficiais",
    userAnimations: "Animações do usuário",
    importAnimation: "Importar animação",
    exportAnimationPack: "Exportar pacote",
    exportAnimationSample: "Exportar amostra",
    useAnimationLibraryItem: "Usar",
    renameAnimation: "Renomear",
    deleteAnimation: "Excluir",
    cancel: "Cancelar",
    saveExport: "Exportar",
    uploadImageForEdit: "Enviar imagem",
    editImage: "Editar imagem",
    statusAnimationGenerated: "Animação gerada",
    codexFailureTitle: "Falha na geração",
    createCodexJob: "Criar job Codex",
    generateLocalImage: "Gerar pixel art",
    generateLocalSprite: "Gerar animação",
    importLatest: "Importar resultado mais recente",
    importFile: "Importar arquivo",
    currentWorkflow: "Fluxo atual",
    results: "Resultados"
  }),
  de: withUiCopy({
    language: "Sprache",
    workflowPanelTitle: "Workflow",
    canvasAnnotationTitle: "Vorschau",
    previewLabel: "Vorschau",
    canvasEmpty: "Bild importieren oder erzeugen, um zu starten",
    promptExamples: "Prompt-Beispiele",
    promptExamplesTitle: "Prompt-Beispiele",
    copyPrompt: "Prompt kopieren",
    usePrompt: "Prompt verwenden",
    closePromptExamples: "Schließen",
    animationStepSourceTitle: "1. Pixel-Art hochladen",
    animationStepMotionTitle: "2. Bewegung wählen",
    animationStepGenerateTitle: "3. Erstellen",
    animationStepDownloadTitle: "4. Herunterladen",
    uploadPixelArt: "Pixel-Art hochladen",
    motionPreset: "Gewählte Animation",
    chooseAnimation: "Animation wählen",
    useAnimationPreset: "Animation wählen",
    generationMayTakeMinutes: "Die Erstellung kann einige Minuten dauern.",
    animationReady: "Animationsframes bereit",
    animatedGif: "Animiertes GIF",
    animatedWebP: "Animiertes WebP",
    spriteSheetDownload: "Sprite-Sheet",
    directionalPreviews: "Richtungsvorschau",
    animationGeneratedFrom: "Erstellt aus",
    imageDownloadTitle: "Herunterladen",
    animationLibraryTitle: "Animationsbibliothek",
    officialAnimations: "Offizielle Animationen",
    userAnimations: "Nutzeranimationen",
    importAnimation: "Animation importieren",
    exportAnimationPack: "Animationspaket exportieren",
    exportAnimationSample: "Beispiel exportieren",
    useAnimationLibraryItem: "Nutzen",
    renameAnimation: "Umbenennen",
    deleteAnimation: "Löschen",
    cancel: "Abbrechen",
    saveExport: "Exportieren",
    uploadImageForEdit: "Bild hochladen",
    editImage: "Bild bearbeiten",
    statusAnimationGenerated: "Animation erstellt",
    codexFailureTitle: "Erstellung fehlgeschlagen",
    createCodexJob: "Codex-Job erstellen",
    generateLocalImage: "Pixel-Art erstellen",
    generateLocalSprite: "Animation erstellen",
    importLatest: "Neuestes Ergebnis importieren",
    importFile: "Datei importieren",
    currentWorkflow: "Aktueller Workflow",
    results: "Ergebnisse"
  }),
  fr: withUiCopy({
    language: "Langue",
    workflowPanelTitle: "Flux",
    canvasAnnotationTitle: "Aperçu",
    previewLabel: "Aperçu",
    canvasEmpty: "Importez ou générez une image pour commencer",
    promptExamples: "Exemples de prompts",
    promptExamplesTitle: "Exemples de prompts",
    copyPrompt: "Copier le prompt",
    usePrompt: "Utiliser le prompt",
    closePromptExamples: "Fermer",
    animationStepSourceTitle: "1. Importer le pixel art",
    animationStepMotionTitle: "2. Choisir le mouvement",
    animationStepGenerateTitle: "3. Générer",
    animationStepDownloadTitle: "4. Télécharger",
    uploadPixelArt: "Importer le pixel art",
    motionPreset: "Animation choisie",
    chooseAnimation: "Choisir une animation",
    useAnimationPreset: "Choisir l'animation",
    generationMayTakeMinutes: "La génération peut prendre quelques minutes.",
    animationReady: "Images d'animation prêtes",
    animatedGif: "GIF animé",
    animatedWebP: "WebP animé",
    spriteSheetDownload: "Sprite sheet",
    directionalPreviews: "Aperçus par direction",
    animationGeneratedFrom: "Généré depuis",
    imageDownloadTitle: "Télécharger",
    animationLibraryTitle: "Bibliothèque d'animations",
    officialAnimations: "Animations officielles",
    userAnimations: "Animations utilisateur",
    importAnimation: "Importer une animation",
    exportAnimationPack: "Exporter le pack",
    exportAnimationSample: "Exporter l'exemple",
    useAnimationLibraryItem: "Utiliser",
    renameAnimation: "Renommer",
    deleteAnimation: "Supprimer",
    cancel: "Annuler",
    saveExport: "Exporter",
    uploadImageForEdit: "Importer une image",
    editImage: "Modifier l'image",
    statusAnimationGenerated: "Animation générée",
    codexFailureTitle: "Échec de la génération",
    createCodexJob: "Créer une tâche Codex",
    generateLocalImage: "Générer du pixel art",
    generateLocalSprite: "Générer l'animation",
    importLatest: "Importer le dernier résultat",
    importFile: "Importer un fichier",
    currentWorkflow: "Flux actuel",
    results: "Résultats"
  }),
  id: withUiCopy({
    language: "Bahasa",
    workflowPanelTitle: "Alur kerja",
    canvasAnnotationTitle: "Pratinjau",
    previewLabel: "Pratinjau",
    canvasEmpty: "Impor atau buat gambar untuk memulai",
    promptExamples: "Contoh prompt",
    promptExamplesTitle: "Contoh prompt",
    copyPrompt: "Salin prompt",
    usePrompt: "Gunakan prompt",
    closePromptExamples: "Tutup",
    animationStepSourceTitle: "1. Unggah pixel art",
    animationStepMotionTitle: "2. Pilih gerakan",
    animationStepGenerateTitle: "3. Buat",
    animationStepDownloadTitle: "4. Unduh",
    uploadPixelArt: "Unggah pixel art",
    motionPreset: "Animasi terpilih",
    chooseAnimation: "Pilih animasi",
    useAnimationPreset: "Pilih animasi",
    generationMayTakeMinutes: "Pembuatan bisa memakan beberapa menit.",
    animationReady: "Frame animasi siap",
    animatedGif: "GIF animasi",
    animatedWebP: "WebP animasi",
    spriteSheetDownload: "Sprite sheet",
    directionalPreviews: "Pratinjau arah",
    animationGeneratedFrom: "Dibuat dari",
    imageDownloadTitle: "Unduh",
    animationLibraryTitle: "Pustaka animasi",
    officialAnimations: "Animasi resmi",
    userAnimations: "Animasi pengguna",
    importAnimation: "Impor animasi",
    exportAnimationPack: "Ekspor paket",
    exportAnimationSample: "Ekspor sampel",
    useAnimationLibraryItem: "Gunakan",
    renameAnimation: "Ganti nama",
    deleteAnimation: "Hapus",
    cancel: "Batal",
    saveExport: "Ekspor",
    uploadImageForEdit: "Unggah gambar",
    editImage: "Edit gambar",
    statusAnimationGenerated: "Animasi dibuat",
    codexFailureTitle: "Pembuatan gagal",
    createCodexJob: "Buat job Codex",
    generateLocalImage: "Buat pixel art",
    generateLocalSprite: "Buat animasi",
    importLatest: "Impor hasil terbaru",
    importFile: "Impor file",
    currentWorkflow: "Alur saat ini",
    results: "Hasil"
  }),
  tr: withUiCopy({
    language: "Dil",
    workflowPanelTitle: "İş akışı",
    canvasAnnotationTitle: "Önizleme",
    previewLabel: "Önizleme",
    canvasEmpty: "Başlamak için bir görsel içe aktarın veya üretin",
    promptExamples: "Prompt örnekleri",
    promptExamplesTitle: "Prompt örnekleri",
    copyPrompt: "Promptu kopyala",
    usePrompt: "Promptu kullan",
    closePromptExamples: "Kapat",
    animationStepSourceTitle: "1. Piksel sanat yükle",
    animationStepMotionTitle: "2. Hareket seç",
    animationStepGenerateTitle: "3. Üret",
    animationStepDownloadTitle: "4. İndir",
    uploadPixelArt: "Piksel sanat yükle",
    motionPreset: "Seçili animasyon",
    chooseAnimation: "Animasyon seç",
    useAnimationPreset: "Animasyon seç",
    generationMayTakeMinutes: "Üretim birkaç dakika sürebilir.",
    animationReady: "Animasyon kareleri hazır",
    animatedGif: "Animasyonlu GIF",
    animatedWebP: "Animasyonlu WebP",
    spriteSheetDownload: "Sprite sheet",
    directionalPreviews: "Yön önizlemeleri",
    animationGeneratedFrom: "Kaynak",
    imageDownloadTitle: "İndir",
    animationLibraryTitle: "Animasyon kitaplığı",
    officialAnimations: "Resmi animasyonlar",
    userAnimations: "Kullanıcı animasyonları",
    importAnimation: "Animasyon içe aktar",
    exportAnimationPack: "Animasyon paketi dışa aktar",
    exportAnimationSample: "Örnek dışa aktar",
    useAnimationLibraryItem: "Kullan",
    renameAnimation: "Yeniden adlandır",
    deleteAnimation: "Sil",
    cancel: "İptal",
    saveExport: "Dışa aktar",
    uploadImageForEdit: "Görsel yükle",
    editImage: "Görsel düzenle",
    statusAnimationGenerated: "Animasyon üretildi",
    codexFailureTitle: "Oluşturma başarısız",
    createCodexJob: "Codex işi oluştur",
    generateLocalImage: "Piksel sanat üret",
    generateLocalSprite: "Animasyon üret",
    importLatest: "En son sonucu içe aktar",
    importFile: "Dosya içe aktar",
    currentWorkflow: "Geçerli iş akışı",
    results: "Sonuçlar"
  }),
  vi: withUiCopy({
    language: "Ngôn ngữ",
    workflowPanelTitle: "Quy trình",
    canvasAnnotationTitle: "Xem trước",
    previewLabel: "Xem trước",
    canvasEmpty: "Nhập hoặc tạo ảnh để bắt đầu",
    promptExamples: "Ví dụ prompt",
    promptExamplesTitle: "Ví dụ prompt",
    copyPrompt: "Sao chép prompt",
    usePrompt: "Dùng prompt",
    closePromptExamples: "Đóng",
    animationStepSourceTitle: "1. Tải pixel art lên",
    animationStepMotionTitle: "2. Chọn chuyển động",
    animationStepGenerateTitle: "3. Tạo",
    animationStepDownloadTitle: "4. Tải xuống",
    uploadPixelArt: "Tải pixel art lên",
    motionPreset: "Hoạt ảnh đã chọn",
    chooseAnimation: "Chọn hoạt ảnh",
    useAnimationPreset: "Chọn hoạt ảnh",
    generationMayTakeMinutes: "Việc tạo có thể mất vài phút.",
    animationReady: "Khung hoạt ảnh đã sẵn sàng",
    animatedGif: "GIF động",
    animatedWebP: "WebP động",
    spriteSheetDownload: "Sprite sheet",
    directionalPreviews: "Xem trước theo hướng",
    animationGeneratedFrom: "Tạo từ",
    imageDownloadTitle: "Tải xuống",
    animationLibraryTitle: "Thư viện hoạt ảnh",
    officialAnimations: "Hoạt ảnh chính thức",
    userAnimations: "Hoạt ảnh người dùng",
    importAnimation: "Nhập hoạt ảnh",
    exportAnimationPack: "Xuất gói hoạt ảnh",
    exportAnimationSample: "Xuất mẫu",
    useAnimationLibraryItem: "Dùng",
    renameAnimation: "Đổi tên",
    deleteAnimation: "Xóa",
    cancel: "Hủy",
    saveExport: "Xuất",
    uploadImageForEdit: "Tải ảnh lên",
    editImage: "Chỉnh sửa ảnh",
    statusAnimationGenerated: "Đã tạo hoạt ảnh",
    codexFailureTitle: "Tạo thất bại",
    createCodexJob: "Tạo job Codex",
    generateLocalImage: "Tạo pixel art",
    generateLocalSprite: "Tạo hoạt ảnh",
    importLatest: "Nhập kết quả mới nhất",
    importFile: "Nhập tệp",
    currentWorkflow: "Quy trình hiện tại",
    results: "Kết quả"
  }),
  pl: withUiCopy({
    language: "Język",
    workflowPanelTitle: "Proces",
    canvasAnnotationTitle: "Podgląd",
    previewLabel: "Podgląd",
    canvasEmpty: "Zaimportuj lub wygeneruj obraz, aby zacząć",
    promptExamples: "Przykłady promptów",
    promptExamplesTitle: "Przykłady promptów",
    copyPrompt: "Kopiuj prompt",
    usePrompt: "Użyj promptu",
    closePromptExamples: "Zamknij",
    animationStepSourceTitle: "1. Prześlij pixel art",
    animationStepMotionTitle: "2. Wybierz ruch",
    animationStepGenerateTitle: "3. Generuj",
    animationStepDownloadTitle: "4. Pobierz",
    uploadPixelArt: "Prześlij pixel art",
    motionPreset: "Wybrana animacja",
    chooseAnimation: "Wybierz animację",
    useAnimationPreset: "Wybierz animację",
    generationMayTakeMinutes: "Generowanie może potrwać kilka minut.",
    animationReady: "Klatki animacji gotowe",
    animatedGif: "Animowany GIF",
    animatedWebP: "Animowany WebP",
    spriteSheetDownload: "Sprite sheet",
    directionalPreviews: "Podglądy kierunków",
    animationGeneratedFrom: "Wygenerowano z",
    imageDownloadTitle: "Pobierz",
    animationLibraryTitle: "Biblioteka animacji",
    officialAnimations: "Oficjalne animacje",
    userAnimations: "Animacje użytkownika",
    importAnimation: "Importuj animację",
    exportAnimationPack: "Eksportuj pakiet",
    exportAnimationSample: "Eksportuj przykład",
    useAnimationLibraryItem: "Użyj",
    renameAnimation: "Zmień nazwę",
    deleteAnimation: "Usuń",
    cancel: "Anuluj",
    saveExport: "Eksportuj",
    uploadImageForEdit: "Prześlij obraz",
    editImage: "Edytuj obraz",
    statusAnimationGenerated: "Animacja wygenerowana",
    codexFailureTitle: "Generowanie nie powiodło się",
    createCodexJob: "Utwórz zadanie Codex",
    generateLocalImage: "Generuj pixel art",
    generateLocalSprite: "Generuj animację",
    importLatest: "Importuj najnowszy wynik",
    importFile: "Importuj plik",
    currentWorkflow: "Bieżący proces",
    results: "Wyniki"
  }),
  it: withUiCopy({
    language: "Lingua",
    workflowPanelTitle: "Flusso",
    canvasAnnotationTitle: "Anteprima",
    previewLabel: "Anteprima",
    canvasEmpty: "Importa o genera un'immagine per iniziare",
    promptExamples: "Esempi di prompt",
    promptExamplesTitle: "Esempi di prompt",
    copyPrompt: "Copia prompt",
    usePrompt: "Usa prompt",
    closePromptExamples: "Chiudi",
    animationStepSourceTitle: "1. Carica pixel art",
    animationStepMotionTitle: "2. Scegli movimento",
    animationStepGenerateTitle: "3. Genera",
    animationStepDownloadTitle: "4. Scarica",
    uploadPixelArt: "Carica pixel art",
    motionPreset: "Animazione selezionata",
    chooseAnimation: "Scegli animazione",
    useAnimationPreset: "Scegli animazione",
    generationMayTakeMinutes: "La generazione può richiedere alcuni minuti.",
    animationReady: "Frame animazione pronti",
    animatedGif: "GIF animata",
    animatedWebP: "WebP animata",
    spriteSheetDownload: "Sprite sheet",
    directionalPreviews: "Anteprime direzioni",
    animationGeneratedFrom: "Generato da",
    imageDownloadTitle: "Scarica",
    animationLibraryTitle: "Libreria animazioni",
    officialAnimations: "Animazioni ufficiali",
    userAnimations: "Animazioni utente",
    importAnimation: "Importa animazione",
    exportAnimationPack: "Esporta pacchetto",
    exportAnimationSample: "Esporta esempio",
    useAnimationLibraryItem: "Usa",
    renameAnimation: "Rinomina",
    deleteAnimation: "Elimina",
    cancel: "Annulla",
    saveExport: "Esporta",
    uploadImageForEdit: "Carica immagine",
    editImage: "Modifica immagine",
    statusAnimationGenerated: "Animazione generata",
    codexFailureTitle: "Generazione non riuscita",
    createCodexJob: "Crea job Codex",
    generateLocalImage: "Genera pixel art",
    generateLocalSprite: "Genera animazione",
    importLatest: "Importa risultato più recente",
    importFile: "Importa file",
    currentWorkflow: "Flusso corrente",
    results: "Risultati"
  })
} satisfies Record<Language, UiCopy>;

function withUiCopy(overrides: Partial<UiCopy>): UiCopy {
  return { ...baseUiCopy.en, ...overrides };
}

function localizedText(text: LocalizedText, language: Language) {
  return text[language] ?? text.en;
}

type WorkflowCopy = Record<WorkflowMode, { label: string; detail: string; status: string }>;

const baseWorkflowCopy = {
  en: {
    "image-generate": {
      label: "Pixel Art Generation",
      detail: "Send the prompt to local Codex imagegen and return the generated image to the cockpit.",
      status: "Generate pixel art through the local Codex imagegen handoff"
    },
    "image-edit": {
      label: "Image Editing",
      detail: "Select numbered rectangles on an image, comment on each region, then ask Codex to edit it.",
      status: "Select numbered edit regions, add comments, then create a Codex handoff job"
    },
    "sprite-generate": {
      label: "Animation Generation",
      detail: "Upload or select pixel art, then ask Codex for a 5-direction animation sprite sheet.",
      status: "Upload or select pixel art, then generate animation frames"
    },
    "sprite-edit": {
      label: "4. Sprite Sheet Editing",
      detail: "Tune timeline order, transparency, anchors, QC, and exports.",
      status: "Review frames, anchors, QC, and export the sprite package"
    }
  },
  ja: {
    "image-generate": {
      label: "ピクセルアートの生成",
      detail: "プロンプトをローカルCodex imagegenへ渡し、生成画像をcockpitへ戻します。",
      status: "ローカルCodex imagegen受け渡しでピクセルアートを生成します"
    },
    "image-edit": {
      label: "画像編集",
      detail: "画像を矩形選択して番号を付け、番号ごとのコメントをCodexへ渡します。",
      status: "番号付き編集範囲とコメントを作ってから、Codex受け渡しジョブを作成します"
    },
    "sprite-generate": {
      label: "アニメーションの生成",
      detail: "ピクセルアートをアップロードまたは選択し、アニメーションシートとframesを生成します。",
      status: "ピクセルアートをアップロードまたは選択して、アニメーションframesを生成します"
    },
    "sprite-edit": {
      label: "4. スプライトシート編集",
      detail: "タイムライン順、透明化、アンカー、QC、書き出しを調整します。",
      status: "フレーム、アンカー、QC、スプライトパッケージ書き出しを確認します"
    }
  }
} satisfies Record<BaseLanguage, WorkflowCopy>;

const workflowCopy = {
  ...baseWorkflowCopy,
  "zh-CN": withWorkflowCopy({
    "image-generate": { label: "像素艺术生成", detail: "将提示词发送到本地 Codex imagegen，并把生成图像带回 cockpit。", status: "通过本地 Codex imagegen 生成像素艺术" },
    "image-edit": { label: "图像编辑", detail: "在图像上选择编号矩形、添加评论，然后请求 Codex 编辑。", status: "选择编号编辑区域并创建 Codex 交接作业" },
    "sprite-generate": { label: "动画生成", detail: "上传或选择像素艺术，然后让 Codex 生成 5 方向动画精灵表。", status: "上传或选择像素艺术，然后生成动画帧" },
    "sprite-edit": { label: "4. 精灵表编辑" }
  }),
  "zh-TW": withWorkflowCopy({
    "image-generate": { label: "像素藝術生成", detail: "將提示詞送到本地 Codex imagegen，並把生成圖像帶回 cockpit。", status: "透過本地 Codex imagegen 生成像素藝術" },
    "image-edit": { label: "圖像編輯", detail: "在圖像上選擇編號矩形、加入註解，然後請 Codex 編輯。", status: "選擇編號編輯區域並建立 Codex 交接作業" },
    "sprite-generate": { label: "動畫生成", detail: "上傳或選擇像素藝術，然後讓 Codex 生成 5 方向動畫精靈表。", status: "上傳或選擇像素藝術，然後生成動畫影格" },
    "sprite-edit": { label: "4. 精靈表編輯" }
  }),
  ko: withWorkflowCopy({
    "image-generate": { label: "픽셀 아트 생성", detail: "프롬프트를 로컬 Codex imagegen에 보내고 생성 이미지를 cockpit으로 가져옵니다.", status: "로컬 Codex imagegen으로 픽셀 아트를 생성합니다" },
    "image-edit": { label: "이미지 편집", detail: "이미지에 번호가 있는 사각형을 선택하고 영역별 코멘트를 Codex에 전달합니다.", status: "번호가 있는 편집 영역과 코멘트로 Codex 작업을 만듭니다" },
    "sprite-generate": { label: "애니메이션 생성", detail: "픽셀 아트를 업로드하거나 선택한 뒤 Codex에 5방향 애니메이션 시트를 요청합니다.", status: "픽셀 아트를 업로드하거나 선택한 뒤 애니메이션 프레임을 생성합니다" },
    "sprite-edit": { label: "4. 스프라이트 시트 편집" }
  }),
  ru: withWorkflowCopy({
    "image-generate": { label: "Генерация пиксель-арта", detail: "Отправьте промпт в локальный Codex imagegen и верните созданное изображение в cockpit.", status: "Создание пиксель-арта через локальный Codex imagegen" },
    "image-edit": { label: "Редактирование изображения", detail: "Выделите нумерованные прямоугольники, добавьте комментарии и попросите Codex отредактировать изображение.", status: "Создайте области правки и задание Codex" },
    "sprite-generate": { label: "Генерация анимации", detail: "Загрузите или выберите пиксель-арт, затем попросите Codex создать 5-направленный спрайт-лист.", status: "Загрузите или выберите пиксель-арт, затем создайте кадры анимации" },
    "sprite-edit": { label: "4. Редактирование спрайт-листа" }
  }),
  es: withWorkflowCopy({
    "image-generate": { label: "Generación de pixel art", detail: "Envía el prompt a Codex imagegen local y devuelve la imagen generada al cockpit.", status: "Genera pixel art con el handoff local de Codex imagegen" },
    "image-edit": { label: "Edición de imagen", detail: "Marca rectángulos numerados, comenta cada región y pide a Codex que edite la imagen.", status: "Crea regiones numeradas y un trabajo Codex" },
    "sprite-generate": { label: "Generación de animación", detail: "Sube o selecciona pixel art y pide a Codex un sprite sheet de 5 direcciones.", status: "Sube o selecciona pixel art y genera fotogramas" },
    "sprite-edit": { label: "4. Edición de sprite sheet" }
  }),
  "pt-BR": withWorkflowCopy({
    "image-generate": { label: "Geração de pixel art", detail: "Envie o prompt para o Codex imagegen local e retorne a imagem gerada ao cockpit.", status: "Gere pixel art pelo handoff local do Codex imagegen" },
    "image-edit": { label: "Edição de imagem", detail: "Selecione retângulos numerados, comente cada região e peça a edição ao Codex.", status: "Crie regiões numeradas e um job Codex" },
    "sprite-generate": { label: "Geração de animação", detail: "Envie ou selecione pixel art e peça ao Codex uma sprite sheet de 5 direções.", status: "Envie ou selecione pixel art e gere os quadros" },
    "sprite-edit": { label: "4. Edição de sprite sheet" }
  }),
  de: withWorkflowCopy({
    "image-generate": { label: "Pixel-Art-Erstellung", detail: "Sende den Prompt an lokales Codex imagegen und hole das Bild zurück ins Cockpit.", status: "Pixel-Art über lokales Codex imagegen erstellen" },
    "image-edit": { label: "Bildbearbeitung", detail: "Markiere nummerierte Rechtecke, kommentiere sie und lasse Codex das Bild bearbeiten.", status: "Nummerierte Bereiche und einen Codex-Job erstellen" },
    "sprite-generate": { label: "Animation erstellen", detail: "Lade Pixel-Art hoch oder wähle sie aus und fordere ein 5-Richtungen-Sprite-Sheet an.", status: "Pixel-Art auswählen und Animationsframes erstellen" },
    "sprite-edit": { label: "4. Sprite-Sheet bearbeiten" }
  }),
  fr: withWorkflowCopy({
    "image-generate": { label: "Génération de pixel art", detail: "Envoyez le prompt à Codex imagegen local et ramenez l'image générée dans le cockpit.", status: "Générer du pixel art via le handoff Codex local" },
    "image-edit": { label: "Édition d'image", detail: "Sélectionnez des rectangles numérotés, commentez chaque zone, puis demandez l'édition à Codex.", status: "Créer des zones numérotées et une tâche Codex" },
    "sprite-generate": { label: "Génération d'animation", detail: "Importez ou sélectionnez du pixel art, puis demandez une sprite sheet à 5 directions.", status: "Importer ou sélectionner du pixel art, puis générer les images" },
    "sprite-edit": { label: "4. Édition de sprite sheet" }
  }),
  id: withWorkflowCopy({
    "image-generate": { label: "Pembuatan pixel art", detail: "Kirim prompt ke Codex imagegen lokal dan kembalikan gambar ke cockpit.", status: "Buat pixel art melalui handoff Codex imagegen lokal" },
    "image-edit": { label: "Pengeditan gambar", detail: "Pilih kotak bernomor, beri komentar, lalu minta Codex mengedit gambar.", status: "Buat area edit bernomor dan job Codex" },
    "sprite-generate": { label: "Pembuatan animasi", detail: "Unggah atau pilih pixel art, lalu minta sprite sheet 5 arah dari Codex.", status: "Unggah atau pilih pixel art, lalu buat frame animasi" },
    "sprite-edit": { label: "4. Edit sprite sheet" }
  }),
  tr: withWorkflowCopy({
    "image-generate": { label: "Piksel sanat üretimi", detail: "Promptu yerel Codex imagegen'e gönderip üretilen görseli cockpit'e döndürür.", status: "Yerel Codex imagegen ile piksel sanat üret" },
    "image-edit": { label: "Görsel düzenleme", detail: "Görselde numaralı dikdörtgenler seçin, yorum ekleyin ve Codex'ten düzenleme isteyin.", status: "Numaralı düzenleme alanları ve Codex işi oluştur" },
    "sprite-generate": { label: "Animasyon üretimi", detail: "Piksel sanatı yükleyin veya seçin, Codex'ten 5 yönlü sprite sheet isteyin.", status: "Piksel sanat seçip animasyon kareleri üret" },
    "sprite-edit": { label: "4. Sprite sheet düzenleme" }
  }),
  vi: withWorkflowCopy({
    "image-generate": { label: "Tạo pixel art", detail: "Gửi prompt tới Codex imagegen cục bộ và đưa ảnh đã tạo về cockpit.", status: "Tạo pixel art qua handoff Codex imagegen cục bộ" },
    "image-edit": { label: "Chỉnh sửa hình ảnh", detail: "Chọn vùng chữ nhật có số, thêm nhận xét, rồi yêu cầu Codex chỉnh sửa.", status: "Tạo vùng chỉnh sửa có số và job Codex" },
    "sprite-generate": { label: "Tạo hoạt ảnh", detail: "Tải lên hoặc chọn pixel art, rồi yêu cầu Codex tạo sprite sheet 5 hướng.", status: "Tải lên hoặc chọn pixel art rồi tạo khung hoạt ảnh" },
    "sprite-edit": { label: "4. Chỉnh sửa sprite sheet" }
  }),
  pl: withWorkflowCopy({
    "image-generate": { label: "Generowanie pixel art", detail: "Wyślij prompt do lokalnego Codex imagegen i zwróć obraz do cockpit.", status: "Generuj pixel art przez lokalny handoff Codex imagegen" },
    "image-edit": { label: "Edycja obrazu", detail: "Zaznacz numerowane prostokąty, dodaj komentarze i poproś Codex o edycję.", status: "Utwórz numerowane obszary i zadanie Codex" },
    "sprite-generate": { label: "Generowanie animacji", detail: "Prześlij lub wybierz pixel art, a potem poproś Codex o sprite sheet w 5 kierunkach.", status: "Prześlij lub wybierz pixel art i generuj klatki" },
    "sprite-edit": { label: "4. Edycja sprite sheet" }
  }),
  it: withWorkflowCopy({
    "image-generate": { label: "Generazione pixel art", detail: "Invia il prompt a Codex imagegen locale e riporta l'immagine nel cockpit.", status: "Genera pixel art con handoff locale Codex imagegen" },
    "image-edit": { label: "Modifica immagine", detail: "Seleziona rettangoli numerati, commenta ogni area e chiedi a Codex di modificare.", status: "Crea aree numerate e un job Codex" },
    "sprite-generate": { label: "Generazione animazione", detail: "Carica o seleziona pixel art e chiedi a Codex una sprite sheet a 5 direzioni.", status: "Carica o seleziona pixel art e genera frame" },
    "sprite-edit": { label: "4. Modifica sprite sheet" }
  })
} satisfies Record<Language, WorkflowCopy>;

function withWorkflowCopy(overrides: Partial<Record<WorkflowMode, Partial<WorkflowCopy[WorkflowMode]>>>): WorkflowCopy {
  return {
    "image-generate": { ...baseWorkflowCopy.en["image-generate"], ...overrides["image-generate"] },
    "image-edit": { ...baseWorkflowCopy.en["image-edit"], ...overrides["image-edit"] },
    "sprite-generate": { ...baseWorkflowCopy.en["sprite-generate"], ...overrides["sprite-generate"] },
    "sprite-edit": { ...baseWorkflowCopy.en["sprite-edit"], ...overrides["sprite-edit"] }
  };
}

type WorkflowFormCopy = Record<WorkflowMode, { promptLabel: string; negativeLabel: string; notesLabel: string; notesPlaceholder: string }>;

const baseWorkflowFormCopy = {
  en: {
    "image-generate": {
      promptLabel: "Pixel Art Prompt",
      negativeLabel: "Negative Prompt",
      notesLabel: "Generation Notes",
      notesPlaceholder: "Style, aspect, transparency, sprite-readiness, or output details"
    },
    "image-edit": {
      promptLabel: "Edit Prompt",
      negativeLabel: "Avoid",
      notesLabel: "Edit Notes",
      notesPlaceholder: "What should Codex preserve, fix, crop, split, or export?"
    },
    "sprite-generate": {
      promptLabel: "Animation Prompt",
      negativeLabel: "Avoid",
      notesLabel: "Animation Notes",
      notesPlaceholder: "Motion preset, timing, pose, bounce, or export details"
    },
    "sprite-edit": {
      promptLabel: "Sprite Prompt",
      negativeLabel: "Avoid",
      notesLabel: "Sprite Notes",
      notesPlaceholder: "Timeline order, anchor, cleanup, frame size, or export details"
    }
  },
  ja: {
    "image-generate": {
      promptLabel: "ピクセルアートプロンプト",
      negativeLabel: "避けたい要素",
      notesLabel: "生成メモ",
      notesPlaceholder: "画風、比率、透過、スプライト化しやすさ、出力条件を書きます"
    },
    "image-edit": {
      promptLabel: "編集プロンプト",
      negativeLabel: "避けたい要素",
      notesLabel: "編集メモ",
      notesPlaceholder: "Codexに残してほしい点、直してほしい点、切り出し方、出力形式を書きます"
    },
    "sprite-generate": {
      promptLabel: "アニメーションプロンプト",
      negativeLabel: "避けたい要素",
      notesLabel: "アニメーションメモ",
      notesPlaceholder: "動き、タイミング、ポーズ、揺れ、出力条件を書きます"
    },
    "sprite-edit": {
      promptLabel: "スプライトプロンプト",
      negativeLabel: "避けたい要素",
      notesLabel: "調整メモ",
      notesPlaceholder: "順番、anchor、透明化、frame size、出力条件を書きます"
    }
  }
} satisfies Record<BaseLanguage, WorkflowFormCopy>;

const workflowFormCopy = {
  ...baseWorkflowFormCopy,
  "zh-CN": withWorkflowFormCopy({
    "image-generate": { promptLabel: "像素艺术提示词", negativeLabel: "避免内容", notesLabel: "生成备注", notesPlaceholder: "风格、比例、透明、适合制作精灵的要求" },
    "image-edit": { promptLabel: "编辑提示词", negativeLabel: "避免内容", notesLabel: "编辑备注" },
    "sprite-generate": { promptLabel: "动画提示词", negativeLabel: "避免内容", notesLabel: "动画备注" },
    "sprite-edit": { promptLabel: "精灵提示词", negativeLabel: "避免内容", notesLabel: "调整备注" }
  }),
  "zh-TW": withWorkflowFormCopy({
    "image-generate": { promptLabel: "像素藝術提示詞", negativeLabel: "避免內容", notesLabel: "生成備註", notesPlaceholder: "風格、比例、透明、適合製作精靈的要求" },
    "image-edit": { promptLabel: "編輯提示詞", negativeLabel: "避免內容", notesLabel: "編輯備註" },
    "sprite-generate": { promptLabel: "動畫提示詞", negativeLabel: "避免內容", notesLabel: "動畫備註" },
    "sprite-edit": { promptLabel: "精靈提示詞", negativeLabel: "避免內容", notesLabel: "調整備註" }
  }),
  ko: withWorkflowFormCopy({
    "image-generate": { promptLabel: "픽셀 아트 프롬프트", negativeLabel: "피할 요소", notesLabel: "생성 메모" },
    "image-edit": { promptLabel: "편집 프롬프트", negativeLabel: "피할 요소", notesLabel: "편집 메모" },
    "sprite-generate": { promptLabel: "애니메이션 프롬프트", negativeLabel: "피할 요소", notesLabel: "애니메이션 메모" },
    "sprite-edit": { promptLabel: "스프라이트 프롬프트", negativeLabel: "피할 요소", notesLabel: "조정 메모" }
  }),
  ru: withWorkflowFormCopy({
    "image-generate": { promptLabel: "Промпт пиксель-арта", negativeLabel: "Избегать", notesLabel: "Заметки генерации" },
    "image-edit": { promptLabel: "Промпт правки", negativeLabel: "Избегать", notesLabel: "Заметки правки" },
    "sprite-generate": { promptLabel: "Промпт анимации", negativeLabel: "Избегать", notesLabel: "Заметки анимации" },
    "sprite-edit": { promptLabel: "Промпт спрайта", negativeLabel: "Избегать", notesLabel: "Заметки спрайта" }
  }),
  es: withWorkflowFormCopy({
    "image-generate": { promptLabel: "Prompt de pixel art", negativeLabel: "Evitar", notesLabel: "Notas de generación" },
    "image-edit": { promptLabel: "Prompt de edición", negativeLabel: "Evitar", notesLabel: "Notas de edición" },
    "sprite-generate": { promptLabel: "Prompt de animación", negativeLabel: "Evitar", notesLabel: "Notas de animación" },
    "sprite-edit": { promptLabel: "Prompt de sprite", negativeLabel: "Evitar", notesLabel: "Notas de sprite" }
  }),
  "pt-BR": withWorkflowFormCopy({
    "image-generate": { promptLabel: "Prompt de pixel art", negativeLabel: "Evitar", notesLabel: "Notas de geração" },
    "image-edit": { promptLabel: "Prompt de edição", negativeLabel: "Evitar", notesLabel: "Notas de edição" },
    "sprite-generate": { promptLabel: "Prompt de animação", negativeLabel: "Evitar", notesLabel: "Notas de animação" },
    "sprite-edit": { promptLabel: "Prompt de sprite", negativeLabel: "Evitar", notesLabel: "Notas de sprite" }
  }),
  de: withWorkflowFormCopy({
    "image-generate": { promptLabel: "Pixel-Art-Prompt", negativeLabel: "Vermeiden", notesLabel: "Erstellungsnotizen" },
    "image-edit": { promptLabel: "Bearbeitungs-Prompt", negativeLabel: "Vermeiden", notesLabel: "Bearbeitungsnotizen" },
    "sprite-generate": { promptLabel: "Animations-Prompt", negativeLabel: "Vermeiden", notesLabel: "Animationsnotizen" },
    "sprite-edit": { promptLabel: "Sprite-Prompt", negativeLabel: "Vermeiden", notesLabel: "Sprite-Notizen" }
  }),
  fr: withWorkflowFormCopy({
    "image-generate": { promptLabel: "Prompt pixel art", negativeLabel: "À éviter", notesLabel: "Notes de génération" },
    "image-edit": { promptLabel: "Prompt d'édition", negativeLabel: "À éviter", notesLabel: "Notes d'édition" },
    "sprite-generate": { promptLabel: "Prompt d'animation", negativeLabel: "À éviter", notesLabel: "Notes d'animation" },
    "sprite-edit": { promptLabel: "Prompt de sprite", negativeLabel: "À éviter", notesLabel: "Notes de sprite" }
  }),
  id: withWorkflowFormCopy({
    "image-generate": { promptLabel: "Prompt pixel art", negativeLabel: "Hindari", notesLabel: "Catatan pembuatan" },
    "image-edit": { promptLabel: "Prompt edit", negativeLabel: "Hindari", notesLabel: "Catatan edit" },
    "sprite-generate": { promptLabel: "Prompt animasi", negativeLabel: "Hindari", notesLabel: "Catatan animasi" },
    "sprite-edit": { promptLabel: "Prompt sprite", negativeLabel: "Hindari", notesLabel: "Catatan sprite" }
  }),
  tr: withWorkflowFormCopy({
    "image-generate": { promptLabel: "Piksel sanat promptu", negativeLabel: "Kaçınılacaklar", notesLabel: "Üretim notları" },
    "image-edit": { promptLabel: "Düzenleme promptu", negativeLabel: "Kaçınılacaklar", notesLabel: "Düzenleme notları" },
    "sprite-generate": { promptLabel: "Animasyon promptu", negativeLabel: "Kaçınılacaklar", notesLabel: "Animasyon notları" },
    "sprite-edit": { promptLabel: "Sprite promptu", negativeLabel: "Kaçınılacaklar", notesLabel: "Sprite notları" }
  }),
  vi: withWorkflowFormCopy({
    "image-generate": { promptLabel: "Prompt pixel art", negativeLabel: "Tránh", notesLabel: "Ghi chú tạo" },
    "image-edit": { promptLabel: "Prompt chỉnh sửa", negativeLabel: "Tránh", notesLabel: "Ghi chú chỉnh sửa" },
    "sprite-generate": { promptLabel: "Prompt hoạt ảnh", negativeLabel: "Tránh", notesLabel: "Ghi chú hoạt ảnh" },
    "sprite-edit": { promptLabel: "Prompt sprite", negativeLabel: "Tránh", notesLabel: "Ghi chú sprite" }
  }),
  pl: withWorkflowFormCopy({
    "image-generate": { promptLabel: "Prompt pixel art", negativeLabel: "Unikaj", notesLabel: "Notatki generowania" },
    "image-edit": { promptLabel: "Prompt edycji", negativeLabel: "Unikaj", notesLabel: "Notatki edycji" },
    "sprite-generate": { promptLabel: "Prompt animacji", negativeLabel: "Unikaj", notesLabel: "Notatki animacji" },
    "sprite-edit": { promptLabel: "Prompt sprite", negativeLabel: "Unikaj", notesLabel: "Notatki sprite" }
  }),
  it: withWorkflowFormCopy({
    "image-generate": { promptLabel: "Prompt pixel art", negativeLabel: "Evita", notesLabel: "Note generazione" },
    "image-edit": { promptLabel: "Prompt modifica", negativeLabel: "Evita", notesLabel: "Note modifica" },
    "sprite-generate": { promptLabel: "Prompt animazione", negativeLabel: "Evita", notesLabel: "Note animazione" },
    "sprite-edit": { promptLabel: "Prompt sprite", negativeLabel: "Evita", notesLabel: "Note sprite" }
  })
} satisfies Record<Language, WorkflowFormCopy>;

function withWorkflowFormCopy(overrides: Partial<Record<WorkflowMode, Partial<WorkflowFormCopy[WorkflowMode]>>>): WorkflowFormCopy {
  return {
    "image-generate": { ...baseWorkflowFormCopy.en["image-generate"], ...overrides["image-generate"] },
    "image-edit": { ...baseWorkflowFormCopy.en["image-edit"], ...overrides["image-edit"] },
    "sprite-generate": { ...baseWorkflowFormCopy.en["sprite-generate"], ...overrides["sprite-generate"] },
    "sprite-edit": { ...baseWorkflowFormCopy.en["sprite-edit"], ...overrides["sprite-edit"] }
  };
}

const DEFAULT_ANIMATION_PRESET_ID = "idle-breathing";

const defaultActions: SpriteAction[] = [
  { name: "idle", fps: 12, loop: true, frameIds: [], cell: STANDARD_ANIMATION_CELL, anchor: STANDARD_ANIMATION_ANCHOR },
  { name: "walk", fps: 12, loop: true, frameIds: [], cell: STANDARD_ANIMATION_CELL, anchor: STANDARD_ANIMATION_ANCHOR },
  { name: "cast", fps: 10, loop: false, frameIds: [], cell: STANDARD_ANIMATION_CELL, anchor: STANDARD_ANIMATION_ANCHOR },
  { name: "attack", fps: 10, loop: false, frameIds: [], cell: STANDARD_ANIMATION_CELL, anchor: STANDARD_ANIMATION_ANCHOR },
  { name: "run", fps: 20, loop: true, playbackMode: "ping-pong-reverse", frameIds: [], cell: STANDARD_ANIMATION_CELL, anchor: STANDARD_ANIMATION_ANCHOR }
];

const animationPresetExamples: AnimationPresetExample[] = [
  {
    id: "idle-breathing",
    actionName: "idle",
    previewClassName: "sample-idle-sheet sample-idle",
    category: { en: "Core", ja: "基礎" },
    title: { en: "Idle Breathing", ja: "待機呼吸ループ" },
    summary: {
      en: "Stable 8-frame ready stance with planted feet, subtle breathing, and readable five-direction views.",
      ja: "足を固定したまま、控えめな呼吸と5方向の見え方が読める8フレーム待機です。"
    },
    prompt: "idle breathing ready stance with planted feet, subtle inhale and exhale, tiny shoulder and chest rise, delayed hair, hood, clothing, and backpack follow-through, stable center, stable foot baseline, no walking, no stepping, no hopping",
    notes: "Official preset: generate eight source frames as one complete idle breathing loop. Feet must remain planted on the same baseline; motion should come only from subtle breathing, shoulder/chest rise, and delayed hair, cloth, hood, and backpack settling. Avoid stepping, walking, running, hopping, large bounce, cropped hair, cropped feet, or pose drift."
  },
  {
    id: "walk-cycle",
    actionName: "walk",
    previewClassName: "sample-walk-sheet sample-walk",
    category: { en: "Move", ja: "移動" },
    title: { en: "Walk Cycle", ja: "歩行ループ" },
    summary: {
      en: "Readable 8-frame walking loop with contact, passing poses, and stable foot placement.",
      ja: "接地、通過ポーズ、安定した足運びが読める8フレーム歩行です。"
    },
    prompt: "8-frame walk cycle with alternating left and right foot contact, clear passing poses under the body, modest stride length, stable ground contact, opposite arm swing, subtle torso bob, full-body side-readable motion",
    notes: "Preset example: generate eight source frames as one complete walk loop. The loop must show left contact, down/weight shift, passing, right reach, right contact, down/weight shift, passing, and left reach back into frame 1. Avoid sliding feet, static shuffling, hidden leg swaps, cropped feet, or pose drift."
  },
  {
    id: "run-cycle",
    actionName: "run",
    previewClassName: "sample-run-sheet sample-run",
    category: { en: "Move", ja: "移動" },
    title: { en: "Run Cycle", ja: "走行ループ" },
    summary: {
      en: "Fast alternating strides with clear airborne beats and arm drive.",
      ja: "大きな歩幅、空中フレーム、強い腕振りが読める走りです。"
    },
    prompt: "run cycle half-cycle with the left foot traveling from back to front and the right foot traveling from front to back, legs far apart then approaching, feet-together passing moment, legs separating into the opposite stride, forward torso lean, strong opposite arm drive, full-body side-readable motion",
    notes: "Preset example: generate eight source frames for one half-cycle; the app appends the reverse order for 16-frame GIF/WebP playback. The half-cycle must show legs far apart, approaching, feet together under the body, separating again, and far apart in the opposite stride. Avoid skating, tiny shuffling steps, cropped feet, or pose drift."
  }
];

function getAnimationPresetById(id: string): AnimationPresetExample {
  return animationPresetExamples.find((example) => example.id === id)
    ?? animationPresetExamples.find((example) => example.id === DEFAULT_ANIMATION_PRESET_ID)
    ?? animationPresetExamples[0]!;
}

function buildAnimationPresetMotionPrompt(preset: AnimationPresetExample) {
  const presetTitle = preset.title.en;
  const motionSheetLine = preset.id === "idle-breathing"
    ? "Create an idle breathing / ready stance animation sprite sheet."
    : preset.id === "walk-cycle"
      ? "Create a walking animation sprite sheet."
      : preset.id === "run-cycle"
        ? "Create a running animation sprite sheet."
        : `Create a ${presetTitle.toLowerCase()} animation sprite sheet.`;
  const idleBreathingLines = preset.id === "idle-breathing"
    ? [
        "Idle breathing must read as a ready stance in every row, not as movement through space.",
        "Use the 8 generated source frames as one complete normal loop, not a ping-pong half-cycle.",
        "Frame plan: frame 1 neutral ready stance; frame 2 slight inhale with chest and shoulders rising; frame 3 hair, hood, clothing, and backpack follow upward subtly; frame 4 top of breath while the body stays centered; frame 5 exhale begins; frame 6 shoulders settle and cloth/hair lag slightly; frame 7 return toward neutral; frame 8 clean bridge back to frame 1.",
        "Both feet must stay planted on the same exact foot baseline in all eight frames. Do not step, walk, run, hop, slide, lift a foot, or change the stance width.",
        "The motion should be visible but restrained: tiny shoulder/chest rise, small head or hair settle, and light clothing/backpack follow-through. Do not use large bounce as a substitute for breathing.",
        "For diagonal and side rows, preserve the same stance silhouette and foot positions across the row; only the breathing and secondary motion should change.",
        "The back row must remain a true straight rear idle stance with a centered backpack/back silhouette and no face details."
      ]
    : [];
  const walkCycleGaitLines = preset.id === "walk-cycle"
    ? [
        "Walking gait must be visible in every row, especially front three-quarter, side, and back three-quarter.",
        "Use the 8 generated source frames as one complete walk loop, not a ping-pong half-cycle.",
        "Frame plan: frame 1 left foot forward / right foot back contact; frame 2 body settles downward over the planted foot; frame 3 passing pose with both feet close under the hips and the rear foot lifting; frame 4 right foot reaches forward with toe-first contact about to happen; frame 5 right foot forward / left foot back contact; frame 6 body settles downward over the planted foot; frame 7 passing pose with both feet close under the hips and the rear foot lifting; frame 8 left foot reaches forward and reconnects cleanly into frame 1.",
        "For side and diagonal rows, the visible front foot must alternate left-right-left-right across the row; frame 1 and frame 5 must be clearly different contact silhouettes, not only mirrored clothing sway.",
        "Keep the walk slower and more grounded than running: no airborne frame, no long leap, no strong forward lean, and at least one foot must stay visually near the ground in every frame.",
        "Show knee bend and toe contact on contact frames, show the rear foot lifting on passing frames, and keep the feet on a stable ground line without skating.",
        "Arms swing opposite the legs, the torso has a subtle walk bob, and hair or clothing secondary motion must support the gait rather than replace visible leg movement."
      ]
    : [];
  const runCycleGaitLines = preset.id === "run-cycle"
    ? [
        "Running gait must be visible in every row, especially front three-quarter, side, and back three-quarter.",
        "Use the 8 generated source frames as one half-cycle, not a complete two-step loop: the left foot must travel from back to front while the right foot travels from front to back.",
        "The app will append the same 8 source frames in reverse order during GIF/WebP playback to create a 16-frame ping-pong run cycle, so do not squeeze both left-front and right-front halves into the 8 source frames.",
        "The 8 source frames must express five clear gait phases: legs far apart, legs approaching, feet together under the body, legs starting to separate with the opposite foot taking the lead, and legs far apart again in the opposite stride.",
        "Source frame plan: frame 1 left foot far back / right foot far front extended stride; frame 2 the stride narrows and both feet move toward the body center; frame 3 both feet are close together directly under the hips, knees bent, one foot just passing the other; frame 4 the feet overlap or cross at the body center with the left foot beginning to pass in front; frame 5 the legs start separating again and the left foot is clearly taking the lead; frame 6 left foot reaches forward while the right foot pushes back; frame 7 left foot extended forward / right foot back airborne stride; frame 8 clean endpoint with left foot fully forward and right foot fully back.",
        "For side and diagonal rows, frames 3 and 4 are mandatory feet-together / crossover passing frames. The reversed playback will create the matching opposite-foot passing frames. Do not skip the feet-together moment, do not hide it behind clothing, and do not replace it with only open-leg airborne stride poses.",
        "The leading foot must visibly change from right-front at frame 1 to left-front at frame 8; do not keep the same leg in front, do not make a walking shuffle, and do not make a sliding pose cycle.",
        "Add a clear forward torso lean, stronger opposite arm drive than walking, longer stride length, and a small vertical bounce while keeping the character centered inside each cell."
      ]
    : [];

  return [
    `Locked animation preset: ${presetTitle}.`,
    `Preset motion details: ${preset.prompt}.`,
    "Deform/chibify the uploaded character into a compact full-body pixel-art sprite while preserving the original identity, outfit, palette, silhouette, and props.",
    motionSheetLine,
    ...idleBreathingLines,
    ...walkCycleGaitLines,
    ...runCycleGaitLines,
    `Use exactly ${ANIMATION_FRAME_COUNT} animation frames per direction.`,
    `The sprite sheet must be evenly divided into ${ANIMATION_DIRECTION_COUNT} rows x ${ANIMATION_FRAME_COUNT} columns: five direction rows and eight frame columns.`,
    `Each cell is fixed at exactly ${ANIMATION_CELL_SIZE}px x ${ANIMATION_CELL_SIZE}px; the complete sheet must be exactly ${ANIMATION_CELL_SIZE * ANIMATION_FRAME_COUNT}px x ${ANIMATION_CELL_SIZE * ANIMATION_DIRECTION_COUNT}px.`,
    `Direction rows from top to bottom: ${ANIMATION_DIRECTIONS.join(", ")}.`,
    "Direction identity rules: front is straight toward camera, front three-quarter is diagonal-front, side is strict profile, back three-quarter is diagonal-back, and back is true straight rear view.",
    "The back row must show the character facing directly away from the camera: centered spine, centered backpack or back silhouette, symmetric shoulders, back of head visible, and no visible eyes, nose, mouth, cheek, side profile, face turn, or looking-over-shoulder pose. Do not duplicate the back three-quarter row in the back row.",
    "In every direction row, keep the full hair silhouette, entire head, hands, outfit, and both feet fully visible inside each 256px cell with clear empty padding above the hair and below the feet; never let the head touch or disappear beyond the top cell edge.",
    "When the sheet is sliced into equal 256px cells, neighboring frames above, below, left, or right must not intrude into the current cell.",
    "Keep each character centered in its own cell with the feet landing on the same visual ground line; do not make the character drift up, down, left, or right between frames.",
    "Prefer a transparent background. If true transparency is not available during generation, use only the flat chroma-key color requested elsewhere in this job.",
    "Reject and regenerate before returning if any cell has cropped hair, a cut-off head, missing feet, duplicated heads, body fragments, a changed character, nonuniform scale, or a non-flat background."
  ].join(" ");
}

function buildAnimationPresetNotes(preset: AnimationPresetExample) {
  return [
    `Locked animation preset: ${preset.title.en} (${preset.id}).`,
    preset.notes,
    `Standard sheet contract: ${ANIMATION_DIRECTION_COUNT} rows x ${ANIMATION_FRAME_COUNT} columns, ${ANIMATION_CELL_SIZE}px x ${ANIMATION_CELL_SIZE}px per cell, direction rows are ${ANIMATION_DIRECTIONS.join(", ")}.`,
    "Direction identity note: the back row is a true straight rear view, not back three-quarter; no face, side profile, or looking-over-shoulder pose should appear in that row.",
    "Framing note: every direction row must keep the full hair silhouette and both feet visible with clear padding inside each cell.",
    "No free-form user motion prompt was supplied; use the locked preset and the strict sheet contract only."
  ].join("\n");
}

const fallbackProviders: ProviderStatus[] = [
  { id: "local-file", label: "Local File", enabled: true, message: "Use images from this machine" },
  { id: "local-generator", label: "Local Generator", enabled: true, message: "Generate local PNG images" },
  { id: "codex-handoff", label: "Codex Handoff", enabled: true, message: "Write local jobs for Codex to pick up" },
  { id: "local-inbox", label: "Local Inbox", enabled: true, message: "Import results returned by Codex" }
];

const workflowOptions: Array<{
  id: WorkflowMode;
  provider: ProviderId;
}> = [
  {
    id: "image-generate",
    provider: "codex-handoff"
  },
  {
    id: "image-edit",
    provider: "codex-handoff"
  },
  {
    id: "sprite-generate",
    provider: "codex-handoff"
  }
];

const promptExamples: PromptExample[] = [
  {
    id: "clockwork-mushroom-courier",
    category: { en: "Character", ja: "キャラクター" },
    title: { en: "Clockwork Mushroom Courier", ja: "ぜんまい茸の配達人" },
    previewImage: "/prompt-examples/clockwork-mushroom-courier.png",
    summary: {
      en: "Isolated full-body character asset with transparent output in mind.",
      ja: "背景なしで使う前提の全身キャラクター素材です。"
    },
    prompt:
      "Create one original pixel-art game asset concept image: a tiny clockwork mushroom courier carrying a glowing blue delivery satchel, isolated full body, transparent background preferred, crisp readable silhouette, 16-bit pixel-art inspired rendering, transparent-game-asset feel, warm amber satchel glow, no scenery, no readable text, no logo, no watermark, no numbers. If transparency is unavailable, use a perfectly flat solid #00ff00 chroma-key background with no shadows, gradients, texture, floor plane, or lighting variation.",
    negativePrompt: "text, logo, watermark, numbers, photorealistic face, blurry silhouette, placeholder geometric-only output, busy background, detailed scenery, floor plane, cast shadow, gradient background",
    notes: "Prompt-only image generation. Prefer no background so the character can become an animation source; use flat chroma-key only as a fallback."
  },
  {
    id: "forest-mage-idle",
    category: { en: "Character", ja: "キャラクター" },
    title: { en: "Forest Mage Idle Sprite", ja: "森の魔法使いアイドル" },
    previewImage: "/prompt-examples/forest-mage-idle.png",
    summary: {
      en: "Neutral stance character designed to be uploaded into animation generation.",
      ja: "アニメーション生成へ渡しやすいニュートラル立ち絵です。"
    },
    prompt:
      "Create a single full-body pixel-art character asset: a small forest mage with a leaf hood, carved wooden staff, soft green cloak, amber charm, friendly confident pose, idle-animation ready stance, clear feet contact, centered subject, transparent background preferred, 32-bit fantasy RPG palette, crisp silhouette, no scenery, no readable text, no logo, no watermark. If transparency is unavailable, use a perfectly flat solid #ff00ff chroma-key background because the character uses green clothing; no shadows, gradients, texture, floor plane, or lighting variation.",
    negativePrompt: "cropped feet, extra arms, text, logo, watermark, blurry edges, realistic skin, busy background, gradient background, floor plane, cast shadow",
    notes: "Character should be easy to cut out and animate later. Keep pose neutral, balanced, readable, and background-free when possible."
  },
  {
    id: "ember-slime-companion",
    category: { en: "Creature", ja: "クリーチャー" },
    title: { en: "Ember Slime Companion", ja: "火種スライム" },
    previewImage: "/prompt-examples/ember-slime-companion.png",
    summary: {
      en: "Simple creature silhouette for idle, hop, and attack variants.",
      ja: "アイドル、跳ね、攻撃へ展開しやすい小型クリーチャーです。"
    },
    prompt:
      "Create a cute pixel-art creature asset: a small ember slime companion with a warm orange core, tiny charcoal feet, two expressive glowing eyes, faint heat shimmer, simple rounded body, readable silhouette, transparent background preferred, collectible monster game style, clean 16-bit pixel-art inspired rendering, no scenery, no text, no logo, no watermark. If transparency is unavailable, use a perfectly flat solid #00ff00 chroma-key background with no shadows, gradients, texture, floor plane, or lighting variation.",
    negativePrompt: "scary horror, text, logo, watermark, photorealistic fire, over-detailed smoke, cropped body, complex background, floor plane, cast shadow, gradient background",
    notes: "Creature design should be simple enough for idle, hop, and attack animation variants, with no background when possible."
  },
  {
    id: "crystal-export-station",
    category: { en: "Prop", ja: "小物" },
    title: { en: "Crystal Export Station", ja: "水晶の書き出し台" },
    previewImage: "/prompt-examples/crystal-export-station.png",
    summary: {
      en: "Readable prop asset that can be separated cleanly from the canvas.",
      ja: "画面から切り出しやすい読みやすい小物素材です。"
    },
    prompt:
      "Create a pixel-art game prop asset: a compact crystal export station made of mossy stone and brass rails, three amber crystals glowing above small sockets, teal interface sparks, isometric-front readable angle, isolated prop, transparent background preferred, crisp edge clusters, no scenery, no readable text, no logo, no watermark, no numbers. If transparency is unavailable, use a perfectly flat solid #00ff00 chroma-key background with no shadows, gradients, texture, floor plane, or lighting variation.",
    negativePrompt: "letters, labels, UI words, logo, watermark, photorealism, cluttered background, broken perspective, detailed room, floor plane, cast shadow",
    notes: "Prop should read clearly as a small interactive workstation and stay easy to separate from the background."
  },
  {
    id: "rainy-neon-forest-tile",
    category: { en: "Environment", ja: "背景" },
    title: { en: "Rainy Neon Forest Tile", ja: "雨のネオン森タイル" },
    previewImage: "/prompt-examples/rainy-neon-forest-tile.png",
    summary: {
      en: "An isolated tile example; scenery stays inside the tile footprint.",
      ja: "風景要素をタイル内だけに収めた孤立タイル例です。"
    },
    prompt:
      "Create a pixel-art environment tile concept: a small isolated rainy neon forest ground tile with wet stone path, cyan puddle reflections, small purple mushrooms, dark green leaves, top-down three-quarter RPG perspective, tile edges clearly visible, transparent background outside the tile footprint preferred, no characters, no readable text, no logo, no watermark. If transparency is unavailable, use a perfectly flat solid #00ff00 chroma-key background outside the tile footprint only.",
    negativePrompt: "characters, text, logo, watermark, photorealistic rain, unreadable clutter, full landscape, complex surrounding background, gradient background",
    notes: "Keep it tile-friendly, isolated, and surrounded by transparency or a flat removable background."
  },
  {
    id: "sprite-sheet-workbench",
    category: { en: "Scene", ja: "シーン" },
    title: { en: "Sprite-Sheet Workbench", ja: "スプライト作業台" },
    previewImage: "/prompt-examples/sprite-sheet-workbench.png",
    summary: {
      en: "Complex production-tool concept kept as one clean isolated object.",
      ja: "複雑な制作ツール案を単体オブジェクトとしてまとめた例です。"
    },
    prompt:
      "Create a pixel-art inspired production-tool prop: a compact fantasy sprite-sheet workbench with glowing teal grid panels, tiny frame thumbnails as abstract blocks, amber export crystals, pinned annotation marks, wooden desk silhouette, isolated object, transparent background preferred, crisp readable composition, no scenery wall, no readable text, no logo, no watermark, no numbers. If transparency is unavailable, use a perfectly flat solid #00ff00 chroma-key background with no shadows, gradients, texture, floor plane, or lighting variation.",
    negativePrompt: "readable UI text, letters, numbers, logo, watermark, photorealistic monitor, blurry composition, complex room background, floor plane, cast shadow",
    notes: "Use this when testing whether complex production-tool concepts survive the imagegen prompt while still remaining easy to cut out."
  }
];

function normalizeAnimationActions(actions: SpriteAction[]) {
  const source = actions.length > 0 ? actions : defaultActions;
  return source.map((action) => normalizeAnimationAction(action));
}

function normalizeAnimationAction(action: SpriteAction): SpriteAction {
  const defaultAction = defaultActions.find((item) => item.name === action.name);
  return {
    ...action,
    fps: action.name === "run" && action.fps === 14 ? defaultAction?.fps ?? action.fps : action.fps,
    playbackMode: action.name === "run" ? "ping-pong-reverse" : action.playbackMode,
    cell: STANDARD_ANIMATION_CELL,
    anchor: STANDARD_ANIMATION_ANCHOR
  };
}

function hatchPetSpriteAction(): SpriteAction {
  return {
    name: "hatch-pet-atlas",
    fps: 8,
    loop: true,
    frameIds: [],
    cell: HATCH_PET_CELL,
    anchor: { x: Math.round(HATCH_PET_CELL.width / 2), y: Math.round(HATCH_PET_CELL.height * 0.92) }
  };
}

function directionalHatchPetSpriteAction(): SpriteAction {
  return {
    ...hatchPetSpriteAction(),
    name: "5-direction-hatch-pet-atlas"
  };
}

function isHatchPetLikeMode(mode: AnimationGenerationMode) {
  return mode === "hatch-pet" || mode === "directional-hatch-pet";
}

function inferAnimationGenerationMode(actionFrames: SpriteFrame[]): AnimationGenerationMode {
  const firstFrame = actionFrames[0];
  if (
    actionFrames.length === DIRECTIONAL_HATCH_PET_GRID.columns * DIRECTIONAL_HATCH_PET_GRID.rows &&
    firstFrame?.width === HATCH_PET_CELL.width &&
    firstFrame?.height === HATCH_PET_CELL.height
  ) {
    return "directional-hatch-pet";
  }
  if (
    actionFrames.length === HATCH_PET_GRID.columns * HATCH_PET_GRID.rows &&
    firstFrame?.width === HATCH_PET_CELL.width &&
    firstFrame?.height === HATCH_PET_CELL.height
  ) {
    return "hatch-pet";
  }
  return "standard";
}

function inferAnimationSheetGrid(actionFrames: SpriteFrame[], variant: AnimationGenerationMode): GridSettings {
  if (variant === "directional-hatch-pet") return DIRECTIONAL_HATCH_PET_GRID;
  if (variant === "hatch-pet") return HATCH_PET_GRID;
  const rows = Math.max(1, Math.ceil(actionFrames.length / ANIMATION_FRAME_COUNT));
  return {
    columns: ANIMATION_FRAME_COUNT,
    rows: Math.min(ANIMATION_DIRECTION_COUNT, rows),
    gutter: 0
  };
}

function clampInteger(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.round(value)));
}

export function getVisibleHistoryCount(historyLength: number, requestedLimit: number, selectedIndex = -1) {
  if (historyLength <= 0) return 0;
  const selectedLimit = selectedIndex >= 0 ? selectedIndex + 1 : 0;
  const safeLimit = Math.max(INITIAL_HISTORY_RENDER_COUNT, requestedLimit, selectedLimit);
  return Math.min(historyLength, safeLimit);
}

export function getNextHistoryRenderLimit(currentLimit: number, historyLength: number) {
  return Math.min(historyLength, Math.max(0, currentLimit) + HISTORY_RENDER_BATCH_SIZE);
}

export function isOutboxResultForJob(resultName: string, jobId: string) {
  return resultName.startsWith(`${jobId}-`) || resultName.startsWith(`${jobId}.`);
}

export function isDirectionSplitAnimationManifestName(resultName: string, jobId: string) {
  return resultName === `${jobId}-manifest.json`;
}

function isStaticImageResult(result: CodexOutboxResult) {
  return result.mimeType.startsWith("image/") && result.mimeType !== "image/gif";
}

function selectDirectionSplitAnimationResults(
  results: CodexOutboxResult[],
  jobId: string,
  manifest: DirectionSplitAnimationManifest | null = null
): DirectionSplitSelection {
  const manifestResult = results.find((result) => isDirectionSplitAnimationManifestName(result.name, jobId));
  const staticImageResults = results.filter(isStaticImageResult);
  const manifestFiles = manifest ? directionSplitManifestFiles(manifest) : new Map<string, string>();
  const byDirection = ANIMATION_DIRECTIONS.map((direction, index) => {
    const slug = DIRECTION_SPLIT_ANIMATION_FILE_SLUGS[index];
    const manifestFile = manifestFiles.get(direction) ?? manifestFiles.get(slug);
    if (manifestFile) {
      const manifestBaseName = manifestFile.split(/[\\/]/).pop() ?? manifestFile;
      return staticImageResults.find((result) => result.name === manifestBaseName);
    }
    return staticImageResults.find((result) => directionSplitResultDirectionIndex(result.name, jobId) === index);
  });
  const missingDirections = byDirection
    .map((result, index) => (result ? "" : ANIMATION_DIRECTIONS[index]))
    .filter(Boolean);
  return {
    detected: Boolean(manifestResult || manifest || byDirection.some(Boolean)),
    manifestResult,
    directionResults: byDirection.filter((result): result is CodexOutboxResult => Boolean(result)),
    missingDirections
  };
}

function directionSplitResultDirectionIndex(resultName: string, jobId: string) {
  const normalized = resultName
    .toLowerCase()
    .replace(/\.[^.]+$/, "")
    .replace(jobId.toLowerCase(), "")
    .replace(/[_\s]+/g, "-")
    .replace(/^-+/, "");
  const numericMatch = normalized.match(/^direction-(\d{1,2})(?:-|$)/);
  if (numericMatch) {
    const index = Number(numericMatch[1]) - 1;
    if (index >= 0 && index < ANIMATION_DIRECTION_COUNT) return index;
  }
  const matchedSlug = DIRECTION_SPLIT_ANIMATION_FILE_SLUGS
    .slice()
    .sort((left, right) => right.length - left.length)
    .find((slug) => normalized === slug || normalized.endsWith(`-${slug}`));
  return matchedSlug ? DIRECTION_SPLIT_ANIMATION_FILE_SLUGS.indexOf(matchedSlug) : -1;
}

function directionSplitManifestFiles(manifest: DirectionSplitAnimationManifest) {
  const files = new Map<string, string>();
  if (Array.isArray(manifest.files)) {
    manifest.files.forEach((file, index) => {
      const direction = file.direction ?? ANIMATION_DIRECTIONS[index] ?? "";
      const name = file.file ?? file.name ?? file.path ?? "";
      if (direction && name) files.set(direction, name);
    });
    return files;
  }
  Object.entries(manifest.files ?? {}).forEach(([direction, name]) => {
    if (typeof name === "string" && direction) files.set(direction, name);
  });
  return files;
}

function directionSplitAnimationFileSet(jobIdPrefix: string) {
  return DIRECTION_SPLIT_ANIMATION_FILE_SLUGS.map((slug) => `${jobIdPrefix}-${slug}.png`);
}

function parseDirectionSplitAnimationManifest(imported: CodexOutboxImportResponse) {
  const text = textFromDataUrl(imported.dataUrl);
  const parsed = JSON.parse(text) as DirectionSplitAnimationManifest;
  if (parsed.schema !== DIRECTION_SPLIT_ANIMATION_SCHEMA) {
    throw new Error(`Direction split manifest has unsupported schema: ${String(parsed.schema ?? "missing")}`);
  }
  return parsed;
}

function textFromDataUrl(dataUrl: string) {
  const match = dataUrl.match(/^data:[^,]*,(.*)$/);
  if (!match) return dataUrl;
  const payload = match[1];
  if (dataUrl.includes(";base64,")) {
    const binary = atob(payload);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }
  return decodeURIComponent(payload);
}

function App() {
  const [history, setHistory] = useState<HistoryItem[]>(() => loadHistory());
  const [historyRenderLimit, setHistoryRenderLimit] = useState(INITIAL_HISTORY_RENDER_COUNT);
  const [frames, setFrames] = useState<SpriteFrame[]>(() => loadFrames());
  const [actions, setActions] = useState<SpriteAction[]>(() => normalizeAnimationActions(loadActions(defaultActions)));
  const [selectedId, setSelectedId] = useState<string>("");
  const [activeActionName, setActiveActionName] = useState("run");
  const [selectedAnimationPresetId, setSelectedAnimationPresetId] = useState(DEFAULT_ANIMATION_PRESET_ID);
  const [animationLibraryTab, setAnimationLibraryTab] = useState<AnimationLibraryKind>("official");
  const [userAnimationLibrary, setUserAnimationLibrary] = useState<AnimationLibraryItem[]>(() => loadUserAnimationLibrary());
  const [showAnimationPackExportModal, setShowAnimationPackExportModal] = useState(false);
  const [animationPackExportDraft, setAnimationPackExportDraft] = useState<AnimationPackExportDraft>(() => createAnimationPackExportDraft());
  const [language, setLanguage] = useState<Language>(loadLanguage);
  const [storageHydrated, setStorageHydrated] = useState(false);
  const [workflowMode, setWorkflowMode] = useState<WorkflowMode>("image-generate");
  const [showPromptExamples, setShowPromptExamples] = useState(false);
  const [showAnimationPresetExamples, setShowAnimationPresetExamples] = useState(false);
  const [providerId, setProviderId] = useState<ProviderId>("codex-handoff");
  const [animationGenerationMode, setAnimationGenerationMode] = useState<AnimationGenerationMode>("standard");
  const [animationSourceId, setAnimationSourceId] = useState("");
  const [providers, setProviders] = useState<ProviderStatus[]>(fallbackProviders);
  const [runnerPreflight, setRunnerPreflight] = useState<CodexRunnerPreflight | null>(null);
  const [prompt, setPrompt] = useState("idle breathing loop with gentle robe sway, ready for a 5-direction sprite sheet");
  const [negativePrompt, setNegativePrompt] = useState("blur, text, watermark, cropped feet");
  const [jobNotes, setJobNotes] = useState("");
  const [seed, setSeed] = useState("24682");
  const [size, setSize] = useState("1024x1024");
  const [count, setCount] = useState(1);
  const [quality, setQuality] = useState("auto");
  const [grid, setGrid] = useState<GridSettings>({ columns: 8, rows: 4, gutter: 0 });
  const [showGrid, setShowGrid] = useState(true);
  const [showCenter, setShowCenter] = useState(true);
  const [tool, setTool] = useState<ToolMode>("select");
  const [annotationColor, setAnnotationColor] = useState("#1ba978");
  const [annotationsByItem, setAnnotationsByItem] = useState<Record<string, Annotation[]>>({});
  const [draftAnnotation, setDraftAnnotation] = useState<Annotation | null>(null);
  const [selectedFrameId, setSelectedFrameId] = useState("");
  const [chromaTolerance, setChromaTolerance] = useState(32);
  const [status, setStatus] = useState("All changes saved locally");
  const [isBusy, setIsBusy] = useState(false);
  const [codexJobs, setCodexJobs] = useState<CodexJobQueueItem[]>(() => loadPendingCodexJobs());
  const gifPreviewUrl = "";
  const [animationDirectionPreviews, setAnimationDirectionPreviews] = useState<AnimationDirectionPreview[]>([]);
  const [isAnimationPreviewBuilding, setIsAnimationPreviewBuilding] = useState(false);
  const [animationChromaKey, setAnimationChromaKey] = useState<AnimationChromaKeyName>("green");
  const [imageEditComparison, setImageEditComparison] = useState<ImageEditComparison | null>(null);
  const [codexFailureNotices, setCodexFailureNotices] = useState<CodexFailureNotice[]>([]);
  const [codexJobLogs, setCodexJobLogs] = useState<CodexJobLogItem[]>([]);
  const [codexLogsCollapsed, setCodexLogsCollapsed] = useState(false);
  const [codexLogsFullscreen, setCodexLogsFullscreen] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const animationPackInputRef = useRef<HTMLInputElement | null>(null);
  const historyListRef = useRef<HTMLDivElement | null>(null);
  const historyLoadMoreRef = useRef<HTMLDivElement | null>(null);
  const startingQueuedJobIdsRef = useRef<Set<string>>(new Set());
  const lastPointerEventAtRef = useRef(0);
  const copy = uiCopy[language];

  const selected = useMemo(
    () => history.find((item) => item.id === selectedId) ?? history[0],
    [history, selectedId]
  );
  const selectedHistoryIndex = useMemo(
    () => (selected?.id ? history.findIndex((item) => item.id === selected.id) : -1),
    [history, selected?.id]
  );
  const visibleHistoryCount = useMemo(
    () => getVisibleHistoryCount(history.length, historyRenderLimit, selectedHistoryIndex),
    [history.length, historyRenderLimit, selectedHistoryIndex]
  );
  const visibleHistory = useMemo(
    () => history.slice(0, visibleHistoryCount),
    [history, visibleHistoryCount]
  );
  const hasMoreHistory = visibleHistoryCount < history.length;

  const animationSource = useMemo(
    () => history.find((item) => item.id === animationSourceId) ?? (isAnimationSource(selected) ? selected : undefined),
    [animationSourceId, history, selected]
  );

  const activeAction = useMemo(
    () => actions.find((action) => action.name === activeActionName) ?? actions[0],
    [actions, activeActionName]
  );
  const selectedAnimationPreset = useMemo(
    () => getAnimationPresetById(selectedAnimationPresetId),
    [selectedAnimationPresetId]
  );
  const officialAnimationLibrary = OFFICIAL_ANIMATION_LIBRARY;
  const activeAnimationLibraryItems = animationLibraryTab === "official"
    ? officialAnimationLibrary
    : userAnimationLibrary;

  const actionFrames = useMemo(
    () =>
      activeAction.frameIds
        .map((frameId) => frames.find((frame) => frame.id === frameId))
        .filter((frame): frame is SpriteFrame => Boolean(frame)),
    [activeAction.frameIds, frames]
  );

  const selectedAnimationFrames = useMemo(
    () =>
      selected
        ? frames
            .filter((frame) => frame.sourceId === selected.id)
            .slice()
            .sort((left, right) => left.index - right.index)
        : [],
    [frames, selected]
  );

  const selectedAnimationAction = useMemo<SpriteAction>(() => {
    const firstFrame = selectedAnimationFrames[0];
    const baseName = selected?.name.replace(/\.[^.]+$/, "") || activeAction.name;
    const cell = firstFrame ? { width: firstFrame.width, height: firstFrame.height } : activeAction.cell;
    return {
      ...activeAction,
      name: `${baseName}_animation`,
      frameIds: selectedAnimationFrames.map((frame) => frame.id),
      cell,
      anchor: firstFrame ? { x: Math.round(cell.width / 2), y: Math.round(cell.height * 0.92) } : activeAction.anchor
    };
  }, [activeAction, selected, selectedAnimationFrames]);

  const selectedAnimationVariant = inferAnimationGenerationMode(selectedAnimationFrames);
  const selectedAnimationSheetGrid = useMemo(
    () => inferAnimationSheetGrid(selectedAnimationFrames, selectedAnimationVariant),
    [selectedAnimationFrames, selectedAnimationVariant]
  );
  const selectedAnimationSheetGridStyle = useMemo(
    () =>
      ({
        "--sprite-grid-columns": selectedAnimationSheetGrid.columns,
        "--sprite-grid-rows": selectedAnimationSheetGrid.rows
      }) as CSSProperties,
    [selectedAnimationSheetGrid.columns, selectedAnimationSheetGrid.rows]
  );
  const selectedAnimationExportReady = Boolean(
    selected && selected.source === "generate" && selectedAnimationFrames.length > 0
  );
  const selectedIsAnimationResult = selectedAnimationExportReady;
  const selectedAnimationPreviewActions = useMemo(
    () =>
      selectedAnimationVariant === "directional-hatch-pet"
        ? buildDirectionalHatchPetPreviewActions(selectedAnimationAction, selectedAnimationFrames)
        : selectedAnimationVariant === "hatch-pet"
        ? buildHatchPetStatePreviewActions(selectedAnimationAction, selectedAnimationFrames)
        : buildAnimationDirectionPreviewActions(selectedAnimationAction, selectedAnimationFrames),
    [selectedAnimationAction, selectedAnimationFrames, selectedAnimationVariant]
  );

  const selectedAnimationSource = useMemo(
    () =>
      selected?.derivedFromId
        ? history.find((item) => item.id === selected.derivedFromId)
        : undefined,
    [history, selected]
  );

  const selectedImageEditSource = useMemo(
    () =>
      selected?.derivedFromId && !selectedAnimationExportReady
        ? history.find((item) => item.id === selected.derivedFromId)
        : undefined,
    [history, selected, selectedAnimationExportReady]
  );

  const selectedFrame = useMemo(
    () => frames.find((frame) => frame.id === selectedFrameId) ?? actionFrames[0],
    [actionFrames, frames, selectedFrameId]
  );

  const selectedFrameForPreview = useMemo(
    () => (selectedFrameId ? frames.find((frame) => frame.id === selectedFrameId) : undefined),
    [frames, selectedFrameId]
  );

  const isPreviewingSelectedFrame = Boolean(selectedFrameForPreview?.sourceId && selectedFrameForPreview.sourceId === selected?.id);
  const selectedAnnotations = useMemo(
    () => (selected ? annotationsByItem[selected.id] ?? [] : []),
    [annotationsByItem, selected]
  );

  const qc = useMemo(
    () => summarizeFrames(actionFrames, activeAction.cell.width, activeAction.cell.height),
    [actionFrames, activeAction.cell.height, activeAction.cell.width]
  );

  const loadMoreHistoryResults = useCallback(() => {
    setHistoryRenderLimit((current) =>
      getNextHistoryRenderLimit(Math.max(current, visibleHistoryCount), history.length)
    );
  }, [history.length, visibleHistoryCount]);

  const maybeLoadMoreHistoryResults = useCallback(
    (target: HTMLElement) => {
      if (!hasMoreHistory) return;
      const remaining = target.scrollHeight - target.scrollTop - target.clientHeight;
      if (remaining > HISTORY_SCROLL_LOAD_THRESHOLD_PX) return;
      loadMoreHistoryResults();
    },
    [hasMoreHistory, loadMoreHistoryResults]
  );

  useEffect(() => {
    const list = historyListRef.current;
    const sentinel = historyLoadMoreRef.current;
    if (!list || !sentinel || !hasMoreHistory || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) loadMoreHistoryResults();
      },
      {
        root: list,
        rootMargin: `${HISTORY_SCROLL_LOAD_THRESHOLD_PX}px`
      }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMoreHistory, loadMoreHistoryResults]);

  useEffect(() => {
    const list = historyListRef.current;
    if (!list || !hasMoreHistory) return;
    const listener = () => maybeLoadMoreHistoryResults(list);
    list.addEventListener("scroll", listener, { passive: true });
    return () => list.removeEventListener("scroll", listener);
  }, [hasMoreHistory, maybeLoadMoreHistoryResults]);

  useEffect(() => {
    let cancelled = false;
    loadPersistedState(defaultActions)
      .then((persisted) => {
        if (cancelled) return;
        setHistory(persisted.history);
        setFrames(persisted.frames);
        setActions(normalizeAnimationActions(persisted.actions));
        setUserAnimationLibrary(persisted.animationLibrary.slice(0, MAX_USER_ANIMATION_LIBRARY_ITEMS));
        setStorageHydrated(true);
      })
      .catch(() => {
        if (!cancelled) setStorageHydrated(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (storageHydrated) saveHistory(history);
  }, [history, storageHydrated]);
  useEffect(() => {
    if (storageHydrated) saveFrames(frames);
  }, [frames, storageHydrated]);
  useEffect(() => {
    if (storageHydrated) saveActions(actions);
  }, [actions, storageHydrated]);
  useEffect(() => {
    if (storageHydrated) saveUserAnimationLibrary(userAnimationLibrary);
  }, [storageHydrated, userAnimationLibrary]);
  useEffect(() => saveLanguage(language), [language]);
  useEffect(() => savePendingCodexJobs(codexJobs), [codexJobs]);

  useEffect(() => {
    if (!codexLogsFullscreen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setCodexLogsFullscreen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [codexLogsFullscreen]);

  useEffect(() => {
    if (providerId !== "codex-handoff") return;
    const runningJobs = codexJobs.filter((job) => job.state === "running");
    if (runningJobs.length === 0) return;
    let cancelled = false;

    const pollCodexLogs = async () => {
      const logItems = await Promise.all(
        runningJobs.map(async (job) => {
          try {
            const log = await loadCodexJobLog(job.id);
            return createCodexJobLogItem(job, log, "running");
          } catch (error) {
            return createCodexJobLogItem(job, undefined, "running", error instanceof Error ? error.message : "Could not read Codex log");
          }
        })
      );
      if (!cancelled) setCodexJobLogs((current) => mergeCodexJobLogs(current, logItems));
    };

    void pollCodexLogs();
    const intervalId = window.setInterval(() => void pollCodexLogs(), CODEX_LOG_POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [codexJobs, providerId]);

  function enterCodexLogsFullscreen() {
    setCodexLogsCollapsed(false);
    setCodexLogsFullscreen(true);
  }

  useEffect(() => {
    fetch("/api/providers")
      .then((response) => response.json())
      .then((data: { providers: ProviderStatus[] }) => setProviders(data.providers))
      .catch(() => setProviders(fallbackProviders));
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadCodexRunnerPreflight()
      .then((runner) => {
        if (!cancelled) setRunnerPreflight(runner);
      })
      .catch(() => {
        if (!cancelled) {
          setRunnerPreflight({
            state: "unavailable",
            message: "Could not read Codex runner preflight status.",
            command: "",
            checkedAt: new Date().toISOString(),
            autorun: false,
            sandbox: "",
            approval: ""
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!storageHydrated) return;
    if (history.length > 0) {
      setSelectedId((current) => current || history[0].id);
      return;
    }

    void seedSampleWorkspace();
  }, [history.length, storageHydrated]);

  useEffect(() => {
    drawWorkspaceCanvas();
  }, [
    selected?.dataUrl,
    selectedFrameForPreview?.dataUrl,
    selectedId,
    selectedFrameId,
    workflowMode,
    annotationsByItem,
    draftAnnotation,
    showGrid,
    showCenter,
    grid,
    tool
  ]);

  useEffect(() => {
    if (!selectedAnimationExportReady || selectedAnimationPreviewActions.length === 0) {
      setAnimationDirectionPreviews([]);
      setIsAnimationPreviewBuilding(false);
      return;
    }

    let cancelled = false;
    const objectUrls: string[] = [];
    setAnimationDirectionPreviews([]);
    setIsAnimationPreviewBuilding(true);

    Promise.all(
      selectedAnimationPreviewActions.map(async ({ directionId, action }) => {
        const gifBlob = await createGifBlob(frames, action);
        const gifUrl = URL.createObjectURL(gifBlob);
        if (cancelled) {
          URL.revokeObjectURL(gifUrl);
          return null;
        }
        objectUrls.push(gifUrl);
        return {
          id: directionId,
          label: animationDirectionLabel(directionId, language),
          gifUrl
        };
      })
    )
      .then((previews) => {
        if (!cancelled) {
          setAnimationDirectionPreviews(
            previews.filter((preview): preview is AnimationDirectionPreview => Boolean(preview))
          );
        }
      })
      .catch(() => {
        objectUrls.forEach((url) => URL.revokeObjectURL(url));
        objectUrls.length = 0;
        if (!cancelled) setAnimationDirectionPreviews([]);
      })
      .finally(() => {
        if (!cancelled) setIsAnimationPreviewBuilding(false);
      });

    return () => {
      cancelled = true;
      objectUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [frames, language, selectedAnimationExportReady, selectedAnimationPreviewActions]);

  useEffect(() => {
    const runningJobs = codexJobs.filter((job) => job.state === "running");
    if (runningJobs.length === 0) return;
    let cancelled = false;

    const pollForReturnedImages = async () => {
      const outcomes = await Promise.all(
        runningJobs.map(async (job) => {
          const imported = await importLatestOutboxResult({
            background: true,
            newerThan: job.createdAt,
            quietEmpty: true,
            job
          });
          if (cancelled || imported) return imported ? "imported" : "cancelled";

          const runnerStatus = await loadCodexRunnerStatus(job.id);
          if (cancelled) return "cancelled";

          if (runnerStatus && !shouldWaitForCodexRunner(runnerStatus)) {
            if (runnerStatus.state === "completed" && !runnerStatus.diagnostic) return "pending";
            recordCodexFailure(job, runnerStatus);
            removeCodexJob(job.id, runnerStatus.state);
            setStatus(`${runnerStatusMessage(runnerStatus, copy)}: ${job.id}`);
            return "terminal";
          }

          return "pending";
        })
      );

      if (!cancelled && outcomes.every((outcome) => outcome === "pending")) {
        setStatus(`${copy.statusCodexJobPending}: ${runningJobs.map((job) => job.id).join(", ")}`);
      }
    };

    void pollForReturnedImages();
    const intervalId = window.setInterval(() => void pollForReturnedImages(), 5000);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [codexJobs, language]);

  useEffect(() => {
    const runningCount = codexJobs.filter((job) => job.state === "running").length;
    const openSlots = MAX_ACTIVE_CODEX_JOBS - runningCount - startingQueuedJobIdsRef.current.size;
    if (openSlots <= 0) return;

    const queuedJobs = codexJobs
      .filter((job) => job.state === "queued" && job.request)
      .slice(0, openSlots);

    queuedJobs.forEach((job) => {
      if (!job.request || startingQueuedJobIdsRef.current.has(job.id)) return;
      startingQueuedJobIdsRef.current.add(job.id);
      void submitCodexJobDraft(job.request, job.id).finally(() => {
        startingQueuedJobIdsRef.current.delete(job.id);
      });
    });
  }, [codexJobs]);

  async function seedSampleWorkspace() {
    const image = await loadImage(SAMPLE_URL);
    const item: HistoryItem = {
      id: createId("hist"),
      name: "forest-mage-sheet.png",
      dataUrl: SAMPLE_URL,
      provider: "local-file",
      prompt: "Original sample sprite sheet for local workflow testing",
      seed: "sample",
      size: `${image.width}x${image.height}`,
      createdAt: new Date().toISOString(),
      adopted: true,
      source: "sample"
    };
    setHistory([item]);
    setSelectedId(item.id);
    const sampleFrames = await splitImageIntoFrames(
      SAMPLE_URL,
      "forest_mage",
      { columns: 8, rows: 4, gutter: 0 },
      item.id,
      { width: MIN_ANIMATION_CELL_SIZE, height: MIN_ANIMATION_CELL_SIZE }
    );
    setFrames(sampleFrames);
    setSelectedFrameId("");
    setActions((current) =>
      current.map((action, actionIndex) => {
        const rowFrames = sampleFrames.slice(actionIndex * 8, actionIndex * 8 + 8).map((frame) => frame.id);
        return { ...action, frameIds: rowFrames };
      })
    );
  }

  const drawWorkspaceCanvas = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    drawCheckerboard(context, CANVAS_WIDTH, CANVAS_HEIGHT, 18);

    if (!selected) {
      drawEmptyCanvas(context, copy.canvasEmpty);
      return;
    }

    const displayingFrame = Boolean(selectedFrameForPreview?.sourceId && selectedFrameForPreview.sourceId === selected.id);
    const image = await loadImage(displayingFrame && selectedFrameForPreview ? selectedFrameForPreview.dataUrl : selected.dataUrl);
    const padding = 44;
    const scale = Math.min((CANVAS_WIDTH - padding * 2) / image.width, (CANVAS_HEIGHT - padding * 2) / image.height);
    const width = image.width * scale;
    const height = image.height * scale;
    const x = (CANVAS_WIDTH - width) / 2;
    const y = (CANVAS_HEIGHT - height) / 2;
    context.drawImage(image, x, y, width, height);

    if (showGrid && !displayingFrame && workflowMode !== "image-edit") drawGridOverlay(context, x, y, width, height, grid.columns, grid.rows);
    if (showCenter && workflowMode !== "image-edit") drawCenterOverlay(context, x, y, width, height);
    if (workflowMode === "image-edit") {
      const annotations = [...(annotationsByItem[selected.id] ?? []), ...(draftAnnotation ? [draftAnnotation] : [])];
      annotations.forEach((annotation) => drawAnnotation(context, annotation));
    }
  }, [annotationsByItem, copy.canvasEmpty, draftAnnotation, grid.columns, grid.rows, selected, selectedFrameForPreview, showCenter, showGrid, workflowMode]);

  async function handleFiles(files: FileList | File[]) {
    const entries = Array.from(files).filter((file) => file.type.startsWith("image/"));
    if (entries.length === 0) return;
    const imported: HistoryItem[] = [];
    for (const file of entries) {
      const dataUrl = await readFileAsDataUrl(file);
      const image = await loadImage(dataUrl);
      imported.push({
        id: createId("hist"),
        name: file.name,
        dataUrl,
        provider: "local-file",
        prompt,
        seed,
        size: `${image.width}x${image.height}`,
        createdAt: new Date().toISOString(),
        adopted: false,
        source: "import"
      });
    }
    setHistory((current) => [...imported, ...current]);
    setSelectedId(imported[0].id);
    setSelectedFrameId("");
    if (workflowMode === "sprite-generate") setAnimationSourceId(imported[0].id);
    setStatus(formatImagesImportedStatus(imported.length, language));
  }

  async function handleGenerate() {
    if (providerId === "local-file") {
      setStatus(`${providerLabel(providerId, language)} ${copy.statusUsesImport}`);
      fileInputRef.current?.click();
      return;
    }
    if (providerId === "local-inbox") {
      await importLatestOutboxResult();
      return;
    }
    if (providerId === "local-generator") {
      await generateLocally();
      return;
    }

    setIsBusy(true);
    try {
      const draft = await buildCodexJobDraft();
      if (!draft) return;

      const activeCodexJobCount =
        codexJobs.filter((job) => job.state === "running").length + startingQueuedJobIdsRef.current.size;
      if (activeCodexJobCount >= MAX_ACTIVE_CODEX_JOBS) {
        enqueueCodexJobDraft(draft);
        return;
      }

      await submitCodexJobDraft(draft);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : copy.statusCodexJobError);
    } finally {
      setIsBusy(false);
    }
  }

  async function buildCodexJobDraft(): Promise<CodexJobDraft | null> {
    const includeSelectedImage = workflowUsesSelectedImage(workflowMode);
    const includeSpriteContext = workflowUsesSpriteContext(workflowMode);
    const isImageEditJob = workflowMode === "image-edit";
    const isAnimationJob = workflowMode === "sprite-generate";
    const animationJobGenerationMode: AnimationGenerationMode = "standard";
    const isHatchPetAnimationJob = false;
    const isDirectionalHatchPetAnimationJob = false;
    const sourceImageForJob = isAnimationJob ? animationSource : selected;
    const animationAction = isDirectionalHatchPetAnimationJob
      ? directionalHatchPetSpriteAction()
      : isHatchPetAnimationJob
      ? hatchPetSpriteAction()
      : normalizeAnimationAction(activeAction);
    const spriteGrid = isAnimationJob
      ? isDirectionalHatchPetAnimationJob
        ? DIRECTIONAL_HATCH_PET_GRID
        : isHatchPetAnimationJob
          ? HATCH_PET_GRID
          : ANIMATION_SHEET_GRID
      : grid;
    const spriteCell = isAnimationJob ? (isHatchPetLikeMode(animationJobGenerationMode) ? HATCH_PET_CELL : animationAction.cell) : activeAction.cell;
    const spriteFrameCount = spriteGrid.columns * spriteGrid.rows;
    const animationMotionPrompt = isAnimationJob ? buildAnimationPresetMotionPrompt(selectedAnimationPreset) : "";
    const animationPresetNotes = isAnimationJob ? buildAnimationPresetNotes(selectedAnimationPreset) : "";

    if (isImageEditJob && selectedIsAnimationResult) {
      setStatus(copy.statusAnimationFinalNotEditable);
      return null;
    }

    if (isAnimationJob && !isAnimationSource(sourceImageForJob)) {
      setStatus(copy.statusAnimationSourceRequired);
      fileInputRef.current?.click();
      return null;
    }

    const chromaDecision = isAnimationJob && sourceImageForJob
      ? await chooseAnimationChromaKey(sourceImageForJob.dataUrl)
      : { key: animationChromaKeys[animationChromaKey], reason: "" };

    if (isAnimationJob) {
      setAnimationChromaKey(chromaDecision.key.name);
    }

    const codexPrompt = isAnimationJob
      ? isDirectionalHatchPetAnimationJob
        ? buildDirectionalHatchPetCodexPrompt({
            sourceName: sourceImageForJob?.name ?? "",
            motionPrompt: animationMotionPrompt,
            chromaKey: chromaDecision.key
          })
        : isHatchPetAnimationJob
        ? buildHatchPetCodexPrompt({
            sourceName: sourceImageForJob?.name ?? "",
            motionPrompt: animationMotionPrompt,
            chromaKey: chromaDecision.key
          })
        : buildAnimationCodexPrompt({
            sourceName: sourceImageForJob?.name ?? "",
            motionPrompt: animationMotionPrompt,
            actionName: animationAction.name,
            chromaKey: chromaDecision.key,
            cell: spriteCell
          })
      : isImageEditJob
        ? buildImageEditCodexPrompt({
            prompt,
            sourceName: sourceImageForJob?.name ?? "",
            annotations: selectedAnnotations
          })
        : prompt;
    const codexJobNotes = isAnimationJob
      ? isDirectionalHatchPetAnimationJob
        ? buildDirectionalHatchPetCodexNotes({
            userNotes: animationPresetNotes,
            chromaKey: chromaDecision.key,
            chromaReason: chromaDecision.reason
          })
        : isHatchPetAnimationJob
        ? buildHatchPetCodexNotes({
            userNotes: animationPresetNotes,
            chromaKey: chromaDecision.key,
            chromaReason: chromaDecision.reason
          })
        : buildAnimationCodexNotes({
            userNotes: animationPresetNotes,
            chromaKey: chromaDecision.key,
            chromaReason: chromaDecision.reason,
            grid: spriteGrid,
            cell: spriteCell
          })
      : isImageEditJob
        ? buildImageEditCodexNotes({
            userNotes: jobNotes,
            annotations: selectedAnnotations
          })
        : jobNotes;

    return {
      workflowMode,
      prompt: codexPrompt,
      negativePrompt,
      jobNotes: codexJobNotes,
      seed,
      size: isDirectionalHatchPetAnimationJob
        ? `${HATCH_PET_CELL.width * HATCH_PET_GRID.columns}x${HATCH_PET_CELL.height * HATCH_PET_GRID.rows} x ${DIRECTIONAL_HATCH_PET_RESULT_COUNT}`
        : isAnimationJob
          ? `${spriteCell.width * DIRECTION_SPLIT_ANIMATION_GRID.columns}x${spriteCell.height * DIRECTION_SPLIT_ANIMATION_GRID.rows} x ${DIRECTION_SPLIT_ANIMATION_RESULT_COUNT}`
          : size,
      count,
      quality,
      selectedImageName: includeSelectedImage ? sourceImageForJob?.name ?? "" : "",
      selectedImageSize: includeSelectedImage ? sourceImageForJob?.size ?? "" : "",
      selectedImageSource: includeSelectedImage ? sourceImageForJob?.source ?? "" : "",
      selectedImageDataUrl: includeSelectedImage ? sourceImageForJob?.dataUrl ?? "" : "",
      annotations: isImageEditJob && selected ? selectedAnnotations : [],
      grid: includeSpriteContext ? spriteGrid : null,
      action: includeSpriteContext ? animationAction.name : "",
      frames: includeSpriteContext ? spriteFrameCount : 0,
      cell: includeSpriteContext ? spriteCell : null,
      chromaKey: isAnimationJob ? chromaDecision.key.name : "",
      spriteVariant: isAnimationJob ? animationJobGenerationMode : undefined,
      directions: isAnimationJob
        ? isDirectionalHatchPetAnimationJob
          ? ANIMATION_DIRECTIONS
          : isHatchPetAnimationJob
            ? HATCH_PET_STATE_ROWS.map((row) => row.id)
            : ANIMATION_DIRECTIONS
        : [],
      label: codexJobLabel(workflowMode, isAnimationJob ? animationMotionPrompt : prompt, isAnimationJob ? animationAction.name : undefined),
      resultWorkflowMode: workflowMode ?? undefined,
      resultActionName: isAnimationJob ? animationAction.name : undefined,
      resultGrid: isAnimationJob ? spriteGrid : undefined,
      resultCell: isAnimationJob ? spriteCell : undefined,
      resultChromaKey: isAnimationJob ? chromaDecision.key.name : undefined,
      resultSpriteVariant: isAnimationJob ? animationJobGenerationMode : undefined,
      resultSourceImageId: isImageEditJob || isAnimationJob ? sourceImageForJob?.id : undefined,
      resultSourceImageName: isImageEditJob || isAnimationJob ? sourceImageForJob?.name : undefined
    };
  }

  function enqueueCodexJobDraft(draft: CodexJobDraft) {
    const queuedAt = new Date().toISOString();
    const labels = codexJobQueueLabels(language);
    setCodexJobs((current) => [
      ...current,
      {
        id: createId("queued"),
        state: "queued",
        label: draft.label,
        createdAt: queuedAt,
        queuedAt,
        request: draft,
        workflowMode: draft.resultWorkflowMode,
        actionName: draft.resultActionName,
        grid: draft.resultGrid,
        cell: draft.resultCell,
        chromaKey: draft.resultChromaKey,
        spriteVariant: draft.resultSpriteVariant,
        sourceImageId: draft.resultSourceImageId,
        sourceImageName: draft.resultSourceImageName
      }
    ]);
    setStatus(`${labels.queuedStatus}: ${draft.label}`);
  }

  async function submitCodexJobDraft(draft: CodexJobDraft, queuedJobId?: string) {
    setIsBusy(true);
    try {
      const response = await fetch("/api/codex/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workflowMode: draft.workflowMode,
          prompt: draft.prompt,
          negativePrompt: draft.negativePrompt,
          jobNotes: draft.jobNotes,
          seed: draft.seed,
          size: draft.size,
          count: draft.count,
          quality: draft.quality,
          selectedImageName: draft.selectedImageName,
          selectedImageSize: draft.selectedImageSize,
          selectedImageSource: draft.selectedImageSource,
          selectedImageDataUrl: draft.selectedImageDataUrl,
          annotations: draft.annotations,
          grid: draft.grid,
          action: draft.action,
          frames: draft.frames,
          cell: draft.cell,
          chromaKey: draft.chromaKey,
          spriteVariant: draft.spriteVariant,
          directions: draft.directions
        })
      });
      if (!response.ok) throw new Error(await response.text());

      const data = (await response.json()) as CodexJobResponse;
      if (draft.resultWorkflowMode === "image-edit") {
        const before = history.find((item) => item.id === draft.resultSourceImageId) ?? selected;
        if (before) setImageEditComparison({ before, jobId: data.id });
      }
      if (shouldWaitForCodexRunner(data.runner)) {
        const runningJob: CodexJobQueueItem = {
          id: data.id,
          path: data.path,
          state: "running",
          label: draft.label,
          createdAt: data.createdAt,
          workflowMode: draft.resultWorkflowMode,
          actionName: draft.resultActionName,
          grid: draft.resultGrid,
          cell: draft.resultCell,
          chromaKey: draft.resultChromaKey,
          spriteVariant: draft.resultSpriteVariant,
          sourceImageId: draft.resultSourceImageId,
          sourceImageName: draft.resultSourceImageName
        };
        setCodexJobs((current) => {
          const withoutQueued = queuedJobId ? current.filter((job) => job.id !== queuedJobId) : current;
          return [...withoutQueued, runningJob];
        });
      } else if (queuedJobId) {
        removeCodexJob(queuedJobId);
      }

      setStatus(`${copy.statusCodexJobWritten}: ${data.path}. ${runnerStatusMessage(data.runner, copy)}.`);
    } catch (error) {
      if (queuedJobId) removeCodexJob(queuedJobId);
      setStatus(error instanceof Error ? error.message : copy.statusCodexJobError);
    } finally {
      setIsBusy(false);
    }
  }

  function removeCodexJob(jobId: string, finalState?: CodexJobLogItem["state"]) {
    const removedJob = codexJobs.find((job) => job.id === jobId);
    setCodexJobs((current) => current.filter((job) => job.id !== jobId));
    if (!removedJob || !finalState) return;

    setCodexJobLogs((logs) =>
      mergeCodexJobLogs(logs, [
        createCodexJobLogItem(removedJob, logs.find((item) => item.jobId === jobId), finalState)
      ])
    );
    void loadCodexJobLog(jobId)
      .then((log) => {
        setCodexJobLogs((logs) => mergeCodexJobLogs(logs, [createCodexJobLogItem(removedJob, log, finalState)]));
      })
      .catch((error) => {
        setCodexJobLogs((logs) =>
          mergeCodexJobLogs(logs, [
            createCodexJobLogItem(
              removedJob,
              logs.find((item) => item.jobId === jobId),
              finalState,
              error instanceof Error ? error.message : "Could not read Codex log"
            )
          ])
        );
      });
  }

  function recordCodexFailure(job: CodexJobQueueItem, runnerStatus: CodexRunnerStatus) {
    if (!runnerStatus.diagnostic) return;
    const notice: CodexFailureNotice = {
      id: `${runnerStatus.jobId}-failure`,
      jobId: runnerStatus.jobId,
      label: job.label,
      createdAt: runnerStatus.finishedAt ?? new Date().toISOString(),
      workflowMode: job.workflowMode,
      diagnostic: runnerStatus.diagnostic
    };
    setCodexFailureNotices((current) =>
      current.some((item) => item.jobId === notice.jobId)
        ? current.map((item) => (item.jobId === notice.jobId ? notice : item))
        : [notice, ...current].slice(0, 12)
    );
  }

  async function generateLocally() {
    setIsBusy(true);
    try {
      if (workflowMode === "sprite-generate") {
        await generateAnimationFromSelectedPixelArt();
        return;
      }

      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workflowMode,
          prompt,
          negativePrompt,
          jobNotes,
          seed,
          size,
          count,
          grid,
          action: activeAction.name,
          frames: grid.columns * grid.rows,
          cell: activeAction.cell
        })
      });
      if (!response.ok) throw new Error(await response.text());
      const data = (await response.json()) as LocalGenerationResponse;
      const imported: HistoryItem[] = [];
      for (const result of data.results) {
        const image = await loadImage(result.dataUrl);
        imported.push({
          id: createId("hist"),
          name: result.name,
          dataUrl: result.dataUrl,
          provider: "local-generator",
          prompt,
          seed,
          size: `${image.width}x${image.height}`,
          createdAt: data.createdAt,
          adopted: false,
          source: "generate"
        });
      }
      if (imported.length === 0) throw new Error("Local generator returned no images.");

      setHistory((current) => [...imported, ...current]);
      setSelectedId(imported[0].id);
      setSelectedFrameId("");

      setStatus(`${copy.statusLocalGenerated}: ${imported.map((item) => item.name).join(", ")}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : copy.statusLocalGenerateError);
    } finally {
      setIsBusy(false);
    }
  }

  async function generateAnimationFromSelectedPixelArt() {
    const source = animationSource;
    if (!isAnimationSource(source)) {
      setStatus(copy.statusAnimationSourceRequired);
      fileInputRef.current?.click();
      return;
    }

    const animationAction = normalizeAnimationAction(activeAction);
    const animationGrid = { columns: ANIMATION_FRAME_COUNT, rows: 1, gutter: 0 };
    const sheetDataUrl = await renderAnimationSheet(source.dataUrl, animationAction.cell, animationAction.name);
    const sheetName = `${source.name.replace(/\.[^.]+$/, "")}_${animationAction.name}_animation_sheet.png`;
    const item: HistoryItem = {
      id: createId("hist"),
      name: sheetName,
      dataUrl: sheetDataUrl,
      provider: "local-generator",
      prompt,
      seed,
      size: `${animationAction.cell.width * ANIMATION_FRAME_COUNT}x${animationAction.cell.height}`,
      createdAt: new Date().toISOString(),
      adopted: false,
      source: "generate",
      derivedFromId: source.id,
      derivedFromName: source.name
    };
    const newFrames = await splitImageIntoFrames(sheetDataUrl, sheetName.replace(/\.[^.]+$/, ""), animationGrid, item.id, animationAction.cell, {
      normalizeOpaqueBounds: true
    });

    setGrid(animationGrid);
    setHistory((current) => [item, ...current]);
    setSelectedId(item.id);
    setFrames((current) => [...current, ...newFrames]);
    setActions((current) =>
      current.map((action) =>
        action.name === animationAction.name ? { ...animationAction, frameIds: newFrames.map((frame) => frame.id) } : action
      )
    );
    setSelectedFrameId("");
    setStatus(`${copy.statusAnimationGenerated}: ${sheetName}. ${formatFramesAddedStatus(newFrames.length, animationAction.name, language)}`);
  }

  async function importAnimationSheetResult(imported: CodexOutboxImportResponse, pendingJob: CodexJobQueueItem) {
    const actionName = pendingJob.actionName ?? activeAction.name;
    const spriteVariant = pendingJob.spriteVariant ?? "standard";
    const spriteGrid = pendingJob.grid ?? ANIMATION_SHEET_GRID;
    const spriteCell = pendingJob.cell ?? normalizeAnimationAction(activeAction).cell;
    const chromaKey = animationChromaKeys[pendingJob.chromaKey ?? animationChromaKey];
    const transparentSheetDataUrl = spriteVariant === "hatch-pet"
      ? imported.dataUrl
      : await createTransparentSpriteSheetDataUrl(imported.dataUrl, chromaKey);
    const image = await loadImage(transparentSheetDataUrl);
    const baseName = imported.name.replace(/\.[^.]+$/, "");
    const item: HistoryItem = {
      id: createId("hist"),
      name: spriteVariant === "hatch-pet" ? imported.name : `${baseName}_transparent.png`,
      dataUrl: transparentSheetDataUrl,
      provider: "local-inbox",
      prompt,
      seed,
      size: `${image.width}x${image.height}`,
      createdAt: new Date().toISOString(),
      adopted: false,
      source: "generate",
      derivedFromId: pendingJob.sourceImageId,
      derivedFromName: pendingJob.sourceImageName
    };
    const newFrames = await splitImageIntoFrames(transparentSheetDataUrl, baseName, spriteGrid, item.id, spriteCell, {
      normalizeOpaqueBounds: spriteVariant === "standard",
      residueChromaKey: chromaKey.name
    });
    if (newFrames.length === 0) throw new Error("Returned sprite sheet could not be split into frames.");

    setAnimationGenerationMode(spriteVariant);
    if (spriteVariant !== "hatch-pet") setAnimationChromaKey(chromaKey.name);
    setGrid(spriteGrid);
    setHistory((current) => [item, ...current]);
    setSelectedId(item.id);
    setFrames((current) => [...current, ...newFrames]);
    setActiveActionName(actionName);
    setActions((current) =>
      current.map((action) =>
        action.name === actionName
          ? { ...normalizeAnimationAction(action), cell: spriteCell, frameIds: newFrames.map((frame) => frame.id) }
          : action
      )
    );
    setSelectedFrameId("");
    setStatus(`${copy.statusAnimationGenerated}: ${item.name}. ${formatFramesAddedStatus(newFrames.length, actionName, language)}`);
  }

  async function importDirectionalHatchPetResults(importedResults: CodexOutboxImportResponse[], pendingJob: CodexJobQueueItem) {
    const actionName = pendingJob.actionName ?? directionalHatchPetSpriteAction().name;
    const chromaKey = animationChromaKeys[pendingJob.chromaKey ?? animationChromaKey];
    const transparentAtlases = await Promise.all(
      importedResults.map((result) => createTransparentSpriteSheetDataUrl(result.dataUrl, chromaKey))
    );
    const combinedDataUrl = await composeDirectionalHatchPetSheet(transparentAtlases);
    const image = await loadImage(combinedDataUrl);
    const itemName = `${pendingJob.id}-directional-hatch-pet-atlas.png`;
    const item: HistoryItem = {
      id: createId("hist"),
      name: itemName,
      dataUrl: combinedDataUrl,
      provider: "local-inbox",
      prompt,
      seed,
      size: `${image.width}x${image.height}`,
      createdAt: new Date().toISOString(),
      adopted: false,
      source: "generate",
      derivedFromId: pendingJob.sourceImageId,
      derivedFromName: pendingJob.sourceImageName
    };
    const newFrames = await splitImageIntoFrames(combinedDataUrl, itemName.replace(/\.[^.]+$/, ""), DIRECTIONAL_HATCH_PET_GRID, item.id, HATCH_PET_CELL);
    if (newFrames.length === 0) throw new Error("Returned directional hatch-pet atlases could not be split into frames.");

    setAnimationGenerationMode("directional-hatch-pet");
    setAnimationChromaKey(chromaKey.name);
    setGrid(DIRECTIONAL_HATCH_PET_GRID);
    setHistory((current) => [item, ...current]);
    setSelectedId(item.id);
    setFrames((current) => [...current, ...newFrames]);
    setActiveActionName(actionName);
    setActions((current) =>
      current.some((action) => action.name === actionName)
        ? current.map((action) =>
            action.name === actionName
              ? { ...action, cell: HATCH_PET_CELL, frameIds: newFrames.map((frame) => frame.id) }
              : action
          )
        : [...current, { ...directionalHatchPetSpriteAction(), frameIds: newFrames.map((frame) => frame.id) }]
    );
    setSelectedFrameId("");
    setStatus(`${copy.statusAnimationGenerated}: ${item.name}. ${formatFramesAddedStatus(newFrames.length, actionName, language)}`);
  }

  async function importDirectionSplitAnimationResults(
    importedResults: CodexOutboxImportResponse[],
    manifest: DirectionSplitAnimationManifest | null,
    pendingJob: CodexJobQueueItem
  ) {
    const actionName = pendingJob.actionName ?? activeAction.name;
    const spriteCell = pendingJob.cell ?? STANDARD_ANIMATION_CELL;
    const chromaKey = animationChromaKeys[pendingJob.chromaKey ?? animationChromaKey];
    const composed = await composeDirectionSplitAnimationSheet(importedResults, chromaKey, spriteCell);
    const image = await loadImage(composed.dataUrl);
    const itemName = `${pendingJob.id}-direction-split-animation-sheet.png`;
    const item: HistoryItem = {
      id: createId("hist"),
      name: itemName,
      dataUrl: composed.dataUrl,
      provider: "local-inbox",
      prompt,
      seed,
      size: `${image.width}x${image.height}`,
      createdAt: new Date().toISOString(),
      adopted: false,
      source: "generate",
      derivedFromId: pendingJob.sourceImageId,
      derivedFromName: pendingJob.sourceImageName
    };
    const newFrames = await splitImageIntoFrames(composed.dataUrl, itemName.replace(/\.[^.]+$/, ""), ANIMATION_SHEET_GRID, item.id, spriteCell);
    if (newFrames.length === 0) throw new Error("Returned direction split animation could not be split into frames.");

    setAnimationGenerationMode("standard");
    setAnimationChromaKey(chromaKey.name);
    setGrid(ANIMATION_SHEET_GRID);
    setHistory((current) => [item, ...current]);
    setSelectedId(item.id);
    setFrames((current) => [...current, ...newFrames]);
    setActiveActionName(actionName);
    setActions((current) =>
      current.map((action) =>
        action.name === actionName
          ? { ...normalizeAnimationAction(action), cell: spriteCell, frameIds: newFrames.map((frame) => frame.id) }
          : action
      )
    );
    setSelectedFrameId("");

    const manifestSuffix = manifest?.schema === DIRECTION_SPLIT_ANIMATION_SCHEMA ? " direction-split manifest ok." : "";
    const warningSuffix = composed.warnings.length > 0 ? ` QA warnings: ${composed.warnings.length}.` : "";
    setStatus(`${copy.statusAnimationGenerated}: ${item.name}. ${formatFramesAddedStatus(newFrames.length, actionName, language)}${manifestSuffix}${warningSuffix}`);
  }

  async function fetchOutboxResult(name: string) {
    const importResponse = await fetch(`/api/codex/results/${encodeURIComponent(name)}`);
    if (!importResponse.ok) throw new Error(await importResponse.text());
    return (await importResponse.json()) as CodexOutboxImportResponse;
  }

  function selectDirectionalHatchPetResults(results: CodexOutboxResult[], jobId: string) {
    const staticImageResults = results.filter((result) => result.mimeType !== "image/gif");
    const sheetCandidates = staticImageResults.filter((result) => !/(?:animated|animation|gif|preview)/i.test(result.name));
    const sortedResults = (sheetCandidates.length >= DIRECTIONAL_HATCH_PET_RESULT_COUNT ? sheetCandidates : staticImageResults)
      .slice()
      .sort((left, right) => left.name.localeCompare(right.name));
    const byDirection = ANIMATION_DIRECTIONS.map((_, index) =>
      sortedResults.find((result) => directionIndexFromResultName(result.name, jobId) === index)
    );
    if (byDirection.every(Boolean)) return byDirection.filter((result): result is CodexOutboxResult => Boolean(result));
    return sortedResults.slice(0, DIRECTIONAL_HATCH_PET_RESULT_COUNT);
  }

  function directionIndexFromResultName(name: string, jobId: string) {
    const normalized = name
      .toLowerCase()
      .replace(jobId.toLowerCase(), "")
      .replace(/\.[^.]+$/, "")
      .replace(/[_\s]+/g, "-");
    const numericMatch = normalized.match(/direction-(\d{1,2})/);
    if (numericMatch) {
      const index = Number(numericMatch[1]) - 1;
      if (index >= 0 && index < ANIMATION_DIRECTION_COUNT) return index;
    }
    const directionSlugs = ANIMATION_DIRECTIONS.map((direction) => direction.replace(/\s+/g, "-"));
    const matchedSlug = directionSlugs
      .slice()
      .sort((left, right) => right.length - left.length)
      .find((slug) => normalized.includes(slug));
    return matchedSlug ? directionSlugs.indexOf(matchedSlug) : -1;
  }

  async function composeDirectionalHatchPetSheet(dataUrls: string[]) {
    const atlasWidth = HATCH_PET_CELL.width * HATCH_PET_GRID.columns;
    const atlasHeight = HATCH_PET_CELL.height * HATCH_PET_GRID.rows;
    const canvas = document.createElement("canvas");
    canvas.width = atlasWidth;
    canvas.height = atlasHeight * DIRECTIONAL_HATCH_PET_RESULT_COUNT;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not compose directional hatch-pet atlas.");
    context.clearRect(0, 0, canvas.width, canvas.height);
    for (let index = 0; index < DIRECTIONAL_HATCH_PET_RESULT_COUNT; index += 1) {
      const image = await loadImage(dataUrls[index]);
      context.drawImage(image, 0, index * atlasHeight, atlasWidth, atlasHeight);
    }
    return canvas.toDataURL("image/png");
  }

  async function importLatestOutboxResult(options: ImportLatestOptions = {}) {
    if (!options.background) setIsBusy(true);
    try {
      const pendingJob = options.job;
      const listResponse = await fetch("/api/codex/results");
      if (!listResponse.ok) throw new Error(await listResponse.text());
      const listData = (await listResponse.json()) as { outboxPath: string; results: CodexOutboxResult[] };
      const newerThanTime = options.newerThan ? Date.parse(options.newerThan) : Number.NEGATIVE_INFINITY;
      const jobResults = listData.results.filter((result) => {
        if (Date.parse(result.modifiedAt) < newerThanTime) return false;
        return pendingJob ? isOutboxResultForJob(result.name, pendingJob.id) : true;
      });
      if (pendingJob?.workflowMode === "sprite-generate" && (pendingJob.spriteVariant ?? "standard") === "standard") {
        const manifestResult = jobResults.find((result) => isDirectionSplitAnimationManifestName(result.name, pendingJob.id));
        const manifest = manifestResult ? parseDirectionSplitAnimationManifest(await fetchOutboxResult(manifestResult.name)) : null;
        const directionSplitSelection = selectDirectionSplitAnimationResults(jobResults, pendingJob.id, manifest);
        if (directionSplitSelection.detected) {
          if (directionSplitSelection.directionResults.length < DIRECTION_SPLIT_ANIMATION_RESULT_COUNT) {
            if (!options.quietEmpty) {
              const missing = directionSplitSelection.missingDirections.join(", ") || "direction images";
              setStatus(`${copy.statusInboxEmpty}: ${listData.outboxPath} (waiting for direction split: ${missing})`);
            }
            return false;
          }
          const importedResults = await Promise.all(directionSplitSelection.directionResults.map((result) => fetchOutboxResult(result.name)));
          await importDirectionSplitAnimationResults(importedResults, manifest, pendingJob);
          removeCodexJob(pendingJob.id, "completed");
          return true;
        }
      }
      if (pendingJob?.workflowMode === "sprite-generate" && pendingJob.spriteVariant === "directional-hatch-pet") {
        const directionalResults = selectDirectionalHatchPetResults(jobResults, pendingJob.id);
        if (directionalResults.length < DIRECTIONAL_HATCH_PET_RESULT_COUNT) {
          if (!options.quietEmpty) setStatus(`${copy.statusInboxEmpty}: ${listData.outboxPath}`);
          return false;
        }
        const importedResults = await Promise.all(directionalResults.map((result) => fetchOutboxResult(result.name)));
        await importDirectionalHatchPetResults(importedResults, pendingJob);
        removeCodexJob(pendingJob.id, "completed");
        return true;
      }

      const latest = jobResults.find(isStaticImageResult);
      if (!latest) {
        if (!options.quietEmpty) setStatus(`${copy.statusInboxEmpty}: ${listData.outboxPath}`);
        return false;
      }

      const imported = await fetchOutboxResult(latest.name);
      if (pendingJob?.workflowMode === "sprite-generate") {
        await importAnimationSheetResult(imported, pendingJob);
        removeCodexJob(pendingJob.id, "completed");
        return true;
      }

      const image = await loadImage(imported.dataUrl);
      const isImageEditImport = pendingJob?.workflowMode === "image-edit" || (!pendingJob && workflowMode === "image-edit" && imageEditComparison?.before);
      const imageEditBefore = isImageEditImport
        ? history.find((historyItem) => historyItem.id === pendingJob?.sourceImageId) ??
          imageEditComparison?.before ??
          selected
        : undefined;
      const imageEditSourceName = imageEditBefore?.name ?? pendingJob?.sourceImageName ?? imageEditComparison?.before?.name;
      const item: HistoryItem = {
        id: createId("hist"),
        name: imported.name,
        dataUrl: imported.dataUrl,
        provider: "local-inbox",
        prompt,
        seed,
        size: `${image.width}x${image.height}`,
        createdAt: new Date().toISOString(),
        adopted: false,
        source: "inbox",
        derivedFromId: isImageEditImport ? imageEditBefore?.id : undefined,
        derivedFromName: isImageEditImport ? imageEditSourceName : undefined
      };
      if (isImageEditImport && imageEditBefore) setImageEditComparison({ before: imageEditBefore, after: item, jobId: pendingJob?.id ?? imageEditComparison?.jobId });
      setHistory((current) => [item, ...current]);
      setSelectedId(item.id);
      setSelectedFrameId("");
      if (pendingJob) removeCodexJob(pendingJob.id, "completed");
      setStatus(`${copy.statusInboxImported}: ${imported.name}`);
      return true;
    } catch (error) {
      if (!options.background) setStatus(error instanceof Error ? error.message : copy.statusInboxError);
      return false;
    } finally {
      if (!options.background) setIsBusy(false);
    }
  }

  async function splitSelectedToTimeline() {
    if (!selected) return;
    setIsBusy(true);
    try {
      const newFrames = await splitImageIntoFrames(
        selected.dataUrl,
        selected.name.replace(/\.[^.]+$/, ""),
        grid,
        selected.id,
        activeAction.cell
      );
      setFrames((current) => [...current, ...newFrames]);
      setActions((current) =>
        current.map((action) =>
          action.name === activeAction.name
            ? { ...action, frameIds: [...action.frameIds, ...newFrames.map((frame) => frame.id)] }
            : action
        )
      );
      setSelectedFrameId(newFrames[0]?.id ?? selectedFrameId);
      setStatus(formatFramesAddedStatus(newFrames.length, activeAction.name, language));
    } finally {
      setIsBusy(false);
    }
  }

  async function exportDirectionalAnimations(format: "gif" | "webp") {
    if (!selectedAnimationExportReady) return;
    for (const { directionId, action } of selectedAnimationPreviewActions) {
      const blob = format === "gif"
        ? await createGifBlob(frames, action)
        : await createAnimatedWebpBlob(frames, action);
      downloadBlob(blob, `${selectedAnimationAction.name}_${directionId.replace(/\s+/g, "-")}.${format}`);
    }
  }

  function downloadSelectedImage() {
    if (!selected || selectedIsAnimationResult) return;
    const blob = dataUrlToBlob(selected.dataUrl);
    const extension = blob.type.includes("webp") ? "webp" : blob.type.includes("jpeg") ? "jpg" : "png";
    downloadBlob(blob, `${selectedImageSafeBaseName(selected)}.${extension}`);
  }

  async function addSelectedAsFrame() {
    if (!selected) return;
    const image = await loadImage(selected.dataUrl);
    const canvas = document.createElement("canvas");
    canvas.width = activeAction.cell.width;
    canvas.height = activeAction.cell.height;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    const scale = Math.min(canvas.width / image.width, canvas.height / image.height);
    const width = image.width * scale;
    const height = image.height * scale;
    context.drawImage(image, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
    const frame: SpriteFrame = {
      id: createId("frame"),
      name: `${selected.name}_frame`,
      dataUrl: canvas.toDataURL("image/png"),
      width: canvas.width,
      height: canvas.height,
      sourceId: selected.id,
      index: frames.length
    };
    setFrames((current) => [...current, frame]);
    setActions((current) =>
      current.map((action) =>
        action.name === activeAction.name ? { ...action, frameIds: [...action.frameIds, frame.id] } : action
      )
    );
    setSelectedFrameId(frame.id);
    setStatus(copy.statusSelectedAsFrame);
  }

  function moveFrame(frameId: string, direction: -1 | 1) {
    setActions((current) =>
      current.map((action) => {
        if (action.name !== activeAction.name) return action;
        const index = action.frameIds.indexOf(frameId);
        const nextIndex = index + direction;
        if (index < 0 || nextIndex < 0 || nextIndex >= action.frameIds.length) return action;
        const copy = [...action.frameIds];
        [copy[index], copy[nextIndex]] = [copy[nextIndex], copy[index]];
        return { ...action, frameIds: copy };
      })
    );
  }

  function removeFrame(frameId: string) {
    setActions((current) =>
      current.map((action) =>
        action.name === activeAction.name
          ? { ...action, frameIds: action.frameIds.filter((id) => id !== frameId) }
          : action
      )
    );
    setSelectedFrameId("");
  }

  function selectHistoryResult(item: HistoryItem) {
    setSelectedId(item.id);
    setSelectedFrameId("");
    if (isAnimationWorkflow && isAnimationSource(item)) setAnimationSourceId(item.id);
    if (isImageEditWorkflow && item.source === "generate" && frames.some((frame) => frame.sourceId === item.id)) {
      setStatus(copy.statusAnimationFinalNotEditable);
    }
  }

  function selectSourceFromPreview(source: HistoryItem) {
    setSelectedId(source.id);
    setSelectedFrameId("");
    if (isAnimationSource(source)) setAnimationSourceId(source.id);
    setStatus(`${copy.statusSourceSelectedForAnimation}: ${source.name}`);
  }

  const handleHistoryScroll = useCallback(
    (event: UIEvent<HTMLDivElement>) => {
      maybeLoadMoreHistoryResults(event.currentTarget);
    },
    [maybeLoadMoreHistoryResults]
  );

  async function applyChromaToSelectedFrame() {
    if (!selectedFrame) return;
    const image = await loadImage(selectedFrame.dataUrl);
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return;
    context.drawImage(image, 0, 0);
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    const key = hexToRgb(annotationColor);
    const pixels = imageData.data;
    for (let i = 0; i < pixels.length; i += 4) {
      const dr = pixels[i] - key.r;
      const dg = pixels[i + 1] - key.g;
      const db = pixels[i + 2] - key.b;
      if (Math.sqrt(dr * dr + dg * dg + db * db) <= chromaTolerance) {
        pixels[i + 3] = 0;
      }
    }
    context.putImageData(imageData, 0, 0);
    const dataUrl = canvas.toDataURL("image/png");
    setFrames((current) => current.map((frame) => (frame.id === selectedFrame.id ? { ...frame, dataUrl } : frame)));
    setStatus(copy.statusChromaApplied);
  }

  function updateActiveAction(patch: Partial<SpriteAction>) {
    setActions((current) =>
      current.map((action) => (action.name === activeAction.name ? { ...action, ...patch } : action))
    );
  }

  function updateCell(width: number, height: number) {
    const nextWidth = Math.max(MIN_ANIMATION_CELL_SIZE, width);
    const nextHeight = Math.max(MIN_ANIMATION_CELL_SIZE, height);
    updateActiveAction({
      cell: { width: nextWidth, height: nextHeight },
      anchor: { x: Math.round(nextWidth / 2), y: Math.round(nextHeight * 0.92) }
    });
  }

  function handlePointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
    lastPointerEventAtRef.current = Date.now();
    beginAnnotationDrag(event);
  }

  function handlePointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
    lastPointerEventAtRef.current = Date.now();
    updateAnnotationDrag(event);
  }

  function handlePointerUp() {
    lastPointerEventAtRef.current = Date.now();
    finishAnnotationDrag();
  }

  function handleMouseDown(event: React.MouseEvent<HTMLCanvasElement>) {
    if (shouldIgnoreMouseFallback()) return;
    beginAnnotationDrag(event);
  }

  function handleMouseMove(event: React.MouseEvent<HTMLCanvasElement>) {
    if (shouldIgnoreMouseFallback()) return;
    updateAnnotationDrag(event);
  }

  function handleMouseUp() {
    if (shouldIgnoreMouseFallback()) return;
    finishAnnotationDrag();
  }

  function shouldIgnoreMouseFallback() {
    return Date.now() - lastPointerEventAtRef.current < 500;
  }

  function beginAnnotationDrag(event: React.PointerEvent<HTMLCanvasElement> | React.MouseEvent<HTMLCanvasElement>) {
    if (workflowMode !== "image-edit" || !selected) return;
    if (selectedIsAnimationResult) return;
    if (event.button !== 0) return;
    const point = canvasPoint(event);
    const number = (annotationsByItem[selected.id]?.length ?? 0) + 1;
    try {
      if ("pointerId" in event) event.currentTarget.setPointerCapture?.(event.pointerId);
    } catch {
      // Synthetic smoke-test pointer events may not register an active pointer id.
    }
    setDraftAnnotation({
      id: createId("anno"),
      tool: "rect",
      color: annotationColor,
      width: 3,
      number,
      comment: "",
      points: [point, point]
    });
  }

  function updateAnnotationDrag(event: React.PointerEvent<HTMLCanvasElement> | React.MouseEvent<HTMLCanvasElement>) {
    if (!draftAnnotation) return;
    const point = canvasPoint(event);
    setDraftAnnotation((current) => {
      if (!current) return current;
      return { ...current, points: [current.points[0], point] };
    });
  }

  function finishAnnotationDrag() {
    if (!draftAnnotation || !selected) return;
    const [start, end = start] = draftAnnotation.points;
    if (Math.abs(end.x - start.x) < 6 || Math.abs(end.y - start.y) < 6) {
      setDraftAnnotation(null);
      return;
    }
    setAnnotationsByItem((current) => {
      const currentList = current[selected.id] ?? [];
      const number = currentList.length + 1;
      return {
        ...current,
        [selected.id]: [...currentList, { ...draftAnnotation, number }]
      };
    });
    setDraftAnnotation(null);
    setStatus(`${copy.imageEditRegionAdded} #${draftAnnotation.number ?? ""}`.trim());
  }

  function updateAnnotationComment(annotationId: string, comment: string) {
    if (!selected) return;
    setAnnotationsByItem((current) => ({
      ...current,
      [selected.id]: (current[selected.id] ?? []).map((annotation) =>
        annotation.id === annotationId ? { ...annotation, comment } : annotation
      )
    }));
  }

  function removeAnnotation(annotationId: string) {
    if (!selected) return;
    setAnnotationsByItem((current) => ({
      ...current,
      [selected.id]: renumberAnnotations((current[selected.id] ?? []).filter((annotation) => annotation.id !== annotationId))
    }));
  }

  function clearSelectedAnnotations() {
    if (!selected) return;
    setAnnotationsByItem((current) => ({
      ...current,
      [selected.id]: []
    }));
  }

  async function adoptSelected() {
    if (!selected) return;
    setHistory((current) => current.map((item) => (item.id === selected.id ? { ...item, adopted: !item.adopted } : item)));
  }

  function beginWorkflow(mode: WorkflowMode) {
    const option = workflowOptions.find((item) => item.id === mode);
    setWorkflowMode(mode);
    setShowPromptExamples(false);
    setShowAnimationPresetExamples(false);
    if (option) setProviderId(option.provider);
    if (mode === "image-edit") {
      setTool("rect");
      setShowGrid(false);
      setShowCenter(false);
    }
    if (mode === "image-generate") {
      setTool("select");
      setShowGrid(true);
      setShowCenter(true);
    }
    if (mode === "sprite-generate" || mode === "sprite-edit") {
      if (mode === "sprite-generate") setAnimationGenerationMode("standard");
      setActiveActionName(mode === "sprite-generate" ? selectedAnimationPreset.actionName : "idle");
      setShowGrid(true);
      setShowCenter(true);
      setGrid(
        mode === "sprite-generate"
          ? ANIMATION_SHEET_GRID
          : { columns: ANIMATION_FRAME_COUNT, rows: 1, gutter: 0 }
      );
      setActions((current) => normalizeAnimationActions(current));
    }
    if (mode === "sprite-generate") {
      setAnimationSourceId(selected && isAnimationSource(selected) ? selected.id : "");
    }
    if (mode === "sprite-generate" && !isAnimationSource(selected)) {
      setStatus(copy.statusAnimationSourceRequired);
      return;
    }
    setStatus(mode === "image-edit" && selectedIsAnimationResult ? copy.statusAnimationFinalNotEditable : workflowCopy[language][mode].status);
  }

  async function copyPromptExample(example: PromptExample) {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(example.prompt);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = example.prompt;
        textarea.setAttribute("readonly", "");
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      setStatus(copy.promptCopied);
    } catch {
      setStatus(copy.promptCopyFailed);
    }
  }

  function usePromptExample(example: PromptExample) {
    setPrompt(example.prompt);
    setNegativePrompt(example.negativePrompt);
    setJobNotes(example.notes);
    setWorkflowMode("image-generate");
    setShowPromptExamples(false);
    setProviderId("codex-handoff");
    setTool("select");
    setStatus(copy.promptExampleApplied);
  }

  function selectAnimationPreset(example: AnimationPresetExample) {
    const defaultAction = defaultActions.find((action) => action.name === example.actionName);
    setActions((current) => (
      current.some((action) => action.name === example.actionName) || !defaultAction
        ? current
        : normalizeAnimationActions([...current, defaultAction])
    ));
    setSelectedAnimationPresetId(example.id);
    setAnimationGenerationMode("standard");
    setActiveActionName(example.actionName);
    setGrid(ANIMATION_SHEET_GRID);
  }

  function useAnimationPresetExample(example: AnimationPresetExample) {
    selectAnimationPreset(example);
    setWorkflowMode("sprite-generate");
    setProviderId("codex-handoff");
    setShowAnimationPresetExamples(false);
    setStatus(`${copy.animationPresetExampleApplied}: ${localizedText(example.title, language)}`);
  }

  async function handleAnimationPackFiles(files: FileList | File[]) {
    const entries = Array.from(files).filter((file) =>
      file.name.endsWith(".image-cockpit-animation.zip") || file.name.endsWith(".zip") || file.type.includes("zip")
    );
    if (entries.length === 0) {
      setStatus(copy.animationPackImportFailed);
      return;
    }

    setIsBusy(true);
    try {
      const importedItems: AnimationLibraryItem[] = [];
      for (const file of entries) {
        importedItems.push(await importAnimationPackBlob(file, file.name));
      }
      setUserAnimationLibrary((current) => {
        const importedTitles = new Set(importedItems.map((item) => item.title));
        return [
          ...importedItems,
          ...current.filter((item) => !importedTitles.has(item.title))
        ].slice(0, MAX_USER_ANIMATION_LIBRARY_ITEMS);
      });
      setAnimationLibraryTab("user");
      setStatus(`${copy.animationPackImported}: ${importedItems.map((item) => item.title).join(", ")}`);
    } catch (error) {
      setStatus(error instanceof Error ? `${copy.animationPackImportFailed}: ${error.message}` : copy.animationPackImportFailed);
    } finally {
      setIsBusy(false);
    }
  }

  async function useAnimationLibraryItem(item: AnimationLibraryItem) {
    setIsBusy(true);
    try {
      const sheetDataUrl = await resolveImageSourceDataUrl(item.sheetDataUrl);
      const image = await loadImage(sheetDataUrl);
      const manifest = item.manifest;
      const historyItem: HistoryItem = {
        id: createId("hist"),
        name: `${safeAnimationFileBaseName(item.title, item.action)}_sheet.png`,
        dataUrl: sheetDataUrl,
        provider: "local-file",
        prompt: `Animation Library: ${item.title}`,
        seed: "library",
        size: `${image.width}x${image.height}`,
        createdAt: new Date().toISOString(),
        adopted: false,
        source: "generate",
        derivedFromName: item.kind === "official" ? copy.officialAnimations : copy.userAnimations
      };
      const newFrames = await splitImageIntoFrames(
        sheetDataUrl,
        historyItem.name.replace(/\.[^.]+$/, ""),
        manifest.grid,
        historyItem.id,
        manifest.cell
      );
      if (newFrames.length === 0) throw new Error("Animation pack sheet could not be split into frames.");

      const nextAction = actionFromAnimationManifest(manifest, newFrames.map((frame) => frame.id));
      setHistory((current) => [historyItem, ...current]);
      setSelectedId(historyItem.id);
      setFrames((current) => [...current, ...newFrames]);
      setActions((current) => upsertSpriteAction(current, nextAction));
      setActiveActionName(nextAction.name);
      setGrid(manifest.grid);
      setWorkflowMode("sprite-generate");
      setAnimationGenerationMode("standard");
      setProviderId("codex-handoff");
      setSelectedFrameId("");
      setStatus(`${copy.animationPackUsed}: ${item.title}`);
    } catch (error) {
      setStatus(error instanceof Error ? `${copy.animationPackImportFailed}: ${error.message}` : copy.animationPackImportFailed);
    } finally {
      setIsBusy(false);
    }
  }

  async function exportAnimationLibraryItem(item: AnimationLibraryItem) {
    setIsBusy(true);
    try {
      const sheetDataUrl = await resolveImageSourceDataUrl(item.sheetDataUrl);
      const tempFrames = await splitImageIntoFrames(
        sheetDataUrl,
        safeAnimationFileBaseName(item.title, item.action),
        item.manifest.grid,
        undefined,
        item.manifest.cell
      );
      const directionPreviews = buildAnimationManifestPreviewActions(item.manifest, tempFrames);
      const previewAction = directionPreviews[0]?.action ?? actionFromAnimationManifest(
        item.manifest,
        tempFrames.slice(0, item.manifest.framesPerDirection).map((frame) => frame.id)
      );
      const previewGif = await createGifBlob(tempFrames, previewAction);
      const previewWebp = await createAnimatedWebpBlob(tempFrames, previewAction);
      const directionPreviewBlobs = await createDirectionPreviewBlobs(tempFrames, directionPreviews);
      await exportAnimationPack({
        manifest: {
          ...item.manifest,
          kind: item.kind,
          title: item.title,
          files: animationPackFileSet(item.manifest.directions)
        },
        sheet: sheetDataUrl,
        previewGif,
        previewWebp,
        directionPreviews: directionPreviewBlobs,
        metadata: animationPackMetadata(item.manifest, {
          libraryKind: item.kind,
          sourceNote: item.manifest.sourceNote ?? ""
        })
      });
      setStatus(`${copy.animationPackExported}: ${item.title}`);
    } catch (error) {
      setStatus(error instanceof Error ? `${copy.animationPackExportFailed}: ${error.message}` : copy.animationPackExportFailed);
    } finally {
      setIsBusy(false);
    }
  }

  function renameUserAnimationItem(item: AnimationLibraryItem) {
    const title = window.prompt(copy.animationPackTitleLabel, item.title)?.trim();
    if (!title) return;
    setUserAnimationLibrary((current) =>
      current.map((currentItem) =>
        currentItem.id === item.id
          ? {
              ...currentItem,
              title,
              manifest: { ...currentItem.manifest, title },
              updatedAt: new Date().toISOString()
            }
          : currentItem
      )
    );
  }

  function deleteUserAnimationItem(item: AnimationLibraryItem) {
    setUserAnimationLibrary((current) => current.filter((currentItem) => currentItem.id !== item.id));
  }

  function openSelectedAnimationPackExportModal() {
    if (!selectedAnimationExportReady) return;
    setAnimationPackExportDraft(createAnimationPackExportDraft({
      title: selected?.name.replace(/\.[^.]+$/, "") || selectedAnimationAction.name,
      tags: [activeAction.name, "character", "sprite"].join(", "),
      sourceNote: selectedAnimationSource?.name ?? selected?.derivedFromName ?? ""
    }));
    setShowAnimationPackExportModal(true);
  }

  async function exportSelectedAnimationPack() {
    if (!selected || !selectedAnimationExportReady) return;
    setIsBusy(true);
    try {
      const previewAction = selectedAnimationPreviewActions[0]?.action ?? selectedAnimationAction;
      const previewGif = await createGifBlob(frames, previewAction);
      const previewWebp = await createAnimatedWebpBlob(frames, previewAction);
      const directionPreviewBlobs = await createDirectionPreviewBlobs(frames, selectedAnimationPreviewActions);
      const manifest = buildSelectedAnimationPackManifest({
        draft: animationPackExportDraft,
        selected,
        action: activeAction,
        grid: selectedAnimationSheetGrid,
        directions: selectedAnimationPreviewActions.map((preview) => preview.directionId)
      });
      await exportAnimationPack({
        manifest,
        sheet: selected.dataUrl,
        previewGif,
        previewWebp,
        directionPreviews: directionPreviewBlobs,
        metadata: animationPackMetadata(manifest, {
          libraryKind: "user",
          sourceNote: animationPackExportDraft.sourceNote.trim()
        })
      });
      setShowAnimationPackExportModal(false);
      setStatus(`${copy.animationPackExported}: ${manifest.title}`);
    } catch (error) {
      setStatus(error instanceof Error ? `${copy.animationPackExportFailed}: ${error.message}` : copy.animationPackExportFailed);
    } finally {
      setIsBusy(false);
    }
  }

  const codexProvider = providers.find((provider) => provider.id === "codex-handoff");
  const activeWorkflowCopy = workflowCopy[language][workflowMode];
  const activeWorkflowFormCopy = workflowFormCopy[language][workflowMode];
  const codexQueueCopy = codexJobQueueLabels(language);
  const runningCodexJobCount = codexJobs.filter((job) => job.state === "running").length;
  const shouldQueueCodexJob = providerId === "codex-handoff" && runningCodexJobCount >= MAX_ACTIVE_CODEX_JOBS;
  const isAnimationWorkflow = workflowMode === "sprite-generate";
  const isImageEditWorkflow = workflowMode === "image-edit";
  const animationSourceReady = !isAnimationWorkflow || isAnimationSource(animationSource);
  const imageEditSourceReady = !isImageEditWorkflow || Boolean(selected && !selectedIsAnimationResult);
  const primaryActionDisabled = isBusy || !animationSourceReady || !imageEditSourceReady;
  const previewMode = !selected ? "empty" : isPreviewingSelectedFrame ? "frame" : isImageEditWorkflow && !selectedIsAnimationResult ? "edit" : "result";
  const previewStatus = isPreviewingSelectedFrame && selectedFrameForPreview
    ? `${copy.frameLabel}: ${selectedFrameForPreview.index}`
    : `${copy.previewLabel}: ${selected?.name ?? "-"}`;
  const previewSize = isPreviewingSelectedFrame && selectedFrameForPreview
    ? `${selectedFrameForPreview.width}x${selectedFrameForPreview.height}`
    : selected?.size ?? "-";
  const selectedAnimationSourceName = selectedAnimationSource?.name ?? (selectedAnimationExportReady ? selected?.derivedFromName : undefined);
  const selectedImageEditSourceName = selectedImageEditSource?.name ?? (!selectedAnimationExportReady ? selected?.derivedFromName : undefined);
  const showFrameGridControls = SHOW_LOW_PRIORITY_CONTROLS || workflowMode === "sprite-edit";
  const showSpriteTuningControls = SHOW_LOW_PRIORITY_CONTROLS || workflowMode === "sprite-edit";
  const showAnnotationToolbar = isImageEditWorkflow && !selectedIsAnimationResult;
  const showSpriteActionsPanel = SHOW_SPRITE_ACTIONS_PANEL;
  const animationGenerateBody = copy.animationStepGenerateBody;
  const animationLockedSizeNote = copy.animationStandardLockedSize;
  const selectedAnimationDownloadBody = selectedAnimationVariant === "directional-hatch-pet"
    ? copy.directionalHatchPetDownloadBody
    : selectedAnimationVariant === "hatch-pet"
      ? copy.hatchPetDownloadBody
      : copy.animationStepDownloadBody;
  const selectedImageDownloadReady = Boolean(selected && !selectedIsAnimationResult);
  const resultDownloadReady = Boolean(selected);
  const resultDownloadIsAnimation = selectedAnimationExportReady;
  const resultDownloadBody = resultDownloadIsAnimation ? selectedAnimationDownloadBody : copy.imageDownloadBody;
  const resultDownloadStatus = !selected
    ? copy.imageDownloadLocked
    : resultDownloadIsAnimation
      ? copy.animationReady
      : copy.imageDownloadReady;

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <Grid3X3 size={18} aria-hidden="true" />
          <strong>Image Cockpit for Codex Workflows</strong>
          <span>{activeWorkflowCopy.label}</span>
          <small>v0.1.0</small>
        </div>
        <div className="project-strip">
          <LanguageSelect language={language} label={copy.language} onChange={setLanguage} />
          {SHOW_LOW_PRIORITY_CONTROLS && (
            <>
              <span>{copy.project}</span>
              <button className="icon-button" title={copy.openWorkspace}>
                <FolderOpen size={18} aria-hidden="true" />
              </button>
              <button className="icon-button" title={copy.settings}>
                <Settings size={18} aria-hidden="true" />
              </button>
            </>
          )}
        </div>
      </header>

      <main className={`cockpit ${SHOW_LOW_PRIORITY_CONTROLS ? "" : "simple-cockpit"} ${showSpriteActionsPanel ? "" : "without-sprite-actions"}`}>
        <aside className="panel source-panel">
          <PanelTitle index="1" title={copy.workflowPanelTitle} />
          <div className="workflow-summary">
            <small>{copy.currentWorkflow}</small>
            <strong>{activeWorkflowCopy.label}</strong>
            <span>{activeWorkflowCopy.detail}</span>
            <em>{copy.selectedProvider}: {providerLabel(providerId, language)}</em>
            {providerId === "codex-handoff" && (
              <em className={`runner-pill runner-${runnerPreflight?.state ?? "checking"}`}>
                <Plug size={13} aria-hidden="true" />
                {runnerPreflightLabel(runnerPreflight, copy)}
              </em>
            )}
          </div>
          <WorkflowTabs language={language} activeMode={workflowMode} onSelect={beginWorkflow} />

          {isAnimationWorkflow ? (
            <div className="animation-steps">
              <section className={`animation-step ${animationSourceReady ? "complete" : ""}`}>
                <div className="step-heading">
                  <strong>{copy.animationStepSourceTitle}</strong>
                  <span>{copy.animationStepSourceBody}</span>
                </div>
                <button className="secondary-button full" onClick={() => fileInputRef.current?.click()}>
                  <Upload size={16} aria-hidden="true" />
                  {copy.uploadPixelArt}
                </button>
                <div className="source-preview">
                  {animationSourceReady && animationSource ? (
                    <>
                      <img src={animationSource.dataUrl} alt="" />
                      <span>
                        <small>{copy.selectedSource}</small>
                        <strong>{animationSource.name}</strong>
                        <em>{animationSource.size} / {animationSource.source}</em>
                      </span>
                    </>
                  ) : (
                    <span>{copy.noAnimationSource}</span>
                  )}
                </div>
              </section>

              <section className="animation-step">
                <div className="step-heading">
                  <strong>{copy.animationStepMotionTitle}</strong>
                  <span>{copy.animationStepMotionBody}</span>
                </div>
                <div className="selected-animation-card">
                  <small className="step-kicker">{copy.motionPreset}</small>
                  <strong>{localizedText(selectedAnimationPreset.title, language)}</strong>
                  <span>{localizedText(selectedAnimationPreset.summary, language)}</span>
                  <em>{localizedText(selectedAnimationPreset.category, language)}</em>
                </div>
                <button className="prompt-example-trigger animation-preset-example-trigger" onClick={() => setShowAnimationPresetExamples(true)}>
                  <Film size={15} aria-hidden="true" />
                  {copy.chooseAnimation}
                </button>
              </section>

              {SHOW_ANIMATION_LIBRARY && (
                <section className="animation-step animation-library-panel">
                  <div className="step-heading">
                    <strong>{copy.animationLibraryTitle}</strong>
                    <span>{copy.animationLibraryBody}</span>
                  </div>
                  <div className="animation-library-tabs" aria-label={copy.animationLibraryTitle}>
                    <button
                      className={animationLibraryTab === "official" ? "active" : ""}
                      onClick={() => setAnimationLibraryTab("official")}
                    >
                      {copy.officialAnimations}
                    </button>
                    <button
                      className={animationLibraryTab === "user" ? "active" : ""}
                      onClick={() => setAnimationLibraryTab("user")}
                    >
                      {copy.userAnimations}
                    </button>
                  </div>
                  {animationLibraryTab === "user" && (
                    <button className="secondary-button full" onClick={() => animationPackInputRef.current?.click()}>
                      <Upload size={16} aria-hidden="true" />
                      {copy.importAnimation}
                    </button>
                  )}
                  <div className="animation-library-list">
                    {activeAnimationLibraryItems.length === 0 ? (
                      <p className="animation-library-empty">{copy.animationLibraryEmpty}</p>
                    ) : (
                      activeAnimationLibraryItems.map((item) => (
                        <article className="animation-library-card" key={item.id}>
                          <div className="animation-library-preview">
                            {item.kind === "official" ? (
                              <div className={`animation-sample-sprite ${animationLibraryPreviewClassName(item)}`} aria-label={`${item.title} sample animation`} />
                            ) : (
                              <img src={item.previewDataUrl ?? item.sheetDataUrl} alt="" />
                            )}
                          </div>
                          <div className="animation-library-info">
                            <small>{item.kind === "official" ? copy.officialAnimations : copy.userAnimations}</small>
                            <strong>{item.title}</strong>
                            <span>{item.action} / {item.manifest.grid.rows}x{item.manifest.grid.columns} / {item.manifest.cell.width}px</span>
                          </div>
                          <div className="animation-library-actions">
                            <button onClick={() => void useAnimationLibraryItem(item)}>
                              <CheckCircle2 size={14} aria-hidden="true" />
                              {copy.useAnimationLibraryItem}
                            </button>
                            <button onClick={() => void exportAnimationLibraryItem(item)}>
                              <FileArchive size={14} aria-hidden="true" />
                              {item.kind === "official" ? copy.exportAnimationSample : copy.exportAnimationPack}
                            </button>
                            {item.kind === "user" && (
                              <>
                                <button onClick={() => renameUserAnimationItem(item)}>
                                  <Settings size={14} aria-hidden="true" />
                                  {copy.renameAnimation}
                                </button>
                                <button className="danger" onClick={() => deleteUserAnimationItem(item)}>
                                  <Trash2 size={14} aria-hidden="true" />
                                  {copy.deleteAnimation}
                                </button>
                              </>
                            )}
                          </div>
                        </article>
                      ))
                    )}
                  </div>
                </section>
              )}

              <section className="animation-step">
                <div className="step-heading">
                  <strong>{copy.animationStepGenerateTitle}</strong>
                  <span>{animationGenerateBody}</span>
                </div>
                <small className="step-kicker">{animationLockedSizeNote}</small>
                <button className="primary-button full" onClick={() => void handleGenerate()} disabled={primaryActionDisabled}>
                  <PrimaryActionIcon providerId={providerId} isBusy={isBusy} />
                  {shouldQueueCodexJob ? codexQueueCopy.queueAction : copy.generateLocalSprite}
                </button>
              </section>
            </div>
          ) : (
            <>
              <label className="field">
                <span>{activeWorkflowFormCopy?.promptLabel ?? "Prompt"}</span>
                <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} maxLength={1200} />
                <small>{prompt.length} / 1200</small>
              </label>
              {workflowMode === "image-generate" && (
                <button className="prompt-example-trigger" onClick={() => setShowPromptExamples(true)}>
                  <FileJson size={15} aria-hidden="true" />
                  {copy.promptExamples}
                </button>
              )}
              {isImageEditWorkflow && (
                <section className="image-edit-panel">
                  <div className="step-heading">
                    <strong>{copy.selectedEditSource}</strong>
                    <span>{selectedIsAnimationResult ? copy.animationFinalNotEditableBody : copy.imageEditRegionsHelp}</span>
                  </div>
                  <button className="secondary-button full inline-full" onClick={() => fileInputRef.current?.click()}>
                    <Upload size={16} aria-hidden="true" />
                    {copy.uploadImageForEdit}
                  </button>
                  <div className="source-preview edit-source-preview">
                    {selected ? (
                      <>
                        <img src={selected.dataUrl} alt="" />
                        <span>
                          <small>{copy.selectedEditSource}</small>
                          <strong>{selected.name}</strong>
                          <em>{selected.size} / {selected.source}</em>
                        </span>
                      </>
                    ) : (
                      <span>{copy.noEditSource}</span>
                    )}
                  </div>

                  {selectedIsAnimationResult ? (
                    <div className="edit-final-notice">
                      <strong>{copy.animationFinalNotEditableTitle}</strong>
                      <span>{copy.animationFinalNotEditableBody}</span>
                    </div>
                  ) : (
                    <>
                      <div className="annotation-region-heading">
                        <span>{copy.imageEditRegionsTitle}</span>
                        {selectedAnnotations.length > 0 && (
                          <button className="secondary-button mini" onClick={clearSelectedAnnotations}>
                            <Trash2 size={14} aria-hidden="true" />
                            {copy.clearRegions}
                          </button>
                        )}
                      </div>
                      <div className="annotation-region-list">
                        {selectedAnnotations.length === 0 ? (
                          <p className="annotation-empty">{copy.noEditRegions}</p>
                        ) : (
                          selectedAnnotations.map((annotation, index) => (
                            <label className="annotation-region-row" key={annotation.id}>
                              <span>
                                <strong>#{annotation.number ?? index + 1}</strong>
                                {copy.editRegionLabel}
                              </span>
                              <textarea
                                className="annotation-comment-field"
                                value={annotation.comment ?? ""}
                                onChange={(event) => updateAnnotationComment(annotation.id, event.target.value)}
                                placeholder={copy.editRegionPlaceholder}
                                rows={2}
                              />
                              <button className="icon-button danger" type="button" title={copy.removeRegion} onClick={() => removeAnnotation(annotation.id)}>
                                <Trash2 size={16} aria-hidden="true" />
                              </button>
                            </label>
                          ))
                        )}
                      </div>
                    </>
                  )}
                </section>
              )}
              {workflowMode === "image-generate" && (
                <div className="button-row primary-action-row">
                  <button className="primary-button" onClick={() => void handleGenerate()} disabled={primaryActionDisabled}>
                    <PrimaryActionIcon providerId={providerId} isBusy={isBusy} />
                    {shouldQueueCodexJob ? codexQueueCopy.queueAction : primaryActionLabel(providerId, workflowMode, copy)}
                  </button>
                  <p className="action-note">{copy.generationMayTakeMinutes}</p>
                </div>
              )}
              <label className="field">
                <span>{activeWorkflowFormCopy?.negativeLabel ?? "Negative Prompt"}</span>
                <textarea value={negativePrompt} onChange={(event) => setNegativePrompt(event.target.value)} rows={2} />
              </label>
              <label className="field">
                <span>{activeWorkflowFormCopy?.notesLabel ?? copy.jobNotes}</span>
                <textarea
                  value={jobNotes}
                  onChange={(event) => setJobNotes(event.target.value)}
                  rows={3}
                  maxLength={1000}
                  placeholder={activeWorkflowFormCopy?.notesPlaceholder ?? copy.jobNotesPlaceholder}
                />
                <small>{jobNotes.length} / 1000</small>
              </label>

              {SHOW_LOW_PRIORITY_CONTROLS && (
                <>
                  <div className="field-row">
                    <label className="field">
                      <span>Seed</span>
                      <input value={seed} onChange={(event) => setSeed(event.target.value)} />
                    </label>
                    <label className="field">
                      <span>Count</span>
                      <input
                        type="number"
                        min={1}
                        max={4}
                        value={count}
                        onChange={(event) => setCount(Number(event.target.value))}
                      />
                    </label>
                  </div>
                  <div className="field-row">
                    <label className="field">
                      <span>Size</span>
                      <select value={size} onChange={(event) => setSize(event.target.value)}>
                        <option>1024x1024</option>
                        <option>1536x1024</option>
                        <option>1024x1536</option>
                      </select>
                    </label>
                    <label className="field">
                      <span>Quality</span>
                      <select value={quality} onChange={(event) => setQuality(event.target.value)}>
                        <option>auto</option>
                        <option>low</option>
                        <option>medium</option>
                        <option>high</option>
                      </select>
                    </label>
                  </div>
                </>
              )}

              {workflowMode !== "image-generate" && (
                <div className="button-row primary-action-row">
                  <button className="primary-button" onClick={() => void handleGenerate()} disabled={primaryActionDisabled}>
                    <PrimaryActionIcon providerId={providerId} isBusy={isBusy} />
                    {shouldQueueCodexJob ? codexQueueCopy.queueAction : primaryActionLabel(providerId, workflowMode, copy)}
                  </button>
                </div>
              )}
            </>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(event) => {
              if (event.target.files) void handleFiles(event.target.files);
              event.currentTarget.value = "";
            }}
          />
          <input
            ref={animationPackInputRef}
            type="file"
            accept=".image-cockpit-animation.zip,.zip,application/zip,application/x-zip-compressed"
            multiple
            hidden
            onChange={(event) => {
              if (event.target.files) void handleAnimationPackFiles(event.target.files);
              event.currentTarget.value = "";
            }}
          />

          {SHOW_LOW_PRIORITY_CONTROLS && (
            <>
              <SectionLabel title="Providers" />
              <div className="provider-list">
                {providers.map((provider) => (
                  <button
                    key={provider.id}
                    className={`provider ${providerId === provider.id ? "selected" : ""}`}
                    onClick={() => setProviderId(provider.id)}
                    disabled={!provider.enabled}
                  >
                    {provider.id === "local-file" && <FolderOpen size={22} aria-hidden="true" />}
                    {provider.id === "local-generator" && <ImagePlus size={22} aria-hidden="true" />}
                    {provider.id === "codex-handoff" && <Plug size={22} aria-hidden="true" />}
                    {provider.id === "local-inbox" && <Archive size={22} aria-hidden="true" />}
                    <span>
                      <strong>{providerLabel(provider.id, language)}</strong>
                      <small>{providerMessage(provider, language)}</small>
                    </span>
                    {provider.enabled ? <CheckCircle2 size={16} aria-hidden="true" /> : <em>Off</em>}
                  </button>
                ))}
              </div>

              <div className="notice">
                <AlertTriangle size={18} aria-hidden="true" />
                <span>
                  This app does not call OpenAI APIs directly. Codex jobs are written to the local inbox
                  {codexProvider?.path ? `: ${codexProvider.path}` : "."}
                </span>
              </div>
            </>
          )}

          {showFrameGridControls && (
            <>
              <div className="field-row">
                <NumberField label={copy.frameWidth} value={activeAction.cell.width} min={MIN_ANIMATION_CELL_SIZE} onChange={(width) => updateCell(width, activeAction.cell.height)} />
                <NumberField label={copy.frameHeight} value={activeAction.cell.height} min={MIN_ANIMATION_CELL_SIZE} onChange={(height) => updateCell(activeAction.cell.width, height)} />
              </div>
              <label className="check-row">
                <input type="checkbox" checked={showGrid} onChange={(event) => setShowGrid(event.target.checked)} />
                {copy.showGrid}
              </label>
              <label className="check-row">
                <input type="checkbox" checked={showCenter} onChange={(event) => setShowCenter(event.target.checked)} />
                {copy.showCenter}
              </label>
            </>
          )}

          {showSpriteTuningControls && (
            <>
              <SectionLabel title={copy.transparencyCleanup} />
              <label className="field">
                <span>{copy.keyColor}</span>
                <input type="color" value={annotationColor} onChange={(event) => setAnnotationColor(event.target.value)} />
              </label>
              <label className="field">
                <span>{copy.tolerance}</span>
                <input
                  type="range"
                  min={0}
                  max={120}
                  value={chromaTolerance}
                  onChange={(event) => setChromaTolerance(Number(event.target.value))}
                />
              </label>
              <button className="secondary-button full" onClick={() => void applyChromaToSelectedFrame()} disabled={!selectedFrame}>
                <Pipette size={16} aria-hidden="true" />
                {copy.applyChromaKey}
              </button>
            </>
          )}
        </aside>

        <section className={`workspace with-downloads ${resultDownloadIsAnimation ? "showing-animation-result" : "showing-image-result"}`}>
          <div className={`panel canvas-panel ${showAnnotationToolbar ? "" : "without-toolbar"}`}>
            <PanelTitle index="2" title={copy.canvasAnnotationTitle} />
            {showAnnotationToolbar && (
              <div className="toolbar edit-toolbar">
                <span className="edit-tool-pill">
                  <Square size={16} aria-hidden="true" />
                  {copy.rectangleTool}
                </span>
                <span>{copy.imageEditRegionsHelp}</span>
              </div>
            )}
            <div
              className={`canvas-stage ${previewMode === "result" ? "showing-result" : ""}`}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                void handleFiles(event.dataTransfer.files);
              }}
            >
              {previewMode === "result" && selected && (
                <div className={`result-preview-frame ${selectedAnimationExportReady ? "with-animation-previews" : ""}`}>
                  {selectedAnimationExportReady ? (
                    <div className="animation-composite-preview">
                      <div className="animation-preview-card direction-preview-card">
                        <div className="animation-preview-card-heading">
                          <strong>{copy.directionalPreviews}</strong>
                          <small>{copy.previewGif}</small>
                        </div>
                        {isAnimationPreviewBuilding ? (
                          <div className="animation-preview compact-animation-preview">{copy.animationPreviewsBuilding}</div>
                        ) : animationDirectionPreviews.length > 0 ? (
                          <div className="direction-preview-list">
                            {animationDirectionPreviews.map((preview) => (
                              <div className="direction-preview-row" key={preview.id}>
                                <span>{preview.label}</span>
                                <div className="animation-preview direction-gif-preview">
                                  <img src={preview.gifUrl} alt="" />
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="animation-preview compact-animation-preview">{copy.noFrames}</div>
                        )}
                      </div>
                      <div className="animation-preview-card sprite-sheet-preview-card">
                        <strong>{copy.previewSpriteSheet}</strong>
                        <div className="animation-preview sheet-preview">
                          <span className="sprite-sheet-grid-preview" style={selectedAnimationSheetGridStyle}>
                            <img className="result-preview-image" src={selected.dataUrl} alt="" />
                            <span className="sprite-sheet-grid-overlay" aria-hidden="true" />
                          </span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="static-result-preview-viewport">
                      <img className="result-preview-image" src={selected.dataUrl} alt="" />
                    </div>
                  )}
                </div>
              )}
              <canvas
                ref={canvasRef}
                width={CANVAS_WIDTH}
                height={CANVAS_HEIGHT}
                data-preview-mode={previewMode}
                data-preview-name={selected?.name ?? ""}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerLeave={handlePointerUp}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
              />
              {SHOW_LOW_PRIORITY_CONTROLS && (
                <div className="split-popover">
                  <strong>Split Grid</strong>
                  <NumberField label="Columns" value={grid.columns} onChange={(columns) => setGrid({ ...grid, columns })} />
                  <NumberField label="Rows" value={grid.rows} onChange={(rows) => setGrid({ ...grid, rows })} />
                  <NumberField label="Gutter" value={grid.gutter} onChange={(gutter) => setGrid({ ...grid, gutter })} />
                  <button onClick={() => void splitSelectedToTimeline()}>Apply to Sheet</button>
                </div>
              )}
            </div>
            <div className="canvas-status">
              <span>{previewStatus}</span>
              {selectedAnimationExportReady && (
                selectedAnimationSource ? (
                  <button
                    type="button"
                    className="source-status-chip source-status-button animation-source-status"
                    onClick={() => selectSourceFromPreview(selectedAnimationSource)}
                    title={`${copy.openSourcePreview}: ${selectedAnimationSource.name}`}
                    aria-label={`${copy.openSourcePreview}: ${selectedAnimationSource.name}`}
                  >
                    <img src={selectedAnimationSource.dataUrl} alt="" />
                    <span className="source-status-text">
                      <small>{copy.animationGeneratedFrom}</small>
                      <strong>{selectedAnimationSource.name}</strong>
                    </span>
                  </button>
                ) : (
                  <span className="source-status-chip animation-source-status">
                    <span className="source-thumb-placeholder" />
                    <span className="source-status-text">
                      <small>{copy.animationGeneratedFrom}</small>
                      <strong>{selectedAnimationSourceName ?? copy.animationSourceUnknown}</strong>
                    </span>
                  </span>
                )
              )}
              {selectedImageEditSourceName && (
                selectedImageEditSource ? (
                  <button
                    type="button"
                    className="source-status-chip source-status-button image-edit-source-status"
                    onClick={() => selectSourceFromPreview(selectedImageEditSource)}
                    title={`${copy.openSourcePreview}: ${selectedImageEditSource.name}`}
                    aria-label={`${copy.openSourcePreview}: ${selectedImageEditSource.name}`}
                  >
                    <img src={selectedImageEditSource.dataUrl} alt="" />
                    <span className="source-status-text">
                      <small>{copy.imageEditGeneratedFrom}</small>
                      <strong>{selectedImageEditSourceName}</strong>
                    </span>
                  </button>
                ) : (
                  <span className="source-status-chip image-edit-source-status">
                    <span className="source-thumb-placeholder" />
                    <span className="source-status-text">
                      <small>{copy.imageEditGeneratedFrom}</small>
                      <strong>{selectedImageEditSourceName ?? copy.imageEditSourceUnknown}</strong>
                    </span>
                  </span>
                )
              )}
              <span>{copy.sizeLabel}: {previewSize}</span>
              <span>{copy.anchorLabel}: {activeAction.anchor.x}, {activeAction.anchor.y}</span>
              <span>{copy.zoomLabel}: {copy.zoomFit}</span>
              <span className="swatch" style={{ background: annotationColor }} />
            </div>
          </div>
          <section className={`panel result-download-panel ${resultDownloadReady ? "complete" : ""} ${resultDownloadIsAnimation ? "animation-result-download" : "image-result-download"}`}>
            <PanelTitle index="4" title={copy.imageDownloadTitle} />
            <div className="result-download-body">
              <div className="step-heading">
                <strong>{selected?.name ?? copy.imageDownloadTitle}</strong>
                <span>{resultDownloadBody}</span>
              </div>
              <small className="step-kicker">{resultDownloadStatus}</small>
              {resultDownloadIsAnimation ? (
                <div className="download-grid result-download-grid">
                  <button onClick={() => void exportDirectionalAnimations("gif")} disabled={!selectedAnimationExportReady}>
                    <Film size={16} aria-hidden="true" />
                    {copy.animatedGif}
                  </button>
                  <button onClick={() => void exportDirectionalAnimations("webp")} disabled={!selectedAnimationExportReady}>
                    <FileArchive size={16} aria-hidden="true" />
                    {copy.animatedWebP}
                  </button>
                  <button onClick={() => void exportSpriteSheet(frames, selectedAnimationAction, ANIMATION_FRAME_COUNT)} disabled={!selectedAnimationExportReady}>
                    <FileImage size={16} aria-hidden="true" />
                    {copy.spriteSheetDownload}
                  </button>
                  <button onClick={openSelectedAnimationPackExportModal} disabled={!selectedAnimationExportReady}>
                    <FileArchive size={16} aria-hidden="true" />
                    {copy.exportAnimationPack}
                  </button>
                </div>
              ) : (
                <div className="download-grid result-download-grid">
                  <button onClick={downloadSelectedImage} disabled={!selectedImageDownloadReady}>
                    <FileImage size={16} aria-hidden="true" />
                    {copy.downloadPng}
                  </button>
                </div>
              )}
            </div>
          </section>
        </section>

        <aside className="panel history-panel">
          <PanelTitle index="3" title={copy.results} />
          {providerId === "codex-handoff" && codexJobs.length > 0 && (
            <CodexJobShelf jobs={codexJobs} maxActive={MAX_ACTIVE_CODEX_JOBS} language={language} />
          )}
          {SHOW_LOW_PRIORITY_CONTROLS && (
            <div className="tabs">
              <button className="tab active">History</button>
              <button className="tab">Adopted ({history.filter((item) => item.adopted).length})</button>
            </div>
          )}
          <div
            ref={historyListRef}
            className="history-list"
            data-visible-count={visibleHistoryCount}
            data-total-count={history.length}
            onScroll={handleHistoryScroll}
          >
            {codexFailureNotices.map((notice) => (
              <CodexFailureCard key={notice.id} notice={notice} language={language} />
            ))}
            {visibleHistory.map((item) => (
              <button
                key={item.id}
                className={`history-item ${selected?.id === item.id ? "selected" : ""}`}
                onClick={() => selectHistoryResult(item)}
              >
                <img src={item.dataUrl} alt="" loading="lazy" decoding="async" />
                <span>
                  <strong>{item.name}</strong>
                  <small>{formatTime(item.createdAt)} • {providerLabel(item.provider, language)}</small>
                  <small>{item.size} • {item.source}</small>
                </span>
                {SHOW_LOW_PRIORITY_CONTROLS && item.adopted && <em>Adopted</em>}
              </button>
            ))}
            {hasMoreHistory && <div ref={historyLoadMoreRef} className="history-load-more-sentinel" aria-hidden="true" />}
          </div>
          {SHOW_LOW_PRIORITY_CONTROLS && (
            <div className="variant-box">
              <div className="variant-title">
                <strong>Variant Comparison</strong>
                <button className="secondary-button mini" onClick={() => void adoptSelected()} disabled={!selected}>
                  Adopt
                </button>
              </div>
              <div className="variant-strip">
                {history.slice(0, 3).map((item) => (
                  <button
                    key={item.id}
                    className={selected?.id === item.id ? "variant selected" : "variant"}
                    onClick={() => selectHistoryResult(item)}
                  >
                    <img src={item.dataUrl} alt="" />
                    <span>{item.adopted ? "Adopted" : "Candidate"}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </aside>

        {showSpriteActionsPanel && (
        <section className="panel sprite-bench">
          <PanelTitle index="4" title={copy.spriteActions} />
          <div className="action-tabs">
            {actions.map((action) => (
              <button
                key={action.name}
                className={action.name === activeAction.name ? "active" : ""}
                onClick={() => setActiveActionName(action.name)}
              >
                {action.name}
              </button>
            ))}
            {SHOW_LOW_PRIORITY_CONTROLS && (
              <button className="icon-button" title="Add action preset">
                <Plus size={16} aria-hidden="true" />
              </button>
            )}
            <span className="spacer" />
            {SHOW_LOW_PRIORITY_CONTROLS && (
              <>
                <label>
                  FPS
                  <input
                    type="number"
                    min={1}
                    max={60}
                    value={activeAction.fps}
                    onChange={(event) => updateActiveAction({ fps: Number(event.target.value) })}
                  />
                </label>
                <label className="check-row inline">
                  <input
                    type="checkbox"
                    checked={activeAction.loop}
                    onChange={(event) => updateActiveAction({ loop: event.target.checked })}
                  />
                  Loop
                </label>
              </>
            )}
          </div>

          <div className={`bench-grid ${showSpriteTuningControls ? "with-sprite-tuning" : ""}`}>
            <div className="timeline">
              {actionFrames.map((frame, index) => (
                <button
                  key={frame.id}
                  className={`frame-tile ${selectedFrame?.id === frame.id ? "selected" : ""}`}
                  onClick={() => setSelectedFrameId(frame.id)}
                >
                  <span>{index}</span>
                  <img src={frame.dataUrl} alt="" />
                  <small>{frame.width}x{frame.height}</small>
                </button>
              ))}
              <button className="add-frame" onClick={() => void addSelectedAsFrame()} title={copy.addFrame}>
                <Plus size={18} aria-hidden="true" />
              </button>
            </div>

            <div className="frame-tools">
              <button className="icon-button" title={copy.moveFrameLeft} disabled={!selectedFrame} onClick={() => selectedFrame && moveFrame(selectedFrame.id, -1)}>
                <ArrowLeft size={16} aria-hidden="true" />
              </button>
              <button className="icon-button" title={copy.moveFrameRight} disabled={!selectedFrame} onClick={() => selectedFrame && moveFrame(selectedFrame.id, 1)}>
                <ArrowRight size={16} aria-hidden="true" />
              </button>
              <button className="icon-button danger" title={copy.removeFrame} disabled={!selectedFrame} onClick={() => selectedFrame && removeFrame(selectedFrame.id)}>
                <Trash2 size={16} aria-hidden="true" />
              </button>
            </div>

            {SHOW_LOW_PRIORITY_CONTROLS && (
              <>
                <div className="qc-panel">
                  <h3>QC Checks <em>{qc.sizeMismatchCount + qc.duplicateCount}</em></h3>
                  <QcLine ok={qc.sizeMismatchCount === 0} label="Frame Size Consistency" value={qc.sizeMismatchCount ? `${qc.sizeMismatchCount} mismatches` : "All frames match"} />
                  <QcLine ok={qc.transparentFrames === actionFrames.length && actionFrames.length > 0} label="Transparent PNG" value={`${qc.transparentFrames}/${actionFrames.length} frames`} />
                  <QcLine ok={qc.duplicateCount === 0} label="Duplicate Frame Check" value={qc.duplicateCount ? `${qc.duplicateCount} duplicates` : "No duplicates found"} />
                  <QcLine ok={activeAction.anchor.y >= activeAction.cell.height * 0.75} label="Anchor at Feet" value={`${activeAction.anchor.x}, ${activeAction.anchor.y}`} />
                  <button className="secondary-button mini">
                    <RefreshCw size={14} aria-hidden="true" />
                    Re-check
                  </button>
                </div>

                <div className="preview-panel">
                  <h3>Preview (GIF)</h3>
                  <div className="gif-preview">{gifPreviewUrl ? <img src={gifPreviewUrl} alt="" /> : <span>{copy.noFrames}</span>}</div>
                  <small>{activeAction.cell.width}x{activeAction.cell.height} • {activeAction.fps} FPS</small>
                </div>
              </>
            )}

            {!isAnimationWorkflow && (
              <div className="export-panel">
                <h3>{copy.exportSprite}</h3>
                <button onClick={() => void exportSpriteSheet(frames, activeAction)} disabled={actionFrames.length === 0}>
                  <FileImage size={18} aria-hidden="true" />
                  {copy.exportSheetPng}
                </button>
                <button onClick={() => void exportFramesZip(frames, activeAction)} disabled={actionFrames.length === 0}>
                  <FileArchive size={18} aria-hidden="true" />
                  {copy.exportZipFrames}
                </button>
                <button onClick={() => void exportGif(frames, activeAction)} disabled={actionFrames.length === 0}>
                  <Film size={18} aria-hidden="true" />
                  {copy.exportGifLabel}
                </button>
                <button onClick={() => exportMetadata("forest_mage", actions, frames)}>
                  <FileJson size={18} aria-hidden="true" />
                  {copy.exportMetadataJson}
                </button>
              </div>
            )}

            {showSpriteTuningControls && (
              <div className="metadata-panel">
                <h3>{copy.metadata}</h3>
                <label>
                  {copy.anchorX}
                  <input
                    type="number"
                    value={activeAction.anchor.x}
                    onChange={(event) => updateActiveAction({ anchor: { ...activeAction.anchor, x: Number(event.target.value) } })}
                  />
                </label>
                <label>
                  {copy.anchorY}
                  <input
                    type="number"
                    value={activeAction.anchor.y}
                    onChange={(event) => updateActiveAction({ anchor: { ...activeAction.anchor, y: Number(event.target.value) } })}
                  />
                </label>
              </div>
            )}
          </div>
        </section>
        )}
      </main>

      <CodexLogPanel
        logs={codexJobLogs}
        jobs={codexJobs}
        collapsed={codexLogsCollapsed}
        fullscreen={codexLogsFullscreen}
        language={language}
        onToggle={() => setCodexLogsCollapsed((current) => !current)}
        onEnterFullscreen={enterCodexLogsFullscreen}
        onExitFullscreen={() => setCodexLogsFullscreen(false)}
      />

      <footer className="statusbar">
        <span className="live-dot" />
        <span>{status}</span>
        <span className="spacer" />
        <Archive size={15} aria-hidden="true" />
        <span>{copy.localWorkspace}</span>
      </footer>

      {showPromptExamples && (
        <PromptExamplesModal
          language={language}
          onClose={() => setShowPromptExamples(false)}
          onCopy={copyPromptExample}
          onUse={usePromptExample}
        />
      )}
      {showAnimationPresetExamples && (
        <AnimationPresetExamplesModal
          language={language}
          onClose={() => setShowAnimationPresetExamples(false)}
          onUse={useAnimationPresetExample}
        />
      )}
      {showAnimationPackExportModal && (
        <AnimationPackExportModal
          language={language}
          draft={animationPackExportDraft}
          onChange={setAnimationPackExportDraft}
          onClose={() => setShowAnimationPackExportModal(false)}
          onExport={() => void exportSelectedAnimationPack()}
        />
      )}
    </div>
  );

  function canvasPoint(event: React.PointerEvent<HTMLCanvasElement> | React.MouseEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * CANVAS_WIDTH,
      y: ((event.clientY - rect.top) / rect.height) * CANVAS_HEIGHT
    };
  }
}

function PanelTitle({ index, title }: { index: string; title: string }) {
  return (
    <div className="panel-title">
      <strong>{index}. {title}</strong>
    </div>
  );
}

function selectedImageSafeBaseName(item: Pick<HistoryItem, "name">) {
  const baseName = item.name.replace(/\.[^.]+$/, "") || "image-cockpit-result";
  return baseName.replace(/[<>:"/\\|?*\x00-\x1F]+/g, "-");
}

function createAnimationPackExportDraft(overrides: Partial<AnimationPackExportDraft> = {}): AnimationPackExportDraft {
  return {
    title: "",
    tags: "character, sprite",
    license: "user-controlled",
    sourceNote: "",
    promptSummary: "",
    includePromptSummary: false,
    ...overrides
  };
}

function buildSelectedAnimationPackManifest({
  draft,
  selected,
  action,
  grid,
  directions
}: {
  draft: AnimationPackExportDraft;
  selected: HistoryItem;
  action: SpriteAction;
  grid: GridSettings;
  directions: string[];
}): AnimationPackManifest {
  const title = draft.title.trim() || selected.name.replace(/\.[^.]+$/, "") || action.name;
  const resolvedDirections = directions.length > 0 ? directions : ANIMATION_DIRECTIONS;
  return {
    schema: "image-cockpit.animation.v1",
    title,
    kind: "user",
    action: action.name,
    directions: resolvedDirections,
    grid,
    cell: action.cell,
    framesPerDirection: grid.columns,
    playback: action.playbackMode ?? "normal",
    createdAt: new Date().toISOString(),
    createdWith: "Image Cockpit for Codex Workflows",
    license: draft.license.trim(),
    sourceNote: draft.sourceNote.trim(),
    promptSummary: draft.includePromptSummary ? draft.promptSummary.trim() : "",
    tags: parseTagList(draft.tags),
    files: animationPackFileSet(resolvedDirections)
  };
}

function animationPackFileSet(directions: string[] = ANIMATION_DIRECTIONS): AnimationPackManifest["files"] {
  return {
    sheet: "sheet.png",
    previewGif: "preview.gif",
    previewWebp: "preview.webp",
    directionPreviews: directions.map((direction) => ({
      direction,
      gif: `previews/${safeAnimationDirectionFileName(direction)}.gif`,
      webp: `previews/${safeAnimationDirectionFileName(direction)}.webp`
    })),
    metadata: "metadata.json"
  };
}

function animationPackMetadata(
  manifest: AnimationPackManifest,
  details: { libraryKind: AnimationLibraryKind; sourceNote: string }
) {
  return {
    schema: manifest.schema,
    title: manifest.title,
    kind: details.libraryKind,
    action: manifest.action,
    exportedAt: new Date().toISOString(),
    createdWith: manifest.createdWith,
    directions: manifest.directions,
    grid: manifest.grid,
    cell: manifest.cell,
    framesPerDirection: manifest.framesPerDirection,
    playback: manifest.playback ?? "normal",
    tags: manifest.tags ?? [],
    license: manifest.license ?? "",
    sourceNote: details.sourceNote,
    promptSummaryIncluded: Boolean(manifest.promptSummary)
  };
}

function parseTagList(tags: string) {
  return tags
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 20);
}

function buildAnimationManifestPreviewActions(manifest: AnimationPackManifest, frames: SpriteFrame[]) {
  const directions = manifest.directions.length > 0 ? manifest.directions : ANIMATION_DIRECTIONS;
  return directions.map((directionId, index) => {
    const rowStart = index * manifest.framesPerDirection;
    const rowFrames = frames.slice(rowStart, rowStart + manifest.framesPerDirection);
    return {
      directionId,
      action: actionFromAnimationManifest(manifest, rowFrames.map((frame) => frame.id))
    };
  }).filter((preview) => preview.action.frameIds.length > 0);
}

async function createDirectionPreviewBlobs(
  frames: SpriteFrame[],
  previews: Array<{ directionId: string; action: SpriteAction }>
) {
  return Promise.all(
    previews.map(async ({ directionId, action }) => ({
      direction: directionId,
      gif: await createGifBlob(frames, action),
      webp: await createAnimatedWebpBlob(frames, action)
    }))
  );
}

function actionFromAnimationManifest(manifest: AnimationPackManifest, frameIds: string[]): SpriteAction {
  const fallback = defaultActions.find((action) => action.name === manifest.action);
  return {
    name: manifest.action,
    fps: fallback?.fps ?? (manifest.action === "run" ? 20 : 12),
    loop: true,
    playbackMode: manifest.playback === "ping-pong-reverse" ? "ping-pong-reverse" : undefined,
    frameIds,
    cell: manifest.cell,
    anchor: {
      x: Math.round(manifest.cell.width / 2),
      y: Math.round(manifest.cell.height * 0.92)
    }
  };
}

function upsertSpriteAction(actions: SpriteAction[], nextAction: SpriteAction) {
  return actions.some((action) => action.name === nextAction.name)
    ? actions.map((action) => (action.name === nextAction.name ? nextAction : action))
    : [...actions, nextAction];
}

function safeAnimationFileBaseName(title: string, action: string) {
  return `${title || action || "animation"}`
    .replace(/\.[^.]+$/, "")
    .replace(/[<>:"/\\|?*\x00-\x1F]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || "image-cockpit-animation";
}

function safeAnimationDirectionFileName(direction: string) {
  return direction
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "") || "direction";
}

async function resolveImageSourceDataUrl(source: string) {
  if (source.startsWith("data:")) return source;
  const image = await loadImage(source);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, image.naturalWidth || image.width);
  canvas.height = Math.max(1, image.naturalHeight || image.height);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not read animation sheet image.");
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/png");
}

function SectionLabel({ title }: { title: string }) {
  return <h2 className="section-label">{title}</h2>;
}

function LanguageSelect({
  language,
  label,
  onChange
}: {
  language: Language;
  label: string;
  onChange: (language: Language) => void;
}) {
  return (
    <label className="language-control" title={label}>
      <Languages size={15} aria-hidden="true" />
      <span>{label}</span>
      <select aria-label={label} value={language} onChange={(event) => onChange(event.target.value as Language)}>
        {languageOptions.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function CodexJobShelf({
  jobs,
  maxActive,
  language
}: {
  jobs: CodexJobQueueItem[];
  maxActive: number;
  language: Language;
}) {
  const labels = codexJobQueueLabels(language);
  const runningCount = jobs.filter((job) => job.state === "running").length;

  return (
    <section className="codex-job-shelf" aria-label={labels.title}>
      <div className="codex-job-shelf-heading">
        <strong>{labels.title}</strong>
        <span>{labels.activeSlots} {runningCount}/{maxActive}</span>
      </div>
      <div className="codex-job-list">
        {jobs.map((job) => (
          <div className="codex-job-row" key={job.id}>
            <span className={`codex-job-state ${job.state}`}>
              {job.state === "running" ? labels.running : labels.queued}
            </span>
            <strong>{job.label}</strong>
            <small>{job.state === "running" ? job.id : labels.waitingForSlot}</small>
          </div>
        ))}
      </div>
    </section>
  );
}

function CodexLogPanel({
  logs,
  jobs,
  collapsed,
  fullscreen,
  language,
  onToggle,
  onEnterFullscreen,
  onExitFullscreen
}: {
  logs: CodexJobLogItem[];
  jobs: CodexJobQueueItem[];
  collapsed: boolean;
  fullscreen: boolean;
  language: Language;
  onToggle: () => void;
  onEnterFullscreen: () => void;
  onExitFullscreen: () => void;
}) {
  const copy = uiCopy[language];
  const runningCount = jobs.filter((job) => job.state === "running").length;
  const hasContent = logs.length > 0 || jobs.length > 0;
  if (!hasContent) return null;

  const visibleLogs = logs.length > 0
    ? logs
    : jobs.slice(0, CODEX_LOG_HISTORY_LIMIT).map((job) => createCodexJobLogItem(job, undefined, job.state));

  return (
    <section className={`codex-log-panel ${collapsed ? "collapsed" : ""} ${fullscreen ? "fullscreen" : ""}`} aria-label={copy.codexLogTitle}>
      <div className="codex-log-header">
        <span>
          <Terminal size={15} aria-hidden="true" />
          <strong>{copy.codexLogTitle}</strong>
          <small>{copy.codexLogLive}</small>
        </span>
        <span className="codex-log-meta">
          <em>{runningCount}/{MAX_ACTIVE_CODEX_JOBS}</em>
          <button
            className="secondary-button mini icon-button codex-log-fullscreen-button"
            onClick={fullscreen ? onExitFullscreen : onEnterFullscreen}
            aria-label={fullscreen ? copy.codexLogExitFullscreen : copy.codexLogFullscreen}
            title={fullscreen ? copy.codexLogExitFullscreen : copy.codexLogFullscreen}
          >
            {fullscreen ? <Minimize2 size={15} aria-hidden="true" /> : <Maximize2 size={15} aria-hidden="true" />}
          </button>
          <button className="secondary-button mini" onClick={onToggle}>
            {collapsed ? copy.codexLogExpand : copy.codexLogCollapse}
          </button>
        </span>
      </div>
      {!collapsed && (
        <div className="codex-log-list">
          {visibleLogs.map((log) => (
            <article className={`codex-log-card state-${log.state}`} key={log.jobId}>
              <div className="codex-log-card-heading">
                <span className={`codex-job-state ${log.state === "queued" ? "queued" : "running"}`}>
                  {log.state}
                </span>
                <strong>{log.label}</strong>
                <small>{log.jobId}</small>
              </div>
              <div className="codex-log-card-meta">
                <span>{copy.codexLogElapsed}: {formatDurationSince(log.createdAt)}</span>
                <span>{copy.codexLogUpdated}: {log.modifiedAt ? formatTime(log.modifiedAt) : "-"}</span>
                {log.truncated && <span>{copy.codexLogTruncated}</span>}
              </div>
              <pre>{log.error || log.text || (log.exists ? copy.codexLogNoOutput : copy.codexLogWaiting)}</pre>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function CodexFailureCard({
  notice,
  language
}: {
  notice: CodexFailureNotice;
  language: Language;
}) {
  const copy = uiCopy[language];
  const failure = codexFailureDisplay(notice.diagnostic.kind, copy);
  return (
    <article className={`codex-failure-card ${notice.diagnostic.kind}`}>
      <div className="codex-failure-icon">
        <AlertTriangle size={17} aria-hidden="true" />
      </div>
      <span>
        <strong>{failure.title}</strong>
        <small>{formatTime(notice.createdAt)} • {notice.jobId}</small>
        <small>{notice.label}</small>
        <em>{failure.message}</em>
        <small>{copy.codexFailureRetryHint}: {failure.suggestion}</small>
      </span>
    </article>
  );
}

function codexFailureDisplay(kind: CodexFailureKind, copy: Record<string, string>) {
  if (kind === "policy_or_safety") {
    return {
      title: copy.codexFailureTitle,
      message: copy.codexFailurePolicyMessage,
      suggestion: copy.codexFailurePolicySuggestion
    };
  }
  if (kind === "imagegen_unavailable") {
    return {
      title: copy.codexFailureImagegenUnavailableTitle,
      message: copy.codexFailureImagegenUnavailableMessage,
      suggestion: copy.codexFailureImagegenUnavailableSuggestion
    };
  }
  if (kind === "runner_failed") {
    return {
      title: copy.codexFailureRunnerFailedTitle,
      message: copy.codexFailureRunnerFailedMessage,
      suggestion: copy.codexFailureRunnerFailedSuggestion
    };
  }
  if (kind === "no_image_returned") {
    return {
      title: copy.codexFailureNoImageTitle,
      message: copy.codexFailureNoImageMessage,
      suggestion: copy.codexFailureNoImageSuggestion
    };
  }
  return {
    title: copy.codexFailureTitle,
    message: copy.codexFailureUnknownMessage,
    suggestion: copy.codexFailureUnknownSuggestion
  };
}

function PrimaryActionIcon({ providerId, isBusy }: { providerId: ProviderId; isBusy: boolean }) {
  if (isBusy) return <Loader2 className="spin" size={17} aria-hidden="true" />;
  if (providerId === "local-file") return <Upload size={17} aria-hidden="true" />;
  if (providerId === "local-inbox") return <Archive size={17} aria-hidden="true" />;
  return <ImagePlus size={17} aria-hidden="true" />;
}

function primaryActionLabel(
  providerId: ProviderId,
  workflowMode: WorkflowMode | null,
  copy: Record<string, string>,
  isWaitingForCodexResult = false
) {
  if (providerId === "local-generator" && workflowMode === "sprite-generate") return copy.generateLocalSprite;
  if (providerId === "local-generator") return copy.generateLocalImage;
  if (providerId === "codex-handoff" && isWaitingForCodexResult) return copy.waitingForCodexResult;
  if (providerId === "codex-handoff" && workflowMode === "image-generate") return copy.generateLocalImage;
  if (providerId === "codex-handoff" && workflowMode === "image-edit") return copy.editImage;
  if (providerId === "codex-handoff") return copy.createCodexJob;
  if (providerId === "local-inbox") return copy.importLatest;
  return copy.importFile;
}

function codexJobQueueLabels(language: Language) {
  return codexJobQueueCopy[language];
}

const codexJobQueueCopyBase = {
  title: "Codex Jobs",
  activeSlots: "Active",
  running: "Running",
  queued: "Queued",
  waitingForSlot: "Waiting for an open slot",
  queueAction: "Queue Codex Job",
  queuedStatus: "Codex job queued"
};

const codexJobQueueCopy = {
  en: {
    title: "Codex Jobs",
    activeSlots: "Active",
    running: "Running",
    queued: "Queued",
    waitingForSlot: "Waiting for an open slot",
    queueAction: "Queue Codex Job",
    queuedStatus: "Codex job queued"
  },
  ja: {
    title: "Codexジョブ",
    activeSlots: "実行枠",
    running: "実行中",
    queued: "待機中",
    waitingForSlot: "空き枠待ち",
    queueAction: "キューに追加",
    queuedStatus: "Codexキューに追加しました"
  },
  "zh-CN": withCodexJobQueueCopy({ title: "Codex 作业", activeSlots: "执行槽", running: "运行中", queued: "排队中", waitingForSlot: "等待空槽", queueAction: "加入队列", queuedStatus: "Codex 作业已排队" }),
  "zh-TW": withCodexJobQueueCopy({ title: "Codex 作業", activeSlots: "執行槽", running: "執行中", queued: "排隊中", waitingForSlot: "等待空位", queueAction: "加入佇列", queuedStatus: "Codex 作業已加入佇列" }),
  ko: withCodexJobQueueCopy({ title: "Codex 작업", activeSlots: "실행 슬롯", running: "실행 중", queued: "대기 중", waitingForSlot: "빈 슬롯 대기", queueAction: "대기열에 추가", queuedStatus: "Codex 작업을 대기열에 추가했습니다" }),
  ru: withCodexJobQueueCopy({ title: "Задания Codex", activeSlots: "Слоты", running: "Выполняется", queued: "В очереди", waitingForSlot: "Ожидание свободного слота", queueAction: "Поставить в очередь", queuedStatus: "Задание Codex в очереди" }),
  es: withCodexJobQueueCopy({ title: "Trabajos Codex", activeSlots: "Activos", running: "En ejecución", queued: "En cola", waitingForSlot: "Esperando un hueco", queueAction: "Poner en cola", queuedStatus: "Trabajo Codex en cola" }),
  "pt-BR": withCodexJobQueueCopy({ title: "Jobs Codex", activeSlots: "Ativos", running: "Executando", queued: "Na fila", waitingForSlot: "Aguardando vaga", queueAction: "Adicionar à fila", queuedStatus: "Job Codex na fila" }),
  de: withCodexJobQueueCopy({ title: "Codex-Jobs", activeSlots: "Aktiv", running: "Läuft", queued: "Wartet", waitingForSlot: "Warten auf freien Slot", queueAction: "Job einreihen", queuedStatus: "Codex-Job eingereiht" }),
  fr: withCodexJobQueueCopy({ title: "Tâches Codex", activeSlots: "Actives", running: "En cours", queued: "En file", waitingForSlot: "En attente d'un créneau", queueAction: "Mettre en file", queuedStatus: "Tâche Codex en file" }),
  id: withCodexJobQueueCopy({ title: "Job Codex", activeSlots: "Aktif", running: "Berjalan", queued: "Antre", waitingForSlot: "Menunggu slot kosong", queueAction: "Masukkan antrean", queuedStatus: "Job Codex masuk antrean" }),
  tr: withCodexJobQueueCopy({ title: "Codex işleri", activeSlots: "Aktif", running: "Çalışıyor", queued: "Sırada", waitingForSlot: "Boş slot bekleniyor", queueAction: "Sıraya ekle", queuedStatus: "Codex işi sıraya eklendi" }),
  vi: withCodexJobQueueCopy({ title: "Job Codex", activeSlots: "Đang chạy", running: "Đang chạy", queued: "Đang chờ", waitingForSlot: "Chờ ô trống", queueAction: "Thêm vào hàng chờ", queuedStatus: "Job Codex đã vào hàng chờ" }),
  pl: withCodexJobQueueCopy({ title: "Zadania Codex", activeSlots: "Aktywne", running: "Działa", queued: "W kolejce", waitingForSlot: "Czeka na slot", queueAction: "Dodaj do kolejki", queuedStatus: "Zadanie Codex w kolejce" }),
  it: withCodexJobQueueCopy({ title: "Job Codex", activeSlots: "Attivi", running: "In esecuzione", queued: "In coda", waitingForSlot: "In attesa di uno slot", queueAction: "Metti in coda", queuedStatus: "Job Codex in coda" })
} satisfies Record<Language, typeof codexJobQueueCopyBase>;

function withCodexJobQueueCopy(overrides: Partial<typeof codexJobQueueCopyBase>) {
  return { ...codexJobQueueCopyBase, ...overrides };
}

function codexJobLabel(mode: WorkflowMode | null, prompt: string, actionName?: string) {
  const shortPrompt = prompt.trim().replace(/\s+/g, " ").slice(0, 54);
  if (mode === "sprite-generate") return `Animation: ${actionName ?? "motion"}${shortPrompt ? ` / ${shortPrompt}` : ""}`;
  if (mode === "image-generate") return shortPrompt ? `Pixel Art: ${shortPrompt}` : "Pixel Art Generation";
  if (mode === "image-edit") return shortPrompt ? `Image Edit: ${shortPrompt}` : "Image Edit";
  if (mode === "sprite-edit") return shortPrompt ? `Sprite Edit: ${shortPrompt}` : "Sprite Edit";
  return shortPrompt || "Codex Job";
}

function buildImageEditCodexPrompt({
  prompt,
  sourceName,
  annotations
}: {
  prompt: string;
  sourceName: string;
  annotations: Annotation[];
}) {
  const basePrompt = prompt.trim() || "Edit the selected image according to the numbered region comments.";
  const regionLines = annotations.length > 0
    ? annotations.map(formatAnnotationInstruction).join("\n")
    : "- No numbered regions were selected. Apply only the general edit prompt and job notes.";

  return [
    basePrompt,
    "",
    `Source image: ${sourceName || "selected image asset"}.`,
    "Use the selected source image as the edit base.",
    "Apply only the requested edits while preserving the rest of the image.",
    "Return the edited image as a real PNG or WebP with the job id filename prefix.",
    "",
    "Numbered edit regions:",
    regionLines
  ].join("\n");
}

function buildImageEditCodexNotes({
  userNotes,
  annotations
}: {
  userNotes: string;
  annotations: Annotation[];
}) {
  const regionNotes = annotations.length > 0
    ? annotations.map(formatAnnotationInstruction).join("\n")
    : "- No numbered regions were selected.";
  return [
    userNotes.trim(),
    "",
    "Image edit region comments:",
    regionNotes,
    "",
    "Keep unrelated pixels unchanged when possible. Do not add labels, watermarks, or UI text unless a region comment explicitly asks for text."
  ]
    .filter((line, index) => index > 0 || line.length > 0)
    .join("\n")
    .trim();
}

function formatAnnotationInstruction(annotation: Annotation) {
  const rect = annotationRect(annotation);
  const number = annotation.number ?? 0;
  const comment = annotation.comment?.trim() || "(no comment yet)";
  return `- #${number}: ${comment} [canvas rect x=${Math.round(rect.x)}, y=${Math.round(rect.y)}, w=${Math.round(rect.width)}, h=${Math.round(rect.height)}]`;
}

function annotationRect(annotation: Annotation) {
  const [start, end = start] = annotation.points;
  const x = Math.min(start.x, end.x);
  const y = Math.min(start.y, end.y);
  const width = Math.abs(end.x - start.x);
  const height = Math.abs(end.y - start.y);
  return { x, y, width, height };
}

function renumberAnnotations(annotations: Annotation[]) {
  return annotations.map((annotation, index) => ({ ...annotation, number: index + 1 }));
}

function buildAnimationDirectionPreviewActions(action: SpriteAction, actionFrames: SpriteFrame[]) {
  const directionCount =
    actionFrames.length >= ANIMATION_FRAME_COUNT * ANIMATION_DIRECTION_COUNT
      ? ANIMATION_DIRECTION_COUNT
      : Math.max(1, Math.ceil(actionFrames.length / ANIMATION_FRAME_COUNT));

  return Array.from({ length: directionCount }, (_, index) => {
    const directionId = ANIMATION_DIRECTIONS[index] ?? `direction-${index + 1}`;
    const rowFrames = actionFrames.slice(index * ANIMATION_FRAME_COUNT, (index + 1) * ANIMATION_FRAME_COUNT);
    return {
      directionId,
      action: {
        ...action,
        name: `${action.name}_${directionId.replace(/\s+/g, "-")}`,
        frameIds: rowFrames.map((frame) => frame.id)
      }
    };
  }).filter((preview) => preview.action.frameIds.length > 0);
}

function buildHatchPetStatePreviewActions(action: SpriteAction, actionFrames: SpriteFrame[]) {
  return HATCH_PET_STATE_ROWS.map((state, rowIndex) => {
    const rowStart = rowIndex * HATCH_PET_GRID.columns;
    const rowFrames = actionFrames.slice(rowStart, rowStart + state.frames);
    return {
      directionId: state.id,
      action: {
        ...action,
        name: `${action.name}_${state.id}`,
        fps: state.id === "idle" || state.id === "waiting" || state.id === "review" ? 6 : 8,
        frameIds: rowFrames.map((frame) => frame.id)
      }
    };
  }).filter((preview) => preview.action.frameIds.length > 0);
}

function buildDirectionalHatchPetPreviewActions(action: SpriteAction, actionFrames: SpriteFrame[]) {
  const framesPerDirection = HATCH_PET_GRID.columns * HATCH_PET_GRID.rows;
  return ANIMATION_DIRECTIONS.map((directionId, directionIndex) => {
    const directionStart = directionIndex * framesPerDirection;
    const stateStart = directionStart;
    const rowFrames = actionFrames.slice(stateStart, stateStart + DIRECTIONAL_HATCH_PET_PRIMARY_STATE.frames);
    return {
      directionId,
      action: {
        ...action,
        name: `${action.name}_${directionId.replace(/\s+/g, "-")}_${DIRECTIONAL_HATCH_PET_PRIMARY_STATE.id}`,
        fps: 6,
        frameIds: rowFrames.map((frame) => frame.id)
      }
    };
  }).filter((preview) => preview.action.frameIds.length > 0);
}

function animationDirectionLabel(directionId: string, language: Language) {
  const labels = uiCopy[language] as Record<string, string>;
  if (directionId === "front") return labels.previewFront;
  if (directionId === "back") return labels.previewBack;
  if (directionId === "back three-quarter") return labels.previewBackThreeQuarter;
  if (directionId === "front three-quarter") return labels.previewFrontThreeQuarter;
  if (directionId === "side") return labels.previewSide;
  return directionId;
}

function isAnimationSource(item?: HistoryItem): item is HistoryItem {
  return Boolean(item && item.source !== "sample");
}

async function chooseAnimationChromaKey(sourceDataUrl: string) {
  const character = await createTransparentAnimationSource(sourceDataUrl);
  const context = character.getContext("2d", { willReadFrequently: true });
  if (!context) {
    return { key: animationChromaKeys.green, reason: "Could not inspect source colors; defaulted to green." };
  }

  const imageData = context.getImageData(0, 0, character.width, character.height);
  const data = imageData.data;
  let opaque = 0;
  let greenPixels = 0;

  for (let offset = 0; offset < data.length; offset += 4) {
    if (data[offset + 3] <= 24) continue;
    opaque += 1;
    if (isCharacterGreenPixel(data, offset)) greenPixels += 1;
  }

  const ratio = opaque > 0 ? greenPixels / opaque : 0;
  if (greenPixels >= 160 && ratio >= 0.008) {
    return {
      key: animationChromaKeys.magenta,
      reason: `Detected green in the extracted character (${Math.round(ratio * 1000) / 10}% of opaque pixels), so magenta was selected.`
    };
  }

  return {
    key: animationChromaKeys.green,
    reason: "No meaningful green was detected in the extracted character, so green was selected."
  };
}

function buildAnimationCodexPrompt({
  sourceName,
  motionPrompt,
  actionName,
  chromaKey,
  cell
}: {
  sourceName: string;
  motionPrompt: string;
  actionName: string;
  chromaKey: AnimationChromaKey;
  cell: SpriteAction["cell"];
}) {
  const motion = motionPrompt.trim() || actionName;
  return [
    "このキャラクターをデフォルメして、方向別アニメーション素材として画像生成してほしい。",
    `Use the uploaded source image "${sourceName}" as the character reference.`,
    `Extract only the single character and create a direction-split pixel-art animation set of that same character ${motion}.`,
    "Do not return one combined 5x8 sheet for the standard animation workflow. Return five separate direction images, and Image Cockpit will compose the final 5x8 sheet after import.",
    `Each direction image must be exactly ${cell.width * DIRECTION_SPLIT_ANIMATION_GRID.columns}x${cell.height * DIRECTION_SPLIT_ANIMATION_GRID.rows}px: ${DIRECTION_SPLIT_ANIMATION_GRID.columns} columns x ${DIRECTION_SPLIT_ANIMATION_GRID.rows} rows, no gutters, no extra outer margin, exactly ${ANIMATION_FRAME_COUNT} cells.`,
    `Required directions and file suffixes: ${ANIMATION_DIRECTIONS.map((direction, index) => `${direction}=${DIRECTION_SPLIT_ANIMATION_FILE_SLUGS[index]}`).join(", ")}.`,
    `Each cell must be exactly ${cell.width}x${cell.height} pixels. Fill frames left-to-right on row 1, then left-to-right on row 2.`,
    "Every cell must contain exactly one full-body character, centered inside that cell, with the entire head, hair, hands, weapon, clothing, and both feet visible.",
    "Keep at least 10% empty chroma-key padding inside every cell above the head, below the feet, and on both sides.",
    "The character center and foot baseline must stay aligned across all eight frames in the same direction image; do not drift left, right, up, or down between frames.",
    "Do not crop the head, feet, hair, weapon, or effects. Do not let body parts cross cell borders. Do not place heads or body fragments under the feet.",
    "Use consistent character scale, baseline, foot contact point, silhouette size, palette, outfit, and pixel density across all direction images.",
    `Prefer a transparent background in every cell. If true transparency is not available during generation, use a flat ${chromaKey.label} background (${chromaKey.hex}) in every cell; do not use black, white, gradients, scenery, shadows, UI, text, logos, watermarks, letters, or numbers.`,
    "If you add a temporary guide grid, use a temporary 1-pixel pure cyan #00FFFF guide grid only on the exact 4x2 cell boundaries for each direction image; no labels, numbers, text, UI, or decorative borders.",
    "Quality gate before returning: inspect all 40 cells and regenerate if any cell is cropped, has missing feet, has a cut-off head, contains multiple heads, has a head below the feet, has a different character, or uses a non-flat background.",
    `Return exactly these direction files using the real job id prefix: ${directionSplitAnimationFileSet("<job-id>").join(", ")}.`,
    `Also return <job-id>-manifest.json with schema "${DIRECTION_SPLIT_ANIMATION_SCHEMA}".`
  ].join(" ");
}

function buildAnimationCodexNotes({
  userNotes,
  chromaKey,
  chromaReason,
  grid,
  cell
}: {
  userNotes: string;
  chromaKey: AnimationChromaKey;
  chromaReason: string;
  grid: GridSettings;
  cell: SpriteAction["cell"];
}) {
  return [
    userNotes.trim(),
    `Animation sprite workflow: generate five source-image-driven direction images through Codex imagegen / built-in image_gen, then Image Cockpit will remove the ${chromaKey.label} background and compose the final sheet.`,
    `Chroma key decision: ${chromaKey.name} ${chromaKey.hex}. ${chromaReason}`,
    `Final app sheet layout after import: ${grid.columns} columns x ${grid.rows} rows, ${cell.width}x${cell.height} per cell.`,
    `Raw returned direction layout: ${DIRECTION_SPLIT_ANIMATION_GRID.columns} columns x ${DIRECTION_SPLIT_ANIMATION_GRID.rows} rows per direction image, ${cell.width}x${cell.height} per cell.`,
    `Required direction files: ${directionSplitAnimationFileSet("<job-id>").join(", ")}.`,
    `Manifest schema: ${DIRECTION_SPLIT_ANIMATION_SCHEMA}; include directions, files, grid, cell, and framesPerDirection=${ANIMATION_FRAME_COUNT}.`,
    "Cell QA is mandatory: one full-body character per cell, consistent baseline and scale, 10% inner padding, no cropping, no duplicated heads, no body fragments under feet, no character parts crossing cell borders.",
    "The generated sheet should keep the chroma key background simple and flat so the app can remove it reliably.",
    "Temporary guide grid: pure cyan #00FFFF on exact 4x2 direction-image cell boundaries only. Image Cockpit removes those guide pixels before slicing/export."
  ].filter(Boolean).join("\n");
}

function buildHatchPetCodexPrompt({
  sourceName,
  motionPrompt,
  chromaKey
}: {
  sourceName: string;
  motionPrompt: string;
  chromaKey: AnimationChromaKey;
}) {
  const concept = motionPrompt.trim() || "make this uploaded character into a compact Codex pet with calm idle, movement, waiting, working, failed, and review states";
  return [
    `Use the uploaded source image "${sourceName}" as the canonical character reference.`,
    "Try the installed hatch-pet workflow for a Codex-compatible custom pet atlas.",
    "If the hatch-pet skill is available, use its deterministic scripts for run preparation, atlas geometry, validation, contact sheet, and preview generation.",
    "Use Codex imagegen / built-in image_gen only through the hatch-pet or imagegen workflow for visual generation; do not call external APIs directly.",
    `Pet concept and motion guidance: ${concept}.`,
    "Create the same character across the full Codex pet state contract: idle, running-right, running-left, waving, jumping, failed, waiting, running, review.",
    `Final atlas must be 8 columns x 9 rows, 1536x1872 pixels total, ${HATCH_PET_CELL.width}x${HATCH_PET_CELL.height} per cell, transparent background, transparent unused cells.`,
    `Use ${chromaKey.label} (${chromaKey.hex}) only as a temporary removable row-generation background when needed; the final atlas should be transparent.`,
    "Keep a canonical base identity first, then generate each row from that identity so face, body shape, palette, outfit, prop design, and pixel density stay consistent.",
    "Avoid text, logos, UI, scenery, shadows, speed lines, detached effects, cropped parts, repeated guide marks, white backgrounds, black backgrounds, and nontransparent residue.",
    "Before returning, inspect the contact sheet and row previews. Reject identity drift, cropped bodies, missing feet, wrong state semantics, static idle, and size popping.",
    "Return the final spritesheet PNG or WebP to the outbox using the job id filename prefix. If pet.json is produced, return it as a sidecar too."
  ].join(" ");
}

function buildHatchPetCodexNotes({
  userNotes,
  chromaKey,
  chromaReason
}: {
  userNotes: string;
  chromaKey: AnimationChromaKey;
  chromaReason: string;
}) {
  return [
    userNotes.trim(),
    "Experimental hatch-pet sprite workflow: create a Codex pet atlas from the selected source image, using the local hatch-pet skill/scripts when available.",
    "Reference process: first lock a canonical base identity, then generate row strips, validate frames, compose the atlas, and visually QA the contact sheet/previews.",
    `Expected atlas: ${HATCH_PET_GRID.columns} columns x ${HATCH_PET_GRID.rows} rows, ${HATCH_PET_CELL.width}x${HATCH_PET_CELL.height} per cell, 1536x1872 total.`,
    `Rows and intended frame counts: ${HATCH_PET_STATE_ROWS.map((row) => `${row.id}=${row.frames}`).join(", ")}.`,
    `Temporary chroma-key decision: ${chromaKey.name} ${chromaKey.hex}. ${chromaReason}`,
    "Final output should be transparent PNG/WebP, with unused cells fully transparent and no hidden colored residue.",
    "Return at least the final spritesheet image to the outbox with the job id filename prefix; include pet.json as a sidecar when available."
  ].filter(Boolean).join("\n");
}

function buildDirectionalHatchPetCodexPrompt({
  sourceName,
  motionPrompt,
  chromaKey
}: {
  sourceName: string;
  motionPrompt: string;
  chromaKey: AnimationChromaKey;
}) {
  const concept = motionPrompt.trim() || "make this uploaded character into a five-direction Codex pet atlas set with clear idle-ready movement";
  return [
    `Use the uploaded source image "${sourceName}" as the canonical character reference.`,
    "Create a 5-direction hatch-pet set: one separate Codex pet atlas for each direction.",
    `Required directions and filename suffixes: ${ANIMATION_DIRECTIONS.map((direction, index) => `direction-${String(index + 1).padStart(2, "0")}-${direction.replace(/\s+/g, "-")}`).join(", ")}.`,
    "For each direction, try the installed hatch-pet workflow/scripts when available: canonical identity lock, row-strip generation, atlas composition, validation, contact sheet, and preview generation.",
    "Do not return only one giant combined sheet. Return five final spritesheet PNG/WebP files, each using the job id filename prefix plus its direction suffix.",
    `Pet concept and motion guidance: ${concept}.`,
    "Each direction atlas must contain the same Codex pet state contract: idle, running-right, running-left, waving, jumping, failed, waiting, running, review.",
    `Each atlas must be 8 columns x 9 rows, 1536x1872 pixels total, ${HATCH_PET_CELL.width}x${HATCH_PET_CELL.height} per cell, transparent background, transparent unused cells.`,
    `Use ${chromaKey.label} (${chromaKey.hex}) only as a temporary removable row-generation background when needed; final atlases should be transparent.`,
    "Keep identity consistent across all five directions: face, body shape, palette, outfit, prop design, outline thickness, and pixel density must match.",
    "Avoid text, logos, UI, scenery, shadows, speed lines, detached effects, cropped parts, repeated guide marks, white backgrounds, black backgrounds, and nontransparent residue.",
    "Before returning, inspect all five contact sheets and row previews. Reject direction drift, identity drift, cropped bodies, missing feet, wrong state semantics, static idle, and size popping."
  ].join(" ");
}

function buildDirectionalHatchPetCodexNotes({
  userNotes,
  chromaKey,
  chromaReason
}: {
  userNotes: string;
  chromaKey: AnimationChromaKey;
  chromaReason: string;
}) {
  return [
    userNotes.trim(),
    "Directional hatch-pet workflow: create five separate hatch-pet atlases from the selected source image, one per direction, instead of a single 5-direction game sheet.",
    `Required direction order: ${ANIMATION_DIRECTIONS.join(", ")}.`,
    `Each returned atlas: ${HATCH_PET_GRID.columns} columns x ${HATCH_PET_GRID.rows} rows, ${HATCH_PET_CELL.width}x${HATCH_PET_CELL.height} per cell, 1536x1872 total.`,
    `Rows and intended frame counts per atlas: ${HATCH_PET_STATE_ROWS.map((row) => `${row.id}=${row.frames}`).join(", ")}.`,
    `The app will combine those five images into an internal ${DIRECTIONAL_HATCH_PET_GRID.columns} x ${DIRECTIONAL_HATCH_PET_GRID.rows} atlas for preview/export after import.`,
    `Temporary chroma-key decision: ${chromaKey.name} ${chromaKey.hex}. ${chromaReason}`,
    "Final outputs should be transparent PNG/WebP files, with unused cells fully transparent and no hidden colored residue.",
    "Return exactly five final spritesheet images to the outbox with the job id filename prefix and direction suffixes; include pet.json sidecars only as optional extras."
  ].filter(Boolean).join("\n");
}

async function createTransparentSpriteSheetDataUrl(dataUrl: string, chromaKey: AnimationChromaKey) {
  const image = await loadImage(dataUrl);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, image.naturalWidth || image.width);
  canvas.height = Math.max(1, image.naturalHeight || image.height);
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Could not create transparent sprite sheet canvas.");
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  removeConnectedBackground(context, canvas.width, canvas.height);
  removeChromaKeyPixels(context, canvas.width, canvas.height, chromaKey);
  removeAnimationGuideGridPixels(context, canvas.width, canvas.height);
  return canvas.toDataURL("image/png");
}

async function composeDirectionSplitAnimationSheet(
  importedResults: CodexOutboxImportResponse[],
  chromaKey: AnimationChromaKey,
  cell: SpriteAction["cell"]
) {
  const preparedCells: DirectionSplitPreparedCell[] = [];
  const warnings: string[] = [];
  const failures: string[] = [];
  const expectedWidth = cell.width * DIRECTION_SPLIT_ANIMATION_GRID.columns;
  const expectedHeight = cell.height * DIRECTION_SPLIT_ANIMATION_GRID.rows;

  for (let directionIndex = 0; directionIndex < DIRECTION_SPLIT_ANIMATION_RESULT_COUNT; directionIndex += 1) {
    const result = importedResults[directionIndex];
    const direction = ANIMATION_DIRECTIONS[directionIndex];
    if (!result) {
      failures.push(`${direction}: missing direction image`);
      continue;
    }

    const transparentDataUrl = await createTransparentSpriteSheetDataUrl(result.dataUrl, chromaKey);
    const image = await loadImage(transparentDataUrl);
    if (image.width !== expectedWidth || image.height !== expectedHeight) {
      failures.push(`${direction}: expected ${expectedWidth}x${expectedHeight}, got ${image.width}x${image.height}`);
    }

    const cells = calculateGridCells(image.width, image.height, DIRECTION_SPLIT_ANIMATION_GRID);
    const canvas = document.createElement("canvas");
    canvas.width = cell.width;
    canvas.height = cell.height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) {
      failures.push(`${direction}: could not create direction cell canvas`);
      continue;
    }
    context.imageSmoothingEnabled = false;

    cells.slice(0, ANIMATION_FRAME_COUNT).forEach((gridCell) => {
      context.clearRect(0, 0, cell.width, cell.height);
      context.drawImage(image, gridCell.x, gridCell.y, gridCell.width, gridCell.height, 0, 0, cell.width, cell.height);
      preparedCells.push(prepareDirectionSplitCell(canvas, direction, directionIndex, gridCell.index, chromaKey.name));
    });
  }

  const normalizedCells = normalizeDirectionSplitCells(preparedCells, cell);
  const qa = validateDirectionSplitAnimationCells(normalizedCells, cell);
  warnings.push(...normalizedCells.flatMap((frame) => frame.warnings), ...qa.warnings);
  failures.push(...normalizedCells.flatMap((frame) => frame.failures), ...qa.failures);

  if (failures.length > 0) {
    throw new Error(`Direction split QA failed: ${failures.slice(0, 10).join("; ")}`);
  }

  const canvas = document.createElement("canvas");
  canvas.width = cell.width * ANIMATION_FRAME_COUNT;
  canvas.height = cell.height * ANIMATION_DIRECTION_COUNT;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not compose direction split animation sheet.");
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingEnabled = false;

  normalizedCells.forEach((frame) => {
    context.drawImage(frame.canvas, frame.frameIndex * cell.width, frame.directionIndex * cell.height);
  });

  return {
    dataUrl: canvas.toDataURL("image/png"),
    warnings
  };
}

function prepareDirectionSplitCell(
  canvas: HTMLCanvasElement,
  direction: string,
  directionIndex: number,
  frameIndex: number,
  residueChromaKey: FrameResidueChromaKey
): DirectionSplitPreparedCell {
  const width = canvas.width;
  const height = canvas.height;
  const sourceContext = canvas.getContext("2d", { willReadFrequently: true });
  const sourceCanvas = document.createElement("canvas");
  sourceCanvas.width = width;
  sourceCanvas.height = height;
  const copyContext = sourceCanvas.getContext("2d", { willReadFrequently: true });
  const failures: string[] = [];
  const warnings: string[] = [];
  const label = directionSplitCellLabel(direction, frameIndex);

  if (!sourceContext || !copyContext) {
    return { direction, directionIndex, frameIndex, sourceCanvas, bounds: null, warnings, failures: [`${label}: could not inspect pixels`] };
  }

  const imageData = sourceContext.getImageData(0, 0, width, height);
  removeFrameEdgeResiduePixels(imageData, width, height, residueChromaKey);
  const { labels, components } = labelOpaqueComponents(imageData, width, height, residueChromaKey);
  const primary = selectPrimaryOpaqueComponent(components, width, height);
  if (!primary || primary.count < 64) {
    copyContext.putImageData(imageData, 0, 0);
    return { direction, directionIndex, frameIndex, sourceCanvas, bounds: null, warnings, failures: [`${label}: no primary character component found`] };
  }

  const keepComponents = new Uint8Array(components.length);
  components.forEach((component) => {
    if (component.id === primary.id) {
      keepComponents[component.id] = 1;
      return;
    }
    if (isLikelyFrameGarbageComponent(component, primary, width, height)) return;

    const distance = Math.round(componentCenterDistance(component, primary));
    if (distance > DIRECTION_SPLIT_DETACHED_FAIL_DISTANCE) {
      failures.push(`${label}: detached component ${distance}px from body`);
    } else if (distance > DIRECTION_SPLIT_DETACHED_WARN_DISTANCE) {
      warnings.push(`${label}: detached component ${distance}px from body`);
    }

    if (shouldKeepFrameComponent(component, primary, width, height)) keepComponents[component.id] = 1;
  });

  const cleaned = new ImageData(new Uint8ClampedArray(imageData.data), width, height);
  const data = cleaned.data;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      const offset = index * 4;
      const componentId = labels[index];
      if (data[offset + 3] <= FRAME_ALPHA_THRESHOLD || componentId < 0 || keepComponents[componentId] !== 1) {
        data[offset + 3] = 0;
      }
    }
  }

  const bounds = findOpaqueBounds(cleaned, width, height);
  if (!bounds || bounds.count < 64) failures.push(`${label}: no character pixels remained after cleanup`);
  copyContext.putImageData(cleaned, 0, 0);
  return { direction, directionIndex, frameIndex, sourceCanvas, bounds, warnings, failures };
}

function normalizeDirectionSplitCells(preparedCells: DirectionSplitPreparedCell[], cell: SpriteAction["cell"]): DirectionSplitNormalizedCell[] {
  const validHeights = preparedCells
    .map((frame) => frame.bounds ? frame.bounds.maxY - frame.bounds.minY + 1 : 0)
    .filter((height) => height > 0);
  const targetHeight = clampNumber(
    Math.round(medianNumber(validHeights) || cell.height * 0.72),
    Math.round(cell.height * 0.45),
    Math.round(cell.height * 0.86)
  );
  const targetFootY = Math.round(cell.height * 0.9);

  return preparedCells.map((frame) => {
    const canvas = document.createElement("canvas");
    canvas.width = cell.width;
    canvas.height = cell.height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context || !frame.bounds) {
      return { ...frame, canvas, bounds: null };
    }

    const cropWidth = frame.bounds.maxX - frame.bounds.minX + 1;
    const cropHeight = frame.bounds.maxY - frame.bounds.minY + 1;
    const scale = Math.min(
      targetHeight / Math.max(1, cropHeight),
      (cell.width * 0.86) / Math.max(1, cropWidth),
      (cell.height * 0.86) / Math.max(1, cropHeight)
    );
    const targetWidth = Math.max(1, Math.round(cropWidth * scale));
    const normalizedHeight = Math.max(1, Math.round(cropHeight * scale));
    const targetX = clampNumber(Math.round(cell.width / 2 - targetWidth / 2), 0, Math.max(0, cell.width - targetWidth));
    const targetY = clampNumber(targetFootY - normalizedHeight, 0, Math.max(0, cell.height - normalizedHeight));

    context.clearRect(0, 0, cell.width, cell.height);
    context.imageSmoothingEnabled = false;
    context.drawImage(
      frame.sourceCanvas,
      frame.bounds.minX,
      frame.bounds.minY,
      cropWidth,
      cropHeight,
      targetX,
      targetY,
      targetWidth,
      normalizedHeight
    );

    const imageData = context.getImageData(0, 0, cell.width, cell.height);
    const bounds = findOpaqueBounds(imageData, cell.width, cell.height);
    return { ...frame, canvas, bounds };
  });
}

function validateDirectionSplitAnimationCells(cells: DirectionSplitNormalizedCell[], cell: SpriteAction["cell"]) {
  const warnings: string[] = [];
  const failures: string[] = [];

  ANIMATION_DIRECTIONS.forEach((direction, directionIndex) => {
    const rowCells = cells
      .filter((frame) => frame.directionIndex === directionIndex)
      .sort((left, right) => left.frameIndex - right.frameIndex);
    if (rowCells.length !== ANIMATION_FRAME_COUNT) {
      failures.push(`${direction}: expected ${ANIMATION_FRAME_COUNT} cells, got ${rowCells.length}`);
      return;
    }

    const metrics = rowCells
      .map((frame) => frame.bounds ? {
        frame,
        width: frame.bounds.maxX - frame.bounds.minX + 1,
        height: frame.bounds.maxY - frame.bounds.minY + 1,
        centerX: (frame.bounds.minX + frame.bounds.maxX) / 2,
        bottomY: frame.bounds.maxY,
        topMargin: frame.bounds.minY
      } : null)
      .filter((metric): metric is NonNullable<typeof metric> => Boolean(metric));
    if (metrics.length !== rowCells.length) {
      rowCells.forEach((frame) => {
        if (!frame.bounds) failures.push(`${directionSplitCellLabel(direction, frame.frameIndex)}: blank normalized cell`);
      });
      return;
    }

    const centerDrift = rangeNumber(metrics.map((metric) => metric.centerX));
    if (centerDrift > DIRECTION_SPLIT_CENTER_FAIL_DRIFT) {
      failures.push(`${direction}: center drift ${Math.round(centerDrift)}px`);
    } else if (centerDrift > DIRECTION_SPLIT_CENTER_WARN_DRIFT) {
      warnings.push(`${direction}: center drift ${Math.round(centerDrift)}px`);
    }

    const bottomDrift = rangeNumber(metrics.map((metric) => metric.bottomY));
    if (bottomDrift > DIRECTION_SPLIT_BOTTOM_FAIL_DRIFT) {
      failures.push(`${direction}: foot baseline drift ${Math.round(bottomDrift)}px`);
    } else if (bottomDrift > DIRECTION_SPLIT_BOTTOM_WARN_DRIFT) {
      warnings.push(`${direction}: foot baseline drift ${Math.round(bottomDrift)}px`);
    }

    const widthVariation = variationRatio(metrics.map((metric) => metric.width));
    if (widthVariation > 0.45) {
      failures.push(`${direction}: bbox width variation ${Math.round(widthVariation * 100)}%`);
    } else if (widthVariation > 0.3) {
      warnings.push(`${direction}: bbox width variation ${Math.round(widthVariation * 100)}%`);
    }

    const heightVariation = variationRatio(metrics.map((metric) => metric.height));
    if (heightVariation > 0.35) {
      failures.push(`${direction}: bbox height variation ${Math.round(heightVariation * 100)}%`);
    } else if (heightVariation > 0.22) {
      warnings.push(`${direction}: bbox height variation ${Math.round(heightVariation * 100)}%`);
    }

    metrics.forEach((metric) => {
      if (metric.topMargin < 4) failures.push(`${directionSplitCellLabel(direction, metric.frame.frameIndex)}: top margin ${metric.topMargin}px`);
      else if (metric.topMargin < 10) warnings.push(`${directionSplitCellLabel(direction, metric.frame.frameIndex)}: top margin ${metric.topMargin}px`);
      if (metric.bottomY > cell.height - 3) failures.push(`${directionSplitCellLabel(direction, metric.frame.frameIndex)}: feet touch cell bottom`);
    });
  });

  return { warnings, failures };
}

function directionSplitCellLabel(direction: string, frameIndex: number) {
  return `${direction} cell ${frameIndex + 1}`;
}

function componentCenterDistance(left: FrameComponentMetrics, right: FrameComponentMetrics) {
  return Math.hypot(left.centerX - right.centerX, left.centerY - right.centerY);
}

function medianNumber(values: number[]) {
  if (values.length === 0) return 0;
  const sorted = values.slice().sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

function rangeNumber(values: number[]) {
  if (values.length === 0) return 0;
  return Math.max(...values) - Math.min(...values);
}

function variationRatio(values: number[]) {
  const median = medianNumber(values);
  return median > 0 ? rangeNumber(values) / median : 0;
}

type AnimationDrawable = (HTMLCanvasElement | HTMLImageElement) & { width: number; height: number };

async function renderAnimationSheet(sourceDataUrl: string, cell: SpriteAction["cell"], actionName: string) {
  const source = await createTransparentAnimationSource(sourceDataUrl);
  const canvas = document.createElement("canvas");
  canvas.width = cell.width * ANIMATION_FRAME_COUNT;
  canvas.height = cell.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not create animation canvas.");
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingEnabled = false;

  for (let frame = 0; frame < ANIMATION_FRAME_COUNT; frame += 1) {
    drawAnimationFrame(context, source, cell, actionName, frame);
  }

  return canvas.toDataURL("image/png");
}

function drawAnimationFrame(
  context: CanvasRenderingContext2D,
  source: AnimationDrawable,
  cell: SpriteAction["cell"],
  actionName: string,
  frame: number
) {
  const phase = (frame / ANIMATION_FRAME_COUNT) * Math.PI * 2;
  const x = frame * cell.width;
  const scale = Math.min((cell.width * 0.74) / source.width, (cell.height * 0.76) / source.height);
  const width = Math.max(1, Math.round(source.width * scale));
  const height = Math.max(1, Math.round(source.height * scale));
  const preset = animationPreset(actionName, phase, frame);
  const centerX = x + cell.width / 2 + preset.x;
  const centerY = cell.height / 2 + preset.y;

  context.save();
  context.translate(centerX, centerY);
  context.rotate(preset.rotate);
  context.scale(preset.scaleX, preset.scaleY);
  context.drawImage(source, -width / 2, -height / 2, width, height);
  context.restore();
}

async function createTransparentAnimationSource(sourceDataUrl: string) {
  const source = await loadImage(sourceDataUrl);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, source.naturalWidth || source.width);
  canvas.height = Math.max(1, source.naturalHeight || source.height);
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Could not create transparent source canvas.");
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  removeConnectedBackground(context, canvas.width, canvas.height);
  return trimTransparentCanvas(canvas);
}

function removeConnectedBackground(context: CanvasRenderingContext2D, width: number, height: number) {
  const imageData = context.getImageData(0, 0, width, height);
  const data = imageData.data;
  const keyColors = [
    readPixelColor(data, 0),
    readPixelColor(data, width - 1),
    readPixelColor(data, (height - 1) * width),
    readPixelColor(data, height * width - 1)
  ].filter((color) => color.a > 8);
  const visited = new Uint8Array(width * height);
  const stack: number[] = [];

  const enqueue = (index: number) => {
    if (index < 0 || index >= visited.length || visited[index]) return;
    visited[index] = 1;
    stack.push(index);
  };

  for (let x = 0; x < width; x += 1) {
    enqueue(x);
    enqueue((height - 1) * width + x);
  }
  for (let y = 0; y < height; y += 1) {
    enqueue(y * width);
    enqueue(y * width + width - 1);
  }

  while (stack.length > 0) {
    const index = stack.pop();
    if (index === undefined) break;
    const offset = index * 4;
    if (!isRemovableBackgroundPixel(data, offset, keyColors)) continue;
    data[offset + 3] = 0;

    const x = index % width;
    if (x > 0) enqueue(index - 1);
    if (x < width - 1) enqueue(index + 1);
    if (index >= width) enqueue(index - width);
    if (index < width * (height - 1)) enqueue(index + width);
  }

  context.putImageData(imageData, 0, 0);
}

function trimTransparentCanvas(source: HTMLCanvasElement) {
  const context = source.getContext("2d", { willReadFrequently: true });
  if (!context) return source;
  const imageData = context.getImageData(0, 0, source.width, source.height);
  const data = imageData.data;
  let minX = source.width;
  let minY = source.height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < source.height; y += 1) {
    for (let x = 0; x < source.width; x += 1) {
      const alpha = data[(y * source.width + x) * 4 + 3];
      if (alpha <= 12) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  if (maxX < minX || maxY < minY) return source;

  const padding = Math.max(2, Math.round(Math.max(maxX - minX, maxY - minY) * 0.03));
  const sx = Math.max(0, minX - padding);
  const sy = Math.max(0, minY - padding);
  const sw = Math.min(source.width - sx, maxX - minX + 1 + padding * 2);
  const sh = Math.min(source.height - sy, maxY - minY + 1 + padding * 2);
  const trimmed = document.createElement("canvas");
  trimmed.width = sw;
  trimmed.height = sh;
  const trimmedContext = trimmed.getContext("2d");
  if (!trimmedContext) return source;
  trimmedContext.imageSmoothingEnabled = false;
  trimmedContext.drawImage(source, sx, sy, sw, sh, 0, 0, sw, sh);
  return trimmed;
}

function readPixelColor(data: Uint8ClampedArray, index: number) {
  const offset = index * 4;
  return { r: data[offset], g: data[offset + 1], b: data[offset + 2], a: data[offset + 3] };
}

function isRemovableBackgroundPixel(data: Uint8ClampedArray, offset: number, keyColors: Array<ReturnType<typeof readPixelColor>>) {
  const alpha = data[offset + 3];
  if (alpha < 12) return true;
  if (isChromaPixel(data, offset)) return true;
  return keyColors.some((color) => Math.abs(alpha - color.a) < 90 && colorDistanceSq(data, offset, color) <= 62 * 62);
}

function isChromaPixel(data: Uint8ClampedArray, offset: number) {
  const r = data[offset];
  const g = data[offset + 1];
  const b = data[offset + 2];
  const a = data[offset + 3];
  if (a < 12) return true;
  const green = g > 105 && g > r * 1.3 && g > b * 1.3;
  const blue = b > 120 && b > r * 1.25 && b > g * 1.08;
  const magenta = r > 130 && b > 110 && g < Math.min(r, b) * 0.7;
  return green || blue || magenta;
}

export function isCharacterGreenPixel(data: Uint8ClampedArray, offset: number) {
  const r = data[offset];
  const g = data[offset + 1];
  const b = data[offset + 2];
  const saturatedGreen = g > 95 && g > r * 1.14 && g > b * 1.14;
  const naturalGreen = g > 68 && g >= r + 8 && g >= b + 16 && r < 170 && b < 140;
  const oliveGreen = g >= 58 && g >= r + 4 && g >= b + 18 && r < 170 && b < 115;
  return saturatedGreen || naturalGreen || oliveGreen;
}

function removeChromaKeyPixels(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  chromaKey: AnimationChromaKey
) {
  const imageData = context.getImageData(0, 0, width, height);
  const data = imageData.data;
  const tolerance = chromaKey.name === "green" ? 96 : 88;

  for (let offset = 0; offset < data.length; offset += 4) {
    if (data[offset + 3] < 12) continue;
    const dr = data[offset] - chromaKey.rgb.r;
    const dg = data[offset + 1] - chromaKey.rgb.g;
    const db = data[offset + 2] - chromaKey.rgb.b;
    const closeToKey = dr * dr + dg * dg + db * db <= tolerance * tolerance;
    const semanticKey = isStrictChromaResiduePixel(data, offset, chromaKey.name);
    if (closeToKey || semanticKey) data[offset + 3] = 0;
  }

  removeFrameEdgeResiduePixels(imageData, width, height, chromaKey.name);
  context.putImageData(imageData, 0, 0);
}

function removeAnimationGuideGridPixels(context: CanvasRenderingContext2D, width: number, height: number) {
  const imageData = context.getImageData(0, 0, width, height);
  const data = imageData.data;
  const radius = Math.max(2, Math.ceil(Math.max(width / ANIMATION_FRAME_COUNT, height / ANIMATION_DIRECTION_COUNT) / 96));

  for (let offset = 0; offset < data.length; offset += 4) {
    if (data[offset + 3] < 12) continue;
    const pixelIndex = offset / 4;
    const x = pixelIndex % width;
    const y = Math.floor(pixelIndex / width);
    const isGuideLine = isNearAnimationGuideLine(x, y, width, height, radius);
    if (isCyanGuidePixel(data, offset) || (isGuideLine && isGuideResiduePixel(data, offset))) {
      data[offset] = 0;
      data[offset + 1] = 0;
      data[offset + 2] = 0;
      data[offset + 3] = 0;
    }
  }

  context.putImageData(imageData, 0, 0);
}

function isNearAnimationGuideLine(x: number, y: number, width: number, height: number, radius: number) {
  for (let column = 0; column <= ANIMATION_FRAME_COUNT; column += 1) {
    if (Math.abs(x - Math.round((width * column) / ANIMATION_FRAME_COUNT)) <= radius) return true;
  }
  for (let row = 0; row <= ANIMATION_DIRECTION_COUNT; row += 1) {
    if (Math.abs(y - Math.round((height * row) / ANIMATION_DIRECTION_COUNT)) <= radius) return true;
  }
  return false;
}

function isCyanGuidePixel(data: Uint8ClampedArray, offset: number) {
  const r = data[offset];
  const g = data[offset + 1];
  const b = data[offset + 2];
  return g >= 145 && b >= 145 && r <= 125 && Math.abs(g - b) <= 75 && g >= r + 45 && b >= r + 45;
}

function isGuideResiduePixel(data: Uint8ClampedArray, offset: number) {
  const r = data[offset];
  const g = data[offset + 1];
  const b = data[offset + 2];
  return g >= 95 && r <= 145 && (g >= r + 35 || b >= r + 35);
}

function colorDistanceSq(data: Uint8ClampedArray, offset: number, color: ReturnType<typeof readPixelColor>) {
  const dr = data[offset] - color.r;
  const dg = data[offset + 1] - color.g;
  const db = data[offset + 2] - color.b;
  return dr * dr + dg * dg + db * db;
}

function animationPreset(actionName: string, phase: number, frame: number) {
  if (actionName === "walk") {
    return {
      x: Math.sin(phase) * 4,
      y: Math.abs(Math.sin(phase)) * -5,
      rotate: Math.sin(phase) * 0.05,
      scaleX: frame % 2 === 0 ? 1 : 0.96,
      scaleY: frame % 2 === 0 ? 1 : 1.04,
      accent: ""
    };
  }
  if (actionName === "run") {
    return {
      x: Math.sin(phase) * 7,
      y: Math.abs(Math.sin(phase)) * -8,
      rotate: -0.08 + Math.sin(phase) * 0.08,
      scaleX: frame % 2 === 0 ? 1.05 : 0.93,
      scaleY: frame % 2 === 0 ? 0.97 : 1.07,
      accent: ""
    };
  }
  if (actionName === "cast") {
    return {
      x: 0,
      y: -3 - Math.sin(phase) * 4,
      rotate: Math.sin(phase) * 0.03,
      scaleX: 1 + Math.sin(phase) * 0.03,
      scaleY: 1 + Math.cos(phase) * 0.03,
      accent: "#f2d778"
    };
  }
  if (actionName === "attack") {
    const thrust = frame < ANIMATION_FRAME_COUNT / 2 ? frame : ANIMATION_FRAME_COUNT - frame;
    return {
      x: thrust * 2.5,
      y: Math.sin(phase) * -2,
      rotate: -0.08 + thrust * 0.018,
      scaleX: 1 + thrust * 0.018,
      scaleY: 1 - thrust * 0.01,
      accent: "#ff7a59"
    };
  }
  return {
    x: 0,
    y: Math.sin(phase) * -4,
    rotate: Math.sin(phase) * 0.025,
    scaleX: 1 + Math.sin(phase) * 0.02,
    scaleY: 1 - Math.sin(phase) * 0.02,
    accent: ""
  };
}

function workflowUsesSelectedImage(mode: WorkflowMode | null) {
  return mode === "image-edit" || mode === "sprite-generate";
}

function workflowUsesSpriteContext(mode: WorkflowMode | null) {
  return mode === "sprite-generate" || mode === "sprite-edit";
}

async function loadCodexRunnerPreflight() {
  const response = await fetch("/api/codex/runner");
  if (!response.ok) throw new Error(await response.text());
  const data = (await response.json()) as CodexRunnerPreflightResponse;
  return data.runner;
}

function runnerPreflightLabel(runner: CodexRunnerPreflight | null, copy: Record<string, string>) {
  if (!runner) return copy.runnerChecking;
  if (runner.state === "ready") return copy.runnerReady;
  if (runner.state === "disabled") return copy.runnerDisabled;
  return runner.errorCode ? `${copy.runnerUnavailable}: ${runner.errorCode}` : copy.runnerUnavailable;
}

async function loadCodexRunnerStatus(jobId: string) {
  try {
    const response = await fetch(`/api/codex/jobs/${encodeURIComponent(jobId)}/status`);
    if (!response.ok) return null;
    const data = (await response.json()) as CodexJobStatusResponse;
    return data.status;
  } catch {
    return null;
  }
}

async function loadCodexJobLog(jobId: string) {
  const response = await fetch(`/api/codex/jobs/${encodeURIComponent(jobId)}/log?bytes=${CODEX_LOG_TAIL_BYTES}`);
  if (!response.ok) throw new Error(await response.text());
  return (await response.json()) as CodexJobLogResponse;
}

function createCodexJobLogItem(
  job: Pick<CodexJobQueueItem, "id" | "label" | "createdAt" | "state">,
  log?: Partial<CodexJobLogResponse & CodexJobLogItem>,
  state: CodexJobLogItem["state"] = job.state,
  error?: string
): CodexJobLogItem {
  return {
    jobId: job.id,
    label: job.label,
    state,
    createdAt: job.createdAt,
    text: log?.text ?? "",
    exists: Boolean(log?.exists),
    truncated: Boolean(log?.truncated),
    size: log?.size ?? 0,
    modifiedAt: log?.modifiedAt ?? "",
    readAt: log?.readAt ?? new Date().toISOString(),
    error
  };
}

function mergeCodexJobLogs(current: CodexJobLogItem[], incoming: CodexJobLogItem[]) {
  const merged = new Map(current.map((item) => [item.jobId, item]));
  incoming.forEach((item) => {
    const previous = merged.get(item.jobId);
    merged.set(item.jobId, { ...previous, ...item });
  });
  return Array.from(merged.values())
    .sort((left, right) => Date.parse(right.readAt || right.createdAt) - Date.parse(left.readAt || left.createdAt))
    .slice(0, CODEX_LOG_HISTORY_LIMIT);
}

export function shouldWaitForCodexRunner(status?: CodexRunnerStatus) {
  if (!status) return true;
  return status.state === "running";
}

function runnerStatusMessage(status: CodexRunnerStatus | undefined, copy: Record<string, string>) {
  if (!status || status.state === "running") return copy.statusCodexJobPending;
  if (status.diagnostic) {
    const failure = codexFailureDisplay(status.diagnostic.kind, copy);
    return `${failure.title}: ${failure.message}`;
  }
  if (status.state === "disabled" || status.state === "unavailable" || status.state === "unknown") {
    return `${copy.statusCodexRunnerUnavailable}: ${status.message}`;
  }
  if (status.state === "failed") return `${copy.statusCodexRunnerFailed}: ${status.message}`;
  return copy.statusCodexRunnerCompletedNoImage;
}

function NumberField({
  label,
  value,
  min = 1,
  onChange
}: {
  label: string;
  value: number;
  min?: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="field number-field">
      <span>{label}</span>
      <input type="number" min={min} value={value} onChange={(event) => onChange(Math.max(min, Number(event.target.value)))} />
    </label>
  );
}

function QcLine({ ok, label, value }: { ok: boolean; label: string; value: string }) {
  return (
    <div className="qc-line">
      {ok ? <CheckCircle2 size={15} aria-hidden="true" /> : <AlertTriangle size={15} aria-hidden="true" />}
      <span>{label}</span>
      <small>{value}</small>
    </div>
  );
}

function WorkflowTabs({
  activeMode,
  language,
  onSelect
}: {
  activeMode: WorkflowMode;
  language: Language;
  onSelect: (mode: WorkflowMode) => void;
}) {
  return (
    <nav className="workflow-tabs" aria-label="Primary workflows">
      {workflowOptions.map((option) => {
        const optionCopy = workflowCopy[language][option.id];
        return (
          <button
            key={option.id}
            className={activeMode === option.id ? "active" : ""}
            onClick={() => onSelect(option.id)}
          >
            <WorkflowIcon mode={option.id} />
            <span>{optionCopy.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

function PromptExamplesModal({
  language,
  onClose,
  onCopy,
  onUse
}: {
  language: Language;
  onClose: () => void;
  onCopy: (example: PromptExample) => Promise<void>;
  onUse: (example: PromptExample) => void;
}) {
  const copy = uiCopy[language];
  return (
    <div className="prompt-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="prompt-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="prompt-examples-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="prompt-library-heading">
          <div>
            <strong id="prompt-examples-title">{copy.promptExamplesTitle}</strong>
            <span>{copy.promptExamplesIntro}</span>
          </div>
          <button className="icon-button" title={copy.closePromptExamples} aria-label={copy.closePromptExamples} onClick={onClose}>
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="prompt-grid">
          {promptExamples.map((example) => (
            <article key={example.id} className="prompt-card">
              <div className="prompt-card-preview">
                <img src={example.previewImage} alt={`${localizedText(example.title, language)} example`} />
              </div>
              <div className="prompt-card-meta">
                <small>{localizedText(example.category, language)}</small>
              </div>
              <h2>{localizedText(example.title, language)}</h2>
              <small className="prompt-card-note">{localizedText(example.summary, language)}</small>
              <div className="prompt-actions">
                <button onClick={() => void onCopy(example)}>
                  <Copy size={15} aria-hidden="true" />
                  {copy.copyPrompt}
                </button>
                <button className="primary-button" onClick={() => onUse(example)}>
                  <ImagePlus size={15} aria-hidden="true" />
                  {copy.usePrompt}
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function AnimationPresetExamplesModal({
  language,
  onClose,
  onUse
}: {
  language: Language;
  onClose: () => void;
  onUse: (example: AnimationPresetExample) => void;
}) {
  const copy = uiCopy[language];
  return (
    <div className="prompt-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="prompt-modal animation-preset-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="animation-preset-examples-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="prompt-library-heading">
          <div>
            <strong id="animation-preset-examples-title">{copy.animationPresetExamplesTitle}</strong>
            <span>{copy.animationPresetExamplesIntro}</span>
          </div>
          <button className="icon-button" title={copy.closePromptExamples} aria-label={copy.closePromptExamples} onClick={onClose}>
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="prompt-grid animation-preset-grid">
          {animationPresetExamples.map((example) => (
            <article key={example.id} className="prompt-card animation-preset-card">
              <div className="prompt-card-preview animation-sample-preview">
                <div className={`animation-sample-sprite ${example.previewClassName}`} aria-label={`${localizedText(example.title, language)} sample animation`} />
              </div>
              <div className="prompt-card-meta">
                <small>{localizedText(example.category, language)}</small>
              </div>
              <h2>{localizedText(example.title, language)}</h2>
              <small className="prompt-card-note">{localizedText(example.summary, language)}</small>
              <div className="prompt-actions single-action">
                <button className="primary-button" onClick={() => onUse(example)}>
                  <CheckCircle2 size={15} aria-hidden="true" />
                  {copy.useAnimationPreset}
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function AnimationPackExportModal({
  language,
  draft,
  onChange,
  onClose,
  onExport
}: {
  language: Language;
  draft: AnimationPackExportDraft;
  onChange: (draft: AnimationPackExportDraft) => void;
  onClose: () => void;
  onExport: () => void;
}) {
  const copy = uiCopy[language];
  const updateDraft = (patch: Partial<AnimationPackExportDraft>) => onChange({ ...draft, ...patch });
  return (
    <div className="prompt-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="prompt-modal animation-pack-export-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="animation-pack-export-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="prompt-library-heading">
          <div>
            <strong id="animation-pack-export-title">{copy.animationPackExportTitle}</strong>
            <span>{copy.animationPackExportIntro}</span>
          </div>
          <button className="icon-button" title={copy.closePromptExamples} aria-label={copy.closePromptExamples} onClick={onClose}>
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="animation-pack-form">
          <label className="field">
            <span>{copy.animationPackTitleLabel}</span>
            <input value={draft.title} onChange={(event) => updateDraft({ title: event.target.value })} />
          </label>
          <label className="field">
            <span>{copy.animationPackTagsLabel}</span>
            <input value={draft.tags} onChange={(event) => updateDraft({ tags: event.target.value })} />
          </label>
          <label className="field">
            <span>{copy.animationPackLicenseLabel}</span>
            <input value={draft.license} onChange={(event) => updateDraft({ license: event.target.value })} />
          </label>
          <label className="field">
            <span>{copy.animationPackSourceLabel}</span>
            <textarea value={draft.sourceNote} onChange={(event) => updateDraft({ sourceNote: event.target.value })} rows={2} maxLength={360} />
          </label>
          <label className="check-row inline">
            <input
              type="checkbox"
              checked={draft.includePromptSummary}
              onChange={(event) => updateDraft({ includePromptSummary: event.target.checked })}
            />
            {copy.animationPackPromptToggle}
          </label>
          {draft.includePromptSummary && (
            <label className="field">
              <span>{copy.animationPackPromptSummaryLabel}</span>
              <textarea value={draft.promptSummary} onChange={(event) => updateDraft({ promptSummary: event.target.value })} rows={3} maxLength={500} />
            </label>
          )}
          <p className="animation-pack-rights-hint">{copy.animationPackRightsHint}</p>
        </div>

        <div className="prompt-actions animation-pack-actions">
          <button onClick={onClose}>{copy.cancel}</button>
          <button className="primary-button" onClick={onExport}>
            <FileArchive size={15} aria-hidden="true" />
            {copy.saveExport}
          </button>
        </div>
      </section>
    </div>
  );
}

function animationLibraryPreviewClassName(item: AnimationLibraryItem) {
  if (item.action === "idle") return "sample-idle-sheet sample-idle";
  if (item.action === "run") return "sample-run-sheet sample-run";
  if (item.action === "walk") return "sample-walk-sheet sample-walk";
  return "sample-walk-sheet sample-walk";
}

function WorkflowIcon({ mode }: { mode: WorkflowMode }) {
  if (mode === "image-generate") return <ImagePlus size={22} aria-hidden="true" />;
  if (mode === "image-edit") return <Brush size={22} aria-hidden="true" />;
  if (mode === "sprite-generate") return <Scissors size={22} aria-hidden="true" />;
  return <Grid3X3 size={22} aria-hidden="true" />;
}

async function splitImageIntoFrames(
  dataUrl: string,
  baseName: string,
  grid: GridSettings,
  sourceId?: string,
  targetCell?: { width: number; height: number },
  options: FrameSplitOptions = {}
): Promise<SpriteFrame[]> {
  const image = await loadImage(dataUrl);
  const cells = calculateGridCells(image.width, image.height, grid);
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return [];
  return cells.map((cell) => {
    const width = targetCell?.width ?? cell.width;
    const height = targetCell?.height ?? cell.height;
    canvas.width = width;
    canvas.height = height;
    context.clearRect(0, 0, width, height);
    context.drawImage(image, cell.x, cell.y, cell.width, cell.height, 0, 0, width, height);
    if (options.normalizeOpaqueBounds) normalizeFrameOpaqueBounds(context, width, height, options.residueChromaKey);
    return {
      id: createId("frame"),
      name: `${baseName}_${String(cell.index).padStart(3, "0")}.png`,
      dataUrl: canvas.toDataURL("image/png"),
      width,
      height,
      sourceId,
      index: cell.index
    };
  });
}

interface OpaqueBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  count: number;
}

type OpaqueComponent = FrameComponentMetrics;

const FRAME_ALPHA_THRESHOLD = 12;

function normalizeFrameOpaqueBounds(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  residueChromaKey: FrameResidueChromaKey = "both"
) {
  const imageData = context.getImageData(0, 0, width, height);
  removeFrameEdgeResiduePixels(imageData, width, height, residueChromaKey);
  const { labels, components } = labelOpaqueComponents(imageData, width, height, residueChromaKey);
  const primary = selectPrimaryOpaqueComponent(components, width, height);
  if (!primary || primary.count < 64) return;

  const keepComponents = new Uint8Array(components.length);
  components.forEach((component) => {
    if (shouldKeepFrameComponent(component, primary, width, height)) keepComponents[component.id] = 1;
  });

  const cleaned = new ImageData(new Uint8ClampedArray(imageData.data), width, height);
  const data = cleaned.data;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      const offset = (y * width + x) * 4;
      const label = labels[index];
      if (data[offset + 3] <= FRAME_ALPHA_THRESHOLD || label < 0 || keepComponents[label] !== 1) {
        data[offset + 3] = 0;
      }
    }
  }

  const bounds = findOpaqueBounds(cleaned, width, height);
  if (!bounds || bounds.count < 64) return;

  const sourceCanvas = document.createElement("canvas");
  sourceCanvas.width = width;
  sourceCanvas.height = height;
  const sourceContext = sourceCanvas.getContext("2d");
  if (!sourceContext) return;
  sourceContext.putImageData(cleaned, 0, 0);

  const cropWidth = bounds.maxX - bounds.minX + 1;
  const cropHeight = bounds.maxY - bounds.minY + 1;
  const targetX = clampNumber(Math.round(width / 2 - cropWidth / 2), 0, Math.max(0, width - cropWidth));
  const targetFootY = Math.round(height * 0.9);
  const targetY = clampNumber(targetFootY - cropHeight, 0, Math.max(0, height - cropHeight));

  context.clearRect(0, 0, width, height);
  context.drawImage(sourceCanvas, bounds.minX, bounds.minY, cropWidth, cropHeight, targetX, targetY, cropWidth, cropHeight);
}

function findOpaqueBounds(imageData: ImageData, width: number, height: number): OpaqueBounds | null {
  const data = imageData.data;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  let count = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const alpha = data[(y * width + x) * 4 + 3];
      if (alpha <= FRAME_ALPHA_THRESHOLD) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      count += 1;
    }
  }

  return count > 0 ? { minX, minY, maxX, maxY, count } : null;
}

function labelOpaqueComponents(
  imageData: ImageData,
  width: number,
  height: number,
  residueChromaKey: FrameResidueChromaKey = "both"
) {
  const data = imageData.data;
  const visited = new Uint8Array(width * height);
  const labels = new Int32Array(width * height);
  labels.fill(-1);
  const stack = new Int32Array(width * height);
  const components: OpaqueComponent[] = [];

  for (let start = 0; start < width * height; start += 1) {
    if (visited[start] || data[start * 4 + 3] <= FRAME_ALPHA_THRESHOLD) continue;

    const id = components.length;
    let stackLength = 0;
    stack[stackLength] = start;
    stackLength += 1;
    visited[start] = 1;
    labels[start] = id;
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;
    let count = 0;
    let sumX = 0;
    let sumY = 0;
    let chromaResidueCount = 0;
    let softAlphaCount = 0;

    while (stackLength > 0) {
      stackLength -= 1;
      const index = stack[stackLength];
      const x = index % width;
      const y = Math.floor(index / width);
      const offset = index * 4;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      count += 1;
      sumX += x;
      sumY += y;
      if (isFrameChromaResiduePixel(data, offset, residueChromaKey)) chromaResidueCount += 1;
      if (data[offset + 3] < 96) softAlphaCount += 1;

      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (dx === 0 && dy === 0) continue;
          const nextX = x + dx;
          const nextY = y + dy;
          if (nextX < 0 || nextX >= width || nextY < 0 || nextY >= height) continue;
          const nextIndex = nextY * width + nextX;
          if (visited[nextIndex] || data[nextIndex * 4 + 3] <= FRAME_ALPHA_THRESHOLD) continue;
          visited[nextIndex] = 1;
          labels[nextIndex] = id;
          stack[stackLength] = nextIndex;
          stackLength += 1;
        }
      }
    }

    components.push({
      id,
      minX,
      minY,
      maxX,
      maxY,
      count,
      centerX: sumX / count,
      centerY: sumY / count,
      chromaResidueCount,
      softAlphaCount
    });
  }

  return { labels, components };
}

function selectPrimaryOpaqueComponent(components: OpaqueComponent[], width: number, height: number): OpaqueComponent | null {
  let best: OpaqueComponent | null = null;
  let bestScore = -Infinity;
  const centerX = width / 2;
  const centerY = height / 2;

  components.forEach((component) => {
    if (component.count < 16) return;
    const distanceFromCellCenter = Math.hypot(component.centerX - centerX, component.centerY - centerY);
    const score = component.count - distanceFromCellCenter * 1.25;
    if (score > bestScore) {
      bestScore = score;
      best = component;
    }
  });

  return best;
}

function shouldKeepFrameComponent(component: OpaqueComponent, primary: OpaqueComponent, width: number, height: number) {
  if (component.id === primary.id) return true;
  if (isLikelyFrameGarbageComponent(component, primary, width, height)) return false;
  const horizontalGap = Math.max(0, Math.max(primary.minX - component.maxX, component.minX - primary.maxX));
  const verticalGap = Math.max(0, Math.max(primary.minY - component.maxY, component.minY - primary.maxY));
  const nearHorizontally = horizontalGap <= Math.round(width * 0.12);
  const nearVertically = verticalGap <= Math.round(height * 0.08);
  const notStrayBelow = component.centerY <= primary.maxY + Math.round(height * 0.08);
  const notStrayAbove = component.centerY >= primary.minY - Math.round(height * 0.08);
  return nearHorizontally && nearVertically && notStrayBelow && notStrayAbove;
}

export function isLikelyFrameGarbageComponent(
  component: FrameComponentMetrics,
  primary: FrameComponentMetrics,
  width: number,
  height: number
) {
  if (component.id === primary.id) return false;
  const tinyThreshold = frameTinyComponentThreshold(width, height);
  if (component.count < tinyThreshold) return true;

  const componentWidth = component.maxX - component.minX + 1;
  const componentHeight = component.maxY - component.minY + 1;
  const chromaResidueRatio = component.chromaResidueCount / Math.max(1, component.count);
  const softAlphaRatio = component.softAlphaCount / Math.max(1, component.count);
  const mostlyChromaResidue = chromaResidueRatio >= 0.35 || (chromaResidueRatio >= 0.18 && softAlphaRatio >= 0.25);
  const nearFootLine = component.centerY >= primary.maxY - Math.round(height * 0.08);
  const compactFootSpeck =
    componentWidth <= Math.round(width * 0.16) &&
    componentHeight <= Math.round(height * 0.12) &&
    component.count < tinyThreshold * 3;

  return (
    (mostlyChromaResidue && component.count < tinyThreshold * 8) ||
    (nearFootLine && compactFootSpeck && (mostlyChromaResidue || component.count < tinyThreshold * 2))
  );
}

function frameTinyComponentThreshold(width: number, height: number) {
  return Math.max(12, Math.round(width * height * 0.00065));
}

export function isFrameChromaResiduePixel(
  data: Uint8ClampedArray,
  offset: number,
  residueChromaKey: FrameResidueChromaKey = "both"
) {
  const alpha = data[offset + 3];
  if (alpha <= FRAME_ALPHA_THRESHOLD) return false;
  const r = data[offset];
  const g = data[offset + 1];
  const b = data[offset + 2];
  const checkGreen = residueChromaKey === "green" || residueChromaKey === "both";
  const checkMagenta = residueChromaKey === "magenta" || residueChromaKey === "both";
  const greenResidue = isStrictChromaResidueColor(r, g, b, "green");
  const magentaResidue = isStrictChromaResidueColor(r, g, b, "magenta");
  return (checkGreen && greenResidue) || (checkMagenta && magentaResidue);
}

function isStrictChromaResiduePixel(data: Uint8ClampedArray, offset: number, chromaKey: AnimationChromaKeyName) {
  return isStrictChromaResidueColor(data[offset], data[offset + 1], data[offset + 2], chromaKey);
}

function isStrictChromaResidueColor(r: number, g: number, b: number, chromaKey: AnimationChromaKeyName) {
  if (chromaKey === "green") {
    const pureDarkGreen = g >= 96 && r <= 56 && b <= 56 && g >= r + 45 && g >= b + 45;
    const brightKeyGreen = g >= 150 && r <= 112 && b <= 112 && g >= r + 70 && g >= b + 70;
    return pureDarkGreen || brightKeyGreen;
  }
  const pureDarkMagenta = r >= 96 && b >= 96 && g <= 56 && r >= g + 45 && b >= g + 45;
  const brightKeyMagenta = r >= 150 && b >= 150 && g <= 112 && r >= g + 70 && b >= g + 70;
  return pureDarkMagenta || brightKeyMagenta;
}

function removeFrameEdgeResiduePixels(
  imageData: ImageData,
  width: number,
  height: number,
  residueChromaKey: FrameResidueChromaKey = "both"
) {
  const data = imageData.data;
  for (let pass = 0; pass < 2; pass += 1) {
    const source = new Uint8ClampedArray(data);
    let removed = 0;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const offset = (y * width + x) * 4;
        if (!isFrameChromaResiduePixel(source, offset, residueChromaKey)) continue;
        if (!hasTransparentNeighbor(source, width, height, x, y)) continue;
        data[offset + 3] = 0;
        removed += 1;
      }
    }
    if (removed === 0) break;
  }
  despillFrameEdgePixels(imageData, width, height, residueChromaKey);
}

function hasTransparentNeighbor(data: Uint8ClampedArray, width: number, height: number, x: number, y: number) {
  return hasTransparentNeighborWithin(data, width, height, x, y, 1);
}

function hasTransparentNeighborWithin(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
  radius: number
) {
  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      const nextX = x + dx;
      const nextY = y + dy;
      if (nextX < 0 || nextX >= width || nextY < 0 || nextY >= height) return true;
      if (data[(nextY * width + nextX) * 4 + 3] <= FRAME_ALPHA_THRESHOLD) return true;
    }
  }
  return false;
}

function despillFrameEdgePixels(
  imageData: ImageData,
  width: number,
  height: number,
  residueChromaKey: FrameResidueChromaKey = "both"
) {
  const source = new Uint8ClampedArray(imageData.data);
  const data = imageData.data;
  const checkGreen = residueChromaKey === "green" || residueChromaKey === "both";
  const checkMagenta = residueChromaKey === "magenta" || residueChromaKey === "both";
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      if (source[offset + 3] <= FRAME_ALPHA_THRESHOLD) continue;
      if (!hasTransparentNeighborWithin(source, width, height, x, y, 2)) continue;

      const r = source[offset];
      const g = source[offset + 1];
      const b = source[offset + 2];
      if (checkGreen && isStrictChromaResidueColor(r, g, b, "green")) {
        data[offset + 1] = Math.min(g, Math.max(r, b));
      }
      if (checkMagenta && isStrictChromaResidueColor(r, g, b, "magenta")) {
        const limit = Math.max(g, Math.round((r + b) / 4));
        data[offset] = Math.min(r, limit);
        data[offset + 2] = Math.min(b, limit);
      }
    }
  }
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function drawCheckerboard(context: CanvasRenderingContext2D, width: number, height: number, size: number) {
  context.fillStyle = "#f8faf8";
  context.fillRect(0, 0, width, height);
  for (let y = 0; y < height; y += size) {
    for (let x = 0; x < width; x += size) {
      context.fillStyle = (x / size + y / size) % 2 === 0 ? "#eef1ee" : "#ffffff";
      context.fillRect(x, y, size, size);
    }
  }
}

function drawEmptyCanvas(context: CanvasRenderingContext2D, message: string) {
  context.fillStyle = "#4b5b50";
  context.font = "600 18px Inter, system-ui, sans-serif";
  context.fillText(message, 250, 250);
}

function drawGridOverlay(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  columns: number,
  rows: number
) {
  context.save();
  context.strokeStyle = "rgba(20, 160, 150, 0.58)";
  context.lineWidth = 1;
  for (let column = 0; column <= columns; column += 1) {
    const px = x + (width / columns) * column;
    context.beginPath();
    context.moveTo(px, y);
    context.lineTo(px, y + height);
    context.stroke();
  }
  for (let row = 0; row <= rows; row += 1) {
    const py = y + (height / rows) * row;
    context.beginPath();
    context.moveTo(x, py);
    context.lineTo(x + width, py);
    context.stroke();
  }
  context.restore();
}

function drawCenterOverlay(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number) {
  context.save();
  context.strokeStyle = "rgba(31, 132, 118, 0.72)";
  context.setLineDash([7, 7]);
  context.beginPath();
  context.moveTo(x + width / 2, y);
  context.lineTo(x + width / 2, y + height);
  context.moveTo(x, y + height / 2);
  context.lineTo(x + width, y + height / 2);
  context.stroke();
  context.restore();
}

function drawAnnotation(context: CanvasRenderingContext2D, annotation: Annotation) {
  const [start, end = start] = annotation.points;
  context.save();
  context.strokeStyle = annotation.color;
  context.fillStyle = annotation.color;
  context.lineWidth = annotation.width;
  context.lineCap = "round";
  context.lineJoin = "round";
  if (annotation.tool === "brush") {
    context.beginPath();
    annotation.points.forEach((point, index) => {
      if (index === 0) context.moveTo(point.x, point.y);
      else context.lineTo(point.x, point.y);
    });
    context.stroke();
  }
  if (annotation.tool === "rect") {
    const rect = annotationRect(annotation);
    context.strokeRect(rect.x, rect.y, rect.width, rect.height);
    const label = `#${annotation.number ?? ""}`;
    context.font = "700 14px Inter, system-ui, sans-serif";
    const labelWidth = Math.max(28, context.measureText(label).width + 14);
    const labelX = Math.max(4, rect.x);
    const labelY = Math.max(4, rect.y - 28);
    context.fillStyle = annotation.color;
    context.fillRect(labelX, labelY, labelWidth, 24);
    context.fillStyle = "#ffffff";
    context.fillText(label, labelX + 7, labelY + 17);
  }
  if (annotation.tool === "arrow") {
    context.beginPath();
    context.moveTo(start.x, start.y);
    context.lineTo(end.x, end.y);
    context.stroke();
    const angle = Math.atan2(end.y - start.y, end.x - start.x);
    const arrowSize = 14;
    context.beginPath();
    context.moveTo(end.x, end.y);
    context.lineTo(end.x - arrowSize * Math.cos(angle - Math.PI / 6), end.y - arrowSize * Math.sin(angle - Math.PI / 6));
    context.lineTo(end.x - arrowSize * Math.cos(angle + Math.PI / 6), end.y - arrowSize * Math.sin(angle + Math.PI / 6));
    context.closePath();
    context.fill();
  }
  context.restore();
}

function hexToRgb(hex: string) {
  const normalized = hex.replace("#", "");
  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16)
  };
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(
    new Date(value)
  );
}

function formatDurationSince(value: string) {
  const start = Date.parse(value);
  if (!Number.isFinite(start)) return "-";
  const seconds = Math.max(0, Math.floor((Date.now() - start) / 1000));
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) return `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}:${String(remainingMinutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
}

export function resolveInitialLanguage(stored: string | null, browserLanguages: readonly string[] = []): Language {
  const storedLanguage = stored ? resolveLocaleToLanguage(stored) : null;
  if (storedLanguage) return storedLanguage;

  for (const browserLanguage of browserLanguages) {
    const resolved = resolveLocaleToLanguage(browserLanguage);
    if (resolved) return resolved;
  }

  return "en";
}

function resolveLocaleToLanguage(value: string): Language | null {
  const normalized = value.trim().replace(/_/g, "-").toLowerCase();
  if (!normalized) return null;

  const exact = SUPPORTED_LANGUAGE_IDS.find((language) => language.toLowerCase() === normalized);
  if (exact) return exact;

  if (normalized === "zh-tw" || normalized.startsWith("zh-hant") || normalized.startsWith("zh-hk") || normalized.startsWith("zh-mo")) {
    return "zh-TW";
  }
  if (normalized === "zh" || normalized.startsWith("zh-cn") || normalized.startsWith("zh-hans") || normalized.startsWith("zh-sg")) {
    return "zh-CN";
  }
  if (normalized === "pt" || normalized.startsWith("pt-")) return "pt-BR";
  if (normalized === "in" || normalized.startsWith("in-")) return "id";

  const prefix = normalized.split("-")[0] ?? "";
  return supportedLanguageSet.has(prefix) ? (prefix as Language) : null;
}

function loadLanguage(): Language {
  try {
    const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    const browserLanguages = window.navigator.languages?.length ? window.navigator.languages : [window.navigator.language];
    return resolveInitialLanguage(stored, browserLanguages.filter(Boolean));
  } catch {
    return "en";
  }
}

function formatImagesImportedStatus(count: number, language: Language) {
  return imageImportedStatusCopy[language](count);
}

function formatFramesAddedStatus(count: number, actionName: string, language: Language) {
  return framesAddedStatusCopy[language](count, actionName);
}

const imageImportedStatusCopy = {
  en: (count: number) => `${count} image${count === 1 ? "" : "s"} imported`,
  ja: (count: number) => `${count}件の画像を取り込みました`,
  "zh-CN": (count: number) => `已导入 ${count} 张图像`,
  "zh-TW": (count: number) => `已匯入 ${count} 張圖像`,
  ko: (count: number) => `${count}개의 이미지를 가져왔습니다`,
  ru: (count: number) => `Импортировано изображений: ${count}`,
  es: (count: number) => `${count} imagen${count === 1 ? "" : "es"} importada${count === 1 ? "" : "s"}`,
  "pt-BR": (count: number) => `${count} imagem${count === 1 ? "" : "ns"} importada${count === 1 ? "" : "s"}`,
  de: (count: number) => `${count} Bild${count === 1 ? "" : "er"} importiert`,
  fr: (count: number) => `${count} image${count === 1 ? "" : "s"} importée${count === 1 ? "" : "s"}`,
  id: (count: number) => `${count} gambar diimpor`,
  tr: (count: number) => `${count} görsel içe aktarıldı`,
  vi: (count: number) => `Đã nhập ${count} ảnh`,
  pl: (count: number) => `Zaimportowano obrazów: ${count}`,
  it: (count: number) => `${count} immagin${count === 1 ? "e importata" : "i importate"}`
} satisfies Record<Language, (count: number) => string>;

const framesAddedStatusCopy = {
  en: (count: number, actionName: string) => `${count} frame${count === 1 ? "" : "s"} added to ${actionName}`,
  ja: (count: number, actionName: string) => `${actionName} に ${count}件のフレームを追加しました`,
  "zh-CN": (count: number, actionName: string) => `已向 ${actionName} 添加 ${count} 帧`,
  "zh-TW": (count: number, actionName: string) => `已向 ${actionName} 加入 ${count} 個影格`,
  ko: (count: number, actionName: string) => `${actionName}에 ${count}개의 프레임을 추가했습니다`,
  ru: (count: number, actionName: string) => `Кадров добавлено в ${actionName}: ${count}`,
  es: (count: number, actionName: string) => `${count} fotograma${count === 1 ? "" : "s"} añadido${count === 1 ? "" : "s"} a ${actionName}`,
  "pt-BR": (count: number, actionName: string) => `${count} quadro${count === 1 ? "" : "s"} adicionado${count === 1 ? "" : "s"} a ${actionName}`,
  de: (count: number, actionName: string) => `${count} Frame${count === 1 ? "" : "s"} zu ${actionName} hinzugefügt`,
  fr: (count: number, actionName: string) => `${count} image${count === 1 ? "" : "s"} ajoutée${count === 1 ? "" : "s"} à ${actionName}`,
  id: (count: number, actionName: string) => `${count} frame ditambahkan ke ${actionName}`,
  tr: (count: number, actionName: string) => `${actionName} için ${count} kare eklendi`,
  vi: (count: number, actionName: string) => `Đã thêm ${count} khung vào ${actionName}`,
  pl: (count: number, actionName: string) => `Dodano klatki do ${actionName}: ${count}`,
  it: (count: number, actionName: string) => `${count} frame aggiunt${count === 1 ? "o" : "i"} a ${actionName}`
} satisfies Record<Language, (count: number, actionName: string) => string>;

function saveLanguage(language: Language) {
  try {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  } catch {
    // The selector still works for the current session if storage is unavailable.
  }
}

function loadPendingCodexJobs(): CodexJobQueueItem[] {
  try {
    const stored = window.localStorage.getItem(PENDING_CODEX_JOB_STORAGE_KEY);
    if (!stored) return [];
    const parsed: unknown = JSON.parse(stored);
    const jobs = Array.isArray(parsed) ? parsed : [parsed];
    return jobs
      .filter(isStoredPendingCodexJob)
      .map((job) => ({
        ...job,
        state: "running" as const,
        label: job.label ?? codexJobLabel(job.workflowMode ?? null, "", job.actionName)
      }));
  } catch {
    return [];
  }
}

function savePendingCodexJobs(jobs: CodexJobQueueItem[]) {
  try {
    const runningJobs: PendingCodexJob[] = jobs
      .filter((job) => job.state === "running" && Boolean(job.path))
      .map((job) => ({
        id: job.id,
        path: job.path ?? "",
        createdAt: job.createdAt,
        label: job.label,
        workflowMode: job.workflowMode,
        actionName: job.actionName,
        grid: job.grid,
        cell: job.cell,
        chromaKey: job.chromaKey,
        spriteVariant: job.spriteVariant,
        sourceImageId: job.sourceImageId,
        sourceImageName: job.sourceImageName
      }));
    if (runningJobs.length > 0) {
      window.localStorage.setItem(PENDING_CODEX_JOB_STORAGE_KEY, JSON.stringify(runningJobs));
      return;
    }
    window.localStorage.removeItem(PENDING_CODEX_JOB_STORAGE_KEY);
  } catch {
    // Pending state is best-effort; the current session still tracks active jobs.
  }
}

function isStoredPendingCodexJob(value: unknown): value is PendingCodexJob {
  if (!value || typeof value !== "object") return false;
  const job = value as Partial<PendingCodexJob>;
  return typeof job.id === "string" && typeof job.path === "string" && typeof job.createdAt === "string";
}

function providerLabel(provider: ProviderId, language: Language) {
  return providerLabels[language][provider];
}

function providerMessage(provider: ProviderStatus, language: Language) {
  return providerMessages[language][provider.id] ?? provider.message;
}

const providerLabels = {
  en: { "local-file": "Local File", "local-generator": "Local Generator", "codex-handoff": "Codex Handoff", "local-inbox": "Local Inbox" },
  ja: { "local-file": "ローカルファイル", "local-generator": "ローカル生成", "codex-handoff": "Codex受け渡し", "local-inbox": "ローカル受信箱" },
  "zh-CN": { "local-file": "本地文件", "local-generator": "本地生成", "codex-handoff": "Codex 交接", "local-inbox": "本地收件箱" },
  "zh-TW": { "local-file": "本地檔案", "local-generator": "本地生成", "codex-handoff": "Codex 交接", "local-inbox": "本地收件匣" },
  ko: { "local-file": "로컬 파일", "local-generator": "로컬 생성", "codex-handoff": "Codex 전달", "local-inbox": "로컬 수신함" },
  ru: { "local-file": "Локальный файл", "local-generator": "Локальная генерация", "codex-handoff": "Handoff Codex", "local-inbox": "Локальный inbox" },
  es: { "local-file": "Archivo local", "local-generator": "Generador local", "codex-handoff": "Handoff Codex", "local-inbox": "Bandeja local" },
  "pt-BR": { "local-file": "Arquivo local", "local-generator": "Gerador local", "codex-handoff": "Handoff Codex", "local-inbox": "Caixa local" },
  de: { "local-file": "Lokale Datei", "local-generator": "Lokaler Generator", "codex-handoff": "Codex-Handoff", "local-inbox": "Lokaler Eingang" },
  fr: { "local-file": "Fichier local", "local-generator": "Générateur local", "codex-handoff": "Handoff Codex", "local-inbox": "Boîte locale" },
  id: { "local-file": "File lokal", "local-generator": "Generator lokal", "codex-handoff": "Handoff Codex", "local-inbox": "Kotak lokal" },
  tr: { "local-file": "Yerel dosya", "local-generator": "Yerel üretici", "codex-handoff": "Codex handoff", "local-inbox": "Yerel gelen kutusu" },
  vi: { "local-file": "Tệp cục bộ", "local-generator": "Trình tạo cục bộ", "codex-handoff": "Handoff Codex", "local-inbox": "Hộp cục bộ" },
  pl: { "local-file": "Plik lokalny", "local-generator": "Generator lokalny", "codex-handoff": "Handoff Codex", "local-inbox": "Lokalna skrzynka" },
  it: { "local-file": "File locale", "local-generator": "Generatore locale", "codex-handoff": "Handoff Codex", "local-inbox": "Inbox locale" }
} satisfies Record<Language, Record<ProviderId, string>>;

const providerMessages = {
  en: { "local-file": "Use images from this machine", "local-generator": "Generate local PNG images", "codex-handoff": "Write local jobs for Codex to pick up", "local-inbox": "Import results returned by Codex" },
  ja: { "local-file": "このマシン上の画像を使います", "local-generator": "このマシン上でPNGを生成します", "codex-handoff": "Codexが拾うローカルジョブを書き込みます", "local-inbox": "Codex outboxの最新画像を取り込みます" },
  "zh-CN": { "local-file": "使用本机图像", "local-generator": "在本机生成 PNG", "codex-handoff": "写入供 Codex 处理的本地作业", "local-inbox": "导入 Codex 返回的结果" },
  "zh-TW": { "local-file": "使用本機圖像", "local-generator": "在本機生成 PNG", "codex-handoff": "寫入供 Codex 處理的本地作業", "local-inbox": "匯入 Codex 返回的結果" },
  ko: { "local-file": "이 컴퓨터의 이미지를 사용합니다", "local-generator": "로컬 PNG 이미지를 생성합니다", "codex-handoff": "Codex가 처리할 로컬 작업을 씁니다", "local-inbox": "Codex가 반환한 결과를 가져옵니다" },
  ru: { "local-file": "Использует изображения с этого компьютера", "local-generator": "Создает локальные PNG", "codex-handoff": "Записывает локальные задания для Codex", "local-inbox": "Импортирует результаты Codex" },
  es: { "local-file": "Usa imágenes de este equipo", "local-generator": "Genera PNG locales", "codex-handoff": "Escribe trabajos locales para Codex", "local-inbox": "Importa resultados devueltos por Codex" },
  "pt-BR": { "local-file": "Usa imagens deste computador", "local-generator": "Gera PNGs locais", "codex-handoff": "Grava jobs locais para o Codex", "local-inbox": "Importa resultados retornados pelo Codex" },
  de: { "local-file": "Bilder von diesem Gerät verwenden", "local-generator": "Lokale PNGs erzeugen", "codex-handoff": "Lokale Jobs für Codex schreiben", "local-inbox": "Von Codex zurückgegebene Ergebnisse importieren" },
  fr: { "local-file": "Utilise les images de cette machine", "local-generator": "Génère des PNG locaux", "codex-handoff": "Écrit des tâches locales pour Codex", "local-inbox": "Importe les résultats renvoyés par Codex" },
  id: { "local-file": "Gunakan gambar dari mesin ini", "local-generator": "Buat PNG lokal", "codex-handoff": "Tulis job lokal untuk Codex", "local-inbox": "Impor hasil dari Codex" },
  tr: { "local-file": "Bu makinedeki görselleri kullanır", "local-generator": "Yerel PNG üretir", "codex-handoff": "Codex için yerel işler yazar", "local-inbox": "Codex sonuçlarını içe aktarır" },
  vi: { "local-file": "Dùng ảnh trên máy này", "local-generator": "Tạo PNG cục bộ", "codex-handoff": "Ghi job cục bộ cho Codex", "local-inbox": "Nhập kết quả Codex trả về" },
  pl: { "local-file": "Używa obrazów z tego komputera", "local-generator": "Tworzy lokalne PNG", "codex-handoff": "Zapisuje lokalne zadania dla Codex", "local-inbox": "Importuje wyniki z Codex" },
  it: { "local-file": "Usa immagini da questa macchina", "local-generator": "Genera PNG locali", "codex-handoff": "Scrive job locali per Codex", "local-inbox": "Importa risultati restituiti da Codex" }
} satisfies Record<Language, Record<ProviderId, string>>;

export default App;
