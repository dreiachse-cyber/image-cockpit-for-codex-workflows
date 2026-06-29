import { describe, expect, it } from "vitest";
import {
  annotationImageCoordinates,
  buildOutboxImportKey,
  buildImageCockpitEnvironmentReport,
  codexJobProgressPhase,
  directionSplitGroundBandForCell,
  directionSplitGroundProfileForAction,
  directionSplitJobIdFromOutboxResultName,
  estimateCodexJobProgress,
  findLatestReadyDirectionSplitArtifact,
  findReadyDirectionSplitArtifacts,
  fingerprintOutboxResults,
  getNextHistoryRenderLimit,
  getVisibleHistoryCount,
  HISTORY_RENDER_BATCH_SIZE,
  imageDisplayRectForCanvas,
  INITIAL_HISTORY_RENDER_COUNT,
  isCharacterGreenPixel,
  isDirectionSplitAnimationManifestName,
  isDirectionSplitComponentOutboxName,
  isFrameChromaResiduePixel,
  isAnimationResultHistoryItem,
  isAnimationSource,
  isGenericStaticImageResult,
  isOutboxResultForJob,
  isLikelyFrameGarbageComponent,
  isUsableOutboxResult,
  resolveInitialLanguage,
  redactEnvironmentReportText,
  selectDirectionSplitAnimationResults,
  settingsTabFromSearch,
  shouldIgnoreOutboxResultName,
  shouldOpenSettingsFromSearch,
  shouldReportCompletedCodexImportFailure,
  shouldWaitForCodexRunner,
  summarizeCodexImportFailureReason,
  SUPPORTED_LANGUAGE_IDS
} from "./App";
import {
  applyFrameRetention,
  applyHistoryRetention,
  classifyStorageUsageBytes,
  dedupeLocalInboxHistory,
  FRAME_RETENTION_LIMIT,
  HISTORY_RETENTION_LIMIT,
  IMAGE_COCKPIT_LOCAL_STATE_KEYS,
  isStorageSafeModeSearch,
  PENDING_CODEX_JOB_STORAGE_KEY,
  prependHistoryItemWithDedupe,
  remapFrameSourceIds,
  STORAGE_AUTO_SAFE_BYTES,
  STORAGE_HARD_BLOCK_BYTES,
  STORAGE_WARNING_BYTES
} from "./lib/storage";
import type { Annotation, CodexArtifactStatus, CodexRunnerStatus, HistoryItem, SpriteFrame } from "./types";

describe("direction split ground line QC", () => {
  it("classifies grounded presets without forcing airborne actions into strict contact", () => {
    expect(directionSplitGroundProfileForAction("idle")).toBe("grounded-strict");
    expect(directionSplitGroundProfileForAction("walk")).toBe("grounded-strict");
    expect(directionSplitGroundProfileForAction("guard")).toBe("grounded-strict");
    expect(directionSplitGroundProfileForAction("talk")).toBe("grounded-strict");
    expect(directionSplitGroundProfileForAction("run")).toBe("grounded-soft");
    expect(directionSplitGroundProfileForAction("attack")).toBe("grounded-soft");
    expect(directionSplitGroundProfileForAction("ranged-attack")).toBe("grounded-soft");
    expect(directionSplitGroundProfileForAction("jump")).toBe("airborne-or-exempt");
    expect(directionSplitGroundProfileForAction("death-downed")).toBe("airborne-or-exempt");
  });

  it("keeps the standard 256px animation ground band aligned with normalization", () => {
    expect(directionSplitGroundBandForCell({ width: 256, height: 256 })).toEqual({
      groundLineY: 230,
      bandTop: 226,
      bandBottom: 238
    });
  });
});

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

describe("Codex job progress estimate", () => {
  it("keeps visual progress below complete while the job is still running", () => {
    const startedAt = "2026-06-29T00:00:00.000Z";
    const afterThirtyMinutes = Date.parse("2026-06-29T00:30:00.000Z");
    const afterTwoHours = Date.parse("2026-06-29T02:00:00.000Z");

    expect(estimateCodexJobProgress(startedAt, afterThirtyMinutes, "sprite-generate")).toBe(90);
    expect(estimateCodexJobProgress(startedAt, afterTwoHours, "sprite-generate")).toBeLessThan(100);
  });

  it("reports coarse phases without exposing a fake percentage", () => {
    const startedAt = "2026-06-29T00:00:00.000Z";

    expect(codexJobProgressPhase("queued", startedAt, Date.parse("2026-06-29T00:30:00.000Z"), "sprite-generate")).toBe("queued");
    expect(codexJobProgressPhase("running", startedAt, Date.parse("2026-06-29T00:01:00.000Z"), "sprite-generate")).toBe("starting");
    expect(codexJobProgressPhase("running", startedAt, Date.parse("2026-06-29T00:12:00.000Z"), "sprite-generate")).toBe("generating");
    expect(codexJobProgressPhase("running", startedAt, Date.parse("2026-06-29T00:25:00.000Z"), "sprite-generate")).toBe("checking");
    expect(codexJobProgressPhase("running", startedAt, Date.parse("2026-06-29T00:45:00.000Z"), "sprite-generate")).toBe("extended");
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

describe("animation source selection", () => {
  it("allows imported body images as animation sources", () => {
    expect(isAnimationSource(makeHistoryItem("body-source", { source: "import", name: "basic-young-male-hero.png" }))).toBe(true);
  });

  it("does not allow generated animation result sheets as the next body source", () => {
    const directionSplitSheet = makeHistoryItem("direction-split", {
      source: "generate",
      name: "codex-job-test-direction-split-animation-sheet.png",
      outboxImportKey: buildOutboxImportKey("direction-split", {
        jobId: "codex-job-test",
        filenames: ["codex-job-test-front.png"],
        manifestName: "codex-job-test-manifest.json"
      })
    });
    const legacyAnimationSheet = makeHistoryItem("animation-sheet", {
      source: "generate",
      name: "codex-job-legacy.png",
      outboxImportKey: buildOutboxImportKey("animation-sheet", { jobId: "codex-job-legacy", filenames: ["codex-job-legacy.png"] })
    });
    const bronzeCandidate = makeHistoryItem("bronze", {
      source: "generate",
      name: "codex-job-bronze-front.png",
      outboxImportKey: buildOutboxImportKey("bronze-candidate", { jobId: "codex-job-bronze", filenames: ["codex-job-bronze-front.png"] })
    });

    expect(isAnimationResultHistoryItem(directionSplitSheet)).toBe(true);
    expect(isAnimationResultHistoryItem(legacyAnimationSheet)).toBe(true);
    expect(isAnimationResultHistoryItem(bronzeCandidate)).toBe(true);
    expect(isAnimationSource(directionSplitSheet)).toBe(false);
    expect(isAnimationSource(legacyAnimationSheet)).toBe(false);
    expect(isAnimationSource(bronzeCandidate)).toBe(false);
  });

  it("does not allow bundled sample items as animation sources until imported", () => {
    expect(isAnimationSource(makeHistoryItem("sample", { source: "sample" }))).toBe(false);
  });
});

describe("settings recovery environment report", () => {
  it("opens settings from explicit recovery and diagnostics URL params", () => {
    expect(shouldOpenSettingsFromSearch("?settings=1")).toBe(true);
    expect(shouldOpenSettingsFromSearch("?settings=environment")).toBe(true);
    expect(shouldOpenSettingsFromSearch("?diagnostics=1")).toBe(true);
    expect(shouldOpenSettingsFromSearch("?safe=1")).toBe(true);
    expect(settingsTabFromSearch("?settings=environment")).toBe("environment");
    expect(settingsTabFromSearch("?diagnostics=1")).toBe("diagnostics");
    expect(settingsTabFromSearch("?safe=1")).toBe("recovery");
  });

  it("redacts secrets, data URLs, and user home paths", () => {
    const windowsHome = ["C:", "Users", "alice", "secret"].join("\\");
    const redactedWindowsHome = ["C:", "Users", "<USER>"].join("\\");
    const unixHome = ["/Users", "alice", "secret"].join("/");
    const redacted = redactEnvironmentReportText(
      `api_key=sk-testsecret token=ghp_testsecret data:image/png;base64,abcdef ${windowsHome} ${unixHome}`
    );

    expect(redacted).toContain("api_key=[REDACTED]");
    expect(redacted).toContain("token=[REDACTED]");
    expect(redacted).toContain("[REDACTED_DATA_URL]");
    expect(redacted).toContain(redactedWindowsHome);
    expect(redacted).toContain("/Users/<USER>");
    expect(redacted).not.toContain("sk-testsecret");
    expect(redacted).not.toContain("abcdef");
    expect(redacted).not.toContain("alice");
  });

  it("builds a report from summaries without including prompts or image data", () => {
    const report = buildImageCockpitEnvironmentReport({
      appVersion: "0.1.2",
      appUrl: "http://127.0.0.1:5181",
      route: "/?settings=environment",
      userAgent: "Vitest Browser",
      browserLanguage: "ja-JP",
      browserPlatform: "Win32",
      viewport: { width: 1280, height: 720, devicePixelRatio: 1 },
      timezoneOffsetMinutes: -540,
      localTime: "2026-06-27T02:41:00.000Z",
      apiHealth: {
        app: "image-cockpit",
        version: "0.1.2",
        role: "api",
        port: 8794,
        handoffRoot: ["C:", "Users", "alice", "project", "codex-handoff"].join("\\"),
        inboxReadable: true,
        outboxReadable: true,
        statusReadable: true,
        logsReadable: true,
        runner: { state: "ready", message: "ok", checkedAt: "now", autorun: true }
      },
      runner: {
        state: "ready",
        message: "ok",
        command: "codex",
        checkedAt: "now",
        autorun: true,
        sandbox: "workspace-write",
        approval: "never"
      },
      providerId: "codex-handoff",
      workflowMode: "image-generate",
      safeMode: false,
      skipStorage: false,
      activeJobCount: 0,
      queuedJobCount: 0,
      lastFailure: {
        jobId: "codex-job-test",
        label: "Image",
        diagnostic: {
          kind: "imagegen_unavailable",
          title: "imagegen unavailable",
          userMessage: "The imagegen tool was unavailable."
        }
      },
      lastResult: {
        provider: "local-generator",
        source: "generate",
        name: "local.png",
        size: "1024x1024",
        mimeType: "image/png",
        dimensions: "1024x1024",
        placeholderSuspected: "no",
        localProcedural: true
      },
      imagegenSmoke: "not_run"
    });

    const json = JSON.stringify(report.json);
    expect(report.markdown).toContain("Image Cockpit Environment Report");
    expect(report.markdown).toContain("imagegen_unavailable");
    expect(report.markdown).toContain("Local procedural result: yes");
    expect(json).toContain("localProcedural");
    expect(json).not.toContain("data:image");
    expect(json).not.toContain("forest mage prompt");
    expect(json).not.toContain("alice");
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

describe("Local Inbox import dedupe", () => {
  it("does not prepend the same outboxImportKey twice", () => {
    const key = buildOutboxImportKey("single", "manual-return.png");
    const first = makeHistoryItem("hist-1", {
      provider: "local-inbox",
      source: "inbox",
      name: "manual-return.png",
      outboxImportKey: key
    });
    const second = makeHistoryItem("hist-2", {
      provider: "local-inbox",
      source: "inbox",
      name: "manual-return.png",
      outboxImportKey: key
    });

    const inserted = prependHistoryItemWithDedupe([first], second);

    expect(inserted.added).toBe(false);
    expect(inserted.item.id).toBe(first.id);
    expect(inserted.history).toHaveLength(1);
  });

  it("keeps one bronze candidate per job even when candidate filenames differ", () => {
    const jobId = "codex-job-2026-06-27T00-57-56-534Z";
    const first = makeHistoryItem("bronze-1", {
      provider: "local-inbox",
      source: "inbox",
      name: `${jobId}-bronze-candidate-${jobId}-front.png`,
      outboxImportKey: buildOutboxImportKey("bronze-candidate", { jobId, filenames: [`${jobId}-front.png`] })
    });
    const second = makeHistoryItem("bronze-2", {
      provider: "local-inbox",
      source: "inbox",
      name: `${jobId}-bronze-candidate-${jobId}-side.png`,
      outboxImportKey: buildOutboxImportKey("bronze-candidate", { jobId, filenames: [`${jobId}-side.png`] })
    });

    const inserted = prependHistoryItemWithDedupe([first], second);

    expect(inserted.added).toBe(false);
    expect(inserted.item.id).toBe(first.id);
  });

  it("dedupes legacy exact duplicate local-inbox entries without touching user imports", () => {
    const localInboxA = makeHistoryItem("local-inbox-a", {
      provider: "local-inbox",
      source: "inbox",
      name: "same-bronze.png",
      size: "1024x512",
      dataUrl: "data:image/png;base64,bronze"
    });
    const localInboxB = makeHistoryItem("local-inbox-b", {
      provider: "local-inbox",
      source: "inbox",
      name: "same-bronze.png",
      size: "1024x512",
      dataUrl: "data:image/png;base64,bronze"
    });
    const userImport = makeHistoryItem("user-import", {
      provider: "local-file",
      source: "import",
      name: "same-bronze.png",
      size: "1024x512",
      dataUrl: "data:image/png;base64,bronze"
    });

    const result = dedupeLocalInboxHistory([localInboxA, localInboxB, userImport]);

    expect(result.removedCount).toBe(1);
    expect(result.history.map((item) => item.id)).toEqual(["local-inbox-a", "user-import"]);
    expect(result.idReplacements["local-inbox-b"]).toBe("local-inbox-a");
  });

  it("drops recovered local generator artifacts without touching real local generator history", () => {
    const recoveredLocalGeneratorName = "local-gen-2026-06-27T16-21-33-465Z-image-1.png";
    const recoveredLocalGenerator = makeHistoryItem("bad-local-inbox", {
      provider: "local-inbox",
      source: "inbox",
      name: recoveredLocalGeneratorName,
      outboxImportKey: buildOutboxImportKey("single", recoveredLocalGeneratorName)
    });
    const realLocalGenerator = makeHistoryItem("real-local-generator", {
      provider: "local-generator",
      source: "generate",
      name: recoveredLocalGeneratorName
    });

    const inserted = prependHistoryItemWithDedupe([], recoveredLocalGenerator);
    const result = dedupeLocalInboxHistory([recoveredLocalGenerator, realLocalGenerator]);

    expect(inserted.added).toBe(false);
    expect(inserted.history).toHaveLength(0);
    expect(result.removedCount).toBe(1);
    expect(result.history.map((item) => item.id)).toEqual(["real-local-generator"]);
  });

  it("remaps frame source ids when exact duplicate history is removed", () => {
    const remapped = remapFrameSourceIds(
      [
        makeFrame("frame-a", { sourceId: "duplicate-history" }),
        makeFrame("frame-b", { sourceId: "kept-history" })
      ],
      { "duplicate-history": "kept-history" }
    );

    expect(remapped.changedCount).toBe(1);
    expect(remapped.frames.map((frame) => frame.sourceId)).toEqual(["kept-history", "kept-history"]);
  });

  it("allows a final direction-split import after a bronze candidate for the same job", () => {
    const jobId = "codex-job-2026-06-27T00-57-56-534Z";
    const bronze = makeHistoryItem("bronze", {
      provider: "local-inbox",
      source: "inbox",
      outboxImportKey: buildOutboxImportKey("bronze-candidate", { jobId, filenames: [`${jobId}-front.png`] })
    });
    const finalSheet = makeHistoryItem("final-sheet", {
      provider: "local-inbox",
      source: "inbox",
      outboxImportKey: buildOutboxImportKey("direction-split", {
        jobId,
        filenames: [
          `${jobId}-front.png`,
          `${jobId}-front-three-quarter.png`,
          `${jobId}-side.png`,
          `${jobId}-back-three-quarter.png`,
          `${jobId}-back.png`
        ],
        manifestName: `${jobId}-manifest.json`
      })
    });

    const inserted = prependHistoryItemWithDedupe([bronze], finalSheet);

    expect(inserted.added).toBe(true);
    expect(inserted.history.map((item) => item.id)).toEqual(["final-sheet", "bronze"]);
  });

  it("fingerprints outbox changes with name, size, and modified time", () => {
    const jobId = "codex-job-2026-06-27T00-57-56-534Z";
    const initial = fingerprintOutboxResults([makeOutboxResult(`${jobId}-front.png`)], jobId, "2026-06-26T00:00:00.000Z");
    const changed = fingerprintOutboxResults(
      [{ ...makeOutboxResult(`${jobId}-front.png`), modifiedAt: "2026-06-27T00:01:00.000Z" }],
      jobId,
      "2026-06-26T00:00:00.000Z"
    );

    expect(initial).not.toBe("");
    expect(changed).not.toBe(initial);
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
      `local-gen-2026-06-27T16-21-33-465Z-image-1.png`,
      `local-gen-2026-06-27T16-21-33-465Z-local-generation.json`,
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

  it("does not treat direction split raw direction files as generic static image imports", () => {
    const jobId = "codex-job-2026-06-27T02-11-47-290Z";

    expect(directionSplitJobIdFromOutboxResultName(`${jobId}-front.png`)).toBe(jobId);
    expect(directionSplitJobIdFromOutboxResultName(`${jobId}-manifest.json`)).toBe(jobId);
    expect(isDirectionSplitComponentOutboxName(`${jobId}-front.png`)).toBe(true);
    expect(isDirectionSplitComponentOutboxName(`${jobId}-manifest.json`)).toBe(false);
    expect(isGenericStaticImageResult(makeOutboxResult(`${jobId}-front.png`))).toBe(false);
    expect(isGenericStaticImageResult(makeOutboxResult(`${jobId}-final-sheet.png`))).toBe(true);
  });

  it("quarantines bronze candidate names instead of treating them as final generic imports", () => {
    const jobId = "codex-job-2026-06-27T02-11-47-290Z";
    const candidate = makeOutboxResult(`${jobId}-bronze-candidate-front.png`);

    expect(shouldIgnoreOutboxResultName(candidate.name)).toBe(false);
    expect(isUsableOutboxResult(candidate)).toBe(false);
    expect(isGenericStaticImageResult(candidate)).toBe(false);
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

  it("blocks direction split import when the server quality gate marks the artifact failed", () => {
    const jobId = "codex-job-2026-06-25T13-01-42-060Z";
    const artifact = makeDirectionSplitArtifact(jobId, {
      ready: false,
      verified: false,
      quality: "blocked",
      reason: "Chroma key removal failed",
      qualityGate: {
        classification: "quality-failed",
        reason: "Chroma key removal failed",
        code: "chroma-key-removal-failed",
        historyAllowed: false,
        downloadAllowed: false,
        retryable: true
      }
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

    expect(selection.qualityFailed).toBe(true);
    expect(selection.waitingForVerifiedArtifacts).toBe(false);
    expect(selection.ready).toBe(false);
    expect(findReadyDirectionSplitArtifacts(results)).toHaveLength(0);
  });

  it("finds ready direction split artifacts without a pending job", () => {
    const olderJobId = "codex-job-2026-06-27T01-11-47-290Z";
    const newerJobId = "codex-job-2026-06-27T02-11-47-290Z";
    const readyArtifact = makeDirectionSplitArtifact(newerJobId, {
      ready: true,
      verified: true,
      quality: "gold",
      reason: "server verified"
    });
    const waitingArtifact = makeDirectionSplitArtifact(olderJobId, {
      ready: false,
      verified: false,
      quality: "waiting",
      reason: "missing side",
      missingDirections: ["side"]
    });
    const readyResults = [
      makeOutboxResult(`${newerJobId}-manifest.json`, "application/json", readyArtifact),
      makeOutboxResult(`${newerJobId}-front.png`, "image/png", readyArtifact),
      makeOutboxResult(`${newerJobId}-front-three-quarter.png`, "image/png", readyArtifact),
      makeOutboxResult(`${newerJobId}-side.png`, "image/png", readyArtifact),
      makeOutboxResult(`${newerJobId}-back-three-quarter.png`, "image/png", readyArtifact),
      makeOutboxResult(`${newerJobId}-back.png`, "image/png", readyArtifact)
    ];
    const waitingResults = [
      makeOutboxResult(`${olderJobId}-manifest.json`, "application/json", waitingArtifact),
      makeOutboxResult(`${olderJobId}-front.png`, "image/png", waitingArtifact),
      makeOutboxResult(`${olderJobId}-front-three-quarter.png`, "image/png", waitingArtifact)
    ];

    const artifacts = findReadyDirectionSplitArtifacts([...waitingResults, ...readyResults]);
    const latest = findLatestReadyDirectionSplitArtifact([...waitingResults, ...readyResults]);

    expect(artifacts).toHaveLength(1);
    expect(latest?.jobId).toBe(newerJobId);
    expect(latest?.manifestResult.name).toBe(`${newerJobId}-manifest.json`);
    expect(latest?.directionResults.map((result) => result.name)).toEqual([
      `${newerJobId}-front.png`,
      `${newerJobId}-front-three-quarter.png`,
      `${newerJobId}-side.png`,
      `${newerJobId}-back-three-quarter.png`,
      `${newerJobId}-back.png`
    ]);
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
