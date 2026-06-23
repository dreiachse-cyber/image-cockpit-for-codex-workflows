import { describe, expect, it } from "vitest";
import { resolveInitialLanguage, shouldWaitForCodexRunner } from "./App";
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

function makeStatus(state: CodexRunnerStatus["state"]): CodexRunnerStatus {
  return {
    jobId: "codex-job-test",
    state,
    message: `${state} runner`
  };
}
