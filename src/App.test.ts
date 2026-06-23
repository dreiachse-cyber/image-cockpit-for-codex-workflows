import { describe, expect, it } from "vitest";
import {
  getNextHistoryRenderLimit,
  getVisibleHistoryCount,
  HISTORY_RENDER_BATCH_SIZE,
  INITIAL_HISTORY_RENDER_COUNT,
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

function makeStatus(state: CodexRunnerStatus["state"]): CodexRunnerStatus {
  return {
    jobId: "codex-job-test",
    state,
    message: `${state} runner`
  };
}
