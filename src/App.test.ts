import { describe, expect, it } from "vitest";
import {
  getNextHistoryRenderLimit,
  getVisibleHistoryCount,
  HISTORY_RENDER_BATCH_SIZE,
  INITIAL_HISTORY_RENDER_COUNT,
  isLikelyFrameGarbageComponent,
  resolveInitialLanguage,
  shouldWaitForCodexRunner
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
});

describe("initial language", () => {
  it("uses the stored language when it is valid", () => {
    expect(resolveInitialLanguage("en", ["ja-JP"])).toBe("en");
    expect(resolveInitialLanguage("ja", ["en-US"])).toBe("ja");
  });

  it("defaults to Japanese for Japanese browser locales", () => {
    expect(resolveInitialLanguage(null, ["ja-JP", "en-US"])).toBe("ja");
  });

  it("falls back to English when no stored or Japanese browser language exists", () => {
    expect(resolveInitialLanguage(null, ["en-US"])).toBe("en");
    expect(resolveInitialLanguage("fr", [])).toBe("en");
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

describe("animation frame cleanup", () => {
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
