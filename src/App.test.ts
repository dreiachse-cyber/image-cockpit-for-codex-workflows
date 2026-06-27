import { describe, expect, it } from "vitest";
import {
  annotationImageCoordinates,
  getNextHistoryRenderLimit,
  getVisibleHistoryCount,
  HISTORY_RENDER_BATCH_SIZE,
  imageDisplayRectForCanvas,
  INITIAL_HISTORY_RENDER_COUNT,
  isCharacterGreenPixel,
  isDirectionSplitAnimationManifestName,
  isFrameChromaResiduePixel,
  isOutboxResultForJob,
  isLikelyFrameGarbageComponent,
  resolveInitialLanguage,
  selectDirectionSplitAnimationResults,
  shouldIgnoreOutboxResultName,
  shouldReportCompletedCodexImportFailure,
  shouldWaitForCodexRunner,
  summarizeCodexImportFailureReason,
  SUPPORTED_LANGUAGE_IDS
} from "./App";
import {
  applyFrameRetention,
  applyHistoryRetention,
  classifyStorageUsageBytes,
  FRAME_RETENTION_LIMIT,
  HISTORY_RETENTION_LIMIT,
  IMAGE_COCKPIT_LOCAL_STATE_KEYS,
  isStorageSafeModeSearch,
  PENDING_CODEX_JOB_STORAGE_KEY,
  STORAGE_AUTO_SAFE_BYTES,
  STORAGE_HARD_BLOCK_BYTES,
  STORAGE_WARNING_BYTES
} from "./lib/storage";
import type { Annotation, CodexArtifactStatus, CodexRunnerStatus, HistoryItem, SpriteFrame } from "./types";

describe("Codex runner wait state", () => {
  it("keeps waiting only when the runner is actively running or status is not loaded yet", () => {
    expect(shouldWaitForCodexRunner()).toBe(true);
    expect(shouldWaitForCodexRunner(makeStatus("running"))).toBe(true);
  });

  it("unlocks stale or terminal runner states", () => {
    expect(shouldWaitForCodexRunner(makeStatus("unknown"))).toBe(false);
    expect(shouldWaitForCodexRunner(makeStatus("disabled"))).toBe(false);
    expect(shouldWaitForCodexRunner(makeStatus("unavailable"))).toBe(false);
    expect(shouldWaitForCodexRunner(makeStatus("failed"))).toBe(false);
    expect(shouldWaitForCodexRunner(makeStatus("completed"))).toBe(false);
  });

  it("reports completed jobs as import failures when no import succeeded", () => {
    expect(shouldReportCompletedCodexImportFailure(makeStatus("completed"), false)).toBe(true);
    expect(shouldReportCompletedCodexImportFailure(makeStatus("completed"), true)).toBe(false);
    expect(shouldReportCompletedCodexImportFailure(makeStatus("running"), false)).toBe(false);
    expect(
      shouldReportCompletedCodexImportFailure(
        {
          ...makeStatus("completed"),
          diagnostic: {
            kind: "no_image_returned",
            title: "No image returned",
            userMessage: "No image was found."
          }
        },
        false
      )
    ).toBe(false);
  });

  it("summarizes import failures without leaking local absolute paths or stack traces", () => {
    const reason = summarizeCodexImportFailureReason(
      new Error("Direction split import failed for codex-job-test: missing side at D:\\codex\\secret\\outbox\\file.png\nstack line")
    );

    expect(reason).toContain("Direction split import failed");
    expect(reason).toContain("local file");
    expect(reason).not.toContain("D:\\codex");
    expect(reason).not.toContain("stack line");
  });
});

describe("initial language", () => {
  it("uses any supported stored language when it is valid", () => {
    SUPPORTED_LANGUAGE_IDS.forEach((language) => {
      expect(resolveInitialLanguage(language, ["ja-JP"])).toBe(language);
    });
  });

  it("maps browser locales to the supported locale pack", () => {
    expect(resolveInitialLanguage(null, ["ja-JP", "en-US"])).toBe("ja");
    expect(resolveInitialLanguage(null, ["zh-CN"])).toBe("zh-CN");
    expect(resolveInitialLanguage(null, ["zh-TW"])).toBe("zh-TW");
    expect(resolveInitialLanguage(null, ["zh-Hant-TW"])).toBe("zh-TW");
    expect(resolveInitialLanguage(null, ["zh-Hans-CN"])).toBe("zh-CN");
    expect(resolveInitialLanguage(null, ["ko-KR"])).toBe("ko");
    expect(resolveInitialLanguage(null, ["ru-RU"])).toBe("ru");
    expect(resolveInitialLanguage(null, ["es-MX"])).toBe("es");
    expect(resolveInitialLanguage(null, ["pt-BR"])).toBe("pt-BR");
    expect(resolveInitialLanguage(null, ["pt-PT"])).toBe("pt-BR");
    expect(resolveInitialLanguage(null, ["de-DE"])).toBe("de");
    expect(resolveInitialLanguage(null, ["fr-FR"])).toBe("fr");
    expect(resolveInitialLanguage(null, ["id-ID"])).toBe("id");
    expect(resolveInitialLanguage(null, ["in-ID"])).toBe("id");
    expect(resolveInitialLanguage(null, ["tr-TR"])).toBe("tr");
    expect(resolveInitialLanguage(null, ["vi-VN"])).toBe("vi");
    expect(resolveInitialLanguage(null, ["pl-PL"])).toBe("pl");
    expect(resolveInitialLanguage(null, ["it-IT"])).toBe("it");
  });

  it("falls back to English when no stored or supported browser language exists", () => {
    expect(resolveInitialLanguage(null, ["en-US"])).toBe("en");
    expect(resolveInitialLanguage("xx", [])).toBe("en");
  });
});

describe("history result rendering window", () => {
  it("starts at the initial result count and grows by batch", () => {
    expect(getVisibleHistoryCount(240, INITIAL_HISTORY_RENDER_COUNT)).toBe(INITIAL_HISTORY_RENDER_COUNT);
    expect(getNextHistoryRenderLimit(INITIAL_HISTORY_RENDER_COUNT, 240)).toBe(
      INITIAL_HISTORY_RENDER_COUNT + HISTORY_RENDER_BATCH_SIZE
    );
    expect(getNextHistoryRenderLimit(235, 240)).toBe(240);
  });

  it("keeps the selected result visible even when it is outside the current window", () => {
    expect(getVisibleHistoryCount(240, INITIAL_HISTORY_RENDER_COUNT, 137)).toBe(138);
    expect(getVisibleHistoryCount(40, INITIAL_HISTORY_RENDER_COUNT, 30)).toBe(40);
  });
});

describe("Image Editing annotation coordinates", () => {
  it("fits a portrait full-body source inside the edit canvas padding", () => {
    const displayed = imageDisplayRectForCanvas({ width: 300, height: 900 });

    expect(displayed.x).toBe(388);
    expect(displayed.y).toBe(44);
    expect(displayed.width).toBe(144);
    expect(displayed.height).toBe(432);
  });

  it("maps canvas annotations to normalized and pixel source-image rectangles", () => {
    const annotation = makeAnnotation([{ x: 388, y: 44 }, { x: 532, y: 476 }]);
    const coordinates = annotationImageCoordinates(annotation, { width: 300, height: 900 });

    expect(coordinates.imageRectNormalized).toEqual({ x: 0, y: 0, width: 1, height: 1 });
    expect(coordinates.imageRectPixels).toEqual({ x: 0, y: 0, width: 300, height: 900 });
    expect(coordinates.imageRectClamped).toBe(false);
  });

  it("clamps canvas annotations to the actual displayed image rectangle", () => {
    const annotation = makeAnnotation([{ x: 320, y: 20 }, { x: 600, y: 500 }]);
    const coordinates = annotationImageCoordinates(annotation, { width: 300, height: 900 });

    expect(coordinates.imageRectNormalized).toEqual({ x: 0, y: 0, width: 1, height: 1 });
    expect(coordinates.imageRectPixels).toEqual({ x: 0, y: 0, width: 300, height: 900 });
    expect(coordinates.imageRectClamped).toBe(true);
  });
});

describe("local state safe mode and retention", () => {
  it("recognizes safe startup query aliases before reading large state", () => {
    expect(isStorageSafeModeSearch("?safe=1")).toBe(true);
    expect(isStorageSafeModeSearch("?skipStorage=true")).toBe(true);
    expect(isStorageSafeModeSearch("?safe=0")).toBe(false);
  });

  it("classifies origin storage pressure at the documented thresholds", () => {
    expect(classifyStorageUsageBytes(STORAGE_WARNING_BYTES - 1)).toBe("normal");
    expect(classifyStorageUsageBytes(STORAGE_WARNING_BYTES)).toBe("warning");
    expect(classifyStorageUsageBytes(STORAGE_AUTO_SAFE_BYTES)).toBe("auto-safe");
    expect(classifyStorageUsageBytes(STORAGE_HARD_BLOCK_BYTES)).toBe("hard-block");
  });

  it("retains latest history while preserving adopted and selected items", () => {
    const history = Array.from({ length: HISTORY_RETENTION_LIMIT + 10 }, (_, index) =>
      makeHistoryItem(`hist-${index}`, { adopted: index === HISTORY_RETENTION_LIMIT + 4 })
    );
    const selectedId = `hist-${HISTORY_RETENTION_LIMIT + 8}`;
    const retained = applyHistoryRetention(history, { selectedId });

    expect(retained.length).toBe(HISTORY_RETENTION_LIMIT);
    expect(retained.some((item) => item.id === selectedId)).toBe(true);
    expect(retained.some((item) => item.adopted)).toBe(true);
    expect(retained.some((item) => item.id === "hist-0")).toBe(true);
  });

  it("retains recent frames while preserving protected action frames", () => {
    const frames = Array.from({ length: FRAME_RETENTION_LIMIT + 20 }, (_, index) => makeFrame(`frame-${index}`));
    const retained = applyFrameRetention(frames, {
      protectedFrameIds: ["frame-0", "frame-1"]
    });

    expect(retained.length).toBe(FRAME_RETENTION_LIMIT);
    expect(retained.some((frame) => frame.id === "frame-0")).toBe(true);
    expect(retained.some((frame) => frame.id === "frame-1")).toBe(true);
    expect(retained.some((frame) => frame.id === `frame-${FRAME_RETENTION_LIMIT + 19}`)).toBe(true);
  });

  it("includes pending Codex jobs in the formal local reset key list", () => {
    expect(IMAGE_COCKPIT_LOCAL_STATE_KEYS).toContain(PENDING_CODEX_JOB_STORAGE_KEY);
  });
});

describe("Codex outbox job result matching", () => {
  it("accepts exact job-id image names and suffixed image names", () => {
    const jobId = "codex-job-2026-06-25T13-01-42-060Z";

    expect(isOutboxResultForJob(`${jobId}.png`, jobId)).toBe(true);
    expect(isOutboxResultForJob(`${jobId}.meta.png`, jobId)).toBe(true);
    expect(isOutboxResultForJob(`${jobId}-sprite-sheet.png`, jobId)).toBe(true);
    expect(isOutboxResultForJob(`${jobId.replace("42", "43")}.png`, jobId)).toBe(false);
  });

  it("recognizes only the direction split manifest for the matching job id", () => {
    const jobId = "codex-job-2026-06-25T13-01-42-060Z";

    expect(isDirectionSplitAnimationManifestName(`${jobId}-manifest.json`, jobId)).toBe(true);
    expect(isDirectionSplitAnimationManifestName(`${jobId}-blocked.json`, jobId)).toBe(false);
    expect(isDirectionSplitAnimationManifestName(`${jobId}.meta.json`, jobId)).toBe(false);
    expect(isDirectionSplitAnimationManifestName(`${jobId.replace("42", "43")}-manifest.json`, jobId)).toBe(false);
  });

  it("ignores temp, contact sheet, QA, and debug outbox names without blocking final assets", () => {
    const jobId = "codex-job-2026-06-25T13-01-42-060Z";
    [
      `${jobId}-candidate-contact.tmp.png`,
      `${jobId}-candidate-contact.tmp_transparent.png`,
      `${jobId}-contact.tmp.png`,
      `${jobId}-contact-sheet.png`,
      `${jobId}-grid-qa.png`,
      `${jobId}-mechanical-qa.png`,
      `${jobId}-transparent-contact.png`,
      `${jobId}-debug-preview.png`,
      `${jobId}-preview-grid.png`,
      `${jobId}-ab-gallery.png`,
      `${jobId}-qa.png`,
      `${jobId}-qa.json`,
      `${jobId}-work-output.png`,
      `.staging-${jobId}.png`
    ].forEach((name) => {
      expect(shouldIgnoreOutboxResultName(name), name).toBe(true);
    });

    [
      `${jobId}.png`,
      `${jobId}-sprite-sheet.png`,
      `${jobId}-front.png`,
      `${jobId}-front-three-quarter.png`,
      `${jobId}-side.png`,
      `${jobId}-back-three-quarter.png`,
      `${jobId}-back.png`,
      `${jobId}-manifest.json`
    ].forEach((name) => {
      expect(shouldIgnoreOutboxResultName(name), name).toBe(false);
    });
  });

  it("treats partial direction files without a manifest as waiting, not ready", () => {
    const jobId = "codex-job-2026-06-25T13-01-42-060Z";
    const selection = selectDirectionSplitAnimationResults(
      [
        makeOutboxResult(`${jobId}-front.png`),
        makeOutboxResult(`${jobId}-side.png`)
      ],
      jobId
    );

    expect(selection.detected).toBe(true);
    expect(selection.hasDirectionFiles).toBe(true);
    expect(selection.waitingForFinalManifest).toBe(true);
    expect(selection.ready).toBe(false);
    expect(selection.missingDirections).toContain("front three-quarter");
  });

  it("keeps ignored QA and contact files out of direction split imports", () => {
    const jobId = "codex-job-2026-06-25T13-01-42-060Z";
    const directionNames = [
      `${jobId}-front.png`,
      `${jobId}-front-three-quarter.png`,
      `${jobId}-side.png`,
      `${jobId}-back-three-quarter.png`,
      `${jobId}-back.png`
    ];
    const results = [
      makeOutboxResult(`${jobId}-manifest.json`, "application/json"),
      ...directionNames.map((name) => makeOutboxResult(name)),
      makeOutboxResult(`${jobId}-candidate-contact.tmp.png`),
      makeOutboxResult(`${jobId}-transparent-contact.png`),
      makeOutboxResult(`${jobId}-preview-grid.png`)
    ];

    const selection = selectDirectionSplitAnimationResults(results, jobId, {
      schema: "image-cockpit.direction-split-animation.v1",
      files: {
        front: `${jobId}-front.png`,
        "front-three-quarter": `${jobId}-front-three-quarter.png`,
        side: `${jobId}-side.png`,
        "back-three-quarter": `${jobId}-back-three-quarter.png`,
        back: `${jobId}-back.png`
      }
    });

    expect(selection.ready).toBe(true);
    expect(selection.directionResults.map((result) => result.name)).toEqual(directionNames);
  });

  it("requires the direction split manifest plus all five direction images before import is ready", () => {
    const jobId = "codex-job-2026-06-25T13-01-42-060Z";
    const results = [
      makeOutboxResult(`${jobId}-manifest.json`, "application/json"),
      makeOutboxResult(`${jobId}-front.png`),
      makeOutboxResult(`${jobId}-front-three-quarter.png`),
      makeOutboxResult(`${jobId}-side.png`),
      makeOutboxResult(`${jobId}-back-three-quarter.png`),
      makeOutboxResult(`${jobId}-back.png`)
    ];

    const selection = selectDirectionSplitAnimationResults(results, jobId, {
      schema: "image-cockpit.direction-split-animation.v1",
      files: {
        front: `${jobId}-front.png`,
        "front-three-quarter": `${jobId}-front-three-quarter.png`,
        side: `${jobId}-side.png`,
        "back-three-quarter": `${jobId}-back-three-quarter.png`,
        back: `${jobId}-back.png`
      }
    });

    expect(selection.detected).toBe(true);
    expect(selection.waitingForFinalManifest).toBe(false);
    expect(selection.ready).toBe(true);
    expect(selection.directionResults).toHaveLength(5);
  });

  it("waits for server verified artifacts even when manifest and direction images are visible", () => {
    const jobId = "codex-job-2026-06-25T13-01-42-060Z";
    const artifact = makeDirectionSplitArtifact(jobId, {
      ready: false,
      verified: false,
      quality: "waiting",
      reason: "waiting for stable verified artifacts"
    });
    const results = [
      makeOutboxResult(`${jobId}-manifest.json`, "application/json", artifact),
      makeOutboxResult(`${jobId}-front.png`, "image/png", artifact),
      makeOutboxResult(`${jobId}-front-three-quarter.png`, "image/png", artifact),
      makeOutboxResult(`${jobId}-side.png`, "image/png", artifact),
      makeOutboxResult(`${jobId}-back-three-quarter.png`, "image/png", artifact),
      makeOutboxResult(`${jobId}-back.png`, "image/png", artifact)
    ];

    const selection = selectDirectionSplitAnimationResults(results, jobId, {
      schema: "image-cockpit.direction-split-animation.v1",
      files: Object.fromEntries(["front", "front-three-quarter", "side", "back-three-quarter", "back"].map((slug) => [slug, `${jobId}-${slug}.png`]))
    });

    expect(selection.detected).toBe(true);
    expect(selection.waitingForVerifiedArtifacts).toBe(true);
    expect(selection.ready).toBe(false);
  });

  it("allows import once the server marks the direction split artifact verified", () => {
    const jobId = "codex-job-2026-06-25T13-01-42-060Z";
    const artifact = makeDirectionSplitArtifact(jobId, {
      ready: true,
      verified: true,
      quality: "gold",
      reason: "server verified"
    });
    const results = [
      makeOutboxResult(`${jobId}-manifest.json`, "application/json", artifact),
      makeOutboxResult(`${jobId}-front.png`, "image/png", artifact),
      makeOutboxResult(`${jobId}-front-three-quarter.png`, "image/png", artifact),
      makeOutboxResult(`${jobId}-side.png`, "image/png", artifact),
      makeOutboxResult(`${jobId}-back-three-quarter.png`, "image/png", artifact),
      makeOutboxResult(`${jobId}-back.png`, "image/png", artifact)
    ];

    const selection = selectDirectionSplitAnimationResults(results, jobId, {
      schema: "image-cockpit.direction-split-animation.v1",
      files: Object.fromEntries(["front", "front-three-quarter", "side", "back-three-quarter", "back"].map((slug) => [slug, `${jobId}-${slug}.png`]))
    });

    expect(selection.waitingForVerifiedArtifacts).toBe(false);
    expect(selection.ready).toBe(true);
  });
});

describe("animation frame cleanup", () => {
  it("detects olive-green character palettes so animation jobs avoid green chroma key", () => {
    expect(isCharacterGreenPixel(pixelData(56, 72, 24), 0)).toBe(true);
    expect(isCharacterGreenPixel(pixelData(64, 80, 24), 0)).toBe(true);
    expect(isCharacterGreenPixel(pixelData(140, 104, 44), 0)).toBe(false);
  });

  it("does not treat normal green costume pixels as chroma residue", () => {
    expect(isFrameChromaResiduePixel(pixelData(56, 72, 24), 0, "green")).toBe(false);
    expect(isFrameChromaResiduePixel(pixelData(64, 80, 24), 0, "green")).toBe(false);
    expect(isFrameChromaResiduePixel(pixelData(0, 255, 0), 0, "green")).toBe(true);
    expect(isFrameChromaResiduePixel(pixelData(42, 220, 38), 0, "green")).toBe(true);
  });

  it("drops tiny chroma residue near a generated sprite footline", () => {
    const primary = makeComponent(1, 82, 38, 172, 224, 4100);
    const residue = makeComponent(2, 165, 220, 176, 226, 38, { chromaResidueCount: 34, softAlphaCount: 12 });

    expect(isLikelyFrameGarbageComponent(residue, primary, 256, 256)).toBe(true);
  });

  it("keeps substantial detached body parts such as a readable shoe", () => {
    const primary = makeComponent(1, 82, 38, 172, 224, 4100);
    const shoe = makeComponent(2, 42, 203, 82, 228, 360, { chromaResidueCount: 0, softAlphaCount: 10 });

    expect(isLikelyFrameGarbageComponent(shoe, primary, 256, 256)).toBe(false);
  });
});

function makeHistoryItem(id: string, overrides: Partial<HistoryItem> = {}): HistoryItem {
  return {
    id,
    name: `${id}.png`,
    dataUrl: "data:image/png;base64,test",
    provider: "local-file",
    prompt: "test",
    seed: "test",
    size: "1x1",
    createdAt: "2026-06-27T00:00:00.000Z",
    adopted: false,
    source: "import",
    ...overrides
  };
}

function makeFrame(id: string, overrides: Partial<SpriteFrame> = {}): SpriteFrame {
  return {
    id,
    name: `${id}.png`,
    dataUrl: "data:image/png;base64,test",
    width: 1,
    height: 1,
    index: 0,
    ...overrides
  };
}

function makeAnnotation(points: Annotation["points"]): Annotation {
  return {
    id: "annotation-test",
    tool: "rect",
    color: "#ff0000",
    width: 3,
    points
  };
}

function makeStatus(state: CodexRunnerStatus["state"]): CodexRunnerStatus {
  return {
    jobId: "codex-job-test",
    state,
    message: `${state} runner`
  };
}

function makeOutboxResult(name: string, mimeType = "image/png", artifact?: CodexArtifactStatus) {
  return {
    name,
    path: `D:\\codex\\outbox\\${name}`,
    size: 123,
    modifiedAt: "2026-06-27T00:00:00.000Z",
    mimeType,
    artifact
  };
}

function makeDirectionSplitArtifact(
  jobId: string,
  overrides: Partial<CodexArtifactStatus> = {}
): CodexArtifactStatus {
  return {
    ...makeDirectionSplitArtifactBase(jobId),
    ...overrides
  };
}

function makeDirectionSplitArtifactBase(jobId: string): CodexArtifactStatus {
  return {
    jobId,
    artifactKind: "direction-split" as const,
    detected: true,
    ready: false,
    verified: false,
    quality: "waiting" as const,
    reason: "waiting",
    missingDirections: [],
    warnings: [],
    files: [],
    stable: false,
    candidateCount: 5
  };
}

function pixelData(r: number, g: number, b: number, a = 255) {
  return new Uint8ClampedArray([r, g, b, a]);
}

function makeComponent(
  id: number,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
  count: number,
  details: { chromaResidueCount?: number; softAlphaCount?: number } = {}
) {
  return {
    id,
    minX,
    minY,
    maxX,
    maxY,
    count,
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2,
    chromaResidueCount: details.chromaResidueCount ?? 0,
    softAlphaCount: details.softAlphaCount ?? 0
  };
}
