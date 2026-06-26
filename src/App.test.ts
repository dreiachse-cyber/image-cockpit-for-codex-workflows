import { describe, expect, it } from "vitest";
import {
  getNextHistoryRenderLimit,
  getVisibleHistoryCount,
  HISTORY_RENDER_BATCH_SIZE,
  INITIAL_HISTORY_RENDER_COUNT,
  isCharacterGreenPixel,
  isDirectionSplitAnimationManifestName,
  isFrameChromaResiduePixel,
  isOutboxResultForJob,
  isLikelyFrameGarbageComponent,
  resolveInitialLanguage,
  shouldReportCompletedCodexImportFailure,
  shouldWaitForCodexRunner,
  summarizeCodexImportFailureReason,
  SUPPORTED_LANGUAGE_IDS
} from "./App";
import type { CodexRunnerStatus } from "./types";

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

function makeStatus(state: CodexRunnerStatus["state"]): CodexRunnerStatus {
  return {
    jobId: "codex-job-test",
    state,
    message: `${state} runner`
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
