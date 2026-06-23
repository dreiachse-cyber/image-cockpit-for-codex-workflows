import {
  AlertTriangle,
  Archive,
  ArrowLeft,
  ArrowRight,
  Brush,
  CheckCircle2,
  Copy,
  Download,
  FileArchive,
  FileImage,
  FileJson,
  Film,
  FolderOpen,
  Grid3X3,
  ImagePlus,
  Languages,
  Loader2,
  MousePointer2,
  MoveUpRight,
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
  createGifBlob,
  exportWebP,
  exportFramesZip,
  exportGif,
  exportMetadata,
  exportSpriteSheet
} from "./lib/exporters";
import { createId, downloadBlob, loadImage, readFileAsDataUrl } from "./lib/image";
import { calculateGridCells, summarizeFrames } from "./lib/sprite";
import { loadActions, loadFrames, loadHistory, saveActions, saveFrames, saveHistory } from "./lib/storage";
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
const ANIMATION_FRAME_COUNT = 8;

type Language = "ja" | "en";

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
}

interface ImportLatestOptions {
  background?: boolean;
  newerThan?: string;
  quietEmpty?: boolean;
}

const uiCopy = {
  en: {
    language: "Language",
    guidedStart: "Start",
    localCodexHandoff: "local Codex handoff",
    project: "Project: Forest Mage",
    openWorkspace: "Open workspace",
    settings: "Settings",
    localWorkspace: "Local workspace",
    workflowPanelTitle: "Workflow",
    canvasGridTitle: "Animation Setup",
    canvasAnnotationTitle: "Preview",
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
    animationStepGenerateBody: "Create an animation sheet and timeline frames from the uploaded source.",
    animationStepDownloadTitle: "4. Download",
    animationStepDownloadBody: "Export the generated result as an animated GIF, animated WebP, or sprite sheet.",
    uploadPixelArt: "Upload Pixel Art",
    selectedSource: "Selected source",
    noAnimationSource: "No pixel-art source uploaded yet",
    motionPrompt: "Motion Prompt",
    motionPromptPlaceholder: "Example: idle breathing loop with gentle robe sway and staff glow",
    motionPreset: "Preset",
    animationReady: "Animation frames ready",
    animatedGif: "Animated GIF",
    animatedWebP: "Animated WebP",
    spriteSheetDownload: "Sprite Sheet",
    animationDownloadsLocked: "Generate animation frames before downloading.",
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
    jobNotesPlaceholder: "What should Codex preserve, fix, crop, split, or export?",
    guidedQuestion: "Choose what to make",
    guidedIntro: "Pixel art first, then animation from a selected pixel-art source.",
    guidedNote:
      "No direct OpenAI API calls from this app. Pixel art generation uses the local Codex handoff, and animation generation runs from a selected pixel-art source."
  },
  ja: {
    language: "言語",
    guidedStart: "スタート",
    localCodexHandoff: "ローカルCodex受け渡し",
    project: "プロジェクト: Forest Mage",
    openWorkspace: "ワークスペースを開く",
    settings: "設定",
    localWorkspace: "ローカルワークスペース",
    workflowPanelTitle: "ワークフロー",
    canvasGridTitle: "アニメーション設定",
    canvasAnnotationTitle: "プレビュー",
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
    animationReady: "アニメーションframes準備完了",
    animatedGif: "アニメGIF",
    animatedWebP: "アニメWebP",
    spriteSheetDownload: "スプライトシート",
    animationDownloadsLocked: "ダウンロード前にアニメーションを生成してください。",
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
    jobNotesPlaceholder: "Codexに残してほしい点、直してほしい点、切り出し方、出力形式を書きます",
    guidedQuestion: "作りたいものを選んでください",
    guidedIntro: "まずピクセルアートを作り、選択したピクセルアートからアニメーションを生成します。",
    guidedNote:
      "このアプリ自体はOpenAI APIを直接呼びません。ピクセルアート生成はローカルCodex受け渡し、アニメーション生成は選択済みピクセルアートから行います。"
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
      label: "2. Image Editing",
      detail: "Annotate an image and hand the edit instruction to Codex.",
      status: "Annotate the image, then create a Codex handoff job with the edit notes"
    },
    "sprite-generate": {
      label: "Animation Generation",
      detail: "Upload or select pixel art, then generate an animation sheet and timeline frames.",
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
      label: "2. 画像編集",
      detail: "画像に注釈を入れて、編集指示をCodexへ受け渡します。",
      status: "画像に注釈を入れてから、編集メモつきのCodex受け渡しジョブを作成します"
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
  { name: "idle", fps: 12, loop: true, frameIds: [], cell: { width: 128, height: 128 }, anchor: { x: 64, y: 118 } },
  { name: "walk", fps: 12, loop: true, frameIds: [], cell: { width: 128, height: 128 }, anchor: { x: 64, y: 118 } },
  { name: "cast", fps: 10, loop: false, frameIds: [], cell: { width: 128, height: 128 }, anchor: { x: 64, y: 118 } },
  { name: "attack", fps: 10, loop: false, frameIds: [], cell: { width: 128, height: 128 }, anchor: { x: 64, y: 118 } }
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
    id: "sprite-generate",
    provider: "local-generator"
  }
];

const promptExamples: PromptExample[] = [
  {
    id: "clockwork-mushroom-courier",
    category: { en: "Character", ja: "キャラクター" },
    title: { en: "Clockwork Mushroom Courier", ja: "ぜんまい茸の配達人" },
    prompt:
      "Create one original pixel-art game asset concept image: a tiny clockwork mushroom courier carrying a glowing blue delivery satchel through a rainy neon forest, crisp readable silhouette, 16-bit pixel-art inspired rendering, transparent-game-asset feel, teal rain highlights, warm amber satchel glow, no readable text, no logo, no watermark, no numbers.",
    negativePrompt: "text, logo, watermark, numbers, photorealistic face, blurry silhouette, placeholder geometric-only output",
    notes: "Prompt-only image generation. Keep the silhouette readable at game-asset scale and avoid any readable symbols."
  },
  {
    id: "forest-mage-idle",
    category: { en: "Character", ja: "キャラクター" },
    title: { en: "Forest Mage Idle Sprite", ja: "森の魔法使いアイドル" },
    prompt:
      "Create a single full-body pixel-art character asset: a small forest mage with a leaf hood, carved wooden staff, soft green cloak, amber charm, friendly confident pose, idle-animation ready stance, clear feet contact, centered subject, transparent-background feel, 32-bit fantasy RPG palette, crisp silhouette, no readable text, no logo, no watermark.",
    negativePrompt: "cropped feet, extra arms, text, logo, watermark, blurry edges, realistic skin, busy background",
    notes: "Character should be easy to cut out and animate later. Keep pose neutral, balanced, and readable."
  },
  {
    id: "ember-slime-companion",
    category: { en: "Creature", ja: "クリーチャー" },
    title: { en: "Ember Slime Companion", ja: "火種スライム" },
    prompt:
      "Create a cute pixel-art creature asset: a small ember slime companion with a warm orange core, tiny charcoal feet, two expressive glowing eyes, faint heat shimmer, simple rounded body, readable silhouette on transparent-background feel, collectible monster game style, clean 16-bit pixel-art inspired rendering, no text, no logo, no watermark.",
    negativePrompt: "scary horror, text, logo, watermark, photorealistic fire, over-detailed smoke, cropped body",
    notes: "Creature design should be simple enough for idle, hop, and attack animation variants."
  },
  {
    id: "crystal-export-station",
    category: { en: "Prop", ja: "小物" },
    title: { en: "Crystal Export Station", ja: "水晶の書き出し台" },
    prompt:
      "Create a pixel-art game prop asset: a compact crystal export station made of mossy stone and brass rails, three amber crystals glowing above small sockets, teal interface sparks, fantasy workshop mood, isometric-front readable angle, transparent-background feel, crisp edge clusters, no readable text, no logo, no watermark, no numbers.",
    negativePrompt: "letters, labels, UI words, logo, watermark, photorealism, cluttered background, broken perspective",
    notes: "Prop should read clearly as a small interactive workstation and fit beside character sprites."
  },
  {
    id: "rainy-neon-forest-tile",
    category: { en: "Environment", ja: "背景" },
    title: { en: "Rainy Neon Forest Tile", ja: "雨のネオン森タイル" },
    prompt:
      "Create a pixel-art environment tile concept: rainy neon forest ground with wet stone path, cyan puddle reflections, small purple mushrooms, dark green leaves, warm lantern glints, seamless game-map tile mood, top-down three-quarter RPG perspective, no characters, no readable text, no logo, no watermark.",
    negativePrompt: "characters, text, logo, watermark, flat plain grass, photorealistic rain, unreadable clutter",
    notes: "Keep it tile-friendly with no large unique landmark in the center."
  },
  {
    id: "sprite-sheet-workbench",
    category: { en: "Scene", ja: "シーン" },
    title: { en: "Sprite-Sheet Workbench", ja: "スプライト作業台" },
    prompt:
      "Create a pixel-art inspired production-tool scene: a cozy fantasy sprite-sheet workbench with glowing teal grid panels, tiny frame thumbnails, amber export crystals, pinned annotation marks, wooden desk, mossy stone walls, friendly maker mood, crisp readable composition, no readable text, no logo, no watermark, no numbers.",
    negativePrompt: "readable UI text, letters, numbers, logo, watermark, photorealistic monitor, blurry composition",
    notes: "Use this when testing whether complex production-tool concepts survive the imagegen prompt."
  }
];

function App() {
  const [history, setHistory] = useState<HistoryItem[]>(() => loadHistory());
  const [frames, setFrames] = useState<SpriteFrame[]>(() => loadFrames());
  const [actions, setActions] = useState<SpriteAction[]>(() => loadActions(defaultActions));
  const [selectedId, setSelectedId] = useState<string>("");
  const [activeActionName, setActiveActionName] = useState("idle");
  const [language, setLanguage] = useState<Language>(loadLanguage);
  const [workflowMode, setWorkflowMode] = useState<WorkflowMode | null>(null);
  const [showPromptExamples, setShowPromptExamples] = useState(false);
  const [providerId, setProviderId] = useState<ProviderId>("codex-handoff");
  const [animationSourceId, setAnimationSourceId] = useState("");
  const [providers, setProviders] = useState<ProviderStatus[]>(fallbackProviders);
  const [runnerPreflight, setRunnerPreflight] = useState<CodexRunnerPreflight | null>(null);
  const [prompt, setPrompt] = useState("Pixel art forest mage, transparent background, 8 directions");
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
  const [pendingCodexJob, setPendingCodexJob] = useState<PendingCodexJob | null>(() => loadPendingCodexJob());
  const [gifPreviewUrl, setGifPreviewUrl] = useState("");

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
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

  const animationExportReady = useMemo(
    () =>
      actionFrames.length > 0 &&
      actionFrames.some((frame) => history.some((item) => item.id === frame.sourceId && item.source === "generate")),
    [actionFrames, history]
  );

  const selectedFrame = useMemo(
    () => frames.find((frame) => frame.id === selectedFrameId) ?? actionFrames[0],
    [actionFrames, frames, selectedFrameId]
  );

  const qc = useMemo(
    () => summarizeFrames(actionFrames, activeAction.cell.width, activeAction.cell.height),
    [actionFrames, activeAction.cell.height, activeAction.cell.width]
  );

  useEffect(() => saveHistory(history), [history]);
  useEffect(() => saveFrames(frames), [frames]);
  useEffect(() => saveActions(actions), [actions]);
  useEffect(() => saveLanguage(language), [language]);
  useEffect(() => savePendingCodexJob(pendingCodexJob), [pendingCodexJob]);

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
    if (history.length > 0) {
      setSelectedId((current) => current || history[0].id);
      return;
    }

    void seedSampleWorkspace();
  }, [history.length]);

  useEffect(() => {
    drawWorkspaceCanvas();
  }, [
    selected?.dataUrl,
    selectedFrame?.dataUrl,
    selectedId,
    workflowMode,
    annotationsByItem,
    draftAnnotation,
    showGrid,
    showCenter,
    grid,
    tool
  ]);

  useEffect(() => {
    if (actionFrames.length === 0) {
      setGifPreviewUrl("");
      return;
    }
    let cancelled = false;
    createGifBlob(frames, activeAction)
      .then((blob) => {
        if (cancelled) return;
        if (gifPreviewUrl) URL.revokeObjectURL(gifPreviewUrl);
        setGifPreviewUrl(URL.createObjectURL(blob));
      })
      .catch(() => setGifPreviewUrl(""));
    return () => {
      cancelled = true;
    };
  }, [activeAction, actionFrames.length, frames]);

  useEffect(() => {
    if (!pendingCodexJob) return;
    let cancelled = false;

    const pollForReturnedImage = async () => {
      const imported = await importLatestOutboxResult({
        background: true,
        newerThan: pendingCodexJob.createdAt,
        quietEmpty: true
      });
      if (cancelled || imported) return;

      const runnerStatus = await loadCodexRunnerStatus(pendingCodexJob.id);
      if (cancelled) return;

      if (runnerStatus && !shouldWaitForCodexRunner(runnerStatus)) {
        setPendingCodexJob(null);
        setStatus(runnerStatusMessage(runnerStatus, copy));
        return;
      }

      if (!cancelled && !imported) {
        setStatus(`${copy.statusCodexJobPending}: ${pendingCodexJob.id}`);
      }
    };

    void pollForReturnedImage();
    const intervalId = window.setInterval(() => void pollForReturnedImage(), 5000);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [pendingCodexJob?.id, pendingCodexJob?.createdAt, language]);

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
      { width: 128, height: 128 }
    );
    setFrames(sampleFrames);
    setSelectedFrameId(sampleFrames[0]?.id ?? "");
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

    const displayingFrame = Boolean(selectedFrame?.sourceId && selectedFrame.sourceId === selected.id);
    const image = await loadImage(displayingFrame && selectedFrame ? selectedFrame.dataUrl : selected.dataUrl);
    const padding = 44;
    const scale = Math.min((CANVAS_WIDTH - padding * 2) / image.width, (CANVAS_HEIGHT - padding * 2) / image.height);
    const width = image.width * scale;
    const height = image.height * scale;
    const x = (CANVAS_WIDTH - width) / 2;
    const y = (CANVAS_HEIGHT - height) / 2;
    context.drawImage(image, x, y, width, height);

    if (showGrid && !displayingFrame) drawGridOverlay(context, x, y, width, height, grid.columns, grid.rows);
    if (showCenter) drawCenterOverlay(context, x, y, width, height);
    const annotations = [...(annotationsByItem[selected.id] ?? []), ...(draftAnnotation ? [draftAnnotation] : [])];
    annotations.forEach((annotation) => drawAnnotation(context, annotation));
  }, [annotationsByItem, copy.canvasEmpty, draftAnnotation, grid.columns, grid.rows, selected, selectedFrame, showCenter, showGrid]);

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
    if (workflowMode === "sprite-generate") setAnimationSourceId(imported[0].id);
    setStatus(formatImagesImportedStatus(imported.length, language));
  }

  async function handleGenerate() {
    if (providerId === "codex-handoff" && pendingCodexJob) {
      setStatus(`${copy.statusCodexJobPending}: ${pendingCodexJob.id}`);
      return;
    }
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
      const includeSelectedImage = workflowUsesSelectedImage(workflowMode);
      const includeSpriteContext = workflowUsesSpriteContext(workflowMode);
      const response = await fetch("/api/codex/jobs", {
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
          quality,
          selectedImageName: includeSelectedImage ? selected?.name : "",
          selectedImageSize: includeSelectedImage ? selected?.size : "",
          selectedImageSource: includeSelectedImage ? selected?.source : "",
          selectedImageDataUrl: includeSelectedImage ? selected?.dataUrl : "",
          annotations: includeSelectedImage && selected ? annotationsByItem[selected.id] ?? [] : [],
          grid: includeSpriteContext ? grid : null,
          action: includeSpriteContext ? activeAction.name : "",
          frames: includeSpriteContext ? actionFrames.length : 0,
          cell: includeSpriteContext ? activeAction.cell : null
        })
      });
      if (!response.ok) throw new Error(await response.text());
      const data = (await response.json()) as CodexJobResponse;
      if (shouldWaitForCodexRunner(data.runner)) {
        setPendingCodexJob({ id: data.id, path: data.path, createdAt: data.createdAt });
      } else {
        setPendingCodexJob(null);
      }
      setStatus(`${copy.statusCodexJobWritten}: ${data.path}. ${runnerStatusMessage(data.runner, copy)}.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : copy.statusCodexJobError);
    } finally {
      setIsBusy(false);
    }
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

    const animationGrid = { columns: ANIMATION_FRAME_COUNT, rows: 1, gutter: 0 };
    const sheetDataUrl = await renderAnimationSheet(source.dataUrl, activeAction.cell, activeAction.name);
    const sheetName = `${source.name.replace(/\.[^.]+$/, "")}_${activeAction.name}_animation_sheet.png`;
    const item: HistoryItem = {
      id: createId("hist"),
      name: sheetName,
      dataUrl: sheetDataUrl,
      provider: "local-generator",
      prompt,
      seed,
      size: `${activeAction.cell.width * ANIMATION_FRAME_COUNT}x${activeAction.cell.height}`,
      createdAt: new Date().toISOString(),
      adopted: false,
      source: "generate"
    };
    const newFrames = await splitImageIntoFrames(sheetDataUrl, sheetName.replace(/\.[^.]+$/, ""), animationGrid, item.id, activeAction.cell);

    setGrid(animationGrid);
    setHistory((current) => [item, ...current]);
    setSelectedId(item.id);
    setFrames((current) => [...current, ...newFrames]);
    setActions((current) =>
      current.map((action) =>
        action.name === activeAction.name ? { ...action, frameIds: newFrames.map((frame) => frame.id) } : action
      )
    );
    setSelectedFrameId(newFrames[0]?.id ?? "");
    setStatus(`${copy.statusAnimationGenerated}: ${sheetName}. ${formatFramesAddedStatus(newFrames.length, activeAction.name, language)}`);
  }

  async function importLatestOutboxResult(options: ImportLatestOptions = {}) {
    if (!options.background) setIsBusy(true);
    try {
      const listResponse = await fetch("/api/codex/results");
      if (!listResponse.ok) throw new Error(await listResponse.text());
      const listData = (await listResponse.json()) as { outboxPath: string; results: CodexOutboxResult[] };
      const newerThanTime = options.newerThan ? Date.parse(options.newerThan) : Number.NEGATIVE_INFINITY;
      const latest = listData.results.find((result) => Date.parse(result.modifiedAt) >= newerThanTime);
      if (!latest) {
        if (!options.quietEmpty) setStatus(`${copy.statusInboxEmpty}: ${listData.outboxPath}`);
        return false;
      }

      const importResponse = await fetch(`/api/codex/results/${encodeURIComponent(latest.name)}`);
      if (!importResponse.ok) throw new Error(await importResponse.text());
      const imported = (await importResponse.json()) as CodexOutboxImportResponse;
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
      setHistory((current) => [item, ...current]);
      setSelectedId(item.id);
      if (pendingCodexJob && Date.parse(latest.modifiedAt) >= Date.parse(pendingCodexJob.createdAt)) {
        setPendingCodexJob(null);
      }
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
    updateActiveAction({ cell: { width, height } });
  }

  function handlePointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
    if (tool === "select" || !selected) return;
    const point = canvasPoint(event);
    setDraftAnnotation({
      id: createId("anno"),
      tool,
      color: annotationColor,
      width: tool === "brush" ? 4 : 3,
      points: [point]
    });
  }

  function handlePointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!draftAnnotation) return;
    const point = canvasPoint(event);
    setDraftAnnotation((current) => {
      if (!current) return current;
      if (current.tool === "brush") return { ...current, points: [...current.points, point] };
      return { ...current, points: [current.points[0], point] };
    });
  }

  function handlePointerUp() {
    if (!draftAnnotation || !selected) return;
    setAnnotationsByItem((current) => ({
      ...current,
      [selected.id]: [...(current[selected.id] ?? []), draftAnnotation]
    }));
    setDraftAnnotation(null);
  }

  async function exportAnnotatedPng() {
    const canvas = canvasRef.current;
    if (!canvas || !selected) return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      downloadBlob(blob, `${selected.name.replace(/\.[^.]+$/, "")}_annotated.png`);
    }, "image/png");
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
    if (mode === "image-edit") setTool("brush");
    if (mode === "image-generate") setTool("select");
    if (mode === "sprite-generate" || mode === "sprite-edit") {
      setActiveActionName("idle");
      setGrid({ columns: ANIMATION_FRAME_COUNT, rows: 1, gutter: 0 });
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
  const activeWorkflowCopy = workflowMode ? workflowCopy[language][workflowMode] : null;
  const activeWorkflowFormCopy = workflowMode ? workflowFormCopy[language][workflowMode] : null;
  const isWaitingForCodexResult = providerId === "codex-handoff" && Boolean(pendingCodexJob);
  const isAnimationWorkflow = workflowMode === "sprite-generate";
  const animationSourceReady = !isAnimationWorkflow || isAnimationSource(animationSource);
  const primaryActionDisabled = isBusy || isWaitingForCodexResult || !animationSourceReady;
  const showFrameGridControls = SHOW_LOW_PRIORITY_CONTROLS || workflowMode === "sprite-edit";
  const showSpriteTuningControls = SHOW_LOW_PRIORITY_CONTROLS || workflowMode === "sprite-edit";
  const showAnnotationToolbar = SHOW_LOW_PRIORITY_CONTROLS || workflowMode === "image-edit";

  if (!workflowMode) {
    return (
      <GuidedStart
        language={language}
        onLanguageChange={setLanguage}
        onSelect={beginWorkflow}
      />
    );
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <Grid3X3 size={18} aria-hidden="true" />
          <strong>Image Cockpit for Codex Workflows</strong>
          <span>{activeWorkflowCopy?.label}</span>
          <small>v0.1.0</small>
        </div>
        {workflowMode && <WorkflowTabs language={language} activeMode={workflowMode} onSelect={beginWorkflow} />}
        <div className="project-strip">
          <LanguageSelect language={language} label={copy.language} onChange={setLanguage} />
          <button className="guided-link" onClick={() => setWorkflowMode(null)}>
            {copy.guidedStart}
          </button>
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

      <main className={`cockpit ${SHOW_LOW_PRIORITY_CONTROLS ? "" : "simple-cockpit"}`}>
        <aside className="panel source-panel">
          <PanelTitle index="1" title={copy.workflowPanelTitle} />
          <div className="workflow-summary">
            <small>{copy.currentWorkflow}</small>
            <strong>{activeWorkflowCopy?.label}</strong>
            <span>{activeWorkflowCopy?.detail}</span>
            <em>{copy.selectedProvider}: {providerLabel(providerId, language)}</em>
            {providerId === "codex-handoff" && (
              <em className={`runner-pill runner-${runnerPreflight?.state ?? "checking"}`}>
                <Plug size={13} aria-hidden="true" />
                {runnerPreflightLabel(runnerPreflight, copy)}
              </em>
            )}
          </div>

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
                <small className="step-kicker">{copy.motionPreset}</small>
                <div className="motion-presets">
                  {actions.map((action) => (
                    <button
                      key={action.name}
                      className={action.name === activeAction.name ? "active" : ""}
                      onClick={() => {
                        setActiveActionName(action.name);
                        setGrid({ columns: ANIMATION_FRAME_COUNT, rows: 1, gutter: 0 });
                      }}
                    >
                      {action.name}
                    </button>
                  ))}
                </div>
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
              </section>

              <section className="animation-step">
                <div className="step-heading">
                  <strong>{copy.animationStepGenerateTitle}</strong>
                  <span>{copy.animationStepGenerateBody}</span>
                </div>
                <div className="field-row compact-row">
                  <NumberField label={copy.frameWidth} value={activeAction.cell.width} onChange={(width) => updateCell(width, activeAction.cell.height)} />
                  <NumberField label={copy.frameHeight} value={activeAction.cell.height} onChange={(height) => updateCell(activeAction.cell.width, height)} />
                </div>
                <button className="primary-button full" onClick={() => void handleGenerate()} disabled={primaryActionDisabled}>
                  <PrimaryActionIcon providerId={providerId} isBusy={isBusy} />
                  {copy.generateLocalSprite}
                </button>
              </section>

              <section className={`animation-step ${animationExportReady ? "complete" : ""}`}>
                <div className="step-heading">
                  <strong>{copy.animationStepDownloadTitle}</strong>
                  <span>{copy.animationStepDownloadBody}</span>
                </div>
                {animationExportReady && <small className="step-kicker">{copy.animationReady}</small>}
                <div className="animation-preview">
                  {animationExportReady && gifPreviewUrl ? <img src={gifPreviewUrl} alt="" /> : <span>{copy.animationDownloadsLocked}</span>}
                </div>
                <div className="download-grid">
                  <button onClick={() => void exportGif(frames, activeAction)} disabled={!animationExportReady}>
                    <Film size={16} aria-hidden="true" />
                    {copy.animatedGif}
                  </button>
                  <button onClick={() => void exportWebP(frames, activeAction)} disabled={!animationExportReady}>
                    <FileArchive size={16} aria-hidden="true" />
                    {copy.animatedWebP}
                  </button>
                  <button onClick={() => void exportSpriteSheet(frames, activeAction)} disabled={!animationExportReady}>
                    <FileImage size={16} aria-hidden="true" />
                    {copy.spriteSheetDownload}
                  </button>
                </div>
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

              <div className="button-row">
                <button className="primary-button" onClick={() => void handleGenerate()} disabled={primaryActionDisabled}>
                  <PrimaryActionIcon providerId={providerId} isBusy={isBusy || isWaitingForCodexResult} />
                  {primaryActionLabel(providerId, workflowMode, copy, isWaitingForCodexResult)}
                </button>
                {providerId !== "local-inbox" && (
                  <button className="secondary-button" onClick={() => void importLatestOutboxResult()} disabled={isBusy}>
                    <Archive size={17} aria-hidden="true" />
                    {copy.importLatest}
                  </button>
                )}
                {providerId !== "local-file" && (
                  <button className="secondary-button" onClick={() => fileInputRef.current?.click()}>
                    <Upload size={17} aria-hidden="true" />
                    {copy.importFile}
                  </button>
                )}
              </div>
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
                <NumberField label={copy.frameWidth} value={activeAction.cell.width} onChange={(width) => updateCell(width, activeAction.cell.height)} />
                <NumberField label={copy.frameHeight} value={activeAction.cell.height} onChange={(height) => updateCell(activeAction.cell.width, height)} />
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

        <section className="workspace">
          <div className="panel canvas-panel">
            <PanelTitle index="2" title={copy.canvasAnnotationTitle} />
            {showAnnotationToolbar && (
              <div className="toolbar">
                <ToolButton active={tool === "select"} title={copy.selectTool} onClick={() => setTool("select")} icon={<MousePointer2 size={18} />} />
                <ToolButton active={tool === "brush"} title={copy.brushTool} onClick={() => setTool("brush")} icon={<Brush size={18} />} />
                <ToolButton active={tool === "rect"} title={copy.rectangleTool} onClick={() => setTool("rect")} icon={<Square size={18} />} />
                <ToolButton active={tool === "arrow"} title={copy.arrowTool} onClick={() => setTool("arrow")} icon={<MoveUpRight size={18} />} />
                <span className="toolbar-separator" />
                <button className="icon-text-button" title={copy.exportAnnotationTitle} onClick={() => void exportAnnotatedPng()} disabled={!selected}>
                  <Download size={17} aria-hidden="true" />
                  {copy.annotatedPng}
                </button>
              </div>
            )}
            <div
              className="canvas-stage"
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                void handleFiles(event.dataTransfer.files);
              }}
            >
              <canvas
                ref={canvasRef}
                width={CANVAS_WIDTH}
                height={CANVAS_HEIGHT}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerLeave={handlePointerUp}
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
              <span>{copy.frameLabel}: {selectedFrame ? selectedFrame.index : "-"}</span>
              <span>{copy.sizeLabel}: {activeAction.cell.width}x{activeAction.cell.height}</span>
              <span>{copy.anchorLabel}: {activeAction.anchor.x}, {activeAction.anchor.y}</span>
              <span>{copy.zoomLabel}: {copy.zoomFit}</span>
              <span className="swatch" style={{ background: annotationColor }} />
            </div>
          </div>
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
                onClick={() => {
                  setSelectedId(item.id);
                  if (isAnimationWorkflow && isAnimationSource(item)) setAnimationSourceId(item.id);
                }}
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
                    onClick={() => setSelectedId(item.id)}
                  >
                    <img src={item.dataUrl} alt="" />
                    <span>{item.adopted ? "Adopted" : "Candidate"}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </aside>

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

  function canvasPoint(event: React.PointerEvent<HTMLCanvasElement>) {
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
  if (providerId === "codex-handoff") return copy.createCodexJob;
  if (providerId === "local-inbox") return copy.importLatest;
  return copy.importFile;
}

function isAnimationSource(item?: HistoryItem): item is HistoryItem {
  return Boolean(item && item.source !== "sample");
}

async function renderAnimationSheet(sourceDataUrl: string, cell: SpriteAction["cell"], actionName: string) {
  const source = await loadImage(sourceDataUrl);
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
  source: HTMLImageElement,
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
  context.globalAlpha = 0.2;
  context.fillStyle = "#1c2028";
  context.beginPath();
  context.ellipse(x + cell.width / 2, cell.height * 0.86, cell.width * 0.22, cell.height * 0.035, 0, 0, Math.PI * 2);
  context.fill();
  context.restore();

  context.save();
  context.translate(centerX, centerY);
  context.rotate(preset.rotate);
  context.scale(preset.scaleX, preset.scaleY);
  context.drawImage(source, -width / 2, -height / 2, width, height);
  context.restore();

  if (preset.accent) {
    context.save();
    context.globalAlpha = 0.55;
    context.fillStyle = preset.accent;
    context.fillRect(x + cell.width * 0.18 + frame, cell.height * 0.18, 3, 3);
    context.fillRect(x + cell.width * 0.74 - frame * 0.5, cell.height * 0.28, 2, 2);
    context.restore();
  }
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
  return mode === "image-edit";
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

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <label className="field number-field">
      <span>{label}</span>
      <input type="number" value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}

function ToolButton({ active, icon, title, onClick }: { active: boolean; icon: React.ReactNode; title: string; onClick: () => void }) {
  return (
    <button className={`icon-button ${active ? "active" : ""}`} title={title} onClick={onClick}>
      {icon}
    </button>
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

function GuidedStart({
  language,
  onLanguageChange,
  onSelect
}: {
  language: Language;
  onLanguageChange: (language: Language) => void;
  onSelect: (mode: WorkflowMode) => void;
}) {
  const copy = uiCopy[language];
  return (
    <div className="guided-shell">
      <header className="topbar">
        <div className="brand">
          <Grid3X3 size={18} aria-hidden="true" />
          <strong>Image Cockpit for Codex Workflows</strong>
          <span>{copy.guidedStart}</span>
          <small>{copy.localCodexHandoff}</small>
        </div>
        <div className="project-strip">
          <LanguageSelect language={language} label={copy.language} onChange={onLanguageChange} />
        </div>
      </header>

      <main className="guided-main">
        <section className="guided-panel">
          <div className="guided-copy">
            <strong>{copy.guidedQuestion}</strong>
            <span>{copy.guidedIntro}</span>
          </div>

          <div className="guided-options">
            {workflowOptions.map((option) => {
              const optionCopy = workflowCopy[language][option.id];
              return (
                <button key={option.id} className="guided-option" onClick={() => onSelect(option.id)}>
                  <WorkflowIcon mode={option.id} />
                  <span>
                    <strong>{optionCopy.label}</strong>
                    <small>{optionCopy.detail}</small>
                  </span>
                </button>
              );
            })}
          </div>

          <div className="guided-note">
            <AlertTriangle size={16} aria-hidden="true" />
            <span>{copy.guidedNote}</span>
          </div>
        </section>
      </main>
    </div>
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
    context.strokeRect(start.x, start.y, end.x - start.x, end.y - start.y);
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

function loadPendingCodexJob(): PendingCodexJob | null {
  try {
    const stored = window.localStorage.getItem(PENDING_CODEX_JOB_STORAGE_KEY);
    if (!stored) return null;
    const job = JSON.parse(stored) as PendingCodexJob;
    return job?.id && job.path && job.createdAt ? job : null;
  } catch {
    return null;
  }
}

function savePendingCodexJob(job: PendingCodexJob | null) {
  try {
    if (job) {
      window.localStorage.setItem(PENDING_CODEX_JOB_STORAGE_KEY, JSON.stringify(job));
      return;
    }
    window.localStorage.removeItem(PENDING_CODEX_JOB_STORAGE_KEY);
  } catch {
    // Pending state is best-effort; the current session still keeps the button locked.
  }
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
