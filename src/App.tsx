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
  PanelRight,
  Pipette,
  Plug,
  Plus,
  RefreshCw,
  Scissors,
  Settings,
  Square,
  Trash2,
  Upload,
  X
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createAnimatedWebpBlob,
  createGifBlob,
  createSpriteSheetBlob,
  exportWebP,
  exportFramesZip,
  exportGif,
  exportMetadata,
  exportSpriteSheet
} from "./lib/exporters";
import { createId, downloadBlob, loadImage, readFileAsDataUrl } from "./lib/image";
import { calculateGridCells, summarizeFrames } from "./lib/sprite";
import { loadActions, loadFrames, loadHistory, loadPersistedState, saveActions, saveFrames, saveHistory } from "./lib/storage";
import type {
  Annotation,
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
const ANIMATION_FRAME_COUNT = 8;
const ANIMATION_DIRECTION_COUNT = 5;
const MIN_ANIMATION_CELL_SIZE = 512;
const MAX_ACTIVE_CODEX_JOBS = 2;
const ANIMATION_SHEET_GRID: GridSettings = { columns: ANIMATION_FRAME_COUNT, rows: ANIMATION_DIRECTION_COUNT, gutter: 0 };
const ANIMATION_DIRECTIONS = ["front", "back", "back three-quarter", "front three-quarter", "side"];

type Language = "ja" | "en";
type MotionInputMode = "prompt" | "preset";
type AnimationChromaKeyName = "green" | "magenta";
type CodexJobQueueState = "queued" | "running";

interface AnimationChromaKey {
  name: AnimationChromaKeyName;
  label: string;
  hex: string;
  rgb: { r: number; g: number; b: number };
}

const animationChromaKeys: Record<AnimationChromaKeyName, AnimationChromaKey> = {
  green: { name: "green", label: "chroma-key green", hex: "#00ff00", rgb: { r: 0, g: 255, b: 0 } },
  magenta: { name: "magenta", label: "chroma-key magenta", hex: "#ff00ff", rgb: { r: 255, g: 0, b: 255 } }
};

const languageOptions: Array<{ id: Language; label: string }> = [
  { id: "ja", label: "日本語" },
  { id: "en", label: "English" }
];

type WorkflowMode = "image-generate" | "image-edit" | "sprite-generate" | "sprite-edit";

interface PromptExample {
  id: string;
  category: Record<Language, string>;
  title: Record<Language, string>;
  prompt: string;
  negativePrompt: string;
  notes: string;
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
  directions: string[];
  label: string;
  resultWorkflowMode?: WorkflowMode;
  resultActionName?: string;
  resultGrid?: GridSettings;
  resultCell?: SpriteAction["cell"];
  resultChromaKey?: AnimationChromaKeyName;
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
  sourceImageId?: string;
  sourceImageName?: string;
}

interface ImportLatestOptions {
  background?: boolean;
  newerThan?: string;
  quietEmpty?: boolean;
  job?: CodexJobQueueItem;
}

interface AnimationDirectionPreview {
  id: string;
  label: string;
  gifUrl: string;
  webpUrl: string;
  frameCount: number;
}

interface ImageEditComparison {
  before: HistoryItem;
  after?: HistoryItem;
  jobId?: string;
}

const uiCopy = {
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
    promptExamplesIntro: "Pixel-art prompts tuned for Codex imagegen.",
    copyPrompt: "Copy Prompt",
    usePrompt: "Use Prompt",
    closePromptExamples: "Close",
    promptCopied: "Prompt copied",
    promptCopyFailed: "Could not copy prompt",
    promptExampleApplied: "Prompt example loaded into Pixel Art Generation",
    animationStepSourceTitle: "1. Upload Pixel Art",
    animationStepSourceBody: "Use a pixel-art image you generated or imported as the animation source.",
    animationStepMotionTitle: "2. Choose Motion",
    animationStepMotionBody: "Pick a preset or describe the motion you want.",
    animationStepGenerateTitle: "3. Generate",
    animationStepGenerateBody: "Send the uploaded source to Codex and generate a 5-direction chroma-key sprite sheet.",
    animationStepDownloadTitle: "4. Download",
    animationStepDownloadBody: "Preview and export the transparent animated GIF, animated WebP, and sprite sheet.",
    uploadPixelArt: "Upload Pixel Art",
    selectedSource: "Selected source",
    noAnimationSource: "No pixel-art source uploaded yet",
    motionPrompt: "Motion Prompt",
    motionPromptPlaceholder: "Example: idle breathing loop with gentle robe sway and staff glow",
    motionPreset: "Preset",
    motionPromptTab: "Prompt",
    motionPresetTab: "Preset",
    motionPresetAdditionalPrompt: "Additional Prompt (optional)",
    motionPresetAdditionalPromptPlaceholder: "Optional: add robe sway, foot timing, effects, or mood.",
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
    animationGeneratedFrom: "Generated from",
    animationSourceUnknown: "Source image not recorded",
    uploadImageForEdit: "Upload Image",
    selectedEditSource: "Selected image",
    noEditSource: "No image selected yet",
    imageEditRegionsTitle: "Numbered edit regions",
    imageEditRegionsHelp: "Drag a rectangle on the preview. Each rectangle gets a number and a comment box.",
    noEditRegions: "No numbered regions yet. Drag on the preview to add #1.",
    editRegionLabel: "Region",
    editRegionPlaceholder: "Example: add the text X here / remove X from here",
    removeRegion: "Remove region",
    clearRegions: "Clear regions",
    imageEditRegionAdded: "Edit region added",
    imageEditComparisonTitle: "Before / After",
    beforeEdit: "Before",
    afterEdit: "After",
    waitingForEditResult: "Waiting for the edited image from Codex.",
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
    statusCodexJobPending: "Waiting for Codex to return an image",
    statusCodexRunnerUnavailable: "Codex runner unavailable. Return an outbox image, then use Import Latest",
    statusCodexRunnerFailed: "Codex runner stopped before returning an image",
    statusCodexRunnerCompletedNoImage: "Codex runner completed, but no returned image was found",
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
    promptExamplesIntro: "Codex imagegen向けのピクセルアートprompt例です。",
    copyPrompt: "プロンプトをコピー",
    usePrompt: "この例を使う",
    closePromptExamples: "閉じる",
    promptCopied: "プロンプトをコピーしました",
    promptCopyFailed: "プロンプトをコピーできませんでした",
    promptExampleApplied: "プロンプト例をピクセルアート生成へ入れました",
    animationStepSourceTitle: "1. ピクセルアートをアップロード",
    animationStepSourceBody: "生成または取り込んだピクセルアートをアニメーション元にします。",
    animationStepMotionTitle: "2. 動きを選ぶ",
    animationStepMotionBody: "プリセットを選ぶか、させたい動きをpromptで入力します。",
    animationStepGenerateTitle: "3. 生成する",
    animationStepGenerateBody: "アップロード画像からanimation sheetとtimeline framesを生成します。",
    animationStepDownloadTitle: "4. ダウンロード",
    animationStepDownloadBody: "生成結果をanimated GIF、animated WebP、sprite sheetで書き出します。",
    uploadPixelArt: "ピクセルアートをアップロード",
    selectedSource: "選択中の元画像",
    noAnimationSource: "まだ元になるピクセルアートがありません",
    motionPrompt: "動きのprompt",
    motionPromptPlaceholder: "例: idle breathing loop with gentle robe sway and staff glow",
    motionPreset: "プリセット",
    motionPromptTab: "Prompt",
    motionPresetTab: "プリセット",
    motionPresetAdditionalPrompt: "追加prompt（任意）",
    motionPresetAdditionalPromptPlaceholder: "任意: 揺れ、足運び、エフェクト、雰囲気などを追加できます。",
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
    animationGeneratedFrom: "生成元",
    animationSourceUnknown: "生成元画像が記録されていません",
    uploadImageForEdit: "画像をアップロード",
    selectedEditSource: "選択中の画像",
    noEditSource: "まだ画像が選択されていません",
    imageEditRegionsTitle: "番号付き編集範囲",
    imageEditRegionsHelp: "プレビュー上をドラッグして矩形選択します。矩形には番号が付き、番号ごとにコメントできます。",
    noEditRegions: "まだ編集範囲がありません。プレビュー上をドラッグして #1 を追加してください。",
    editRegionLabel: "範囲",
    editRegionPlaceholder: "例: ここにXというテキスト追加 / ここのXを削除",
    removeRegion: "範囲を削除",
    clearRegions: "範囲を全削除",
    imageEditRegionAdded: "編集範囲を追加しました",
    imageEditComparisonTitle: "編集前 / 編集後",
    beforeEdit: "編集前",
    afterEdit: "編集後",
    waitingForEditResult: "Codexから編集後画像が戻るのを待っています。",
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
    statusCodexJobPending: "Codexから画像が戻るのを待っています",
    statusCodexRunnerUnavailable: "Codex runner起動不可。outboxへ画像を戻したらImport Latestを押してください",
    statusCodexRunnerFailed: "Codex runnerが画像を返す前に停止しました",
    statusCodexRunnerCompletedNoImage: "Codex runnerは完了しましたが、戻り画像が見つかりません",
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
} satisfies Record<Language, Record<string, string>>;

const workflowCopy: Record<Language, Record<WorkflowMode, { label: string; detail: string; status: string }>> = {
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
};

const workflowFormCopy: Record<
  Language,
  Record<WorkflowMode, { promptLabel: string; negativeLabel: string; notesLabel: string; notesPlaceholder: string }>
> = {
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
};

const defaultActions: SpriteAction[] = [
  { name: "idle", fps: 12, loop: true, frameIds: [], cell: { width: 512, height: 512 }, anchor: { x: 256, y: 472 } },
  { name: "walk", fps: 12, loop: true, frameIds: [], cell: { width: 512, height: 512 }, anchor: { x: 256, y: 472 } },
  { name: "cast", fps: 10, loop: false, frameIds: [], cell: { width: 512, height: 512 }, anchor: { x: 256, y: 472 } },
  { name: "attack", fps: 10, loop: false, frameIds: [], cell: { width: 512, height: 512 }, anchor: { x: 256, y: 472 } }
];

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
    prompt:
      "Create one original pixel-art game asset concept image: a tiny clockwork mushroom courier carrying a glowing blue delivery satchel, isolated full body on a simple flat chroma-key green background, crisp readable silhouette, 16-bit pixel-art inspired rendering, transparent-game-asset feel, warm amber satchel glow, no scenery, no readable text, no logo, no watermark, no numbers.",
    negativePrompt: "text, logo, watermark, numbers, photorealistic face, blurry silhouette, placeholder geometric-only output, busy background, detailed scenery",
    notes: "Prompt-only image generation. Use a simple chroma-key background so the character can be separated for animation."
  },
  {
    id: "forest-mage-idle",
    category: { en: "Character", ja: "キャラクター" },
    title: { en: "Forest Mage Idle Sprite", ja: "森の魔法使いアイドル" },
    prompt:
      "Create a single full-body pixel-art character asset: a small forest mage with a leaf hood, carved wooden staff, soft green cloak, amber charm, friendly confident pose, idle-animation ready stance, clear feet contact, centered subject, simple flat chroma-key green background, 32-bit fantasy RPG palette, crisp silhouette, no scenery, no readable text, no logo, no watermark.",
    negativePrompt: "cropped feet, extra arms, text, logo, watermark, blurry edges, realistic skin, busy background, gradient background",
    notes: "Character should be easy to cut out and animate later. Keep pose neutral, balanced, readable, and on a simple background."
  },
  {
    id: "ember-slime-companion",
    category: { en: "Creature", ja: "クリーチャー" },
    title: { en: "Ember Slime Companion", ja: "火種スライム" },
    prompt:
      "Create a cute pixel-art creature asset: a small ember slime companion with a warm orange core, tiny charcoal feet, two expressive glowing eyes, faint heat shimmer, simple rounded body, readable silhouette, isolated on a simple flat chroma-key blue background, collectible monster game style, clean 16-bit pixel-art inspired rendering, no scenery, no text, no logo, no watermark.",
    negativePrompt: "scary horror, text, logo, watermark, photorealistic fire, over-detailed smoke, cropped body, complex background",
    notes: "Creature design should be simple enough for idle, hop, and attack animation variants, with a plain background for cleanup."
  },
  {
    id: "crystal-export-station",
    category: { en: "Prop", ja: "小物" },
    title: { en: "Crystal Export Station", ja: "水晶の書き出し台" },
    prompt:
      "Create a pixel-art game prop asset: a compact crystal export station made of mossy stone and brass rails, three amber crystals glowing above small sockets, teal interface sparks, isometric-front readable angle, isolated prop on a simple flat chroma-key green background, crisp edge clusters, no scenery, no readable text, no logo, no watermark, no numbers.",
    negativePrompt: "letters, labels, UI words, logo, watermark, photorealism, cluttered background, broken perspective, detailed room",
    notes: "Prop should read clearly as a small interactive workstation and stay easy to separate from the background."
  },
  {
    id: "rainy-neon-forest-tile",
    category: { en: "Environment", ja: "背景" },
    title: { en: "Rainy Neon Forest Tile", ja: "雨のネオン森タイル" },
    prompt:
      "Create a pixel-art environment tile concept: a small isolated rainy neon forest ground tile with wet stone path, cyan puddle reflections, small purple mushrooms, dark green leaves, top-down three-quarter RPG perspective, tile edges clearly visible, simple flat chroma-key green background outside the tile footprint, no characters, no readable text, no logo, no watermark.",
    negativePrompt: "characters, text, logo, watermark, photorealistic rain, unreadable clutter, full landscape, complex surrounding background",
    notes: "Keep it tile-friendly, isolated, and surrounded by a simple background so the tile can be extracted."
  },
  {
    id: "sprite-sheet-workbench",
    category: { en: "Scene", ja: "シーン" },
    title: { en: "Sprite-Sheet Workbench", ja: "スプライト作業台" },
    prompt:
      "Create a pixel-art inspired production-tool prop: a compact fantasy sprite-sheet workbench with glowing teal grid panels, tiny frame thumbnails, amber export crystals, pinned annotation marks, wooden desk silhouette, isolated object on a simple flat chroma-key green background, crisp readable composition, no scenery wall, no readable text, no logo, no watermark, no numbers.",
    negativePrompt: "readable UI text, letters, numbers, logo, watermark, photorealistic monitor, blurry composition, complex room background",
    notes: "Use this when testing whether complex production-tool concepts survive the imagegen prompt while still remaining easy to cut out."
  }
];

function normalizeAnimationActions(actions: SpriteAction[]) {
  const source = actions.length > 0 ? actions : defaultActions;
  return source.map((action) => normalizeAnimationAction(action));
}

function normalizeAnimationAction(action: SpriteAction): SpriteAction {
  const width = Math.max(MIN_ANIMATION_CELL_SIZE, action.cell.width);
  const height = Math.max(MIN_ANIMATION_CELL_SIZE, action.cell.height);
  const scaleX = width / Math.max(1, action.cell.width);
  const scaleY = height / Math.max(1, action.cell.height);
  const cellChanged = width !== action.cell.width || height !== action.cell.height;
  const anchor = cellChanged
    ? {
        x: clampInteger(Math.round(action.anchor.x * scaleX), 0, width),
        y: clampInteger(Math.round(action.anchor.y * scaleY), 0, height)
      }
    : action.anchor;

  return {
    ...action,
    cell: { width, height },
    anchor
  };
}

function clampInteger(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function App() {
  const [history, setHistory] = useState<HistoryItem[]>(() => loadHistory());
  const [frames, setFrames] = useState<SpriteFrame[]>(() => loadFrames());
  const [actions, setActions] = useState<SpriteAction[]>(() => normalizeAnimationActions(loadActions(defaultActions)));
  const [selectedId, setSelectedId] = useState<string>("");
  const [activeActionName, setActiveActionName] = useState("idle");
  const [language, setLanguage] = useState<Language>(loadLanguage);
  const [storageHydrated, setStorageHydrated] = useState(false);
  const [workflowMode, setWorkflowMode] = useState<WorkflowMode>("image-generate");
  const [showPromptExamples, setShowPromptExamples] = useState(false);
  const [providerId, setProviderId] = useState<ProviderId>("codex-handoff");
  const [motionInputMode, setMotionInputMode] = useState<MotionInputMode>("prompt");
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
  const [gifPreviewUrl, setGifPreviewUrl] = useState("");
  const [webpPreviewUrl, setWebpPreviewUrl] = useState("");
  const [spriteSheetPreviewUrl, setSpriteSheetPreviewUrl] = useState("");
  const [animationDirectionPreviews, setAnimationDirectionPreviews] = useState<AnimationDirectionPreview[]>([]);
  const [animationChromaKey, setAnimationChromaKey] = useState<AnimationChromaKeyName>("green");
  const [imageEditComparison, setImageEditComparison] = useState<ImageEditComparison | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const startingQueuedJobIdsRef = useRef<Set<string>>(new Set());
  const lastPointerEventAtRef = useRef(0);
  const copy = uiCopy[language];

  const selected = useMemo(
    () => history.find((item) => item.id === selectedId) ?? history[0],
    [history, selectedId]
  );

  const animationSource = useMemo(
    () => history.find((item) => item.id === animationSourceId) ?? (isAnimationSource(selected) ? selected : undefined),
    [animationSourceId, history, selected]
  );

  const activeAction = useMemo(
    () => actions.find((action) => action.name === activeActionName) ?? actions[0],
    [actions, activeActionName]
  );

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

  const selectedAnimationExportReady = Boolean(
    selected && selected.source === "generate" && selectedAnimationFrames.length > 0
  );

  const selectedAnimationSource = useMemo(
    () =>
      selected?.derivedFromId
        ? history.find((item) => item.id === selected.derivedFromId)
        : undefined,
    [history, selected]
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

  useEffect(() => {
    let cancelled = false;
    loadPersistedState(defaultActions)
      .then((persisted) => {
        if (cancelled) return;
        setHistory(persisted.history);
        setFrames(persisted.frames);
        setActions(normalizeAnimationActions(persisted.actions));
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
  useEffect(() => saveLanguage(language), [language]);
  useEffect(() => savePendingCodexJobs(codexJobs), [codexJobs]);

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
    if (!selectedAnimationExportReady) {
      setGifPreviewUrl("");
      setWebpPreviewUrl("");
      setSpriteSheetPreviewUrl("");
      setAnimationDirectionPreviews([]);
      return;
    }
    let cancelled = false;
    const objectUrls: string[] = [];
    const directionActions = buildAnimationDirectionPreviewActions(selectedAnimationAction, selectedAnimationFrames);

    Promise.all([
      Promise.all(
        directionActions.map(async ({ directionId, action }) => ({
          id: directionId,
          label: animationDirectionLabel(directionId, language),
          frameCount: action.frameIds.length,
          gifBlob: await createGifBlob(frames, action),
          webpBlob: await createAnimatedWebpBlob(frames, action)
        }))
      ),
      createSpriteSheetBlob(frames, activeAction, ANIMATION_FRAME_COUNT)
    ])
      .then(([directionBlobs, spriteSheetBlob]) => {
        if (cancelled) return;
        const directionPreviews = directionBlobs.map((preview) => {
          const gifUrl = URL.createObjectURL(preview.gifBlob);
          const webpUrl = URL.createObjectURL(preview.webpBlob);
          objectUrls.push(gifUrl, webpUrl);
          return {
            id: preview.id,
            label: preview.label,
            frameCount: preview.frameCount,
            gifUrl,
            webpUrl
          };
        });
        const sheetUrl = URL.createObjectURL(spriteSheetBlob);
        objectUrls.push(sheetUrl);
        setAnimationDirectionPreviews(directionPreviews);
        setGifPreviewUrl(directionPreviews[0]?.gifUrl ?? "");
        setWebpPreviewUrl(directionPreviews[0]?.webpUrl ?? "");
        setSpriteSheetPreviewUrl(sheetUrl);
      })
      .catch(() => {
        setGifPreviewUrl("");
        setWebpPreviewUrl("");
        setSpriteSheetPreviewUrl("");
        setAnimationDirectionPreviews([]);
      });
    return () => {
      cancelled = true;
      objectUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [frames, language, selectedAnimationAction, selectedAnimationExportReady, selectedAnimationFrames]);

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
            removeCodexJob(job.id);
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
    const sourceImageForJob = isAnimationJob ? animationSource : selected;
    const animationAction = normalizeAnimationAction(activeAction);
    const spriteGrid = isAnimationJob ? ANIMATION_SHEET_GRID : grid;
    const spriteCell = isAnimationJob ? animationAction.cell : activeAction.cell;
    const spriteFrameCount = spriteGrid.columns * spriteGrid.rows;

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
      ? buildAnimationCodexPrompt({
          sourceName: sourceImageForJob?.name ?? "",
          motionPrompt: prompt,
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
      ? buildAnimationCodexNotes({
          userNotes: jobNotes,
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
      size: isAnimationJob ? `${spriteCell.width * spriteGrid.columns}x${spriteCell.height * spriteGrid.rows}` : size,
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
      directions: isAnimationJob ? ANIMATION_DIRECTIONS : [],
      label: codexJobLabel(workflowMode, prompt, isAnimationJob ? animationAction.name : undefined),
      resultWorkflowMode: workflowMode ?? undefined,
      resultActionName: isAnimationJob ? animationAction.name : undefined,
      resultGrid: isAnimationJob ? spriteGrid : undefined,
      resultCell: isAnimationJob ? spriteCell : undefined,
      resultChromaKey: isAnimationJob ? chromaDecision.key.name : undefined,
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

  function removeCodexJob(jobId: string) {
    setCodexJobs((current) => current.filter((job) => job.id !== jobId));
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
    const newFrames = await splitImageIntoFrames(sheetDataUrl, sheetName.replace(/\.[^.]+$/, ""), animationGrid, item.id, animationAction.cell);

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
    const spriteGrid = pendingJob.grid ?? ANIMATION_SHEET_GRID;
    const spriteCell = pendingJob.cell ?? normalizeAnimationAction(activeAction).cell;
    const chromaKey = animationChromaKeys[pendingJob.chromaKey ?? animationChromaKey];
    const transparentSheetDataUrl = await createTransparentSpriteSheetDataUrl(imported.dataUrl, chromaKey);
    const image = await loadImage(transparentSheetDataUrl);
    const baseName = imported.name.replace(/\.[^.]+$/, "");
    const item: HistoryItem = {
      id: createId("hist"),
      name: `${baseName}_transparent.png`,
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
    const newFrames = await splitImageIntoFrames(transparentSheetDataUrl, baseName, spriteGrid, item.id, spriteCell);
    if (newFrames.length === 0) throw new Error("Returned sprite sheet could not be split into frames.");

    setAnimationChromaKey(chromaKey.name);
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

  async function importLatestOutboxResult(options: ImportLatestOptions = {}) {
    if (!options.background) setIsBusy(true);
    try {
      const pendingJob = options.job;
      const listResponse = await fetch("/api/codex/results");
      if (!listResponse.ok) throw new Error(await listResponse.text());
      const listData = (await listResponse.json()) as { outboxPath: string; results: CodexOutboxResult[] };
      const newerThanTime = options.newerThan ? Date.parse(options.newerThan) : Number.NEGATIVE_INFINITY;
      const latest = listData.results.find((result) => {
        if (Date.parse(result.modifiedAt) < newerThanTime) return false;
        return pendingJob ? result.name.startsWith(`${pendingJob.id}-`) : true;
      });
      if (!latest) {
        if (!options.quietEmpty) setStatus(`${copy.statusInboxEmpty}: ${listData.outboxPath}`);
        return false;
      }

      const importResponse = await fetch(`/api/codex/results/${encodeURIComponent(latest.name)}`);
      if (!importResponse.ok) throw new Error(await importResponse.text());
      const imported = (await importResponse.json()) as CodexOutboxImportResponse;
      if (pendingJob?.workflowMode === "sprite-generate") {
        await importAnimationSheetResult(imported, pendingJob);
        removeCodexJob(pendingJob.id);
        return true;
      }

      const image = await loadImage(imported.dataUrl);
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
        source: "inbox"
      };
      const isImageEditImport = pendingJob?.workflowMode === "image-edit" || (!pendingJob && workflowMode === "image-edit" && imageEditComparison?.before);
      let imageEditBefore: HistoryItem | undefined;
      if (isImageEditImport) {
        imageEditBefore =
          history.find((historyItem) => historyItem.id === pendingJob?.sourceImageId) ??
          imageEditComparison?.before ??
          selected;
        if (imageEditBefore) setImageEditComparison({ before: imageEditBefore, after: item, jobId: pendingJob?.id ?? imageEditComparison?.jobId });
      }
      setHistory((current) => [item, ...current]);
      setSelectedId(imageEditBefore?.id ?? item.id);
      setSelectedFrameId("");
      if (pendingJob) removeCodexJob(pendingJob.id);
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
    const directionActions = buildAnimationDirectionPreviewActions(selectedAnimationAction, selectedAnimationFrames);
    for (const { directionId, action } of directionActions) {
      const blob = format === "gif"
        ? await createGifBlob(frames, action)
        : await createAnimatedWebpBlob(frames, action);
      downloadBlob(blob, `${selectedAnimationAction.name}_${directionId.replace(/\s+/g, "-")}.${format}`);
    }
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
  }

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
      setActiveActionName("idle");
      setMotionInputMode("prompt");
      setShowGrid(true);
      setShowCenter(true);
      setGrid(mode === "sprite-generate" ? ANIMATION_SHEET_GRID : { columns: ANIMATION_FRAME_COUNT, rows: 1, gutter: 0 });
      setActions((current) => normalizeAnimationActions(current));
    }
    if (mode === "sprite-generate") {
      setAnimationSourceId(selected && isAnimationSource(selected) ? selected.id : "");
    }
    if (mode === "sprite-generate" && !isAnimationSource(selected)) {
      setStatus(copy.statusAnimationSourceRequired);
      return;
    }
    setStatus(workflowCopy[language][mode].status);
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

  const codexProvider = providers.find((provider) => provider.id === "codex-handoff");
  const activeWorkflowCopy = workflowCopy[language][workflowMode];
  const activeWorkflowFormCopy = workflowFormCopy[language][workflowMode];
  const codexQueueCopy = codexJobQueueLabels(language);
  const runningCodexJobCount = codexJobs.filter((job) => job.state === "running").length;
  const shouldQueueCodexJob = providerId === "codex-handoff" && runningCodexJobCount >= MAX_ACTIVE_CODEX_JOBS;
  const isAnimationWorkflow = workflowMode === "sprite-generate";
  const isImageEditWorkflow = workflowMode === "image-edit";
  const animationSourceReady = !isAnimationWorkflow || isAnimationSource(animationSource);
  const imageEditSourceReady = !isImageEditWorkflow || Boolean(selected);
  const primaryActionDisabled = isBusy || !animationSourceReady || !imageEditSourceReady;
  const previewMode = !selected ? "empty" : isPreviewingSelectedFrame ? "frame" : isImageEditWorkflow ? "edit" : "result";
  const previewStatus = isPreviewingSelectedFrame && selectedFrameForPreview
    ? `${copy.frameLabel}: ${selectedFrameForPreview.index}`
    : `${copy.previewLabel}: ${selected?.name ?? "-"}`;
  const previewSize = isPreviewingSelectedFrame && selectedFrameForPreview
    ? `${selectedFrameForPreview.width}x${selectedFrameForPreview.height}`
    : selected?.size ?? "-";
  const animationDownloadTitle = copy.animationStepDownloadTitle.replace(/^4\.\s*/, "");
  const showFrameGridControls = SHOW_LOW_PRIORITY_CONTROLS || workflowMode === "sprite-edit";
  const showSpriteTuningControls = SHOW_LOW_PRIORITY_CONTROLS || workflowMode === "sprite-edit";
  const showAnnotationToolbar = isImageEditWorkflow;
  const showSpriteActionsPanel = SHOW_SPRITE_ACTIONS_PANEL;

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
          {providerId === "codex-handoff" && codexJobs.length > 0 && (
            <CodexJobShelf jobs={codexJobs} maxActive={MAX_ACTIVE_CODEX_JOBS} language={language} />
          )}

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
                <div className="motion-mode-tabs">
                  <button className={motionInputMode === "prompt" ? "active" : ""} onClick={() => setMotionInputMode("prompt")}>
                    {copy.motionPromptTab}
                  </button>
                  <button className={motionInputMode === "preset" ? "active" : ""} onClick={() => setMotionInputMode("preset")}>
                    {copy.motionPresetTab}
                  </button>
                </div>
                {motionInputMode === "preset" ? (
                  <>
                    <small className="step-kicker">{copy.motionPreset}</small>
                    <div className="motion-presets">
                      {actions.map((action) => (
                        <button
                          key={action.name}
                          className={action.name === activeAction.name ? "active" : ""}
                          onClick={() => {
                            setActiveActionName(action.name);
                            setGrid(ANIMATION_SHEET_GRID);
                          }}
                        >
                          {action.name}
                        </button>
                      ))}
                    </div>
                    <label className="field compact-field">
                      <span>{copy.motionPresetAdditionalPrompt}</span>
                      <textarea
                        value={prompt}
                        onChange={(event) => setPrompt(event.target.value)}
                        maxLength={1200}
                        placeholder={copy.motionPresetAdditionalPromptPlaceholder}
                      />
                      <small>{prompt.length} / 1200</small>
                    </label>
                  </>
                ) : (
                  <label className="field compact-field">
                    <span>{copy.motionPrompt}</span>
                    <textarea
                      value={prompt}
                      onChange={(event) => setPrompt(event.target.value)}
                      maxLength={1200}
                      placeholder={copy.motionPromptPlaceholder}
                    />
                    <small>{prompt.length} / 1200</small>
                  </label>
                )}
              </section>

              <section className="animation-step">
                <div className="step-heading">
                  <strong>{copy.animationStepGenerateTitle}</strong>
                  <span>{copy.animationStepGenerateBody}</span>
                </div>
                <div className="field-row compact-row">
                  <NumberField label={copy.frameWidth} value={activeAction.cell.width} min={MIN_ANIMATION_CELL_SIZE} onChange={(width) => updateCell(width, activeAction.cell.height)} />
                  <NumberField label={copy.frameHeight} value={activeAction.cell.height} min={MIN_ANIMATION_CELL_SIZE} onChange={(height) => updateCell(activeAction.cell.width, height)} />
                </div>
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
                    <span>{copy.imageEditRegionsHelp}</span>
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
              {isImageEditWorkflow && (
                <section className="image-edit-compare">
                  <div className="step-heading">
                    <strong>{copy.imageEditComparisonTitle}</strong>
                    <span>{imageEditComparison?.after ? copy.statusInboxImported : copy.waitingForEditResult}</span>
                  </div>
                  <div className="edit-compare-grid">
                    <figure>
                      <figcaption>{copy.beforeEdit}</figcaption>
                      {(imageEditComparison?.before ?? selected) ? (
                        <img src={(imageEditComparison?.before ?? selected)?.dataUrl} alt="" />
                      ) : (
                        <span>{copy.noEditSource}</span>
                      )}
                    </figure>
                    <figure>
                      <figcaption>{copy.afterEdit}</figcaption>
                      {imageEditComparison?.after ? (
                        <img src={imageEditComparison.after.dataUrl} alt="" />
                      ) : (
                        <span>{copy.waitingForEditResult}</span>
                      )}
                    </figure>
                  </div>
                </section>
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

        <section className={`workspace ${isAnimationWorkflow ? "with-animation-downloads" : ""}`}>
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
                <div className="result-preview-frame">
                  <img className="result-preview-image" src={selected.dataUrl} alt="" />
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
              {isAnimationWorkflow && selectedAnimationExportReady && (
                <span className="animation-source-status">
                  {copy.animationGeneratedFrom}: {selectedAnimationSource?.name ?? selected?.derivedFromName ?? copy.animationSourceUnknown}
                </span>
              )}
              <span>{copy.sizeLabel}: {previewSize}</span>
              <span>{copy.anchorLabel}: {activeAction.anchor.x}, {activeAction.anchor.y}</span>
              <span>{copy.zoomLabel}: {copy.zoomFit}</span>
              <span className="swatch" style={{ background: annotationColor }} />
            </div>
          </div>
          {isAnimationWorkflow && (
            <section className={`panel animation-download-panel ${selectedAnimationExportReady ? "complete" : ""}`}>
              <PanelTitle index="4" title={animationDownloadTitle} />
              <div className="animation-download-body">
                <div className="step-heading">
                  <strong>{selected?.name ?? copy.animationStepDownloadTitle}</strong>
                  <span>{copy.animationStepDownloadBody}</span>
                </div>
                {selectedAnimationExportReady && <small className="step-kicker">{copy.animationReady}</small>}
                <div className="animation-preview-grid">
                  <div className="animation-preview-card direction-preview-card">
                    <strong>{(copy as Record<string, string>).directionalPreviews ?? "Directional Previews"}</strong>
                    {selectedAnimationExportReady && animationDirectionPreviews.length > 0 ? (
                      <div className="direction-preview-list">
                        {animationDirectionPreviews.map((preview) => (
                          <div className="direction-preview-row" key={preview.id}>
                            <span>{preview.label}</span>
                            <div className="direction-preview-media">
                              <div className="direction-preview-slot">
                                <small>{(copy as Record<string, string>).previewGif ?? "GIF"}</small>
                                <div className="animation-preview compact-animation-preview">
                                  <img src={preview.gifUrl} alt="" />
                                </div>
                              </div>
                              <div className="direction-preview-slot">
                                <small>{(copy as Record<string, string>).previewWebP ?? "WebP"}</small>
                                <div className="animation-preview compact-animation-preview">
                                  <img src={preview.webpUrl} alt="" />
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="animation-preview">
                        <span>{copy.animationDownloadsLocked}</span>
                      </div>
                    )}
                  </div>
                  <div className="animation-preview-card">
                    <strong>{(copy as Record<string, string>).previewSpriteSheet ?? "Sprite Sheet Preview"}</strong>
                    <div className="animation-preview sheet-preview">
                      {selectedAnimationExportReady && spriteSheetPreviewUrl ? <img src={spriteSheetPreviewUrl} alt="" /> : <span>{copy.animationDownloadsLocked}</span>}
                    </div>
                  </div>
                </div>
                <div className="download-grid">
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
                </div>
              </div>
            </section>
          )}
        </section>

        <aside className="panel history-panel">
          <PanelTitle index="3" title={copy.results} />
          {SHOW_LOW_PRIORITY_CONTROLS && (
            <div className="tabs">
              <button className="tab active">History</button>
              <button className="tab">Adopted ({history.filter((item) => item.adopted).length})</button>
            </div>
          )}
          <div className="history-list">
            {history.map((item) => (
              <button
                key={item.id}
                className={`history-item ${selected?.id === item.id ? "selected" : ""}`}
                onClick={() => selectHistoryResult(item)}
              >
                <img src={item.dataUrl} alt="" />
                <span>
                  <strong>{item.name}</strong>
                  <small>{formatTime(item.createdAt)} • {providerLabel(item.provider, language)}</small>
                  <small>{item.size} • {item.source}</small>
                </span>
                {SHOW_LOW_PRIORITY_CONTROLS && item.adopted && <em>Adopted</em>}
              </button>
            ))}
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
  if (language === "ja") {
    return {
      title: "Codexジョブ",
      activeSlots: "実行枠",
      running: "実行中",
      queued: "待機中",
      waitingForSlot: "空き枠待ち",
      queueAction: "キューに追加",
      queuedStatus: "Codexキューに追加しました"
    };
  }

  return {
    title: "Codex Jobs",
    activeSlots: "Active",
    running: "Running",
    queued: "Queued",
    waitingForSlot: "Waiting for an open slot",
    queueAction: "Queue Codex Job",
    queuedStatus: "Codex job queued"
  };
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
  if (greenPixels >= 80 && ratio >= 0.015) {
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
    `Use the uploaded source image "${sourceName}" as the character reference.`,
    `Extract only the character and create a pixel-art sprite sheet of that character ${motion}.`,
    `Create exactly ${ANIMATION_DIRECTION_COUNT} direction rows in this order: ${ANIMATION_DIRECTIONS.join(", ")}.`,
    `Each direction row must contain exactly ${ANIMATION_FRAME_COUNT} animation frames, for ${ANIMATION_FRAME_COUNT * ANIMATION_DIRECTION_COUNT} total cells.`,
    `Target each cell as ${cell.width}x${cell.height} pixels, arranged as ${ANIMATION_FRAME_COUNT} columns by ${ANIMATION_DIRECTION_COUNT} rows.`,
    `Use a flat ${chromaKey.label} background (${chromaKey.hex}) in every cell; do not use gradients, scenery, shadows, UI, text, logos, watermarks, letters, or numbers.`,
    "Keep the character centered in every frame with consistent scale, readable full body, clear feet contact, and pixel-art edges.",
    "Return one complete raster sprite sheet PNG or WebP using the job id filename prefix."
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
    `Animation sprite workflow: generate a source-image-driven sprite sheet through Codex imagegen / built-in image_gen, then Image Cockpit will remove the ${chromaKey.label} background.`,
    `Chroma key decision: ${chromaKey.name} ${chromaKey.hex}. ${chromaReason}`,
    `Expected sheet layout: ${grid.columns} columns x ${grid.rows} rows, ${cell.width}x${cell.height} per cell.`,
    `Direction rows: ${ANIMATION_DIRECTIONS.join(", ")}.`,
    "The generated sheet should keep the chroma key background simple and flat so the app can remove it reliably."
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
  return canvas.toDataURL("image/png");
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

function isCharacterGreenPixel(data: Uint8ClampedArray, offset: number) {
  const r = data[offset];
  const g = data[offset + 1];
  const b = data[offset + 2];
  const saturatedGreen = g > 95 && g > r * 1.18 && g > b * 1.18;
  const naturalGreen = g > 72 && g >= r + 18 && g >= b + 14 && r < 150;
  return saturatedGreen || naturalGreen;
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
    const semanticKey =
      chromaKey.name === "green"
        ? data[offset + 1] > 120 && data[offset + 1] > data[offset] * 1.25 && data[offset + 1] > data[offset + 2] * 1.25
        : data[offset] > 150 && data[offset + 2] > 130 && data[offset + 1] < Math.min(data[offset], data[offset + 2]) * 0.72;
    if (closeToKey || semanticKey) data[offset + 3] = 0;
  }

  context.putImageData(imageData, 0, 0);
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

export function shouldWaitForCodexRunner(status?: CodexRunnerStatus) {
  if (!status) return true;
  return status.state === "running";
}

function runnerStatusMessage(status: CodexRunnerStatus | undefined, copy: Record<string, string>) {
  if (!status || status.state === "running") return copy.statusCodexJobPending;
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
              <div className="prompt-card-meta">
                <small>{example.category[language]}</small>
              </div>
              <h2>{example.title[language]}</h2>
              <p className="prompt-card-text">{example.prompt}</p>
              <p className="prompt-card-negative">{example.negativePrompt}</p>
              <small className="prompt-card-note">{example.notes}</small>
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
  targetCell?: { width: number; height: number }
): Promise<SpriteFrame[]> {
  const image = await loadImage(dataUrl);
  const cells = calculateGridCells(image.width, image.height, grid);
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) return [];
  return cells.map((cell) => {
    const width = targetCell?.width ?? cell.width;
    const height = targetCell?.height ?? cell.height;
    canvas.width = width;
    canvas.height = height;
    context.clearRect(0, 0, width, height);
    context.drawImage(image, cell.x, cell.y, cell.width, cell.height, 0, 0, width, height);
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

export function resolveInitialLanguage(stored: string | null, browserLanguages: readonly string[] = []): Language {
  if (stored === "ja" || stored === "en") return stored;
  return browserLanguages.some((language) => language.toLowerCase().startsWith("ja")) ? "ja" : "en";
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
  if (language === "ja") return `${count}件の画像を取り込みました`;
  return `${count} image${count === 1 ? "" : "s"} imported`;
}

function formatFramesAddedStatus(count: number, actionName: string, language: Language) {
  if (language === "ja") return `${actionName} に ${count}件のフレームを追加しました`;
  return `${count} frame${count === 1 ? "" : "s"} added to ${actionName}`;
}

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
  if (language === "ja") {
    if (provider === "local-file") return "ローカルファイル";
    if (provider === "local-generator") return "ローカル生成";
    if (provider === "codex-handoff") return "Codex受け渡し";
    return "ローカル受信箱";
  }
  if (provider === "local-file") return "Local File";
  if (provider === "local-generator") return "Local Generator";
  if (provider === "codex-handoff") return "Codex Handoff";
  return "Local Inbox";
}

function providerMessage(provider: ProviderStatus, language: Language) {
  if (language === "ja") {
    if (provider.id === "local-file") return "このマシン上の画像を使います";
    if (provider.id === "local-generator") return "このマシン上でPNGを生成します";
    if (provider.id === "codex-handoff") return "Codexが拾うローカルジョブを書き込みます";
    return "Codex outboxの最新画像を取り込みます";
  }
  return provider.message;
}

export default App;
