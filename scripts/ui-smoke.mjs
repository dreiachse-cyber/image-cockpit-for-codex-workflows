import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { deflateSync } from "node:zlib";
import JSZip from "jszip";

const nodeCommand = process.execPath;
const browserCommand = process.env.IMAGE_COCKPIT_BROWSER_COMMAND || findBrowserCommand();
const tinyPng =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";
const basicCharacterPromptExampleChecks = [
  { title: "Boy Adventurer", promptText: "cheerful young boy adventurer" },
  { title: "Girl Adventurer", promptText: "cheerful young girl adventurer" },
  { title: "Young Male Hero", promptText: "young male fantasy hero" },
  { title: "Young Female Hero", promptText: "young female fantasy hero" },
  { title: "Middle-Aged Male Mercenary", promptText: "middle-aged male mercenary" },
  { title: "Middle-Aged Female Ranger", promptText: "middle-aged female ranger" },
  { title: "Elder Male Sage", promptText: "elderly male sage" },
  { title: "Elder Female Herbalist", promptText: "elderly female herbalist" },
  { title: "Androgynous Traveler", promptText: "androgynous fantasy traveler" },
  { title: "Small Village Child", promptText: "small village child NPC" },
  { title: "Large Veteran Warrior", promptText: "large veteran warrior" },
  { title: "Hooded Mysterious Figure", promptText: "hooded mysterious figure" },
  { title: "Two-Head Chibi Knight", promptText: "two-head-tall chibi knight" },
  { title: "Two-Head Chibi Mage", promptText: "two-head-tall chibi mage" },
  { title: "Two-Head Chibi Archer", promptText: "two-head-tall chibi archer" },
  { title: "Two-Head Chibi Healer", promptText: "two-head-tall chibi healer" },
  { title: "Two-Head Chibi Ninja", promptText: "two-head-tall chibi ninja" },
  { title: "Two-Head Chibi Alchemist", promptText: "two-head-tall chibi alchemist" },
  { title: "Two-Head Chibi Pirate", promptText: "two-head-tall chibi pirate" },
  { title: "Two-Head Chibi Robot", promptText: "two-head-tall chibi robot" },
  { title: "Two-Head Chibi Dragon Tamer", promptText: "two-head-tall chibi dragon tamer" }
];
const expandedPromptExampleChecks = [
  { title: "Boy Warrior Apprentice", promptText: "boy warrior apprentice" },
  { title: "Middle-Aged Female Captain", promptText: "middle-aged female captain" },
  { title: "Classic Green Slime", promptText: "classic small green slime" },
  { title: "Earth Spirit", promptText: "earth spirit" },
  { title: "Slime Scout Girl", promptText: "chibi slime scout girl" },
  { title: "Shark Pirate Girl", promptText: "chibi shark pirate girl" }
];
const expectedPromptExampleCount = 107;
const expectedCodexLogHistoryLimit = 3;

if (!browserCommand) {
  console.error("UI smoke requires Chrome or Edge. Set IMAGE_COCKPIT_BROWSER_COMMAND to a browser executable.");
  process.exit(1);
}

const tempRoot = await mkdtemp(join(tmpdir(), "image-cockpit-ui-smoke-"));
const handoffDir = join(tempRoot, "handoff");
const chromeProfileDir = join(tempRoot, "chrome-profile");
const mockRunnerPath = join(tempRoot, "mock-codex-runner.mjs");
const mockAnimationPackPath = join(tempRoot, "mock-run-cycle.image-cockpit-animation.zip");
const mockFullBodySourcePath = join(tempRoot, "mock-full-body-source.png");
const mockImportFailureMarkerPath = join(tempRoot, "mock-direction-split-import-failure.flag");
const mockQualityGateFailureMarkerPath = join(tempRoot, "mock-direction-split-quality-gate-failure.flag");
const mockPartialDirectionSplitMarkerPath = join(tempRoot, "mock-partial-direction-split-recovery.flag");
const mockManifestFirstDirectionSplitMarkerPath = join(tempRoot, "mock-manifest-first-direction-split-recovery.flag");
const apiPort = await getOpenPort();
const vitePort = await getOpenPort();
const debugPort = await getOpenPort();
const appUrl = `http://127.0.0.1:${vitePort}/`;
const screenshotDir = process.env.IMAGE_COCKPIT_UI_SMOKE_SCREENSHOT_DIR;
const onlyEffectSmoke = process.env.IMAGE_COCKPIT_UI_SMOKE_ONLY_EFFECT === "1";
const onlyVfxCompositeSmoke = process.env.IMAGE_COCKPIT_UI_SMOKE_ONLY_VFX_COMPOSITE === "1";

let apiServer;
let viteServer;
let browserProcess;
let cdp;

try {
  await writeFile(mockRunnerPath, mockRunnerSource(), "utf8");
  await writeFile(mockAnimationPackPath, Buffer.from(await createMockAnimationPack()));
  await writeFile(mockFullBodySourcePath, makeFullBodySourcePng());
  apiServer = startProcess(nodeCommand, ["node_modules/tsx/dist/cli.mjs", "server/index.ts"], {
    IMAGE_COCKPIT_API_PORT: String(apiPort),
    IMAGE_COCKPIT_HANDOFF_DIR: handoffDir,
    IMAGE_COCKPIT_CODEX_AUTORUN: "1",
    IMAGE_COCKPIT_ALLOW_MOCK_RUNNER: "1",
    IMAGE_COCKPIT_CODEX_COMMAND: nodeCommand,
    IMAGE_COCKPIT_CODEX_HELP_ARGS_JSON: JSON.stringify([mockRunnerPath, "--help"]),
    IMAGE_COCKPIT_CODEX_EXEC_ARGS_JSON: JSON.stringify([mockRunnerPath]),
    IMAGE_COCKPIT_MOCK_RUNNER_DELAY_MS: "2600",
    IMAGE_COCKPIT_ARTIFACT_STABLE_MS: "0"
  });
  await waitForHttp(`http://127.0.0.1:${apiPort}/api/providers`, "local API");

  viteServer = startProcess(nodeCommand, ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", String(vitePort), "--strictPort"], {
    IMAGE_COCKPIT_API_TARGET: `http://127.0.0.1:${apiPort}`
  });
  await waitForHttp(appUrl, "Vite app");
  console.log(`UI smoke app URL: ${appUrl}`);

  browserProcess = startProcess(browserCommand, [
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-background-networking",
    "--remote-debugging-address=127.0.0.1",
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${chromeProfileDir}`,
    "--window-size=1280,720",
    "about:blank"
  ]);

  const target = await waitForPageTarget(debugPort);
  cdp = await createCdpClient(target.webSocketDebuggerUrl);
  await cdp.send("Page.enable");
  await cdp.send("DOM.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Page.addScriptToEvaluateOnNewDocument", {
    source: `
      window.__uiSmokeErrors = [];
      window.addEventListener("error", (event) => {
        window.__uiSmokeErrors.push(event.message || "window error");
      });
      window.addEventListener("unhandledrejection", (event) => {
        window.__uiSmokeErrors.push(String(event.reason?.message || event.reason || "unhandled rejection"));
      });
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText: async (value) => {
            window.__uiSmokeCopiedText = String(value);
          }
        }
      });
      if (location.search.includes("mockLargeStorage=1")) {
        Object.defineProperty(navigator, "storage", {
          configurable: true,
          value: {
            estimate: async () => ({
              usage: 600 * 1024 * 1024,
              quota: 2 * 1024 * 1024 * 1024
            })
          }
        });
      }
      localStorage.setItem("image-cockpit.language", "en");
      localStorage.removeItem("image-cockpit.pendingCodexJob");
      if (sessionStorage.getItem("image-cockpit.ui-smoke.skip-default-seed") !== "1") {
        localStorage.setItem("image-cockpit.v3.history", JSON.stringify([{
          id: "ui-smoke-source",
          name: "ui-smoke-source.png",
          dataUrl: ${JSON.stringify(tinyPng)},
          provider: "local-file",
          prompt: "UI smoke source pixel art",
          seed: "ui-smoke",
          size: "1x1",
          createdAt: new Date().toISOString(),
          adopted: false,
          source: "import"
        }]));
        localStorage.removeItem("image-cockpit.v3.frames");
        localStorage.removeItem("image-cockpit.v3.actions");
        localStorage.removeItem("image-cockpit.v3.animation-library");
      }
    `
  });
  await cdp.send("Page.navigate", { url: appUrl });
  await waitForEval(
    () => `document.body.innerText.includes("Pixel Art Generation") && Boolean(document.querySelector(".source-panel > .workflow-tabs"))`,
    "initial Pixel Art Generation workspace"
  );

  if (onlyVfxCompositeSmoke) {
    await prepareVfxCompositeSmokeResults();
    await assertVfxCompositeStage();
    console.log("UI smoke VFX Composite-only passed.");
  } else if (onlyEffectSmoke) {
    await assertEffectAnimationWorkflow();
    await assertEffectCategoryMatrix();
    await assertEffectResultNotEditable();
    console.log("UI smoke effect-only passed.");
  } else {
  await assertInitialWorkspace();
  await assertCockpitHealthAndDedupeControls();
  await assertSettingsRecoveryEnvironmentReport();
  await assertSafeModeRecovery();
  await assertStoragePreflightRecovery();
  await assertResetLocalStatePage();
  await assertLanguageSwitch();
  await assertPromptExamples();
  await assertAnimationPresetExamples();
  await assertAnimationLibraryHidden();
  await assertCodexFailureNotice();
  await assertImagegenUnavailableSidecar();
  await assertTempCandidateContactImportFilter();
  await assertPartialDirectionSplitRecovery();
  await assertManifestFirstDirectionSplitRecovery();
  await assertCompletedDirectionSplitImportFailure();
  await assertQualityGateDirectionSplitFailure();
  await assertDetachedDirectionSplitRecoverResults();
  await assertCodexQueue();
  await assertImageEditing();
  await assertWorkflow({
    label: "Pixel Art Generation",
    route: "Route: Codex Handoff",
    buttons: ["Generate Pixel Art", "Download"],
    hiddenButtons: ["Import Latest", "Import File", "PNG", "Animated GIF", "Animated WebP", "Animated APNG"],
    hiddenText: ["Sprite Actions", "Export Sprite", "Generation Method"],
    requiredText: ["Pixel Art Prompt", "Generation Notes", "Preview", "Generation can take a few minutes."],
    exerciseButton: "Generate Pixel Art",
    expectedAfterExercise: "Imported from Local Inbox",
    expectedCanvasPreviewModeAfterExercise: "result",
    expectedDownloadModalButtons: ["PNG"],
    downloadModalAbsentButtons: ["Animated GIF", "Animated WebP", "Animated APNG", "Sprite Sheet", "Export Animation Pack"],
    downloadModalClickButtons: ["PNG"]
  });
  await assertWorkflow({
    label: "Animation Generation",
    route: "Route: Codex Handoff",
    buttons: ["Choose Animation", "Open advanced settings", "Generate Animation", "Download"],
    hiddenButtons: ["Import Latest", "Import File", "PNG", "Animated GIF", "Animated WebP", "Animated APNG", "Official Animations", "User Animations", "Import Animation", "Export Sample", "Use", "5-Direction Sheet", "hatch-pet", "5-Direction hatch-pet"],
    hiddenText: ["Animation Library", "Official Animations", "User Animations", "No user animations yet", "Sprite Actions", "Export Sprite", "Generation Method", "Hop Bounce"],
    requiredText: ["1. Upload Pixel Art", "2. Choose Motion", "3. Generate", "4. Download", "Selected animation", "Choose Animation", "Directions", "5 directions", "3 directions"],
    exerciseButton: "Generate Animation",
    expectedAfterExercise: "Animation generated",
    expectedAfterExerciseText: ["Animation frames ready", "Generated from", "Directional Previews", "GIF Preview", "Sprite Sheet Preview"],
    expectedDownloadModalButtons: ["Animated GIF", "Animated WebP", "Animated APNG", "Sprite Sheet", "Review / Edit Timeline", "Export Animation Pack"],
    downloadModalClickButtons: ["Animated WebP", "Animated APNG", "Sprite Sheet"],
    expectedCanvasPreviewModeAfterExercise: "result",
    expectedPreviewImages: 6,
    expectedAnimationPreviewImagesAfterExercise: 6,
    expectedDirectionPreviewCount: 5,
    expectedNormalizedAnimationFrames: true,
    expectSourceRoundTrip: true,
    reloadAfterExercise: true,
    exerciseTimeoutMs: 45000
  });
  await assertAnimationReviewCockpit();
  await assertAnimationTimelinePackV2();
  await assertAnimationResultNotEditable();
  await assertEffectAnimationWorkflow();
  await assertEffectCategoryMatrix();
  await assertVfxCompositeStage();
  await assertEffectResultNotEditable();
  if (!screenshotDir) await assertHistoryIncrementalRendering();

  console.log("UI smoke passed.");
  }
} finally {
  await cdp?.close();
  await stopProcess(browserProcess);
  await stopProcess(viteServer);
  await stopProcess(apiServer);
  await rm(tempRoot, { recursive: true, force: true });
}

async function assertInitialWorkspace() {
  const snapshot = await pageSnapshot();
  assert(snapshot.guidedOptions.length === 0, "Initial screen should not show legacy Guided Start options");
  assert(!snapshot.buttons.includes("Start"), "Initial workspace should not expose the old Start button");
  assert(snapshot.text.includes("Pixel Art Generation"), "Initial screen should open the Pixel Art Generation workspace");
  assert(snapshot.buttons.includes("Pixel Art Generation"), "Initial workspace should expose Pixel Art Generation tab");
  assert(snapshot.buttons.includes("Image Editing"), "Initial workspace should expose Image Editing tab");
  assert(snapshot.buttons.includes("Animation Generation"), "Initial workspace should expose Animation Generation tab");
  assert(snapshot.buttons.includes("Effect Animation"), "Initial workspace should expose Effect Animation tab");
  assert(snapshot.workflowTabsInsidePanel, "Initial workspace should place workflow tabs under 1. Workflow");
  assert(snapshot.workflowTabsLeadHierarchy, "Initial workspace should place primary workflow buttons before summary and health");
  assert(snapshot.workflowTabsTopOffset <= 50, `Primary workflow buttons should stay at the top of the left column, got offset ${snapshot.workflowTabsTopOffset}`);
  assert(snapshot.workflowTabsWithinInitialViewport, "Primary workflow buttons should be visible without scrolling the initial workspace");
  assert(snapshot.canvasVisible, "Initial workspace should render the preview canvas immediately");
  assert(snapshot.resultDownloadPanelInWorkspace, "Initial workspace should place the result download card under the preview workspace");
  assert(snapshot.resultDownloadActionButtons === 1, "Initial workspace should expose one compact Download button");
  assert(snapshot.resultDownloadGridButtonsInWorkspace === 0, "Initial workspace should not expose detailed download buttons under the preview");
  assert(snapshot.resultDownloadPanelHeight <= 110, `Initial download panel should stay compact, got ${snapshot.resultDownloadPanelHeight}`);
  await maybeCapture("initial-workspace");
}

async function assertCockpitHealthAndDedupeControls() {
  await waitForEval(
    () => `Boolean(document.querySelector(".cockpit-health-panel")) && document.body.innerText.includes("Cockpit:")`,
    "Cockpit health panel"
  );
  const snapshot = await pageSnapshot();
  assert(snapshot.text.includes("Recover Results"), "Cockpit health panel should expose Recover Results");
  assert(snapshot.text.includes("Dedupe History"), "History panel should expose Dedupe History");
  assert(snapshot.text.includes("Diagnose"), "Cockpit health panel should expose Diagnose");
  const healthState = await evaluate(`(() => {
    const panel = document.querySelector(".cockpit-health-panel");
    return {
      hasOkOrWarning: panel?.classList.contains("state-ok") || panel?.classList.contains("state-warning") || panel?.classList.contains("state-checking"),
      repairButton: Array.from(document.querySelectorAll("button")).some((button) => button.innerText.includes("Repair Cockpit")),
      recoverButton: Array.from(document.querySelectorAll("button")).some((button) => button.innerText.includes("Recover Results")),
      dedupeButton: Array.from(document.querySelectorAll("button")).some((button) => button.innerText.includes("Dedupe History"))
    };
  })()`);
  assert(healthState.hasOkOrWarning, "Cockpit health panel should render a non-broken initial state");
  assert(healthState.repairButton, "Cockpit health panel should render the fixed Repair Cockpit action");
  assert(healthState.recoverButton, "Cockpit health panel should render the fixed Recover Results action");
  assert(healthState.dedupeButton, "History panel should render duplicate history cleanup action");
  await assertNoBrowserErrors("Cockpit health and dedupe controls");
}

async function assertSettingsRecoveryEnvironmentReport() {
  await waitForEval(
    () => `Boolean(document.querySelector(".language-control + .settings-trigger"))`,
    "settings trigger next to language selector"
  );
  await evaluate(`document.querySelector(".settings-trigger")?.click()`);
  await waitForEval(() => `document.body.innerText.includes("Environment Report")`, "settings modal");
  const initial = await evaluate(`(() => {
    const text = document.body.innerText;
    const topbar = document.querySelector(".topbar")?.getBoundingClientRect();
    const settings = document.querySelector(".settings-trigger")?.getBoundingClientRect();
    const language = document.querySelector(".language-control")?.getBoundingClientRect();
    return {
      hasTabs: ["General", "Recovery", "Diagnostics", "Environment Report"].every((label) => text.includes(label)),
      triggerRightOfLanguage: Boolean(settings && language && settings.left >= language.right - 1),
      topbarFits: !topbar || topbar.right <= window.innerWidth + 1
    };
  })()`);
  assert(initial.hasTabs, "Settings modal should expose General, Recovery, Diagnostics, and Environment Report tabs");
  assert(initial.triggerRightOfLanguage, "Settings trigger should sit next to the language selector");
  assert(initial.topbarFits, "Settings trigger should not overflow the topbar");

  await clickButtonByText("Recovery");
  await waitForEval(() => `document.body.innerText.includes("Open Reset Local State")`, "settings recovery tab");
  const recovery = await evaluate(`(() => {
    const text = document.body.innerText;
    return ["Open Safe Mode", "Open Reset Local State", "Recover Results", "Dedupe History", "Repair Cockpit", "Diagnose"].every((label) => text.includes(label));
  })()`);
  assert(recovery, "Settings Recovery should gather safe, reset, diagnose, recover, repair, and dedupe actions");

  await clickButtonByText("Environment Report");
  await waitForEval(() => `document.body.innerText.includes("Copy Markdown") && document.body.innerText.includes("Copy JSON")`, "environment report tab");
  await clickButtonByText("Copy Markdown");
  const markdownCopy = await evaluate(`window.__uiSmokeCopiedText || ""`);
  assert(markdownCopy.includes("Image Cockpit Environment Report"), "Copy Markdown should copy the environment report");
  assert(markdownCopy.includes("imagegen smoke: not_run"), "Environment report should include imagegen smoke status");
  assert(!/data:image/i.test(markdownCopy), "Markdown report should not include image data URLs");
  assert(!/api[_-]?key\s*[=:]|sk-[A-Za-z0-9]|ghp_/i.test(markdownCopy), "Markdown report should not include secret values");

  await clickButtonByText("Copy JSON");
  const jsonCopy = await evaluate(`window.__uiSmokeCopiedText || ""`);
  const parsed = JSON.parse(jsonCopy);
  assert(parsed.imagegen?.smoke === "not_run", "JSON report should include imagegen smoke not_run");
  assert(parsed.safety?.redacted === true, "JSON report should mark redaction");
  assert(!/data:image/i.test(jsonCopy), "JSON report should not include image data URLs");
  assert(!/"prompt"/i.test(jsonCopy), "JSON report should not include prompt fields");

  await evaluate(`document.querySelector(".settings-modal-header .icon-button")?.click()`);
  await waitForEval(() => `!document.querySelector(".settings-modal")`, "settings modal close");
  await assertNoBrowserErrors("settings recovery environment report");
}

async function assertSafeModeRecovery() {
  await cdp.send("Page.navigate", { url: `http://127.0.0.1:${vitePort}/?safe=1` });
  await waitForEval(() => `document.body.innerText.includes("Local state safe mode")`, "safe mode recovery screen");
  const safeMode = await evaluate(`(() => {
    const text = document.body.innerText;
    return {
      skipped: text.includes("Large history, frames, and animation library state were not loaded."),
      clearAll: text.includes("Clear all local Image Cockpit state"),
      runner: text.includes("Codex runner"),
      settingsOpen: Boolean(document.querySelector(".settings-modal")) && text.includes("Environment Report"),
      historyItems: document.querySelectorAll(".history-item").length
    };
  })()`);
  assert(safeMode.skipped, "Safe mode should state that large local state was skipped");
  assert(safeMode.clearAll, "Safe mode should expose the reset action");
  assert(safeMode.runner, "Safe mode should keep lightweight Codex runner status visible");
  assert(safeMode.settingsOpen, "Safe mode should automatically open the settings recovery modal");
  assert(safeMode.historyItems === 0, "Safe mode should not render restored history items");
  await assertNoBrowserErrors("safe mode recovery");
  await cdp.send("Page.navigate", { url: `http://127.0.0.1:${vitePort}/` });
  await waitForEval(() => `document.body.innerText.includes("Pixel Art Generation")`, "safe mode return to normal workspace");
}

async function assertStoragePreflightRecovery() {
  await cdp.send("Page.navigate", { url: `http://127.0.0.1:${vitePort}/?mockLargeStorage=1` });
  await waitForEval(() => `document.body.innerText.includes("Local state recovery")`, "mock large storage recovery screen");
  const recovery = await evaluate(`(() => {
    const text = document.body.innerText;
    return {
      pressure: text.includes("auto-safe"),
      usage: text.includes("600.0 MB"),
      dangerLoad: text.includes("危険を理解して読み込む")
    };
  })()`);
  assert(recovery.pressure, "Storage preflight should classify mocked 600 MB usage as auto-safe");
  assert(recovery.usage, "Storage recovery should show the mocked origin usage");
  assert(recovery.dangerLoad, "Storage recovery should expose the explicit unsafe-load option");
  await assertNoBrowserErrors("mock large storage recovery");
  await cdp.send("Page.navigate", { url: `http://127.0.0.1:${vitePort}/` });
  await waitForEval(() => `document.body.innerText.includes("Pixel Art Generation")`, "storage recovery return to normal workspace");
}

async function assertResetLocalStatePage() {
  await cdp.send("Page.navigate", { url: `http://127.0.0.1:${vitePort}/reset-local-state.html` });
  await waitForEval(() => `document.body.innerText.includes("Image Cockpit Local State Reset")`, "static local state reset page");
  await evaluate(`(() => {
    window.confirm = () => true;
    localStorage.setItem("image-cockpit.v3.history", JSON.stringify([{ id: "reset-smoke" }]));
    localStorage.setItem("image-cockpit.pendingCodexJob", JSON.stringify({ id: "reset-pending" }));
  })()`);
  await clickButtonByText("Clear all local state");
  await waitForEval(() => `document.querySelector("#status")?.textContent.includes("cleared")`, "static reset clear all status");
  const resetState = await evaluate(`(() => ({
    history: localStorage.getItem("image-cockpit.v3.history"),
    pending: localStorage.getItem("image-cockpit.pendingCodexJob"),
    safeLink: Boolean(document.querySelector('a[href="/?safe=1"]'))
  }))()`);
  assert(resetState.history === null, "Reset page should clear history localStorage");
  assert(resetState.pending === null, "Reset page should clear pending Codex job localStorage");
  assert(resetState.safeLink, "Reset page should provide a safe mode link");
  await assertNoBrowserErrors("static local state reset page");
  await cdp.send("Page.navigate", { url: `http://127.0.0.1:${vitePort}/` });
  await waitForEval(() => `document.body.innerText.includes("Pixel Art Generation")`, "reset page return to normal workspace");
}

async function assertLanguageSwitch() {
  const localeChecks = [
    { id: "ja", text: "ピクセルアートの生成" },
    { id: "en", text: "Pixel Art Generation" },
    { id: "zh-CN", text: "像素艺术生成" },
    { id: "zh-TW", text: "像素藝術生成" },
    { id: "ko", text: "픽셀 아트 생성" },
    { id: "ru", text: "Генерация пиксель-арта", checkFit: true },
    { id: "es", text: "Generación de pixel art" },
    { id: "pt-BR", text: "Geração de pixel art", checkFit: true },
    { id: "de", text: "Pixel-Art-Erstellung", checkFit: true },
    { id: "fr", text: "Génération de pixel art" },
    { id: "id", text: "Pembuatan pixel art" },
    { id: "tr", text: "Piksel sanat üretimi" },
    { id: "vi", text: "Tạo pixel art" },
    { id: "pl", text: "Generowanie pixel art" },
    { id: "it", text: "Generazione pixel art" }
  ];

  const optionSnapshot = await evaluate(`(() => {
    const options = Array.from(document.querySelectorAll(".language-control select option")).map((option) => ({
      value: option.value,
      text: option.textContent.trim()
    }));
    return { count: options.length, values: options.map((option) => option.value), labels: options.map((option) => option.text) };
  })()`);
  assert(optionSnapshot.count === 15, `Language selector should expose 15 locales, got ${optionSnapshot.count}`);
  ["zh-CN", "zh-TW", "ko", "ru", "es", "pt-BR", "de", "fr", "id", "tr", "vi", "pl", "it"].forEach((locale) => {
    assert(optionSnapshot.values.includes(locale), `Language selector missing ${locale}`);
  });
  ["简体中文", "繁體中文", "한국어", "Русский", "Português (Brasil)"].forEach((label) => {
    assert(optionSnapshot.labels.includes(label), `Language selector missing label ${label}`);
  });

  for (const check of localeChecks) {
    await evaluate(`(() => {
      const select = document.querySelector(".language-control select");
      select.value = ${JSON.stringify(check.id)};
      select.dispatchEvent(new Event("change", { bubbles: true }));
    })()`);
    await waitForEval(() => `document.body.innerText.includes(${JSON.stringify(check.text)})`, `${check.id} workspace copy`);
    if (check.checkFit) {
      const fit = await evaluate(`(() => {
        const topbar = document.querySelector(".topbar")?.getBoundingClientRect();
        const buttons = Array.from(document.querySelectorAll(".workflow-tabs button, .primary-button, .secondary-button"));
        const tooTall = buttons
          .map((button) => ({ text: button.innerText.trim(), height: button.getBoundingClientRect().height }))
          .filter((button) => button.height > 72);
        return {
          topbarFits: !topbar || topbar.right <= window.innerWidth + 1,
          tooTall
        };
      })()`);
      assert(fit.topbarFits, `${check.id} language selector should fit in the topbar`);
      assert(fit.tooTall.length === 0, `${check.id} buttons should wrap without excessive height: ${JSON.stringify(fit.tooTall)}`);
    }
  }

  await evaluate(`(() => {
    const select = document.querySelector(".language-control select");
    select.value = "en";
    select.dispatchEvent(new Event("change", { bubbles: true }));
  })()`);
  await waitForEval(() => `document.body.innerText.includes("Pixel Art Generation")`, "English workspace copy restored");
}

async function assertPromptExamples() {
  await selectWorkflowTab("Pixel Art Generation");
  await waitForEval(() => `document.body.innerText.includes("Pixel Art Generation")`, "Pixel Art Generation for prompt examples");
  const triggerPlacement = await evaluate(`(() => {
    const trigger = document.querySelector(".prompt-example-trigger");
    const promptField = document.querySelector(".source-panel .field");
    return Boolean(trigger && promptField && promptField.nextElementSibling === trigger);
  })()`);
  assert(triggerPlacement, "Prompt Examples trigger should sit directly below the prompt field");
  await openPromptExamplesModal();
  const snapshot = await pageSnapshot();
  assert(snapshot.text.includes("Pick by preview image"), "Prompt Examples intro should be visible");
  assert(snapshot.buttons.includes("Copy Prompt"), "Prompt Examples should expose copy buttons");
  assert(snapshot.buttons.includes("Use Prompt"), "Prompt Examples should expose use buttons");
  assert(
    snapshot.promptPreviewImages >= expectedPromptExampleCount,
    `Prompt Examples should show image previews with at least ${expectedPromptExampleCount} image previews, got ${snapshot.promptPreviewImages}`
  );
  assert(snapshot.promptRawTextBlocks === 0, `Prompt Examples should hide raw prompt text, got ${snapshot.promptRawTextBlocks} raw blocks`);
  await waitForEval(
    () => `Array.from(document.querySelectorAll(".prompt-card-preview img"))
      .filter((image) => image.complete && image.naturalWidth > 0).length >= ${expectedPromptExampleCount}`,
    "Prompt Examples preview images loaded",
    60000
  );
  const promptExampleCounts = await evaluate(`(() => {
    const buttonLabels = Array.from(document.querySelectorAll(".prompt-modal button"))
      .map((button) => button.innerText.replace(/\\s+/g, " ").trim());
    return {
      hasCategoryTabs: Boolean(document.querySelector(".prompt-category-tabs")),
      loadedImages: Array.from(document.querySelectorAll(".prompt-card-preview img"))
        .filter((image) => image.complete && image.naturalWidth > 0).length,
      copyButtons: buttonLabels.filter((label) => label === "Copy Prompt").length,
      useButtons: buttonLabels.filter((label) => label === "Use Prompt").length,
      categories: Array.from(document.querySelectorAll(".prompt-card-meta small"))
        .map((node) => node.textContent?.trim() || "")
    };
  })()`);
  assert(promptExampleCounts.hasCategoryTabs, "Prompt Examples should show prompt-category-tabs for large catalogs");
  assert(promptExampleCounts.loadedImages >= expectedPromptExampleCount, `Prompt Examples preview images should load, got ${promptExampleCounts.loadedImages}`);
  assert(
    promptExampleCounts.copyButtons >= expectedPromptExampleCount,
    `Prompt Examples should expose copy buttons for every preview, got ${promptExampleCounts.copyButtons}`
  );
  assert(
    promptExampleCounts.useButtons >= expectedPromptExampleCount,
    `Prompt Examples should expose use buttons for every preview, got ${promptExampleCounts.useButtons}`
  );
  assert(promptExampleCounts.categories.includes("Basic Character"), "Prompt Examples should include Basic Character category");
  assert(promptExampleCounts.categories.includes("Profession Character"), "Prompt Examples should include Profession Character category");
  assert(promptExampleCounts.categories.includes("Monster"), "Prompt Examples should include Monster category");
  assert(promptExampleCounts.categories.includes("Monster Girl Chibi"), "Prompt Examples should include Monster Girl Chibi category");
  assert(!snapshot.text.includes("Create one original pixel-art game asset"), "Prompt Examples should not display raw prompt contents");
  assert(!snapshot.text.includes("Create a single full-body pixel-art character asset"), "Prompt Examples should not display raw basic character prompt contents");
  assert(!snapshot.text.includes("Create a single full-body pixel-art monster asset"), "Prompt Examples should not display raw monster prompt contents");
  for (const check of basicCharacterPromptExampleChecks) {
    assert(snapshot.text.includes(check.title), `Prompt Examples should include ${check.title}`);
  }
  for (const check of expandedPromptExampleChecks) {
    assert(snapshot.text.includes(check.title), `Prompt Examples should include ${check.title}`);
  }
  await maybeCapture("prompt-examples-modal");

  for (const check of basicCharacterPromptExampleChecks) {
    await openPromptExamplesModal();
    await clickPromptExampleCardButton(check.title, "Use Prompt");
    await waitForEval(
      () => `document.body.innerText.includes("Prompt example loaded into Pixel Art Generation")`,
      `${check.title} prompt example loaded`
    );
    const loadedPrompt = await evaluate(`document.querySelector("textarea")?.value || ""`);
    assert(loadedPrompt.includes(check.promptText), `Use Prompt should load ${check.title} into the prompt field`);
    const modalClosed = await evaluate(`!document.querySelector(".prompt-modal")`);
    assert(modalClosed, `${check.title} Use Prompt should close the Prompt Examples modal`);

    const historyCountBefore = await evaluate(`document.querySelectorAll(".history-item").length`);
    await clickButtonByText("Generate Pixel Art");
    await waitForEval(
      () => `document.querySelectorAll(".history-item").length > ${historyCountBefore}`,
      `${check.title} generated from prompt example`,
      18000
    );
    await waitForButtonEnabled("Generate Pixel Art");
  }

  for (const check of expandedPromptExampleChecks) {
    await openPromptExamplesModal();
    await clickPromptExampleCardButton(check.title, "Use Prompt");
    await waitForEval(
      () => `document.body.innerText.includes("Prompt example loaded into Pixel Art Generation")`,
      `${check.title} prompt example loaded`
    );
    const loadedPrompt = await evaluate(`document.querySelector("textarea")?.value || ""`);
    assert(loadedPrompt.includes(check.promptText), `Use Prompt should load ${check.title} into the prompt field`);
    const modalClosed = await evaluate(`!document.querySelector(".prompt-modal")`);
    assert(modalClosed, `${check.title} Use Prompt should close the Prompt Examples modal`);
  }

  await selectWorkflowTab("Pixel Art Generation");
}

async function assertAnimationPresetExamples() {
  await selectWorkflowTab("Animation Generation");
  await waitForEval(() => `document.body.innerText.includes("Animation Generation")`, "Animation Generation for preset examples");
  const noFreePrompt = await evaluate(`document.querySelectorAll(".animation-step textarea").length === 0`);
  assert(noFreePrompt, "Animation Generation should not expose free-form motion prompt textareas");
  const selectorSummary = await evaluate(`document.querySelector(".selected-animation-card")?.innerText.replace(/\\s+/g, " ").trim() || ""`);
  assert(selectorSummary.includes("Selected animation"), `Animation card should show selected animation summary, got ${selectorSummary}`);
  assert(selectorSummary.length > "Selected animation".length, `Animation card should include the selected animation details, got ${selectorSummary}`);
  assert(!selectorSummary.includes("Hop Bounce"), "Animation card should not show unselected animation options");
  const triggerPlacement = await evaluate(`(() => {
    const selectedCard = document.querySelector(".selected-animation-card");
    const trigger = document.querySelector(".animation-preset-example-trigger");
    return Boolean(trigger && selectedCard && selectedCard.nextElementSibling === trigger);
  })()`);
  assert(triggerPlacement, "Choose Animation trigger should sit directly below the selected animation card");
  const workflowNavigation = await evaluate(`(() => {
    const nav = document.querySelector(".source-panel > .workflow-tabs");
    const buttons = [...(nav?.querySelectorAll("button") || [])];
    const navRect = nav?.getBoundingClientRect();
    const nextRect = nav?.nextElementSibling?.getBoundingClientRect();
    return {
      count: buttons.length,
      heights: buttons.map((button) => Math.round(button.getBoundingClientRect().height)),
      fontSizes: buttons.map((button) => Number.parseFloat(getComputedStyle(button).fontSize)),
      navContainsButtons: Boolean(navRect && buttons.every((button) => button.getBoundingClientRect().bottom <= navRect.bottom + 1)),
      nextStartsAfterNav: Boolean(navRect && nextRect && nextRect.top >= navRect.bottom)
    };
  })()`);
  assert(workflowNavigation.count === 4, `Workflow navigation should expose four primary actions, got ${workflowNavigation.count}`);
  assert(workflowNavigation.heights.every((height) => height >= 48), `Workflow buttons should keep generous click targets: ${JSON.stringify(workflowNavigation.heights)}`);
  assert(workflowNavigation.fontSizes.every((size) => size >= 16), `Workflow buttons should preserve the readable type floor: ${JSON.stringify(workflowNavigation.fontSizes)}`);
  assert(workflowNavigation.navContainsButtons && workflowNavigation.nextStartsAfterNav, "Workflow buttons should not overlap the following animation controls");
  const sourceUploadAccess = await evaluate(`(() => {
    const sourceStep = document.querySelector("details.collapsible-animation-step");
    const uploadButton = [...(sourceStep?.querySelectorAll("button") || [])]
      .find((button) => button.textContent.trim() === "Upload Pixel Art");
    return { available: Boolean(uploadButton), open: Boolean(sourceStep?.open) };
  })()`);
  assert(sourceUploadAccess.available, "Collapsed animation source step should keep Upload Pixel Art available on demand");
  assert(!(await evaluate(`document.querySelector(".source-panel")?.innerText.includes("Generation profile")`)), "Animation advanced controls should stay hidden by default");
  await clickButtonByText("Open advanced settings");
  await waitForEval(() => `Boolean(document.querySelector(".animation-utility-modal"))`, "Animation advanced settings modal");
  const profileSnapshot = await pageSnapshot();
  assert(profileSnapshot.text.includes("Generation profile"), "Animation Generation should expose the generation profile selector");
  assert(profileSnapshot.text.includes("chroma-key direction frames"), "Animation advanced settings should retain the chroma-key generation guidance");
  assert(profileSnapshot.text.includes("Fixed cells: 256 x 256 px"), "Animation advanced settings should retain the fixed cell contract");
  assert(profileSnapshot.text.includes("Notify when done"), "Animation advanced settings should retain notification controls");
  assert(["Fast", "Balanced", "Best"].every((label) => profileSnapshot.buttons.includes(label) || profileSnapshot.text.includes(label)), "Generation profile should expose Fast, Balanced, and Best");
  const defaultBest = await evaluate(`document.querySelector(".generation-profile-buttons button.active")?.innerText.includes("Best")`);
  assert(defaultBest, "Best should remain the default animation generation profile");
  const motionPilotDefaultOff = await evaluate(`document.querySelector(".motion-pilot-toggle input")?.checked === false`);
  assert(motionPilotDefaultOff, "Motion Pilot Tournament must remain experimental and default OFF");
  assert(profileSnapshot.text.includes("Best only"), "Motion Pilot should explain that A/B/C pilot generation is limited to Best");
  await clickSelector(".motion-pilot-toggle input");
  const motionPilotEnabled = await evaluate(`(() => ({ checked: document.querySelector(".motion-pilot-toggle input")?.checked, note: document.querySelector(".motion-pilot-experiment-note")?.innerText || "" }))()`);
  assert(motionPilotEnabled.checked === true, "Motion Pilot experimental flag should be explicitly selectable");
  assert(motionPilotEnabled.note.includes("Human review gate") && motionPilotEnabled.note.includes("remaining 4 directions"), `Motion Pilot should explain staged generation and review: ${JSON.stringify(motionPilotEnabled)}`);
  await clickSelector(".motion-pilot-toggle input");
  await clickSelector(".generation-profile-buttons button:nth-child(2)");
  const balancedActive = await evaluate(`document.querySelector(".generation-profile-buttons button.active")?.innerText.includes("Balanced")`);
  assert(balancedActive, "Balanced profile should be selectable");
  const motionPilotBalancedDisabled = await evaluate(`document.querySelector(".motion-pilot-toggle input")?.disabled === true && document.querySelector(".motion-pilot-toggle input")?.checked === false`);
  assert(motionPilotBalancedDisabled, "Motion Pilot should stay Best-only and reset OFF when another profile is selected");
  await clickSelector(".generation-profile-buttons button:nth-child(3)");
  await clickSelector(".animation-utility-heading .icon-button");
  await waitForEval(() => `!document.querySelector(".animation-utility-modal")`, "Animation advanced settings closed");
  await waitForEval(
    () => `document.activeElement?.classList.contains("animation-advanced-settings-trigger") || false`,
    "Animation advanced settings should return focus to its trigger"
  );

  await clickButtonByText("Choose Animation");
  await waitForEval(() => `document.querySelector(".animation-preset-modal")?.innerText.includes("Idle Breathing")`, "Choose Animation modal");
  const snapshot = await pageSnapshot();
  assert(snapshot.text.includes("Pick an animated sample"), "Choose Animation intro should be visible");
  assert(snapshot.buttons.includes("Select Animation"), "Choose Animation should expose select buttons");
  assert(snapshot.text.includes("Category") && snapshot.text.includes("Status"), "Motion Browser should expose Category and Status filters");
  const initialFilterFocus = await evaluate(`document.activeElement?.closest(".motion-preset-search") !== null`);
  assert(initialFilterFocus, "Motion Browser should place initial focus in search");
  const expectedAnimationPresetSamples = [
    { title: "Idle Breathing", className: "sample-idle-sheet", sheet: "idle-breathing-sheet.png", direction: "normal", playback: "normal loop", includeMessage: "Choose Animation should include the Idle Breathing animation card" },
    { title: "Walk Cycle", className: "sample-walk-sheet", sheet: "walk-cycle-sheet.png", direction: "normal", playback: "normal loop", includeMessage: "Choose Animation should include the Walk Cycle animation card" },
    { title: "Run Cycle", className: "sample-run-sheet", sheet: "run-cycle-sheet.png", direction: "alternate", playback: "ping-pong playback", includeMessage: "Choose Animation should include the Run Cycle animation card" },
    { title: "Basic Attack", className: "sample-attack-sheet", sheet: "basic-attack-sheet.png", direction: "normal", playback: "normal playback", includeMessage: "Choose Animation should include the Basic Attack animation card" },
    { title: "Hurt Reaction", className: "sample-hurt-sheet", sheet: "hurt-reaction-sheet.png", direction: "normal", playback: "normal playback", includeMessage: "Choose Animation should include the Hurt Reaction animation card" },
    { title: "Death / Downed", className: "sample-death-sheet", sheet: "death-downed-sheet.png", direction: "normal", playback: "normal playback", includeMessage: "Choose Animation should include the Death / Downed animation card" },
    { title: "Spell Cast", className: "sample-cast-sheet", sheet: "spell-cast-sheet.png", direction: "normal", playback: "normal playback", includeMessage: "Choose Animation should include the Spell Cast animation card" },
    { title: "Jump / Hop", className: "sample-jump-sheet", sheet: "jump-hop-sheet.png", direction: "normal", playback: "normal playback", includeMessage: "Choose Animation should include the Jump / Hop animation card" },
    { title: "Guard / Block", className: "sample-guard-sheet", sheet: "guard-block-sheet.png", direction: "normal", playback: "normal playback", includeMessage: "Choose Animation should include the Guard / Block animation card" },
    { title: "Victory Cheer", className: "sample-cheer-sheet", sheet: "victory-cheer-sheet.png", direction: "normal", playback: "normal loop", includeMessage: "Choose Animation should include the Victory Cheer animation card" },
    { title: "Interact / Pickup", className: "sample-interact-sheet", sheet: "interact-pickup-sheet.png", direction: "normal", playback: "normal playback", includeMessage: "Choose Animation should include the Interact / Pickup animation card" },
    { title: "Ranged Attack", className: "sample-ranged-sheet", sheet: "ranged-attack-sheet.png", direction: "normal", playback: "normal playback", includeMessage: "Choose Animation should include the Ranged Attack animation card" },
    { title: "Skill Release", className: "sample-skill-sheet", sheet: "skill-release-sheet.png", direction: "normal", playback: "normal playback", includeMessage: "Choose Animation should include the Skill Release animation card" },
    { title: "Knockback", className: "sample-knockback-sheet", sheet: "knockback-sheet.png", direction: "normal", playback: "normal playback", includeMessage: "Choose Animation should include the Knockback animation card" },
    { title: "Item Use", className: "sample-item-sheet", sheet: "item-use-sheet.png", direction: "normal", playback: "normal playback", includeMessage: "Choose Animation should include the Item Use animation card" },
    { title: "Talk / NPC Reaction", className: "sample-talk-sheet", sheet: "talk-sheet.png", direction: "normal", playback: "normal loop", includeMessage: "Choose Animation should include the Talk / NPC Reaction animation card" }
  ];
  assert(snapshot.animationPresetModalSampleSprites === 22, `Choose Animation should show 16 verified and 6 experimental animated samples, got ${snapshot.animationPresetModalSampleSprites}`);
  const repertoireStatus = await evaluate(`(() => {
    const cards = [...document.querySelectorAll(".animation-preset-modal .animation-preset-card")];
    return {
      verified: cards.filter((card) => [...card.querySelectorAll("small")].some((item) => item.textContent?.trim() === "Verified")).length,
      experimental: cards.filter((card) => [...card.querySelectorAll("small")].some((item) => item.textContent?.trim() === "Experimental")).length,
      titles: cards.map((card) => card.textContent || "")
    };
  })()`);
  assert(repertoireStatus.verified === 16, `Choose Animation should keep 16 verified Recipes, got ${repertoireStatus.verified}`);
  assert(repertoireStatus.experimental === 6, `Choose Animation should expose 6 experimental Recipes, got ${repertoireStatus.experimental}`);
  await evaluate(`(() => {
    const selects = [...document.querySelectorAll(".motion-preset-filters select")];
    const status = selects.find((select) => select.parentElement?.innerText.includes("Status"));
    status.value = "experimental";
    status.dispatchEvent(new Event("change", { bubbles: true }));
  })()`);
  await waitForEval(() => `document.querySelectorAll(".animation-preset-card").length === 6`, "Experimental Motion Recipe status filter");
  await evaluate(`(() => {
    const selects = [...document.querySelectorAll(".motion-preset-filters select")];
    const status = selects.find((select) => select.parentElement?.innerText.includes("Status"));
    status.value = "all";
    status.dispatchEvent(new Event("change", { bubbles: true }));
  })()`);
  await waitForEval(() => `document.querySelectorAll(".animation-preset-card").length === 22`, "Motion Recipe status filter reset");
  ["Dash", "Dodge Roll / Backstep", "Charge / Heavy Attack", "Combo Attack", "Stun", "Get Up"].forEach((title) => {
    assert(repertoireStatus.titles.some((text) => text.includes(title)), `Choose Animation should include experimental ${title}`);
  });
  for (const sample of expectedAnimationPresetSamples) {
    assert(snapshot.text.includes(sample.title), sample.includeMessage);
    const usesGeneratedSheet = await evaluate(`(() => {
      const sample = ${JSON.stringify(sample)};
      const cards = [...document.querySelectorAll(".animation-preset-card")];
      const card = cards.find((item) => item.innerText.includes(sample.title));
      const sprite = card?.querySelector(".animation-sample-sprite");
      if (!sprite) return false;
      const style = getComputedStyle(sprite);
      return sprite.classList.contains(sample.className)
        && style.backgroundImage.includes(sample.sheet)
        && style.backgroundSize.includes("500%")
        && style.animationDirection === sample.direction;
    })()`);
    assert(usesGeneratedSheet, `${sample.title} card should use the generated ${sample.sheet} sprite sheet sample with ${sample.playback}`);
  }
  assert(snapshot.promptRawTextBlocks === 0, `Choose Animation should hide raw prompt text, got ${snapshot.promptRawTextBlocks} raw blocks`);
  const animationName = await evaluate(`getComputedStyle(document.querySelector(".animation-preset-modal .animation-sample-sprite")).animationName`);
  assert(animationName && animationName !== "none", "Choose Animation samples should be animated");
  await cdp.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await delay(100);
  const reducedMotionPaused = await evaluate(`getComputedStyle(document.querySelector(".animation-preset-modal .animation-sample-sprite")).animationPlayState === "paused"`);
  assert(reducedMotionPaused, "Motion Browser samples should pause when reduced motion is requested");
  await cdp.send("Emulation.setEmulatedMedia", { features: [] });
  await maybeCapture("animation-preset-examples-modal");

  await clickButtonByText("Select Animation");
  await waitForEval(
    () => `document.body.innerText.includes("Animation selected")`,
    "Animation selected"
  );
  const selectedPreset = await evaluate(`document.querySelector(".selected-animation-card")?.innerText.replace(/\\s+/g, " ").trim() || ""`);
  assert(selectedPreset.includes("Idle Breathing"), `Select Animation should keep the verified Idle Breathing selected, got ${selectedPreset}`);
  const stillNoFreePrompt = await evaluate(`document.querySelectorAll(".animation-step textarea").length === 0`);
  assert(stillNoFreePrompt, "Select Animation should keep free-form motion prompt textareas hidden");
  const modalClosed = await evaluate(`!document.querySelector(".animation-preset-modal")`);
  assert(modalClosed, "Select Animation should close the Choose Animation modal");
  await waitForEval(
    () => `document.activeElement?.classList.contains("animation-preset-example-trigger") || false`,
    "Select Animation should return focus to the Choose Animation trigger"
  );

  await cdp.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await delay(200);
  const mobileWorkflowLayout = await evaluate(`(() => {
    const rect = (selector) => document.querySelector(selector)?.getBoundingClientRect();
    const source = rect(".source-panel");
    const workspace = rect(".workspace");
    const history = rect(".history-panel");
    const workflowButtons = [...document.querySelectorAll(".source-panel > .workflow-tabs button")];
    return {
      stacked: Boolean(source && workspace && history && workspace.top >= source.bottom - 1 && history.top >= workspace.bottom - 1),
      documentFits: document.documentElement.scrollWidth <= window.innerWidth + 1,
      buttonHeights: workflowButtons.map((button) => Math.round(button.getBoundingClientRect().height)),
      buttonFonts: workflowButtons.map((button) => Number.parseFloat(getComputedStyle(button).fontSize))
    };
  })()`);
  assert(mobileWorkflowLayout.stacked, "Responsive workflow panels should stack instead of covering the primary workflow buttons");
  assert(mobileWorkflowLayout.documentFits, "Responsive workflow layout should avoid horizontal document overflow");
  assert(mobileWorkflowLayout.buttonHeights.every((height) => height >= 48), `Responsive workflow buttons should remain easy to press: ${JSON.stringify(mobileWorkflowLayout.buttonHeights)}`);
  assert(mobileWorkflowLayout.buttonFonts.every((size) => size >= 16), `Responsive workflow buttons should retain readable text: ${JSON.stringify(mobileWorkflowLayout.buttonFonts)}`);
  await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
  await delay(200);

  await selectWorkflowTab("Pixel Art Generation");
}

async function assertAnimationLibraryImport() {
  await selectWorkflowTab("Animation Generation");
  await waitForEval(() => `document.body.innerText.includes("Animation Library")`, "Animation Library panel");
  let snapshot = await pageSnapshot();
  assert(snapshot.text.includes("Official Animations"), "Animation Library should expose Official Animations");
  assert(snapshot.text.includes("User Animations"), "Animation Library should expose User Animations");
  assert(snapshot.animationLibraryCards >= 3, `Official Animations should show bundled cards, got ${snapshot.animationLibraryCards}`);
  assert(snapshot.text.includes("Idle Breathing"), "Official Animations should include Idle Breathing");
  assert(snapshot.text.includes("Run Cycle"), "Official Animations should include Run Cycle");

  await clickButtonByText("User Animations");
  await waitForEval(() => `document.body.innerText.includes("Import Animation")`, "User Animations import button");
  snapshot = await pageSnapshot();
  assert(snapshot.text.includes("No user animations yet"), "User Animations should show an empty state before import");

  await setFileInputFiles('input[accept*="image-cockpit-animation"]', [mockAnimationPackPath]);
  await waitForEval(() => `document.body.innerText.includes("Animation pack imported")`, "Animation pack imported");
  snapshot = await pageSnapshot();
  assert(snapshot.text.includes("Smoke Run Pack"), "Imported animation pack should appear in User Animations");
  assert(snapshot.buttons.includes("Use"), "Imported animation pack should expose Use");
  assert(snapshot.buttons.includes("Export Animation Pack"), "Imported animation pack should expose Export Animation Pack");
  assert(snapshot.buttons.includes("Rename"), "Imported animation pack should expose Rename");
  assert(snapshot.buttons.includes("Delete"), "Imported animation pack should expose Delete");

  await clickButtonByText("Use");
  await waitForEval(() => `document.body.innerText.includes("Animation loaded from library")`, "Imported animation Use");
  await waitForEval(() => `document.body.innerText.includes("Animation frames ready")`, "Imported animation frames ready");
  await waitForEval(() => `document.querySelectorAll(".animation-preview img").length >= 6`, "Imported animation preview images");
  snapshot = await pageSnapshot();
  assert(snapshot.resultDownloadPanelInWorkspace, "Imported animation should use the shared result download panel");
  assert(snapshot.resultDownloadPanelComplete, "Imported animation should make the download panel ready");
  assert(snapshot.resultDownloadActionButtons === 1, "Selected imported animation should expose one compact Download button");
  assert(snapshot.resultDownloadGridButtonsInWorkspace === 0, "Selected imported animation should keep detailed download buttons out of the preview area");

  await openDownloadModal();
  snapshot = await pageSnapshot();
  assert(snapshot.downloadModalVisible, "Selected imported animation should open the Download modal");
  assert(snapshot.downloadModalButtons.includes("Export Animation Pack"), "Download modal should expose Export Animation Pack");
  assert(snapshot.workspaceExportAnimationPackButtons >= 1, "Selected imported animation should expose Export Animation Pack in the Download modal");
  await clickDownloadModalButtonByText("Export Animation Pack");
  await waitForEval(() => `document.querySelector(".animation-pack-export-modal")?.innerText.includes("Export Animation Pack")`, "Export Animation Pack modal");
  await clickButtonByText("Cancel");
  await waitForEval(() => `!document.querySelector(".animation-pack-export-modal")`, "Export Animation Pack modal closed");
  await maybeCapture("animation-library-import");
  await selectWorkflowTab("Pixel Art Generation");
}

async function assertAnimationLibraryHidden() {
  await selectWorkflowTab("Animation Generation");
  await waitForEval(() => `document.body.innerText.includes("Animation Generation")`, "Animation Generation for hidden library check");
  const snapshot = await pageSnapshot();
  assert(!snapshot.text.includes("Animation Library"), "Animation Library should stay hidden until the feature is ready");
  assert(!snapshot.text.includes("Official Animations"), "Official Animations tab should stay hidden with the library");
  assert(!snapshot.text.includes("User Animations"), "User Animations tab should stay hidden with the library");
  assert(snapshot.animationLibraryCards === 0, `Animation Library cards should be hidden, got ${snapshot.animationLibraryCards}`);
  await selectWorkflowTab("Pixel Art Generation");
}

async function assertAnimationReviewCockpit() {
  await selectWorkflowTab("Animation Generation");

  const stepper = await evaluate(`(() => {
    const steps = [...document.querySelectorAll("details.collapsible-animation-step")];
    const motionRect = steps[1]?.getBoundingClientRect();
    const generateRect = steps[2]?.getBoundingClientRect();
    return {
      count: steps.length,
      openStates: steps.map((details) => details.open),
      sourceReady: (document.querySelector(".animation-source-fingerprint strong")?.innerText || "-") !== "-",
      generateInFlow: Boolean(motionRect && generateRect && generateRect.top >= motionRect.bottom - 1),
      generatePosition: getComputedStyle(document.querySelector(".animation-generate-step")).position,
      sourceSummary: document.querySelector(".animation-source-fingerprint")?.innerText || ""
    };
  })()`);
  assert(stepper.count === 3, `Animation flow should expose three collapsible steps, got ${stepper.count}`);
  assert(stepper.openStates[1] && stepper.openStates[2], `Animation flow should keep motion and generation steps open: ${JSON.stringify(stepper.openStates)}`);
  assert(stepper.openStates[0] === !stepper.sourceReady, "Animation source step should collapse automatically once a source is ready");
  assert(stepper.generateInFlow && stepper.generatePosition === "relative", "Animation generation CTA should remain in flow instead of covering readable controls");
  assert(stepper.sourceSummary.includes("Actual source"), "Animation generation CTA should identify its Actual source");

  await clickSelector(".animation-activity-trigger");
  await waitForEval(() => `Boolean(document.querySelector(".animation-utility-modal .tournament-review-button"))`, "Tournament Review A/B/C button", 20000);
  await clickSelector(".animation-utility-modal .tournament-review-button");
  await waitForEval(() => `Boolean(document.querySelector(".animation-review-cockpit .review-candidate-card img"))`, "Animation Review candidate artifacts", 20000);
  const initial = await evaluate(`(() => {
    const modal = document.querySelector(".animation-review-cockpit");
    return {
      dialog: modal?.getAttribute("role"),
      candidateCount: modal?.querySelectorAll(".review-candidate-card").length || 0,
      frameImages: modal?.querySelectorAll(".review-candidate-card .review-frame-stage img").length || 0,
      dimensionCount: modal?.querySelectorAll(".candidate-dimension-grid .dimension-score").length || 0,
      qcRows: modal?.querySelectorAll(".qc-matrix tbody tr").length || 0,
      heatModes: modal?.querySelectorAll(".qc-mode-tabs [role=tab]").length || 0,
      overlays: modal?.querySelectorAll(".preview-overlay-controls button").length || 0,
      frameLabel: modal?.querySelector(".animation-review-toolbar strong")?.innerText || "",
      initialFocus: document.activeElement?.innerText?.includes("Calibration JSON") || false
    };
  })()`);
  assert(initial.dialog === "dialog", "Animation Review should use dialog semantics");
  assert(initial.candidateCount >= 1 && initial.frameImages >= 1, "Animation Review should render real candidate frame artifacts");
  assert(initial.dimensionCount >= initial.candidateCount * 8, `Animation Review should show eight dimensions per candidate, got ${initial.dimensionCount}`);
  assert(initial.qcRows >= 3, `Animation Review should expose Direction x Frame rows, got ${initial.qcRows}`);
  assert(initial.heatModes === 6, `Animation Review should expose six QC heatmaps, got ${initial.heatModes}`);
  assert(initial.overlays === 7, `Preview Studio should expose seven overlays, got ${initial.overlays}`);
  assert(initial.frameLabel.includes("F 1/"), `Animation Review should begin at frame 1, got ${initial.frameLabel}`);
  assert(initial.initialFocus, "Animation Review should place initial focus inside the modal");

  await clickSelector(".decision-control button:first-child");
  await evaluate(`(() => {
    const note = document.querySelector(".review-note textarea");
    note.value = "UI smoke human calibration note";
    note.dispatchEvent(new Event("input", { bubbles: true }));
    const tag = document.querySelector('.reason-tag-grid input[type="checkbox"]');
    tag.click();
  })()`);
  await clickSelector(".review-save-panel button");
  await waitForEval(() => `document.querySelector(".review-save-panel")?.innerText.includes("Saved")`, "Human review persistence");
  const winnerEnabled = await evaluate(`!document.querySelector(".animation-review-footer .primary-button")?.disabled`);
  assert(winnerEnabled, "Manual winner selection should enable the adoption action");

  await evaluate(`(() => {
    const tab = [...document.querySelectorAll(".qc-mode-tabs button")].find((button) => button.innerText.trim() === "BBox");
    if (!tab) throw new Error("BBox heatmap tab not found");
    tab.click();
  })()`);
  await clickSelector(".qc-matrix tbody .qc-cell");
  await waitForEval(() => `Boolean(document.querySelector(".qc-cell-inspector"))`, "QC cell inspector");
  const inspector = await evaluate(`(() => ({
    comparisons: [...document.querySelectorAll(".qc-frame-comparison figcaption")].map((caption) => caption.innerText),
    correctionFacts: document.querySelectorAll(".correction-facts dd").length,
    directionRepair: Boolean(document.querySelector(".repair-actions button:not(:disabled)")),
    frameRepairDisabled: Boolean(document.querySelector(".repair-actions button:disabled"))
  }))()`);
  for (const label of ["Raw", "Normalized", "Adjacent diff"]) assert(inspector.comparisons.includes(label), `QC inspector should show ${label}`);
  assert(inspector.correctionFacts === 3, "QC inspector should expose scale and translation corrections");
  assert(inspector.directionRepair && inspector.frameRepairDisabled, "QC inspector should enable Direction Repair and explain disabled frame-range repair");

  await clickSelector(".preview-overlay-controls button:first-child");
  const onionPressed = await evaluate(`document.querySelector(".preview-overlay-controls button:first-child")?.getAttribute("aria-pressed") === "true"`);
  assert(onionPressed, "Preview Studio onion overlay should be keyboard-readable and toggleable");
  await evaluate(`document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }))`);
  await waitForEval(() => `document.querySelector(".animation-review-toolbar strong")?.innerText.includes("F 2/")`, "Animation Review keyboard frame step");
  await maybeCapture("animation-review-cockpit");

  await cdp.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await delay(250);
  const mobile = await evaluate(`(() => {
    const modal = document.querySelector(".animation-review-cockpit");
    const rect = modal?.getBoundingClientRect();
    const footer = modal?.querySelector(".animation-review-footer")?.getBoundingClientRect();
    return {
      modalFits: Boolean(rect && rect.left >= -1 && rect.right <= window.innerWidth + 1),
      modalScrollFits: Boolean(modal && modal.scrollWidth <= modal.clientWidth + 1),
      footerFits: Boolean(footer && footer.left >= -1 && footer.right <= window.innerWidth + 1),
      documentFits: document.documentElement.scrollWidth <= window.innerWidth + 1
    };
  })()`);
  assert(mobile.modalFits && mobile.modalScrollFits, "Mobile Animation Review should fit within the modal viewport");
  assert(mobile.footerFits, "Mobile Animation Review should keep adoption actions visible without horizontal overflow");
  assert(mobile.documentFits, "Mobile Animation Review should not cause document overflow");
  await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
  await delay(200);

  await evaluate(`document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))`);
  await waitForEval(() => `!document.querySelector(".animation-review-cockpit")`, "Animation Review closes with Escape");
  await waitForEval(
    () => `document.activeElement?.classList.contains("tournament-review-button") || false`,
    "Animation Review should return focus to its Review A/B/C trigger"
  );
  await clickSelector(".animation-utility-heading .icon-button");
  await waitForEval(() => `!document.querySelector(".animation-utility-modal")`, "Animation generation history closed");
  await waitForEval(
    () => `document.activeElement?.classList.contains("animation-activity-trigger") || false`,
    "Animation generation history should return focus to its trigger"
  );
  await assertNoBrowserErrors("Animation Review Cockpit");
}

async function assertAnimationTimelinePackV2() {
  await openDownloadModal();
  await clickDownloadModalButtonByText("Review / Edit Timeline");
  await waitForEval(
    () => `Boolean(document.querySelector(".animation-timeline-editor-modal"))`,
    "Animation Timeline Review / Edit modal"
  );
  let metrics = await evaluate(`(() => {
    const modal = document.querySelector(".animation-timeline-editor-modal");
    const timeline = modal?.querySelector(".timeline-strip");
    return {
      metadataOnly: modal?.innerText.includes("Metadata only"),
      frameCount: timeline?.querySelectorAll(".timeline-frame-card").length || 0,
      previewSources: Array.from(modal?.querySelectorAll(".timeline-preview-panel img") || []).map((image) => image.src),
      eventInputs: modal?.querySelectorAll(".timeline-event-list input").length || 0,
      engineButtons: modal?.querySelectorAll(".timeline-export-row button").length || 0,
      undoDisabled: modal?.querySelector("button")?.disabled ?? false
    };
  })()`);
  assert(metrics.metadataOnly, "Timeline editor should clearly label metadata-only edits");
  assert(metrics.frameCount > 0, "Timeline editor should expose generated frames");
  assert(metrics.eventInputs >= 4, `Timeline editor should expose recipe events, got ${metrics.eventInputs}`);
  assert(metrics.engineButtons === 6, `Timeline editor should expose five engine JSON exports plus round-trip, got ${metrics.engineButtons}`);

  const originalFrameCount = metrics.frameCount;
  const originalPreviewSources = metrics.previewSources;
  await evaluate(`(() => {
    const input = document.querySelector('input[aria-label="Frame 1 duration"]');
    if (!input) throw new Error("Frame 1 duration input not found");
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    setter.call(input, "175");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  })()`);
  await waitForEval(() => `document.querySelector(".timeline-dirty-badge")?.innerText.includes("Unsaved")`, "Timeline duration edit becomes unsaved");
  metrics = await evaluate(`(() => ({
    frameCount: document.querySelectorAll(".timeline-frame-card").length,
    previewSources: Array.from(document.querySelectorAll(".timeline-preview-panel img")).map((image) => image.src),
    duration: document.querySelector('input[aria-label="Frame 1 duration"]')?.value
  }))()`);
  assert(metrics.duration === "175", `Timeline duration should update to 175ms, got ${metrics.duration}`);
  assert(metrics.frameCount === originalFrameCount, "Duration editing should not regenerate or add PNG frames");
  assert(JSON.stringify(metrics.previewSources) === JSON.stringify(originalPreviewSources), "Duration editing should keep PNG frame references unchanged");

  await clickButtonByText("Hold +100ms");
  await clickButtonByText("Duplicate");
  await waitForEval(() => `document.querySelectorAll(".timeline-frame-card").length === ${originalFrameCount + 1}`, "Timeline duplicate reuses a frame reference");
  await clickButtonByText("Reverse");
  await evaluate(`(() => {
    const select = Array.from(document.querySelectorAll(".animation-timeline-editor-modal select")).find((item) => item.parentElement?.innerText.includes("Loop"));
    if (!select) throw new Error("Loop selector not found");
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set;
    setter.call(select, "one-shot");
    select.dispatchEvent(new Event("change", { bubbles: true }));
  })()`);
  await waitForEval(() => `Array.from(document.querySelectorAll(".animation-timeline-editor-modal select")).some((item) => item.value === "one-shot")`, "Timeline one-shot mode");
  await evaluate(`(() => {
    const select = Array.from(document.querySelectorAll(".animation-timeline-editor-modal select")).find((item) => item.value === "one-shot");
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set;
    setter.call(select, "ping-pong");
    select.dispatchEvent(new Event("change", { bubbles: true }));
  })()`);
  await waitForEval(() => `Array.from(document.querySelectorAll(".animation-timeline-editor-modal select")).some((item) => item.value === "ping-pong")`, "Timeline ping-pong mode");

  await clickButtonByText("+ Pivot");
  await clickButtonByText("+ Anchor");
  await clickButtonByText("+ Socket");
  await clickButtonByText("+ Hitbox");
  await clickButtonByText("+ Hurtbox");
  const gameMetadata = await evaluate(`document.querySelector(".timeline-coordinate-list")?.innerText || ""`);
  for (const label of ["Pivot", "Anchor", "Socket", "hitbox", "hurtbox"]) assert(gameMetadata.includes(label), `Timeline editor should add ${label} metadata`);

  await clickButtonByText("Pack v2 Round-trip");
  await waitForEval(() => `document.body.innerText.includes("Pack v2 round-trip: identical")`, "Pack v2 round-trip equality", 10000);

  await cdp.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await delay(200);
  const mobileFit = await evaluate(`(() => {
    const modal = document.querySelector(".animation-timeline-editor-modal");
    const rect = modal?.getBoundingClientRect();
    const strip = modal?.querySelector(".timeline-strip");
    return {
      modalFits: Boolean(rect && rect.left >= -1 && rect.right <= window.innerWidth + 1),
      documentFits: document.documentElement.scrollWidth <= window.innerWidth + 1,
      stripScrollable: Boolean(strip && strip.scrollWidth >= strip.clientWidth),
      actionsVisible: Boolean(modal?.querySelector(".timeline-editor-actions"))
    };
  })()`);
  assert(mobileFit.modalFits, "Mobile timeline editor should fit within the viewport");
  assert(mobileFit.documentFits, "Mobile timeline editor should not cause document overflow");
  assert(mobileFit.stripScrollable, "Mobile timeline should keep its horizontal strip usable");
  assert(mobileFit.actionsVisible, "Mobile timeline editor should keep save/export actions available");
  await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
  await delay(200);

  await clickButtonByText("Recipe defaults");
  await clickButtonByText("Save timeline");
  await waitForEval(() => `document.querySelector(".timeline-dirty-badge")?.innerText.includes("Saved")`, "Timeline metadata saved");
  await clickButtonByAriaLabel("Close timeline editor");
  await waitForEval(() => `!document.querySelector(".animation-timeline-editor-modal")`, "Timeline editor closes");
  await assertNoBrowserErrors("Animation Timeline Pack v2");
  await maybeCapture("animation-timeline-pack-v2");
}

async function assertCodexQueue() {
  await selectWorkflowTab("Pixel Art Generation");
  await waitForEval(() => `document.body.innerText.includes("Pixel Art Generation")`, "Pixel Art Generation for Codex queue");
  await evaluate(`document.querySelector("textarea").value = "queue smoke pixel hero"; document.querySelector("textarea").dispatchEvent(new Event("input", { bubbles: true }))`);

  await clickButtonByText("Generate Pixel Art");
  await waitForEval(() => `document.body.innerText.includes("Codex Jobs") && document.body.innerText.includes("Active 1/3")`, "first Codex job running");
  await assertCodexProgressIndicators();
  await assertCodexLogFullscreen();
  await waitForButtonEnabled("Generate Pixel Art");

  await clickButtonByText("Generate Pixel Art");
  await waitForEval(() => `document.body.innerText.includes("Active 2/3")`, "two Codex jobs running");
  await waitForButtonEnabled("Generate Pixel Art");

  await clickButtonByText("Generate Pixel Art");
  await waitForEval(() => `document.body.innerText.includes("Active 3/3")`, "three Codex jobs running");
  await waitForButtonEnabled("Queue Codex Job");
  const queueActionAtCapacity = await evaluate(`Array.from(document.querySelectorAll("button")).some((button) => button.innerText.replace(/\\s+/g, " ").trim() === "Queue Codex Job" && !button.disabled)`);
  assert(queueActionAtCapacity, "Codex queue should switch the primary action to Queue Codex Job at three active jobs");

  await clickButtonByText("Queue Codex Job");
  await waitForEval(() => `(() => {
    const text = document.body.innerText;
    const queued = text.includes("Queued") && text.includes("Waiting for an open slot");
    if (queued) {
      window.__uiSmokeQueueEvidence = {
        text,
        rows: document.querySelectorAll(".codex-job-row").length
      };
    }
    return queued;
  })()`, "fourth Codex job queued");
  const queueEvidence = await evaluate(`window.__uiSmokeQueueEvidence || { text: "", rows: 0 }`);
  assert(queueEvidence.text.includes("Codex job queued"), "Codex queue should report that the fourth job was queued");
  assert(queueEvidence.rows === 4, `Codex queue should show 4 job rows when the fourth job queues, got ${queueEvidence.rows}`);
  const snapshot = await pageSnapshot();
  assert(snapshot.codexJobShelfInHistory, "Codex job shelf should appear above the Results cards in the right column");
  assert(!snapshot.codexJobShelfInSource, "Codex job shelf should not remain in the left source column");
  assert(snapshot.codexJobShelfBeforeHistoryList, "Codex job shelf should sit before the result card list");
  await maybeCapture("codex-job-shelf-results");

  await waitForEval(() => `document.querySelectorAll(".codex-job-row").length === 0`, "Codex queue drains after results return", 18000);
  const drainedSnapshot = await pageSnapshot();
  assert(drainedSnapshot.codexLogPanelVisible, "Codex log panel should keep latest logs after jobs complete");
  await waitForEval(
    () => `document.querySelectorAll(".codex-log-card").length === ${expectedCodexLogHistoryLimit}`,
    "Codex log panel retains the latest 3 completed log cards",
    6000
  );
  const drainedLogCardCount = await evaluate(`document.querySelectorAll(".codex-log-card").length`);
  assert(
    drainedLogCardCount === expectedCodexLogHistoryLimit,
    `Codex log panel should retain exactly ${expectedCodexLogHistoryLimit} completed log cards after four jobs, got ${drainedLogCardCount}`
  );
  await assertNoBrowserErrors("Codex queue");
  await selectWorkflowTab("Pixel Art Generation");
}

async function assertCodexProgressIndicators() {
  await waitForEval(
    () => `Boolean(document.querySelector(".history-panel .codex-job-row .codex-progress-meter.state-running .codex-progress-fill"))`,
    "Codex job shelf running progress"
  );
  await waitForEval(
    () => `Boolean(document.querySelector(".codex-log-card .codex-progress-meter.state-running .codex-progress-fill"))`,
    "Codex log card running progress",
    6000
  );
  const metrics = await evaluate(`(() => {
    const shelfMeter = document.querySelector(".history-panel .codex-job-row .codex-progress-meter.state-running");
    const shelfTrack = shelfMeter?.querySelector(".codex-progress-track");
    const shelfFill = shelfMeter?.querySelector(".codex-progress-fill");
    const logMeter = document.querySelector(".codex-log-card .codex-progress-meter.state-running");
    const logTrack = logMeter?.querySelector(".codex-progress-track");
    const logFill = logMeter?.querySelector(".codex-progress-fill");
    const shelfText = shelfMeter?.innerText || "";
    const shelfTrackRect = shelfTrack?.getBoundingClientRect();
    const shelfFillRect = shelfFill?.getBoundingClientRect();
    const logTrackRect = logTrack?.getBoundingClientRect();
    const logFillRect = logFill?.getBoundingClientRect();
    return {
      shelfHasElapsed: shelfText.includes("Elapsed"),
      shelfShowsNoPercent: !/%/.test(shelfText),
      shelfTrackWidth: Math.round(shelfTrackRect?.width || 0),
      shelfFillWidth: Math.round(shelfFillRect?.width || 0),
      logTrackWidth: Math.round(logTrackRect?.width || 0),
      logFillWidth: Math.round(logFillRect?.width || 0),
      shimmer: getComputedStyle(shelfFill, "::after").animationName,
      reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
      keyframesDefined: Array.from(document.styleSheets).some((sheet) => {
        try {
          return Array.from(sheet.cssRules || []).some((rule) => rule.cssText.includes("codex-progress-shimmer"));
        } catch {
          return false;
        }
      })
    };
  })()`);
  assert(metrics.shelfHasElapsed, "Codex job shelf progress should show elapsed time");
  assert(metrics.shelfShowsNoPercent, "Codex job shelf progress should not expose a fake percent label");
  assert(metrics.shelfTrackWidth > 40, `Codex job shelf progress track should be visible, got ${metrics.shelfTrackWidth}`);
  assert(metrics.shelfFillWidth > 0 && metrics.shelfFillWidth < metrics.shelfTrackWidth, `Codex job shelf progress fill should be partial, got ${metrics.shelfFillWidth}/${metrics.shelfTrackWidth}`);
  assert(metrics.logTrackWidth > 40, `Codex log card progress track should be visible, got ${metrics.logTrackWidth}`);
  assert(metrics.logFillWidth > 0 && metrics.logFillWidth < metrics.logTrackWidth, `Codex log card progress fill should be partial, got ${metrics.logFillWidth}/${metrics.logTrackWidth}`);
  assert(
    metrics.reducedMotion || metrics.shimmer === "codex-progress-shimmer" || metrics.keyframesDefined,
    `Codex progress fill should animate with shimmer unless reduced motion is active, got ${metrics.shimmer}`
  );

  await clickButtonByAriaLabel("Full screen logs");
  await waitForEval(() => `document.querySelector(".codex-log-panel")?.classList.contains("fullscreen")`, "Codex log fullscreen progress mode");
  const fullscreenMetrics = await evaluate(`(() => {
    const header = document.querySelector(".codex-log-panel.fullscreen .codex-log-header");
    const meter = header?.querySelector(".codex-progress-meter.compact.state-running");
    const track = meter?.querySelector(".codex-progress-track");
    const fill = meter?.querySelector(".codex-progress-fill");
    const headerRect = header?.getBoundingClientRect();
    const trackRect = track?.getBoundingClientRect();
    const fillRect = fill?.getBoundingClientRect();
    return {
      headerWidth: Math.round(headerRect?.width || 0),
      trackWidth: Math.round(trackRect?.width || 0),
      fillWidth: Math.round(fillRect?.width || 0),
      compactBottom: Boolean(meter && trackRect && headerRect && Math.abs(trackRect.bottom - headerRect.bottom) <= 1)
    };
  })()`);
  assert(fullscreenMetrics.trackWidth > 40, `Fullscreen Codex log header progress should be visible, got ${fullscreenMetrics.trackWidth}`);
  assert(fullscreenMetrics.fillWidth > 0 && fullscreenMetrics.fillWidth < fullscreenMetrics.trackWidth, `Fullscreen Codex log header progress should be partial, got ${fullscreenMetrics.fillWidth}/${fullscreenMetrics.trackWidth}`);
  assert(fullscreenMetrics.compactBottom, "Fullscreen Codex log header progress should sit at the bottom of the header");
  await evaluate(`window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))`);
  await waitForEval(() => `!document.querySelector(".codex-log-panel")?.classList.contains("fullscreen")`, "Codex log progress fullscreen closes with Escape");
}

async function assertCodexLogFullscreen() {
  await waitForEval(() => `Boolean(document.querySelector(".codex-log-panel .codex-log-fullscreen-button"))`, "Codex log fullscreen button");
  await waitForEval(
    () => `Array.from(document.querySelectorAll(".codex-log-card pre")).some((pre) => pre.innerText.includes("mock runner accepted"))`,
    "mock Codex log output",
    8000
  );
  await waitForEval(
    () => `Array.from(document.querySelectorAll(".codex-log-card pre")).some((pre) => pre.innerText.includes("mock runner tail marker"))`,
    "mock Codex log tail marker",
    8000
  );
  await delay(100);
  const normalMetrics = await evaluate(`(() => {
    const panel = document.querySelector(".codex-log-panel");
    const pre = Array.from(document.querySelectorAll(".codex-log-card pre"))
      .find((candidate) => candidate.innerText.includes("mock runner tail marker")) || document.querySelector(".codex-log-card pre");
    return {
      panelHeight: Math.round(panel?.getBoundingClientRect().height || 0),
      preHeight: Math.round(pre?.getBoundingClientRect().height || 0),
      cardCount: document.querySelectorAll(".codex-log-panel .codex-log-card").length,
      preOverflowing: Boolean(pre && pre.scrollHeight > pre.clientHeight),
      distanceFromBottom: pre ? Math.round(pre.scrollHeight - pre.scrollTop - pre.clientHeight) : 999,
      hasTailMarker: Boolean(pre?.innerText.includes("mock runner tail marker"))
    };
  })()`);
  assert(normalMetrics.panelHeight > 0, "Codex log panel should be visible before fullscreen");
  assert(normalMetrics.preHeight > 0, "Codex log pre should be visible before fullscreen");
  assert(normalMetrics.cardCount <= expectedCodexLogHistoryLimit, `Compact Codex log panel should show at most ${expectedCodexLogHistoryLimit} cards, got ${normalMetrics.cardCount}`);
  assert(normalMetrics.preOverflowing, "Compact Codex log pre should overflow so latest-line auto-scroll is meaningful");
  assert(normalMetrics.hasTailMarker, "Compact Codex log should include the mock tail marker");
  assert(normalMetrics.distanceFromBottom <= 4, `Compact Codex log should auto-scroll to the latest line, distance ${normalMetrics.distanceFromBottom}`);

  await clickButtonByAriaLabel("Full screen logs");
  await waitForEval(() => `document.querySelector(".codex-log-panel")?.classList.contains("fullscreen")`, "Codex log fullscreen mode");
  await delay(100);
  const fullscreenMetrics = await evaluate(`(() => {
    const panel = document.querySelector(".codex-log-panel.fullscreen");
    const pre = Array.from(document.querySelectorAll(".codex-log-panel.fullscreen .codex-log-card pre"))
      .find((candidate) => candidate.innerText.includes("mock runner tail marker")) || document.querySelector(".codex-log-panel.fullscreen .codex-log-card pre");
    return {
      panelHeight: Math.round(panel?.getBoundingClientRect().height || 0),
      preHeight: Math.round(pre?.getBoundingClientRect().height || 0),
      exitButton: Boolean(document.querySelector('button[aria-label="Exit full screen"]')),
      cardCount: document.querySelectorAll(".codex-log-panel.fullscreen .codex-log-card").length,
      distanceFromBottom: pre ? Math.round(pre.scrollHeight - pre.scrollTop - pre.clientHeight) : 999,
      hasTailMarker: Boolean(pre?.innerText.includes("mock runner tail marker"))
    };
  })()`);
  assert(fullscreenMetrics.exitButton, "Fullscreen Codex log should expose an exit button");
  assert(fullscreenMetrics.cardCount <= expectedCodexLogHistoryLimit, `Fullscreen Codex log panel should show at most ${expectedCodexLogHistoryLimit} cards, got ${fullscreenMetrics.cardCount}`);
  assert(fullscreenMetrics.panelHeight > normalMetrics.panelHeight + 120, "Fullscreen Codex log panel should be taller than the compact panel");
  assert(fullscreenMetrics.preHeight > normalMetrics.preHeight + 120, "Fullscreen Codex log text area should be taller than normal");
  assert(fullscreenMetrics.hasTailMarker, "Fullscreen Codex log should include the mock tail marker");
  assert(fullscreenMetrics.distanceFromBottom <= 4, `Fullscreen Codex log should open at the latest line, distance ${fullscreenMetrics.distanceFromBottom}`);
  await maybeCapture("codex-log-fullscreen");

  await evaluate(`window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))`);
  await waitForEval(() => `!document.querySelector(".codex-log-panel")?.classList.contains("fullscreen")`, "Codex log fullscreen closes with Escape");

  await cdp.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await delay(250);
  await clickButtonByAriaLabel("Full screen logs");
  await waitForEval(() => `document.querySelector(".codex-log-panel")?.classList.contains("fullscreen")`, "mobile Codex log fullscreen mode");
  await delay(100);
  const mobileFit = await evaluate(`(() => {
    const panel = document.querySelector(".codex-log-panel.fullscreen");
    const header = document.querySelector(".codex-log-panel.fullscreen .codex-log-header");
    const pre = Array.from(document.querySelectorAll(".codex-log-panel.fullscreen .codex-log-card pre"))
      .find((candidate) => candidate.innerText.includes("mock runner tail marker")) || document.querySelector(".codex-log-panel.fullscreen .codex-log-card pre");
    const panelRect = panel?.getBoundingClientRect();
    return {
      panelFits: Boolean(panelRect && panelRect.left >= -1 && panelRect.right <= window.innerWidth + 1),
      headerFits: Boolean(header && header.scrollWidth <= header.clientWidth + 1),
      preFits: Boolean(pre && pre.scrollWidth <= pre.clientWidth + 1),
      cardCount: document.querySelectorAll(".codex-log-panel.fullscreen .codex-log-card").length,
      distanceFromBottom: pre ? Math.round(pre.scrollHeight - pre.scrollTop - pre.clientHeight) : 999,
      hasTailMarker: Boolean(pre?.innerText.includes("mock runner tail marker"))
    };
  })()`);
  assert(mobileFit.panelFits, "Mobile fullscreen Codex log panel should fit within the viewport");
  assert(mobileFit.headerFits, "Mobile fullscreen Codex log header should not overflow horizontally");
  assert(mobileFit.preFits, "Mobile fullscreen Codex log text should not overflow horizontally");
  assert(mobileFit.cardCount <= expectedCodexLogHistoryLimit, `Mobile fullscreen Codex log panel should show at most ${expectedCodexLogHistoryLimit} cards, got ${mobileFit.cardCount}`);
  assert(mobileFit.hasTailMarker, "Mobile fullscreen Codex log should include the mock tail marker");
  assert(mobileFit.distanceFromBottom <= 4, `Mobile fullscreen Codex log should stay on the latest line, distance ${mobileFit.distanceFromBottom}`);
  await evaluate(`window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))`);
  await waitForEval(() => `!document.querySelector(".codex-log-panel")?.classList.contains("fullscreen")`, "mobile Codex log fullscreen closes with Escape");
  await cdp.send("Emulation.clearDeviceMetricsOverride");
  await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
  await delay(250);
}

async function assertCodexFailureNotice() {
  await selectWorkflowTab("Pixel Art Generation");
  await waitForEval(() => `document.body.innerText.includes("Pixel Art Generation")`, "Pixel Art Generation for Codex failure");
  const historyCountBefore = await evaluate(`document.querySelectorAll(".history-item").length`);
  await setPromptValue("policy blocked ui smoke");

  await clickButtonByText("Generate Pixel Art");
  await waitForEval(() => `document.querySelector(".codex-failure-card")?.innerText.includes("Generation failed")`, "Codex failure notice", 20000);
  let snapshot = await pageSnapshot();
  assert(snapshot.codexFailureCards === 1, `Codex failure should leave one failure card, got ${snapshot.codexFailureCards}`);
  assert(snapshot.text.includes("safety or usage-policy checks"), "Codex failure should show policy/safety diagnostic copy");
  assert(snapshot.historyItems === historyCountBefore, "Codex failure should not create a fake history image");
  assert(snapshot.codexJobRows === 0, "Codex failure should release the active job slot");
  await evaluate(`(() => {
    const select = document.querySelector(".language-control select");
    select.value = "ja";
    select.dispatchEvent(new Event("change", { bubbles: true }));
  })()`);
  await waitForEval(() => `document.body.innerText.includes("生成できませんでした")`, "Japanese Codex failure notice");
  await evaluate(`(() => {
    const select = document.querySelector(".language-control select");
    select.value = "en";
    select.dispatchEvent(new Event("change", { bubbles: true }));
  })()`);
  await waitForEval(() => `document.body.innerText.includes("Generation failed")`, "English Codex failure notice restored");

  await setPromptValue("normal generation after failure");
  await clickButtonByText("Generate Pixel Art");
  await waitForEval(() => `document.querySelectorAll(".history-item").length > ${historyCountBefore}`, "Codex queue continues after failure", 18000);
  snapshot = await pageSnapshot();
  assert(snapshot.historyItems > historyCountBefore, "Codex should import a real image after a previous failure");
  assert(snapshot.codexFailureCards === 1, "Codex failure notice should remain visible after later success");
  await assertNoBrowserErrors("Codex failure notice");
  await maybeCapture("codex-failure-notice");
  await selectWorkflowTab("Pixel Art Generation");
}

async function assertImagegenUnavailableSidecar() {
  await selectWorkflowTab("Pixel Art Generation");
  await waitForEval(() => `document.body.innerText.includes("Pixel Art Generation")`, "Pixel Art Generation for imagegen unavailable");
  const before = await pageSnapshot();
  await setPromptValue("imagegen unavailable ui smoke");

  await clickButtonByText("Generate Pixel Art");
  await waitForEval(
    () => `Array.from(document.querySelectorAll(".codex-failure-card")).some((card) => card.innerText.includes("Image generation unavailable"))`,
    "imagegen unavailable Codex failure notice",
    20000
  );
  const after = await pageSnapshot();
  assert(
    after.codexFailureCards === before.codexFailureCards + 1,
    `Imagegen unavailable sidecar should add one failure card, got ${after.codexFailureCards}`
  );
  assert(after.text.includes("Image generation is not available in this Codex environment."), "Imagegen unavailable should show explicit diagnostic copy");
  assert(after.historyItems === before.historyItems, "Imagegen unavailable sidecar should not create a fake history image");
  assert(after.codexJobRows === 0, "Imagegen unavailable sidecar should release the active job slot");
  await assertNoBrowserErrors("imagegen unavailable sidecar");
}

async function assertTempCandidateContactImportFilter() {
  await selectWorkflowTab("Pixel Art Generation");
  await waitForEval(() => `document.body.innerText.includes("Pixel Art Generation")`, "Pixel Art Generation for temp contact filter");
  await setPromptValue("temp candidate contact filter setup");
  const before = await pageSnapshot();

  await clickButtonByText("Generate Pixel Art");
  await waitForEval(
    () => `document.querySelectorAll(".history-item").length > ${before.historyItems}`,
    "temp candidate contact import filter imports final image",
    18000
  );
  await waitForEval(() => `document.querySelectorAll(".codex-job-row").length === 0`, "temp candidate contact filter job drains", 6000);
  const historyTexts = await evaluate(`Array.from(document.querySelectorAll(".history-item")).map((node) => node.innerText.replace(/\\s+/g, " ").trim())`);
  assert(
    !historyTexts.some((text) => text.includes("candidate-contact.tmp")),
    "Import Latest should not create a candidate-contact.tmp history item"
  );
  assert(!historyTexts.some((text) => text.includes("preview-grid")), "Import Latest should not create a preview-grid history item");
  await assertNoBrowserErrors("temp candidate contact import filter");
  await maybeCapture("temp-candidate-contact-import-filter");
  await selectWorkflowTab("Pixel Art Generation");
}

async function assertPartialDirectionSplitRecovery() {
  await selectWorkflowTab("Pixel Art Generation");
  await setPromptValue("partial direction split recovery setup");
  await writeFile(mockPartialDirectionSplitMarkerPath, "1", "utf8");
  await selectWorkflowTab("Animation Generation");
  await waitForEval(() => `document.body.innerText.includes("Animation Generation")`, "Animation Generation for partial direction recovery");
  const before = await pageSnapshot();

  await clickButtonByText("Generate Animation");
  await delay(3200);
  let snapshot = await pageSnapshot();
  assert(
    snapshot.codexFailureCards === before.codexFailureCards,
    `Partial direction files without a manifest should not add a failure card, got ${snapshot.codexFailureCards}`
  );
  assert(snapshot.text.includes("Waiting for Codex"), "Partial direction files should keep the job pending while waiting for the final manifest");
  await waitForEval(
    () => `document.querySelectorAll(".history-item").length > ${before.historyItems}`,
    "partial direction split imports after final manifest",
    25000
  );
  await waitForEval(() => `document.querySelectorAll(".codex-job-row").length === 0`, "partial direction split releases active job slot", 6000);
  snapshot = await pageSnapshot();
  assert(snapshot.codexJobRows === 0, "Partial direction split recovery should release the active job slot after import");
  assert(
    snapshot.codexFailureCards === before.codexFailureCards,
    "Partial direction split recovery should not leave a failure card"
  );
  assert(snapshot.text.includes("direction-split manifest ok"), "Recovered direction split import should confirm manifest use");
  await assertNoBrowserErrors("partial direction split recovery");
  await maybeCapture("partial-direction-split-recovery");
  await selectWorkflowTab("Pixel Art Generation");
}

async function assertManifestFirstDirectionSplitRecovery() {
  await selectWorkflowTab("Pixel Art Generation");
  await setPromptValue("manifest first direction split recovery setup");
  await writeFile(mockManifestFirstDirectionSplitMarkerPath, "1", "utf8");
  await selectWorkflowTab("Animation Generation");
  await waitForEval(() => `document.body.innerText.includes("Animation Generation")`, "Animation Generation for manifest-first direction recovery");
  const before = await pageSnapshot();

  await clickButtonByText("Generate Animation");
  await delay(3200);
  let snapshot = await pageSnapshot();
  assert(
    snapshot.codexFailureCards === before.codexFailureCards,
    `Manifest-first direction files should not add a failure card while side is missing, got ${snapshot.codexFailureCards}`
  );
  assert(snapshot.text.includes("Waiting for Codex"), "Manifest-first direction files should stay pending until server verified");
  await waitForEval(
    () => `document.querySelectorAll(".history-item").length > ${before.historyItems}`,
    "manifest-first direction split imports after side arrives",
    25000
  );
  await waitForEval(() => `document.querySelectorAll(".codex-job-row").length === 0`, "manifest-first direction split releases active job slot", 6000);
  snapshot = await pageSnapshot();
  assert(snapshot.codexJobRows === 0, "Manifest-first direction split recovery should release the active job slot after import");
  assert(
    snapshot.codexFailureCards === before.codexFailureCards,
    "Manifest-first direction split recovery should not leave a failure card"
  );
  assert(snapshot.text.includes("direction-split manifest ok"), "Manifest-first recovered import should confirm manifest use");
  await assertNoBrowserErrors("manifest-first direction split recovery");
  await maybeCapture("manifest-first-direction-split-recovery");
  await selectWorkflowTab("Pixel Art Generation");
}

async function assertCompletedDirectionSplitImportFailure() {
  await selectWorkflowTab("Pixel Art Generation");
  await setPromptValue("completed direction split import failure setup");
  await writeFile(mockImportFailureMarkerPath, "1", "utf8");
  await selectWorkflowTab("Animation Generation");
  await waitForEval(() => `document.body.innerText.includes("Animation Generation")`, "Animation Generation for completed import failure");
  const before = await pageSnapshot();

  await clickButtonByText("Generate Animation");
  await waitForEval(
    () => `document.body.innerText.includes("Needs review candidate") && document.body.innerText.includes("missing side")`,
    "completed direction split candidate notice",
    25000
  );
  const snapshot = await pageSnapshot();
  assert(snapshot.codexJobRows === 0, "Completed direction split import failure should release the active job slot");
  assert(
    snapshot.codexFailureCards === before.codexFailureCards + 1,
    `Completed direction split import failure should add one failure card, got ${snapshot.codexFailureCards}`
  );
  assert(snapshot.historyItems === before.historyItems, "Completed direction split import failure should not add a broken history item");
  assert(snapshot.text.includes("Raw direction files"), "Completed direction split import failure should tell the user raw files remain available");
  await rm(mockImportFailureMarkerPath, { force: true });
  await assertNoBrowserErrors("completed direction split import failure");
  await maybeCapture("completed-direction-split-import-failure");
  await selectWorkflowTab("Pixel Art Generation");
}

async function assertQualityGateDirectionSplitFailure() {
  await selectWorkflowTab("Pixel Art Generation");
  await setPromptValue("quality gate direction split failure setup");
  await writeFile(mockQualityGateFailureMarkerPath, "1", "utf8");
  await selectWorkflowTab("Animation Generation");
  await waitForEval(() => `document.body.innerText.includes("Animation Generation")`, "Animation Generation for quality gate failure");
  const before = await pageSnapshot();

  await clickButtonByText("Generate Animation");
  await waitForEval(
    () => `document.body.innerText.includes("Material quality gate failed") && document.body.innerText.includes("Chroma key removal failed")`,
    "quality gate direction split failure notice",
    25000
  );
  const snapshot = await pageSnapshot();
  assert(snapshot.codexJobRows === 0, "Quality gate failure should release the active job slot");
  assert(
    snapshot.codexFailureCards === before.codexFailureCards + 1,
    `Quality gate failure should add one failure card, got ${snapshot.codexFailureCards}`
  );
  assert(snapshot.historyItems === before.historyItems, "Quality gate failure should not add a quarantined history item");
  assert(snapshot.text.toLowerCase().includes("no history or final download item was added"), "Quality gate failure should explain that no final item was added");
  await rm(mockQualityGateFailureMarkerPath, { force: true });
  await assertNoBrowserErrors("quality gate direction split failure");
  await maybeCapture("quality-gate-direction-split-failure");
  await selectWorkflowTab("Pixel Art Generation");
}

async function assertDetachedDirectionSplitRecoverResults() {
  const jobId = "codex-job-ui-smoke-detached-direction-split";
  await writeDetachedDirectionSplitFixture(jobId);
  await selectWorkflowTab("Pixel Art Generation");
  const before = await pageSnapshot();

  await clickButtonByText("Recover Results");
  await waitForEval(
    () => `document.body.innerText.includes("${jobId}-direction-split-animation-sheet.png")`,
    "detached direction split recovers final sheet",
    20000
  );
  let snapshot = await pageSnapshot();
  assert(snapshot.historyItems === before.historyItems + 1, `Detached direction split should add one final sheet, got ${snapshot.historyItems - before.historyItems}`);
  assert(snapshot.canvasPreviewName === `${jobId}-direction-split-animation-sheet.png`, `Detached direction split should select final sheet, got ${snapshot.canvasPreviewName}`);
  assert(snapshot.text.includes("direction-split manifest ok"), "Detached direction split recovery should confirm manifest use");
  assert(!snapshot.text.includes(`${jobId}-front.png`), "Detached direction split recovery should not add raw front direction file as history");
  const alpha = await inspectImageAlpha(`document.querySelector(".result-preview-image")?.src || ""`);
  assert(alpha.width === 2048 && alpha.height === 1280, `Detached direction split final sheet should be 2048x1280, got ${alpha.width}x${alpha.height}`);
  assert(alpha.transparentPixels > 0 && alpha.opaquePixels > 0, "Detached direction split final sheet should preserve transparent character pixels");

  await assertDownloadModal({
    expectedButtons: ["Animated GIF", "Animated WebP", "Animated APNG", "Sprite Sheet", "Review / Edit Timeline", "Export Animation Pack"],
    absentButtons: ["PNG"],
    label: "detached direction split download modal"
  });

  await clickButtonByText("Recover Results");
  await delay(500);
  snapshot = await pageSnapshot();
  assert(snapshot.historyItems === before.historyItems + 1, "Detached direction split recovery should not duplicate the final sheet");
  await assertNoBrowserErrors("detached direction split recover results");
  await maybeCapture("detached-direction-split-recover-results");
  await selectWorkflowTab("Pixel Art Generation");
}

async function writeDetachedDirectionSplitFixture(jobId) {
  const directionSlugs = ["front", "front-three-quarter", "side", "back-three-quarter", "back"];
  const directionNames = ["front", "front three-quarter", "side", "back three-quarter", "back"];
  for (const [index, slug] of directionSlugs.entries()) {
    await writeFile(
      join(handoffDir, "outbox", `${jobId}-${slug}.png`),
      makeDirectionSplitFixturePng(index)
    );
  }
  await writeFile(join(handoffDir, "outbox", `${jobId}-manifest.json`), JSON.stringify({
    schema: "image-cockpit.direction-split-animation.v1",
    jobId,
    serverVerified: true,
    quality: "gold",
    warnings: [],
    directions: directionNames,
    framesPerDirection: 8,
    grid: { columns: 4, rows: 2, gutter: 0 },
    cell: { width: 256, height: 256 },
    files: Object.fromEntries(directionSlugs.map((slug, index) => [directionNames[index], `${jobId}-${slug}.png`])),
    chromaKey: { name: "green" }
  }, null, 2), "utf8");
}

async function assertImageEditing() {
  await selectWorkflowTab("Image Editing");
  await waitForEval(() => `document.body.innerText.includes("Image Editing")`, "Image Editing workflow");
  let snapshot = await pageSnapshot();
  assert(snapshot.summary.includes("Route: Codex Handoff"), "Image Editing should use Codex Handoff");
  assert(snapshot.buttons.includes("Edit Image"), "Image Editing should expose the Edit Image action");
  assert(snapshot.buttons.includes("Upload Image"), "Image Editing should expose image upload");
  assert(snapshot.buttons.includes("Pixel Art Generation"), "Image Editing should expose Pixel Art Generation tab");
  assert(snapshot.buttons.includes("Image Editing"), "Image Editing should expose Image Editing tab");
  assert(snapshot.buttons.includes("Animation Generation"), "Image Editing should expose Animation Generation tab");
  assert(snapshot.buttons.includes("Download"), "Image Editing should expose one compact Download action");
  assert(!snapshot.buttons.includes("PNG"), "Image Editing should keep PNG download details inside the modal");
  assert(!snapshot.buttons.includes("Animated GIF"), "Image Editing should hide animated GIF download for non-animation results");
  assert(!snapshot.buttons.includes("Animated WebP"), "Image Editing should hide animated WebP download for non-animation results");
  assert(!snapshot.buttons.includes("Animated APNG"), "Image Editing should hide animated APNG download for non-animation results");
  assert(snapshot.resultDownloadPanelInWorkspace, "Image Editing should place the result download card under the preview workspace");
  assert(snapshot.resultDownloadActionButtons === 1, "Image Editing should expose one compact Download button");
  assert(snapshot.resultDownloadGridButtonsInWorkspace === 0, "Image Editing should not expose detailed download buttons under the preview");
  assert(snapshot.resultDownloadPanelHeight <= 110, `Image Editing download panel should stay compact, got ${snapshot.resultDownloadPanelHeight}`);
  assert(snapshot.annotationToolbarVisible, "Image Editing should show the rectangle selection toolbar");
  assert(snapshot.canvasPreviewMode === "edit", `Image Editing should use edit canvas mode, got ${snapshot.canvasPreviewMode}`);
  assert(snapshot.text.includes("Numbered edit regions"), "Image Editing should show numbered edit regions");
  assert(!snapshot.text.includes("Before / After"), "Image Editing should not show the old Before / After card in the source panel");
  assert(!snapshot.buttons.includes("Annotated PNG"), "Image Editing should hide the old annotation PNG button");
  assert(!snapshot.buttons.includes("Brush"), "Image Editing should hide the old brush tool");
  assert(!snapshot.buttons.includes("Arrow"), "Image Editing should hide the old arrow tool");
  await setFileInputFiles('input[accept="image/*"]', [mockFullBodySourcePath]);
  await waitForEval(
    () => `document.querySelector("canvas")?.dataset.previewName === "mock-full-body-source.png"`,
    "Image Editing full-body source upload"
  );
  await assertDownloadModal({
    expectedButtons: ["PNG"],
    absentButtons: ["Animated GIF", "Animated WebP", "Animated APNG", "Sprite Sheet", "Export Animation Pack"],
    label: "Image Editing non-animation download modal"
  });
  await waitForEval(
    () => `(() => {
      const canvas = document.querySelector("canvas");
      if (!canvas || getComputedStyle(canvas).display === "none") return false;
      const rect = canvas.getBoundingClientRect();
      return rect.width > 300 && rect.height > 160;
    })()`,
    "Image Editing canvas ready"
  );
  await assertImageEditingFullBodyFitWithLogs("Image Editing full-body source canvas");

  await dragCanvasRegion();
  await waitForEval(() => `document.querySelectorAll(".annotation-region-row").length === 1`, "Image Editing numbered region");
  await evaluate(`(() => {
    const field = document.querySelector(".annotation-comment-field");
    field.focus();
  })()`);
  await cdp.send("Input.insertText", { text: "Add the text X in this selected rectangle" });
  await waitForEval(
    () => `document.querySelector(".annotation-comment-field")?.value.includes("text X")`,
    "Image Editing comment input"
  );

  await clickButtonByText("Edit Image");
  await waitForEval(() => `document.body.innerText.includes("Imported from Local Inbox")`, "Image Editing imported result", 18000);
  await waitForEval(() => `document.querySelector(".image-edit-source-status img")?.naturalWidth > 0`, "Image Editing edit source preview");
  snapshot = await pageSnapshot();
  assert(snapshot.annotationRegionRows === 0, `Image Editing should move to the edited result without stale numbered rows, got ${snapshot.annotationRegionRows}`);
  assert(snapshot.editCompareImages === 0, `Image Editing should remove the old Before / After card, got ${snapshot.editCompareImages} compare images`);
  assert(!snapshot.editCompareVisible, "Image Editing should not render the old Before / After compare card");
  assert(snapshot.imageEditSourceImages === 1, `Image Editing should show one edit source thumbnail under the preview, got ${snapshot.imageEditSourceImages}`);
  assert(snapshot.imageEditSourceStatus.includes("Edited from"), "Image Editing should show the edit source under the preview");
  assert(snapshot.imageEditSourceButton, "Image Editing should make the edit source selectable from the preview status");
  assert(snapshot.resultDownloadPanelInWorkspace, "Image Editing should keep the result download card under the preview after edit");
  assert(snapshot.resultDownloadPanelComplete, "Image Editing should mark the selected edited image as downloadable");
  assert(snapshot.resultDownloadActionButtons === 1, "Image Editing edited result should keep one compact Download button");
  assert(snapshot.resultDownloadGridButtonsInWorkspace === 0, "Image Editing edited result should keep detailed downloads in the modal");
  assert(snapshot.canvasPreviewMode === "edit", `Image Editing should keep edit canvas mode after import, got ${snapshot.canvasPreviewMode}`);
  await assertImageEditingFullBodyFitWithLogs("Image Editing edited full-body result");
  await assertSelectedPreviewHasTransparentPixels("Image Editing edited result preview should preserve transparent alpha");
  await installDownloadSpy();
  await assertDownloadModal({
    expectedButtons: ["PNG"],
    absentButtons: ["Animated GIF", "Animated WebP", "Animated APNG", "Sprite Sheet", "Export Animation Pack"],
    clickButtons: ["PNG"],
    label: "Image Editing edited result PNG download modal"
  });
  await assertLatestDownloadHasTransparentPixels("Image Editing PNG download should preserve transparent alpha");
  await assertNoBrowserErrors("Image Editing");
  await maybeCapture("image-editing-edit-source");
  await assertSourceStatusRoundTrip("Image Editing", ".image-edit-source-status.source-status-button");
  await assertNoBrowserErrors("Image Editing source round trip");
  await selectWorkflowTab("Pixel Art Generation");
}

async function assertImageEditingFullBodyFitWithLogs(label) {
  const metrics = await evaluate(`(() => {
    const rectFor = (node) => {
      if (!node) return null;
      const rect = node.getBoundingClientRect();
      return {
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        left: rect.left,
        width: rect.width,
        height: rect.height
      };
    };
    const log = document.querySelector(".codex-log-panel");
    const workspace = document.querySelector(".workspace");
    const canvasPanel = document.querySelector(".canvas-panel");
    const stage = document.querySelector(".canvas-stage");
    const canvas = document.querySelector("canvas");
    const resultFrame = document.querySelector(".result-preview-frame");
    const downloadPanel = document.querySelector(".workspace .result-download-panel");
    const canvasVisible = Boolean(canvas && getComputedStyle(canvas).display !== "none");
    const activePreview = resultFrame || (canvasVisible ? canvas : null);
    const activeStyle = activePreview ? getComputedStyle(activePreview) : null;
    const logRect = rectFor(log);
    const workspaceRect = rectFor(workspace);
    const panelRect = rectFor(canvasPanel);
    const stageRect = rectFor(stage);
    const previewRect = rectFor(activePreview);
    const downloadRect = rectFor(downloadPanel);
    return {
      logVisible: Boolean(logRect),
      activeVisible: Boolean(previewRect && previewRect.width > 0 && previewRect.height > 0),
      activeTag: activePreview?.tagName || "",
      activeClass: activePreview?.className || "",
      activeStyleHeight: activeStyle?.height || "",
      activeStyleWidth: activeStyle?.width || "",
      activeStyleMaxHeight: activeStyle?.maxHeight || "",
      activeStyleMaxWidth: activeStyle?.maxWidth || "",
      activeHeight: Math.round(previewRect?.height || 0),
      stageHeight: Math.round(stageRect?.height || 0),
      panelHeight: Math.round(panelRect?.height || 0),
      logTop: Math.round(logRect?.top || 0),
      workspaceBottom: Math.round(workspaceRect?.bottom || 0),
      downloadBottom: Math.round(downloadRect?.bottom || 0),
      activeFitsStage: Boolean(previewRect && stageRect
        && previewRect.top >= stageRect.top - 1
        && previewRect.left >= stageRect.left - 1
        && previewRect.right <= stageRect.right + 1
        && previewRect.bottom <= stageRect.bottom + 1),
      stageFitsPanel: Boolean(stageRect && panelRect
        && stageRect.top >= panelRect.top - 1
        && stageRect.bottom <= panelRect.bottom + 1),
      workspaceBeforeLog: Boolean(!logRect || !workspaceRect || workspaceRect.bottom <= logRect.top + 1),
      downloadBeforeLog: Boolean(!logRect || !downloadRect || downloadRect.bottom <= logRect.top + 1),
      distanceToLog: Math.round((logRect?.top || 0) - (workspaceRect?.bottom || 0))
    };
  })()`);
  assert(metrics.logVisible, `${label}: Codex log panel should be visible while checking full-body fit`);
  assert(metrics.activeVisible, `${label}: active preview should be visible`);
  assert(metrics.activeHeight >= 160, `${label}: active preview should remain inspectable, got height ${metrics.activeHeight}`);
  assert(metrics.stageHeight >= 220, `${label}: canvas stage should reserve enough height for full-body inspection, got ${metrics.stageHeight}`);
  assert(metrics.activeFitsStage, `${label}: active preview should fit inside the canvas stage: ${JSON.stringify(metrics)}`);
  assert(metrics.stageFitsPanel, `${label}: canvas stage should fit inside the canvas panel: ${JSON.stringify(metrics)}`);
  assert(metrics.workspaceBeforeLog, `${label}: workspace should not overlap the Codex log panel, distance ${metrics.distanceToLog}: ${JSON.stringify(metrics)}`);
  assert(metrics.downloadBeforeLog, `${label}: download panel should stay above the Codex log panel: ${JSON.stringify(metrics)}`);
}

async function assertAnimationResultNotEditable() {
  await selectWorkflowTab("Image Editing");
  await waitForEval(() => `document.body.innerText.includes("Animation output")`, "Image Editing final animation notice");
  const snapshot = await pageSnapshot();
  assert(snapshot.canvasPreviewMode === "result", `Animation results should stay in result preview mode in Image Editing, got ${snapshot.canvasPreviewMode}`);
  assert(!snapshot.annotationToolbarVisible, "Animation results should not expose the rectangle selection toolbar");
  assert(snapshot.finalEditNoticeVisible, "Animation results should show the final-artifact edit notice");
  assert(snapshot.text.includes("Animation outputs are final artifacts"), "Animation results should update the status copy to final-artifact guidance");
  assert(snapshot.annotationRegionRows === 0, `Animation results should not show numbered edit rows, got ${snapshot.annotationRegionRows}`);
  assert(snapshot.disabledButtons.includes("Edit Image"), "Animation results should disable the Edit Image action");
  await assertNoBrowserErrors("Animation result is not editable");
  await maybeCapture("animation-result-not-editable");
  await selectWorkflowTab("Pixel Art Generation");
}

async function assertEffectAnimationWorkflow() {
  await installDownloadSpy();
  await assertEffectControlsSimplified();
  await assertWorkflow({
    label: "Effect Animation",
    route: "Route: Codex Handoff",
    buttons: ["Choose Effect", "Open advanced settings", "Generate Effect", "Download"],
    hiddenButtons: ["Import Latest", "Import File", "Animated WebP", "Animated APNG", "Export Animation Pack"],
    hiddenText: ["Sprite Actions", "Export Sprite", "Generation Method", "Prompt (optional)", "Compositing tools (after generation)"],
    requiredText: ["1. Choose Effect", "Selected effect", "Choose Effect", "Open advanced settings", "2. Generate"],
    exerciseButton: "Generate Effect",
    expectedAfterExercise: "Effect imported",
    expectedAfterExerciseText: ["Effect exports ready", "GIF preview", "Sheet preview", "Frame timeline", "GOLD"],
    expectedCanvasPreviewModeAfterExercise: "result",
    expectedDownloadModalButtons: ["Effect GIF", "Effect APNG", "Sheet PNG", "Frames ZIP", "Metadata JSON", "Effect Pack ZIP"],
    downloadModalAbsentButtons: ["PNG", "Animated GIF", "Animated WebP", "Animated APNG", "Export Animation Pack"],
    downloadModalClickButtons: ["Effect GIF", "Effect APNG", "Sheet PNG", "Frames ZIP", "Metadata JSON", "Effect Pack ZIP"]
  });
  await waitForEval(
    () => `(window.__uiSmokeDownloads || []).some((item) => item.type === "image/apng" || String(item.dataUrl || "").startsWith("data:image/apng"))`,
    "Effect Animation APNG download captured"
  );
  const apng = await inspectDownloadedApng();
  assert(apng.found, `Effect Animation APNG download should contain an acTL chunk: ${JSON.stringify(apng)}`);
  assert(apng.frameCount === 8, `Effect Animation APNG should contain 8 frames, got ${JSON.stringify(apng)}`);
  assert(apng.loopCount === 0, `Effect Animation APNG should loop forever, got ${JSON.stringify(apng)}`);
}

async function assertEffectControlsSimplified() {
  await selectWorkflowTab("Effect Animation");
  const defaultState = await evaluate(`(() => {
    const panel = document.querySelector(".source-panel");
    const steps = [...(panel?.querySelectorAll(".effect-steps-simplified > .effect-step") || [])];
    const buttons = [...(panel?.querySelectorAll("button") || [])];
    return {
      stepCount: steps.length,
      selectCount: panel?.querySelectorAll(".effect-steps-simplified select").length || 0,
      textareaCount: panel?.querySelectorAll(".effect-steps-simplified textarea").length || 0,
      categoryGridCount: panel?.querySelectorAll(".effect-category-grid").length || 0,
      summary: panel?.querySelector(".effect-selected-summary")?.innerText.replace(/\\s+/g, " ").trim() || "",
      actionHeights: buttons
        .filter((button) => ["Choose Effect", "Open advanced settings", "Generate Effect"].includes(button.innerText.trim()))
        .map((button) => Math.round(button.getBoundingClientRect().height))
    };
  })()`);
  assert(defaultState.stepCount === 2, `Effect Animation should show only choose and generate steps by default: ${JSON.stringify(defaultState)}`);
  assert(defaultState.selectCount === 0 && defaultState.textareaCount === 0 && defaultState.categoryGridCount === 0, `Effect optional controls should stay out of the default left column: ${JSON.stringify(defaultState)}`);
  assert(defaultState.summary.includes("Selected effect") && defaultState.summary.includes("Verified"), `Effect Animation should show a compact selected-effect summary: ${defaultState.summary}`);
  assert(defaultState.actionHeights.length === 3 && defaultState.actionHeights.every((height) => height >= 48), `Effect primary actions should remain easy to press: ${JSON.stringify(defaultState.actionHeights)}`);

  await clickButtonByText("Choose Effect");
  await waitForEval(() => `Boolean(document.querySelector(".effect-picker-modal-body"))`, "Effect picker modal opens");
  const pickerState = await evaluate(`(() => ({
    categoryCount: document.querySelectorAll(".effect-picker-category-grid button").length,
    selectedCount: document.querySelectorAll(".effect-picker-category-grid button[aria-pressed=true]").length,
    variationCount: document.querySelector(".effect-picker-selection select")?.options.length || 0
  }))()`);
  assert(pickerState.categoryCount === 11, `Effect picker should keep all eleven effect categories available: ${JSON.stringify(pickerState)}`);
  assert(pickerState.selectedCount === 1 && pickerState.variationCount >= 3, `Effect picker should expose one active category and its variations: ${JSON.stringify(pickerState)}`);
  await clickSelector(".animation-utility-heading .icon-button");
  await waitForEval(() => `!document.querySelector(".effect-picker-modal-body")`, "Effect picker modal closes");
  await waitForEval(
    () => `document.activeElement?.classList.contains("effect-picker-trigger") || false`,
    "Effect picker should return focus to its trigger"
  );

  await clickButtonByText("Open advanced settings");
  await waitForEval(() => `Boolean(document.querySelector("[aria-labelledby=effect-advanced-settings-title]"))`, "Effect advanced settings modal opens");
  const advancedState = await evaluate(`(() => {
    const dialog = document.querySelector("[aria-labelledby=effect-advanced-settings-title]");
    return {
      selectCount: dialog?.querySelectorAll("select").length || 0,
      textareaCount: dialog?.querySelectorAll("textarea").length || 0,
      backgroundCount: dialog?.querySelectorAll(".effect-background-switch button").length || 0,
      optionalClosed: dialog?.querySelector(".effect-optional-tools")?.open === false,
      activeBackgrounds: dialog?.querySelectorAll(".effect-background-switch button[aria-pressed=true]").length || 0
    };
  })()`);
  assert(advancedState.selectCount === 7 && advancedState.textareaCount === 3, `Effect advanced settings should retain appearance, sheet, and prompt controls: ${JSON.stringify(advancedState)}`);
  assert(advancedState.backgroundCount === 4 && advancedState.activeBackgrounds === 1, `Effect preview backgrounds should remain available in advanced settings: ${JSON.stringify(advancedState)}`);
  assert(advancedState.optionalClosed, "VFX Composite Stage should stay collapsed as an optional post-generation tool");
  await clickSelector(".animation-utility-heading .icon-button");
  await waitForEval(() => `!document.querySelector("[aria-labelledby=effect-advanced-settings-title]")`, "Effect advanced settings closes");
  await waitForEval(
    () => `document.activeElement?.classList.contains("effect-advanced-settings-trigger") || false`,
    "Effect advanced settings should return focus to its trigger"
  );
}

async function assertEffectResultNotEditable() {
  await selectWorkflowTab("Image Editing");
  await waitForEval(() => `document.body.innerText.includes("Effect output")`, "Image Editing final effect notice");
  const snapshot = await pageSnapshot();
  assert(snapshot.canvasPreviewMode === "result", `Effect results should stay in result preview mode in Image Editing, got ${snapshot.canvasPreviewMode}`);
  assert(!snapshot.annotationToolbarVisible, "Effect results should not expose the rectangle selection toolbar");
  assert(snapshot.finalEditNoticeVisible, "Effect results should show the final-artifact edit notice");
  assert(snapshot.text.includes("Effect animation results are export assets"), "Effect results should update the status copy to export-asset guidance");
  assert(snapshot.annotationRegionRows === 0, `Effect results should not show numbered edit rows, got ${snapshot.annotationRegionRows}`);
  assert(snapshot.disabledButtons.includes("Edit Image"), "Effect results should disable the Edit Image action");
  await assertNoBrowserErrors("Effect result is not editable");
  await maybeCapture("effect-result-not-editable");
  await selectWorkflowTab("Pixel Art Generation");
}

async function assertEffectCategoryMatrix() {
  const categories = [
    { label: "Slash Arc", id: "slash-arc" },
    { label: "Hit Spark", id: "hit-spark" },
    { label: "Magic Cast", id: "magic-cast" },
    { label: "Projectile", id: "projectile" },
    { label: "Impact", id: "impact" }
  ];
  await selectWorkflowTab("Effect Animation");
  for (const category of categories) {
    await clickEffectCategory(category.label);
    const historyCountBeforeExercise = await evaluate(`document.querySelectorAll(".history-item").length`);
    await clickButtonByText("Generate Effect");
    await waitForEval(
      () => `document.querySelectorAll(".history-item").length > ${historyCountBeforeExercise} && document.body.innerText.includes("Effect imported")`,
      `Effect Animation generated ${category.label}`,
      24000
    );
    for (const text of ["Effect exports ready", "GIF preview", "Sheet preview", "Frame timeline", "GOLD"]) {
      await waitForEval(() => `document.body.innerText.includes(${JSON.stringify(text)})`, `Effect Animation ${category.label} shows ${text}`);
    }
    const result = await evaluate(`(() => {
      const selected = document.querySelector(".history-item.selected")?.innerText.replace(/\\s+/g, " ").trim() || "";
      return {
        selected,
        previewMode: document.querySelector("canvas")?.dataset.previewMode || "",
        previewName: document.querySelector("canvas")?.dataset.previewName || "",
        frameButtons: document.querySelectorAll(".effect-timeline button").length,
        resultImages: document.querySelectorAll(".result-preview-image").length
      };
    })()`);
    const gifLoop = await waitForEffectGifLoop(category.label);
    assert(result.selected.includes(`Effect: ${category.label}`), `Effect Animation should label selected history compactly as ${category.label}: ${result.selected}`);
    assert(!result.selected.includes("-effect-sheet.png"), `Effect Animation selected history card should hide long sheet filenames: ${result.selected}`);
    assert(result.previewMode === "result", `Effect Animation ${category.label} should stay in result preview mode, got ${result.previewMode}`);
    assert(result.previewName, `Effect Animation ${category.label} should expose a selected preview name`);
    assert(result.frameButtons === 8, `Effect Animation ${category.label} should render 8 timeline frames, got ${result.frameButtons}`);
    assert(result.resultImages === 1, `Effect Animation ${category.label} should render one sheet preview image, got ${result.resultImages}`);
    assert(gifLoop.loopCount === 0, `Effect Animation ${category.label} GIF preview should loop forever: ${JSON.stringify(gifLoop)}`);
    console.log(`Effect QA ${category.label}: ${result.previewName}`);
    await maybeCapture(`effect-animation-${category.id}`);
    await assertNoBrowserErrors(`Effect Animation ${category.label}`);
  }
}

async function assertVfxCompositeStage() {
  await selectWorkflowTab("Effect Animation");
  await clickButtonByText("Open advanced settings");
  await waitForEval(() => `Boolean(document.querySelector("[aria-labelledby=effect-advanced-settings-title]"))`, "Effect advanced settings for VFX Composite Stage");
  await clickSelector(".effect-optional-tools > summary");
  await waitForEval(() => `Boolean(Array.from(document.querySelectorAll("button")).find((button) => button.textContent?.includes("Open Composite Stage") && !button.disabled))`, "VFX Composite Stage launch ready");
  await cdp.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await clickButtonByText("Open Composite Stage");
  await waitForEval(() => `Boolean(document.querySelector('.vfx-composite-dialog'))`, "VFX Composite Stage opens");
  await waitForEval(() => `Boolean(document.querySelector('button[aria-label="Play composite"]'))`, "VFX Composite respects reduced motion");
  await cdp.send("Emulation.setEmulatedMedia", { features: [] });
  const initial = await evaluate(`(() => {
    const dialog = document.querySelector('.vfx-composite-dialog');
    return {
      title: dialog?.querySelector('h2')?.textContent || '',
      sourceSelects: dialog?.querySelectorAll('.vfx-composite-source-grid select').length || 0,
      socketOptions: dialog?.querySelectorAll('.vfx-control-section select')[0]?.options.length || 0,
      eventOptions: dialog?.querySelectorAll('.vfx-control-section select')[1]?.options.length || 0,
      overlays: dialog?.querySelectorAll('.vfx-overlay-grid input').length || 0,
      previewImages: dialog?.querySelectorAll('.vfx-preview-stage img').length || 0,
      initialFocusInside: Boolean(dialog?.contains(document.activeElement)),
      text: dialog?.innerText || ''
    };
  })()`);
  assert(initial.title === "VFX Composite Stage", `VFX Composite Stage title missing: ${JSON.stringify(initial)}`);
  assert(initial.sourceSelects === 2, `VFX Composite Stage needs character/effect selectors: ${JSON.stringify(initial)}`);
  assert(initial.socketOptions === 6, `VFX Composite Stage needs six sockets: ${JSON.stringify(initial)}`);
  assert(initial.eventOptions === 5, `VFX Composite Stage needs five events: ${JSON.stringify(initial)}`);
  assert(initial.overlays === 5, `VFX Composite Stage needs five overlay controls: ${JSON.stringify(initial)}`);
  assert(initial.previewImages >= 1, `VFX Composite Stage should render actual frame layers: ${JSON.stringify(initial)}`);
  assert(initial.initialFocusInside, `VFX Composite Stage should place focus inside the modal: ${JSON.stringify(initial)}`);
  for (const text of ["Socket / Event", "Basic offset", "Advanced adjustments", "Normal", "Additive", "Screen", "Layer Sheets", "Combined GIF", "Combined APNG", "Composite Pack ZIP"]) {
    assert(initial.text.includes(text), `VFX Composite Stage missing ${text}: ${initial.text}`);
  }

  await evaluate(`(() => {
    const dialog = document.querySelector('.vfx-composite-dialog');
    const selectByLabel = (label, value) => {
      const input = Array.from(dialog.querySelectorAll('label.field')).find((item) => item.querySelector('span')?.textContent === label)?.querySelector('select');
      if (!input) throw new Error('Missing select ' + label);
      input.value = value;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    };
    const numberByLabel = (label, value) => {
      const input = Array.from(dialog.querySelectorAll('label.field')).find((item) => item.querySelector('span')?.textContent === label)?.querySelector('input[type=number]');
      if (!input) throw new Error('Missing number input ' + label);
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(input, String(value));
      input.dispatchEvent(new Event('input', { bubbles: true }));
    };
    selectByLabel('Socket', 'weapon-tip');
    selectByLabel('Event', 'impact');
    selectByLabel('Layer', 'back');
    selectByLabel('Blend', 'screen');
    numberByLabel('Offset X', 12);
    numberByLabel('Offset Y', -6);
  })()`);
  await clickButtonByText("peak sync");
  await clickButtonByText("dark");
  await clickButtonByText("Save setup");
  await waitForEval(() => `document.querySelector('.vfx-save-state')?.textContent?.includes('Saved')`, "VFX Composite setup saved");
  const configured = await evaluate(`(() => ({
    attachment: document.querySelector('.vfx-attachment-strip')?.innerText || '',
    background: document.querySelector('.vfx-preview-stage')?.className || '',
    offsetX: Array.from(document.querySelectorAll('.vfx-controls-panel label.field')).find((item) => item.querySelector('span')?.textContent === 'Offset X')?.querySelector('input')?.value,
    offsetY: Array.from(document.querySelectorAll('.vfx-controls-panel label.field')).find((item) => item.querySelector('span')?.textContent === 'Offset Y')?.querySelector('input')?.value
  }))()`);
  assert(configured.attachment.includes("weapon-tip") && configured.attachment.includes("impact") && configured.attachment.includes("peak sync") && configured.attachment.includes("back / screen"), `VFX attachment configuration did not apply: ${JSON.stringify(configured)}`);
  assert(configured.background.includes("bg-dark"), `VFX dark background did not apply: ${JSON.stringify(configured)}`);
  assert(configured.offsetX === "12" && configured.offsetY === "-6", `VFX numeric offsets did not apply: ${JSON.stringify(configured)}`);

  await maybeCapture("vfx-composite-stage");
  await cdp.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await delay(250);
  const mobile = await evaluate(`(() => {
    const dialog = document.querySelector('.vfx-composite-dialog');
    const rect = dialog?.getBoundingClientRect();
    return {
      dialogFits: Boolean(rect && rect.left >= -1 && rect.right <= window.innerWidth + 1),
      dialogScrollFits: Boolean(dialog && dialog.scrollWidth <= dialog.clientWidth + 1),
      documentFits: document.documentElement.scrollWidth <= window.innerWidth + 1,
      advancedCollapsed: !document.querySelector('.vfx-advanced')?.open,
      basicOffsetsVisible: Boolean(Array.from(document.querySelectorAll('.vfx-controls-panel label.field')).find((item) => item.querySelector('span')?.textContent === 'Offset X'))
    };
  })()`);
  assert(mobile.dialogFits && mobile.dialogScrollFits, `Mobile VFX Composite dialog should fit: ${JSON.stringify(mobile)}`);
  assert(mobile.documentFits, `Mobile VFX Composite should not overflow the document: ${JSON.stringify(mobile)}`);
  assert(mobile.advancedCollapsed && mobile.basicOffsetsVisible, `Mobile VFX Composite should prioritize preview/basic offsets and collapse advanced controls: ${JSON.stringify(mobile)}`);
  await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
  await delay(200);
  await clickButtonByText("Layer Sheets");
  await clickButtonByText("Manifest JSON");
  await clickButtonByText("Combined GIF");
  await waitForEval(() => `(window.__uiSmokeDownloads || []).some((item) => item.type === 'image/gif')`, "VFX combined GIF download");
  await waitForEval(() => `Boolean(Array.from(document.querySelectorAll('.vfx-export-actions button')).find((button) => button.textContent?.includes('Combined APNG') && !button.disabled))`, "VFX GIF export settles");
  await clickButtonByText("Combined APNG");
  await waitForEval(() => `(window.__uiSmokeDownloads || []).some((item) => item.type === 'image/apng')`, "VFX combined APNG download");
  await waitForEval(() => `Boolean(Array.from(document.querySelectorAll('.vfx-export-actions button')).find((button) => button.textContent?.includes('Composite Pack ZIP') && !button.disabled))`, "VFX APNG export settles");
  await clickButtonByText("Composite Pack ZIP");
  await waitForEval(() => `(window.__uiSmokeDownloads || []).at(-1)?.type === 'application/zip'`, "VFX Composite Pack download");
  await evaluate(`(async () => {
    const download = (window.__uiSmokeDownloads || []).at(-1);
    const blob = await (await fetch(download.dataUrl)).blob();
    const file = new File([blob], 'ui-smoke-vfx-composite.zip', { type: 'application/zip' });
    const input = document.querySelector('.vfx-composite-footer input[type=file]');
    Object.defineProperty(input, 'files', { configurable: true, value: [file] });
    input.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  await waitForEval(() => `document.querySelector('.vfx-export-status')?.textContent?.includes('reimported')`, "VFX Composite Pack reimport");

  await evaluate(`(() => {
    const dialog = document.querySelector('.vfx-composite-dialog');
    const scrubber = dialog.querySelector('input[aria-label="Composite frame scrubber"]');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(scrubber, '0');
    scrubber.dispatchEvent(new Event('change', { bubbles: true }));
    const event = new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true });
    dialog.dispatchEvent(event);
  })()`);
  await waitForEval(() => `document.querySelector('.vfx-scrubber strong')?.textContent?.includes('2/')`, "VFX keyboard frame stepping");
  const frameAfterArrow = await evaluate(`document.querySelector('.vfx-scrubber strong')?.textContent || ''`);
  assert(frameAfterArrow.includes("2/"), `VFX keyboard frame stepping should advance to frame 2: ${frameAfterArrow}`);

  await evaluate(`(() => { window.__vfxReturnFocus = document.activeElement; document.querySelector('.vfx-composite-dialog').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); })()`);
  await waitForEval(() => `!document.querySelector('.vfx-composite-dialog')`, "VFX Composite Stage closes with Escape");
  await waitForEval(
    () => `document.activeElement?.textContent?.includes('Open Composite Stage') || false`,
    "VFX Composite Stage should return focus to its launcher"
  );
  await clickSelector(".animation-utility-heading .icon-button");
  await waitForEval(() => `!document.querySelector("[aria-labelledby=effect-advanced-settings-title]")`, "Effect advanced settings closes after VFX Composite Stage");
  await assertNoBrowserErrors("VFX Composite Stage");
}

async function prepareVfxCompositeSmokeResults() {
  await installDownloadSpy();
  await selectWorkflowTab("Pixel Art Generation");
  const sourceCount = await evaluate(`document.querySelectorAll('.history-item').length`);
  await clickButtonByText("Generate Pixel Art");
  await waitForEval(() => `document.querySelectorAll('.history-item').length > ${sourceCount}`, "VFX smoke pixel source", 30000);
  await selectWorkflowTab("Animation Generation");
  await clickButtonByText("Generate Animation");
  await waitForEval(() => `document.body.innerText.includes("Animation generated")`, "VFX smoke character animation", 45000);
  await selectWorkflowTab("Effect Animation");
  await clickButtonByText("Generate Effect");
  await waitForEval(() => `document.body.innerText.includes("Effect imported")`, "VFX smoke effect animation", 30000);
}

async function assertHistoryIncrementalRendering() {
  const bulkHistory = Array.from({ length: 130 }, (_, index) => ({
    id: `bulk-history-${index + 1}`,
    name: `bulk-history-${String(index + 1).padStart(3, "0")}.png`,
    dataUrl: tinyPng,
    provider: "local-file",
    prompt: `Bulk history ${index + 1}`,
    seed: "ui-smoke",
    size: "1x1",
    createdAt: new Date(Date.now() - index * 1000).toISOString(),
    adopted: false,
    source: "import"
  }));
  await evaluate(`(() => {
    sessionStorage.setItem("image-cockpit.ui-smoke.skip-default-seed", "1");
    localStorage.setItem("image-cockpit.v3.history", ${JSON.stringify(JSON.stringify(bulkHistory))});
    localStorage.removeItem("image-cockpit.v3.frames");
    localStorage.removeItem("image-cockpit.v3.actions");
  })()`);
  await writeIndexedSmokeState("image-cockpit.v3.history", bulkHistory);
  await writeIndexedSmokeState("image-cockpit.v3.frames", []);
  await cdp.send("Page.navigate", { url: `http://127.0.0.1:${vitePort}/` });
  await waitForEval(
    () => `document.querySelector(".history-list")?.dataset.visibleCount === "100" && document.querySelector(".history-list")?.dataset.totalCount === "130"`,
    "Results list renders the first 100 history items"
  );
  let snapshot = await pageSnapshot();
  assert(snapshot.historyItems === 100, `Results list should initially render 100 cards, got ${snapshot.historyItems}`);
  assert(snapshot.historyVisibleCount === "100", `Results list visible count should start at 100, got ${snapshot.historyVisibleCount}`);
  assert(snapshot.historyTotalCount === "130", `Results list total count should stay 130, got ${snapshot.historyTotalCount}`);

  await scrollHistoryListToBottom();
  await waitForEval(
    () => `Number(document.querySelector(".history-list")?.dataset.visibleCount || 0) >= 120`,
    "Results list loads 20 more cards on scroll"
  );
  snapshot = await pageSnapshot();
  assert(snapshot.historyItems >= 120 && snapshot.historyItems <= 130, `Results list should render at least 120 cards after one scroll, got ${snapshot.historyItems}`);

  if (snapshot.historyItems < 130) {
    await scrollHistoryListToBottom();
    await waitForEval(
      () => `document.querySelector(".history-list")?.dataset.visibleCount === "130"`,
      "Results list caps at all available cards"
    );
  }
  snapshot = await pageSnapshot();
  assert(snapshot.historyItems === 130, `Results list should render all 130 cards after the final scroll, got ${snapshot.historyItems}`);
  await assertNoBrowserErrors("Results incremental rendering");
}

async function scrollHistoryListToBottom() {
  const box = await evaluate(`(() => {
    const list = document.querySelector(".history-list");
    if (!list) throw new Error("History list not found");
    const rect = list.getBoundingClientRect();
    return { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) };
  })()`);
  for (let index = 0; index < 6; index += 1) {
    await cdp.send("Input.dispatchMouseEvent", {
      type: "mouseWheel",
      x: box.x,
      y: box.y,
      deltaX: 0,
      deltaY: 1800
    });
    await delay(80);
  }
  await evaluate(`(async () => {
    const list = document.querySelector(".history-list");
    if (!list) throw new Error("History list not found");
    for (let index = 0; index < 4; index += 1) {
      document.querySelector(".history-load-more-sentinel")?.scrollIntoView({ block: "end" });
      list.scrollTop = list.scrollHeight - list.clientHeight;
      list.dispatchEvent(new Event("scroll", { bubbles: true }));
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
  })()`);
}

async function writeIndexedSmokeState(key, value) {
  await evaluate(`(async () => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open("image-cockpit-local-state", 1);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains("state")) database.createObjectStore("state");
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Could not open smoke IndexedDB"));
    });
    await new Promise((resolve, reject) => {
      const transaction = db.transaction("state", "readwrite");
      transaction.objectStore("state").put(${JSON.stringify(value)}, ${JSON.stringify(key)});
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error("Could not write smoke IndexedDB"));
    });
    db.close();
  })()`);
}

async function assertWorkflow({
  label,
  route,
  buttons,
  hiddenButtons = [],
  hiddenText = [],
  requiredText,
  preExerciseButtonChecks = [],
  exactButtonCounts = {},
  exerciseButton,
  expectedAfterExercise,
  expectedAfterExerciseText = [],
  postExerciseButtons = [],
  expectedDownloadModalButtons = [],
  downloadModalAbsentButtons = [],
  downloadModalClickButtons = [],
  expectedPreviewImages = 0,
  expectedAnimationPreviewImagesAfterExercise,
  expectedDirectionPreviewCount = 0,
  expectedCanvasPreviewModeAfterExercise = "",
  expectedAnnotationToolbarVisible = false,
  expectedNormalizedAnimationFrames = false,
  expectSourceRoundTrip = false,
  reloadAfterExercise = false,
  exerciseTimeoutMs = 10000
}) {
  await selectWorkflowTab(label);
  await waitForEval(() => `document.body.innerText.includes(${JSON.stringify(label)})`, label);
  const snapshot = await pageSnapshot();
  assert(snapshot.text.includes(label), `${label} should be visible after selection`);
  assert(snapshot.buttons.includes("Pixel Art Generation"), `${label} should expose the Pixel Art Generation tab`);
  assert(snapshot.buttons.includes("Image Editing"), `${label} should expose the Image Editing tab`);
  assert(snapshot.buttons.includes("Animation Generation"), `${label} should expose the Animation Generation tab`);
  assert(snapshot.buttons.includes("Effect Animation"), `${label} should expose the Effect Animation tab`);
  assert(snapshot.workflowTabsInsidePanel, `${label} should place workflow tabs under 1. Workflow`);
  assert(snapshot.workflowTabsLeadHierarchy, `${label} should keep primary workflow buttons before summary and health`);
  assert(!snapshot.workflowTabsInTopbar, `${label} should not place workflow tabs in the global header`);
  assert(snapshot.summary.includes(route), `${label} should select ${route}`);
  assert(snapshot.canvasVisible, `${label} should render the canvas`);
  assert(
    snapshot.annotationToolbarVisible === expectedAnnotationToolbarVisible,
    `${label} Preview toolbar visibility should be ${expectedAnnotationToolbarVisible}`
  );
  assert(!snapshot.spriteBenchVisible, `${label} should keep the Sprite Actions panel hidden for now`);
  if (label === "Animation Generation") {
    assert(snapshot.resultDownloadPanelInWorkspace, "Animation Generation should place the shared download card under the preview workspace");
    assert(!snapshot.resultDownloadPanelInSource, "Animation Generation should not leave the shared download card in the left source panel");
    assert(snapshot.animationPreviewImages === 0, "Animation Generation should not show stale animation preview images before a selected animation result exists");
  } else {
    assert(snapshot.resultDownloadPanelInWorkspace, `${label} should place the shared download card under the preview workspace`);
    assert(!snapshot.resultDownloadPanelInSource, `${label} should not put download cards in the left source panel`);
  }
  assert(snapshot.resultDownloadActionButtons === 1, `${label} should expose one compact Download button`);
  assert(snapshot.resultDownloadGridButtonsInWorkspace === 0, `${label} should keep detailed download buttons out of the preview area`);
  assert(snapshot.resultDownloadPanelHeight <= 110, `${label} download panel should stay compact, got ${snapshot.resultDownloadPanelHeight}`);
  buttons.forEach((button) => {
    assert(snapshot.buttons.includes(button), `${label} missing action button: ${button}`);
  });
  hiddenButtons.forEach((button) => {
    assert(!snapshot.buttons.includes(button), `${label} should hide action button for now: ${button}`);
  });
  hiddenText.forEach((text) => {
    assert(!snapshot.text.includes(text), `${label} should hide workflow text for now: ${text}`);
  });
  Object.entries(exactButtonCounts).forEach(([button, count]) => {
    const actual = snapshot.buttons.filter((value) => value === button).length;
    assert(actual === count, `${label} expected ${count} ${button} button(s), got ${actual}`);
  });
  requiredText.forEach((text) => {
    assert(snapshot.text.includes(text), `${label} missing workflow text: ${text}`);
  });
  for (const check of preExerciseButtonChecks) {
    await clickButtonByText(check.button);
    await waitForEval(() => `document.body.innerText.includes(${JSON.stringify(check.expectedText)})`, `${label} shows ${check.expectedText}`);
  }
  if (exerciseButton) {
    const historyCountBeforeExercise = await evaluate(`document.querySelectorAll(".history-item").length`);
    await clickButtonByText(exerciseButton);
    if (expectedAfterExercise === "Imported from Local Inbox") {
      await waitForEval(
        () => `document.querySelectorAll(".history-item").length > ${historyCountBeforeExercise}`,
        `${label} generated result`,
        exerciseTimeoutMs
      );
    } else {
      await waitForEval(
        () => `document.body.innerText.includes(${JSON.stringify(expectedAfterExercise)})`,
        `${label} generated result`,
        exerciseTimeoutMs
      );
    }
    for (const text of expectedAfterExerciseText) {
      await waitForEval(() => `document.body.innerText.includes(${JSON.stringify(text)})`, `${label} shows ${text}`);
    }
    if (expectedPreviewImages > 0) {
      await waitForEval(
        () => `document.querySelectorAll(".animation-preview img").length >= ${expectedPreviewImages}`,
        `${label} renders animation preview images`
      );
      const postSnapshot = await pageSnapshot();
      assert(
        postSnapshot.animationPreviewImages >= expectedPreviewImages,
        `${label} should render ${expectedPreviewImages} animation preview image(s), got ${postSnapshot.animationPreviewImages}`
      );
      assert(postSnapshot.spriteSheetGridOverlays === 1, `${label} should overlay a sprite sheet grid on animation results`);
    }
    if (expectedDirectionPreviewCount > 0) {
      const directionSnapshot = await pageSnapshot();
      assert(
        directionSnapshot.directionPreviewRows === expectedDirectionPreviewCount,
        `${label} should render ${expectedDirectionPreviewCount} directional preview row(s), got ${directionSnapshot.directionPreviewRows}`
      );
      assert(directionSnapshot.animationSourceStatus.includes("Generated from"), `${label} should show the generated-from source under the preview`);
    }
    if (typeof expectedAnimationPreviewImagesAfterExercise === "number") {
      const postSnapshot = await pageSnapshot();
      assert(
        postSnapshot.animationPreviewImages === expectedAnimationPreviewImagesAfterExercise,
        `${label} should render ${expectedAnimationPreviewImagesAfterExercise} animation preview image(s), got ${postSnapshot.animationPreviewImages}`
      );
      assert(
        postSnapshot.directionPreviewRows === expectedDirectionPreviewCount,
        `${label} should render ${expectedDirectionPreviewCount} directional preview row(s), got ${postSnapshot.directionPreviewRows}`
      );
      assert(postSnapshot.resultDownloadPanelInWorkspace, `${label} should keep the download panel visible under the preview`);
    }
    if (expectedNormalizedAnimationFrames) {
      await assertNormalizedAnimationFrames(label);
    }
    if (expectSourceRoundTrip) {
      await waitForEval(
        () => `document.querySelectorAll(".codex-job-row").length === 0`,
        `${label} releases every tournament job before source round trip`,
        15000
      );
      await assertSourceStatusRoundTrip(label, ".animation-source-status.source-status-button", { restoreSelectedResult: true });
    }
    if (expectedCanvasPreviewModeAfterExercise) {
      await waitForEval(
        () => `document.querySelector("canvas")?.dataset.previewMode === ${JSON.stringify(expectedCanvasPreviewModeAfterExercise)}`,
        `${label} shows the selected result in the main preview`
      );
      const previewSnapshot = await pageSnapshot();
      assert(
        previewSnapshot.canvasPreviewMode === expectedCanvasPreviewModeAfterExercise,
        `${label} should use ${expectedCanvasPreviewModeAfterExercise} canvas preview mode, got ${previewSnapshot.canvasPreviewMode}`
      );
      assert(previewSnapshot.canvasPreviewName, `${label} should expose the selected result name on the preview canvas`);
      if (expectedCanvasPreviewModeAfterExercise === "result") {
        assert(previewSnapshot.resultPreviewImages === 1, `${label} should render one selected result preview image, got ${previewSnapshot.resultPreviewImages}`);
        assert(previewSnapshot.resultPreviewLoaded, `${label} should load the selected result preview image`);
        assert(previewSnapshot.resultPreviewFrameHeight >= 240, `${label} result preview frame should be tall enough to inspect, got ${previewSnapshot.resultPreviewFrameHeight}`);
        assert(previewSnapshot.resultDownloadPanelComplete, `${label} should mark the selected result as downloadable`);
        assert(previewSnapshot.resultDownloadActionButtons === 1, `${label} should keep one compact Download button after generation`);
        assert(previewSnapshot.resultDownloadGridButtonsInWorkspace === 0, `${label} should keep detailed download buttons inside the modal after generation`);
      }
    }
    if (expectedDownloadModalButtons.length > 0) {
      await assertDownloadModal({
        expectedButtons: expectedDownloadModalButtons,
        absentButtons: downloadModalAbsentButtons,
        clickButtons: downloadModalClickButtons,
        label: `${label} download modal`
      });
    }
    for (const button of postExerciseButtons) {
      await clickButtonByText(button);
    }
    await delay(250);
    await assertNoBrowserErrors(label);
    if (reloadAfterExercise) {
      await delay(500);
      await cdp.send("Page.reload", { ignoreCache: true });
      await waitForEval(() => `document.body.innerText.includes("Pixel Art Generation")`, `${label} reload returned to initial workspace`);
      await selectWorkflowTab(label);
      await waitForEval(() => `document.body.innerText.includes("Animation frames ready")`, `${label} persisted animation frames after reload`);
      await waitForEval(() => `document.body.innerText.includes("Generated from")`, `${label} persisted generated-from source after reload`);
      await clickButtonByText("Open advanced settings");
      await waitForEval(() => `document.querySelector(".animation-utility-modal")?.innerText.includes("256 x 256 px")`, `${label} persisted 256 x 256 px frame size after reload`);
      await clickSelector(".animation-utility-heading .icon-button");
      await waitForEval(() => `!document.querySelector(".animation-utility-modal")`, `${label} persisted settings modal closed`);
      if (expectedPreviewImages > 0) {
        await waitForEval(
          () => `document.querySelectorAll(".animation-preview img").length >= ${expectedPreviewImages}`,
          `${label} regenerated animation previews after reload`
        );
      }
      await assertNoBrowserErrors(`${label} reload persistence`);
    }
  }
  await maybeCapture(label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""));
  await selectWorkflowTab("Pixel Art Generation");
}

async function assertNormalizedAnimationFrames(label) {
  const metrics = await evaluate(`(async () => {
    const readState = (key) => new Promise((resolve, reject) => {
      const request = indexedDB.open("image-cockpit-local-state", 1);
      request.onerror = () => reject(request.error || new Error("Could not open IndexedDB"));
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction("state", "readonly");
        const getRequest = transaction.objectStore("state").get(key);
        getRequest.onsuccess = () => {
          db.close();
          resolve(getRequest.result || []);
        };
        getRequest.onerror = () => {
          db.close();
          reject(getRequest.error || new Error("Could not read IndexedDB"));
        };
      };
    });
    const loadImage = (src) => new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Could not load frame image"));
      image.src = src;
    });
    const frames = await readState("image-cockpit.v3.frames");
    const groups = new Map();
    frames
      .filter((frame) => frame.width === 256 && frame.height === 256 && frame.sourceId)
      .forEach((frame) => {
        const group = groups.get(frame.sourceId) || [];
        group.push(frame);
        groups.set(frame.sourceId, group);
      });
    const targetFrames = [...groups.values()]
      .sort((left, right) => right.length - left.length)
      .find((group) => group.length >= 40);
    if (!targetFrames) return { ok: false, reason: "missing generated animation frame group" };
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return { ok: false, reason: "missing canvas context" };
    const sampleFrames = targetFrames.slice(0, 12);
    const bboxes = [];
    for (const frame of sampleFrames) {
      const image = await loadImage(frame.dataUrl);
      context.clearRect(0, 0, 256, 256);
      context.drawImage(image, 0, 0, 256, 256);
      const data = context.getImageData(0, 0, 256, 256).data;
      let minX = 256;
      let minY = 256;
      let maxX = -1;
      let maxY = -1;
      let count = 0;
      for (let y = 0; y < 256; y += 1) {
        for (let x = 0; x < 256; x += 1) {
          if (data[(y * 256 + x) * 4 + 3] <= 12) continue;
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
          count += 1;
        }
      }
      if (count > 0) {
        bboxes.push({
          centerDelta: Math.abs(((minX + maxX + 1) / 2) - 128),
          bottom: maxY + 1,
          count
        });
      }
    }
    const maxCenterDelta = bboxes.length > 0 ? Math.max(...bboxes.map((box) => box.centerDelta)) : Infinity;
    const minBottom = bboxes.length > 0 ? Math.min(...bboxes.map((box) => box.bottom)) : 0;
    const maxBottom = bboxes.length > 0 ? Math.max(...bboxes.map((box) => box.bottom)) : 0;
    return {
      ok: bboxes.length >= 10 && maxCenterDelta <= 12 && minBottom >= 214 && maxBottom <= 238,
      frameCount: targetFrames.length,
      measured: bboxes.length,
      expectedSampleFrames: sampleFrames.length,
      maxCenterDelta,
      minBottom,
      maxBottom
    };
  })()`);
  assert(
    metrics.ok,
    `${label} should normalize animation frame cutouts around center and footline: ${JSON.stringify(metrics)}`
  );
}

async function assertSourceStatusRoundTrip(label, selector, { restoreSelectedResult = false } = {}) {
  const before = await pageSnapshot();
  const sourceName = await evaluate(`document.querySelector(${JSON.stringify(selector)} + " strong")?.textContent?.trim() || ""`);
  assert(sourceName, `${label} should expose a source name on its preview source chip`);
  assert(before.sourceStatusButtons > 0, `${label} should expose clickable preview source chips`);
  const resultName = before.canvasPreviewName;
  await clickSelector(selector);
  await waitForEval(
    () => `document.querySelector("canvas")?.dataset.previewName === ${JSON.stringify(sourceName)}`,
    `${label} source chip selects the source preview`
  );
  if (label === "Animation Generation") {
    await waitForEval(
      () => `document.querySelector(".animation-step.complete .source-preview")?.textContent.includes(${JSON.stringify(sourceName)})`,
      `${label} source card updates after source chip click`
    );
  }
  const after = await pageSnapshot();
  assert(
    after.canvasPreviewName === sourceName,
    `${label} should show source image in the main preview after source chip click, got ${after.canvasPreviewName}`
  );
  assert(
    after.text.includes("Source selected for animation generation"),
    `${label} should confirm the source is ready for another animation`
  );
  if (label === "Animation Generation") {
    assert(
      after.animationSourceCard.includes(sourceName),
      `${label} should keep the clicked source in the Animation Generation source card: source=${JSON.stringify(sourceName)}, card=${JSON.stringify(after.animationSourceCard)}, jobs=${after.codexJobRows}`
    );
    assert(!after.disabledButtons.includes("Generate Animation"), `${label} should allow generating another animation from the clicked source`);
  }
  if (restoreSelectedResult && resultName) {
    await clickHistoryItemByName(resultName);
    await waitForEval(
      () => `document.querySelector("canvas")?.dataset.previewName === ${JSON.stringify(resultName)}`,
      `${label} restores the generated animation result after source round trip`
    );
  }
}

async function selectWorkflowTab(label) {
  await waitForEval(
    () => `Array.from(document.querySelectorAll(".workflow-tabs button")).some((item) => item.innerText.replace(/\\s+/g, " ").trim() === ${JSON.stringify(label)})`,
    `${label} workflow tab button`
  );
  await evaluate(`(() => {
    const button = Array.from(document.querySelectorAll(".workflow-tabs button")).find((item) => item.innerText.replace(/\\s+/g, " ").trim() === ${JSON.stringify(label)});
    if (!button) throw new Error("Workflow tab not found: ${label}");
    button.click();
  })()`);
  await waitForEval(() => `document.body.innerText.includes(${JSON.stringify(label)})`, `${label} workflow tab`);
}

async function clickEffectCategory(label) {
  await clickButtonByText("Choose Effect");
  await waitForEval(() => `Boolean(document.querySelector(".effect-picker-modal-body"))`, `${label} effect picker opens`);
  await waitForEval(
    () => `Array.from(document.querySelectorAll(".effect-category-grid button")).some((item) => item.innerText.replace(/\\s+/g, " ").trim().startsWith(${JSON.stringify(label)}))`,
    `${label} effect category button`
  );
  await evaluate(`(() => {
    const button = Array.from(document.querySelectorAll(".effect-category-grid button")).find((item) => item.innerText.replace(/\\s+/g, " ").trim().startsWith(${JSON.stringify(label)}));
    if (!button) throw new Error("Effect category not found: ${label}");
    button.click();
  })()`);
  await waitForEval(
    () => `Array.from(document.querySelectorAll(".effect-category-grid button.selected")).some((item) => item.innerText.replace(/\\s+/g, " ").trim().startsWith(${JSON.stringify(label)}))`,
    `${label} effect category active`
  );
  await clickButtonByText("Use This Effect");
  await waitForEval(() => `!document.querySelector(".effect-picker-modal-body")`, `${label} effect picker closes`);
  await waitForEval(
    () => `document.querySelector(".effect-selected-summary")?.innerText.includes(${JSON.stringify(label)})`,
    `${label} selected effect summary`
  );
}

async function setPromptValue(value) {
  await evaluate(`(() => {
    const textarea = document.querySelector(".source-panel textarea");
    if (!textarea) throw new Error("Prompt textarea not found");
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set;
    setter.call(textarea, ${JSON.stringify(value)});
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    textarea.dispatchEvent(new Event("change", { bubbles: true }));
  })()`);
  await waitForEval(
    () => `document.querySelector(".source-panel textarea")?.value === ${JSON.stringify(value)}`,
    "prompt textarea value update"
  );
}

async function dragCanvasRegion() {
  const drag = await evaluate(`(() => {
    const canvas = document.querySelector("canvas");
    if (!canvas) throw new Error("Canvas not found for rectangle drag");
    const rect = canvas.getBoundingClientRect();
    return {
      startX: rect.left + rect.width * 0.34,
      startY: rect.top + rect.height * 0.32,
      endX: rect.left + rect.width * 0.58,
      endY: rect.top + rect.height * 0.55
    };
  })()`);
  await dispatchCanvasPointer("pointerdown", drag.startX, drag.startY, 1);
  await delay(40);
  await dispatchCanvasPointer("pointermove", drag.endX, drag.endY, 1);
  await delay(40);
  await dispatchCanvasPointer("pointerup", drag.endX, drag.endY, 0);
}

async function dispatchCanvasPointer(type, x, y, buttons) {
  await evaluate(`(() => {
    const canvas = document.querySelector("canvas");
    if (!canvas) throw new Error("Canvas not found for pointer dispatch");
    canvas.dispatchEvent(new PointerEvent(${JSON.stringify(type)}, {
      bubbles: true,
      cancelable: true,
      pointerId: 1,
      pointerType: "mouse",
      isPrimary: true,
      clientX: ${JSON.stringify(x)},
      clientY: ${JSON.stringify(y)},
      button: 0,
      buttons: ${JSON.stringify(buttons)}
    }));
  })()`);
}

async function clickButtonByText(label) {
  await evaluate(`(() => {
    const button = Array.from(document.querySelectorAll("button")).find((item) => item.innerText.replace(/\\s+/g, " ").trim() === ${JSON.stringify(label)});
    if (!button) throw new Error("Button not found: ${label}");
    button.click();
  })()`);
}

async function openPromptExamplesModal() {
  const isOpen = await evaluate(`Boolean(document.querySelector(".prompt-modal"))`);
  if (!isOpen) await clickButtonByText("Prompt Examples");
  await waitForEval(() => `document.querySelector(".prompt-modal")?.innerText.includes("Clockwork Mushroom Courier")`, "Prompt Examples modal");
}

async function clickPromptExampleCardButton(title, buttonLabel) {
  await evaluate(`(() => {
    const cards = Array.from(document.querySelectorAll(".prompt-card"));
    const card = cards.find((item) => item.innerText.includes(${JSON.stringify(title)}));
    if (!card) throw new Error("Prompt example card not found: ${title}");
    const button = Array.from(card.querySelectorAll("button"))
      .find((item) => item.innerText.replace(/\\s+/g, " ").trim() === ${JSON.stringify(buttonLabel)});
    if (!button) throw new Error("Prompt example button not found: ${title} / ${buttonLabel}");
    button.click();
  })()`);
}

async function clickButtonByAriaLabel(label) {
  await evaluate(`(() => {
    const button = Array.from(document.querySelectorAll("button")).find((item) => item.getAttribute("aria-label") === ${JSON.stringify(label)});
    if (!button) throw new Error("Button not found by aria-label: ${label}");
    button.click();
  })()`);
}

async function openDownloadModal() {
  await evaluate(`(() => {
    const button = document.querySelector(".workspace .result-download-action");
    if (!button) throw new Error("Download action button not found");
    button.click();
  })()`);
  await waitForEval(() => `Boolean(document.querySelector(".download-options-modal"))`, "Download modal opens");
}

async function assertDownloadModal({ expectedButtons, absentButtons = [], clickButtons = [], label }) {
  await openDownloadModal();
  const snapshot = await pageSnapshot();
  assert(snapshot.downloadModalVisible, `${label} should open the Download modal`);
  assert(
    snapshot.downloadModalButtons.length === expectedButtons.length,
    `${label} should show ${expectedButtons.length} download option(s), got ${snapshot.downloadModalButtons.length}: ${snapshot.downloadModalButtons.join(", ")}`
  );
  expectedButtons.forEach((button) => {
    assert(snapshot.downloadModalButtons.includes(button), `${label} missing modal option: ${button}`);
  });
  absentButtons.forEach((button) => {
    assert(!snapshot.downloadModalButtons.includes(button), `${label} should not show modal option: ${button}`);
  });
  for (const button of clickButtons) {
    await clickDownloadModalButtonByText(button);
  }
  if (await evaluate(`Boolean(document.querySelector(".download-options-modal"))`)) {
    await clickButtonByAriaLabel("Close downloads");
    await waitForEval(() => `!document.querySelector(".download-options-modal")`, `${label} modal closes`);
  }
}

async function installDownloadSpy() {
  await evaluate(`(() => {
    window.__uiSmokeDownloads = [];
    if (window.__uiSmokeDownloadSpyInstalled) return;
    const originalCreateObjectURL = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (object) => {
      if (object instanceof Blob) {
        const reader = new FileReader();
        reader.addEventListener("load", () => {
          window.__uiSmokeDownloads.push({ type: object.type, dataUrl: String(reader.result || "") });
        });
        reader.readAsDataURL(object);
      }
      return originalCreateObjectURL(object);
    };
    window.__uiSmokeDownloadSpyInstalled = true;
  })()`);
}

async function assertSelectedPreviewHasTransparentPixels(label) {
  const alpha = await inspectImageAlpha(`document.querySelector(".result-preview-image")?.src || document.querySelector(".history-item.selected img")?.src || ""`);
  assert(alpha.transparentPixels > 0, `${label}: expected transparent pixels, got ${JSON.stringify(alpha)}`);
  assert(alpha.opaquePixels > 0, `${label}: expected opaque pixels, got ${JSON.stringify(alpha)}`);
}

async function assertLatestDownloadHasTransparentPixels(label) {
  await waitForEval(() => `(window.__uiSmokeDownloads || []).length > 0`, "PNG download captured");
  const alpha = await inspectImageAlpha(`(window.__uiSmokeDownloads || []).at(-1)?.dataUrl || ""`);
  assert(alpha.transparentPixels > 0, `${label}: expected transparent pixels, got ${JSON.stringify(alpha)}`);
  assert(alpha.opaquePixels > 0, `${label}: expected opaque pixels, got ${JSON.stringify(alpha)}`);
}

async function inspectImageAlpha(dataUrlExpression) {
  return evaluate(`(async () => {
    const source = ${dataUrlExpression};
    if (!source) throw new Error("Image source not found for alpha inspection");
    const image = new Image();
    image.src = source;
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error("Could not load image for alpha inspection"));
    });
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Could not inspect image alpha");
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0);
    const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let transparentPixels = 0;
    let opaquePixels = 0;
    for (let index = 3; index < data.length; index += 4) {
      if (data[index] === 0) transparentPixels += 1;
      if (data[index] > 240) opaquePixels += 1;
    }
    return { width: canvas.width, height: canvas.height, transparentPixels, opaquePixels };
  })()`);
}

async function inspectEffectGifLoop() {
  return evaluate(`(async () => {
    const image = document.querySelector(".effect-gif-card img");
    if (!image?.src) return { found: false, loopCount: null };
    const response = await fetch(image.src);
    const bytes = new Uint8Array(await response.arrayBuffer());
    const signature = [78, 69, 84, 83, 67, 65, 80, 69, 50, 46, 48];
    for (let index = 0; index <= bytes.length - 19; index += 1) {
      if (bytes[index] !== 0x21 || bytes[index + 1] !== 0xff || bytes[index + 2] !== 0x0b) continue;
      let matches = true;
      for (let offset = 0; offset < signature.length; offset += 1) {
        if (bytes[index + 3 + offset] !== signature[offset]) {
          matches = false;
          break;
        }
      }
      if (!matches || bytes[index + 14] !== 0x03 || bytes[index + 15] !== 0x01) continue;
      return {
        found: true,
        loopCount: bytes[index + 16] | (bytes[index + 17] << 8),
        byteLength: bytes.length
      };
    }
    return { found: false, loopCount: null, byteLength: bytes.length };
  })()`);
}

async function waitForEffectGifLoop(label) {
  const deadline = Date.now() + 10000;
  let result = { found: false, loopCount: null };
  while (Date.now() < deadline) {
    result = await inspectEffectGifLoop();
    if (result.loopCount !== null) return result;
    await delay(100);
  }
  return result;
}

async function inspectDownloadedApng() {
  return evaluate(`(() => {
    const download = (window.__uiSmokeDownloads || []).slice().reverse().find((item) => {
      return item.type === "image/apng" || String(item.dataUrl || "").startsWith("data:image/apng");
    });
    if (!download?.dataUrl) return { found: false, frameCount: null, loopCount: null, reason: "missing-download" };
    const base64 = String(download.dataUrl).split(",")[1] || "";
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    for (let index = 0; index < signature.length; index += 1) {
      if (bytes[index] !== signature[index]) return { found: false, frameCount: null, loopCount: null, reason: "bad-signature" };
    }
    const read32 = (offset) => ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;
    for (let offset = 8; offset + 12 <= bytes.length;) {
      const length = read32(offset);
      const type = String.fromCharCode(bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7]);
      const dataOffset = offset + 8;
      if (type === "acTL") {
        return {
          found: true,
          frameCount: read32(dataOffset),
          loopCount: read32(dataOffset + 4),
          byteLength: bytes.length
        };
      }
      offset = dataOffset + length + 4;
    }
    return { found: false, frameCount: null, loopCount: null, reason: "missing-acTL", byteLength: bytes.length };
  })()`);
}

async function clickSelector(selector) {
  await evaluate(`(() => {
    const target = document.querySelector(${JSON.stringify(selector)});
    if (!target) throw new Error("Selector not found: ${selector}");
    target.click();
  })()`);
}

async function clickDownloadModalButtonByText(label) {
  await evaluate(`(() => {
    const button = Array.from(document.querySelectorAll(".download-options-modal button")).find((item) => item.innerText.replace(/\\s+/g, " ").trim() === ${JSON.stringify(label)});
    if (!button) throw new Error("Download modal button not found: ${label}");
    button.click();
  })()`);
}

async function clickHistoryItemByName(name) {
  await evaluate(`(() => {
    const item = Array.from(document.querySelectorAll(".history-item")).find((node) => node.innerText.includes(${JSON.stringify(name)}));
    if (!item) throw new Error("History item not found: ${name}");
    item.click();
  })()`);
}

async function setFileInputFiles(selector, files) {
  const { root } = await cdp.send("DOM.getDocument", { depth: 1 });
  const { nodeId } = await cdp.send("DOM.querySelector", { nodeId: root.nodeId, selector });
  if (!nodeId) throw new Error(`File input not found: ${selector}`);
  await cdp.send("DOM.setFileInputFiles", { nodeId, files });
  await delay(250);
}

async function waitForButtonEnabled(label) {
  await waitForEval(
    () => `Array.from(document.querySelectorAll("button")).some((button) => button.innerText.replace(/\\s+/g, " ").trim() === ${JSON.stringify(label)} && !button.disabled)`,
    `${label} button enabled`
  );
}

async function assertNoBrowserErrors(label) {
  const errors = await evaluate(`window.__uiSmokeErrors || []`);
  assert(errors.length === 0, `${label} browser errors: ${errors.join("; ")}`);
}

async function pageSnapshot() {
  return evaluate(`(() => ({
    text: document.body.innerText.replace(/\\s+/g, " ").trim(),
    guidedOptions: Array.from(document.querySelectorAll(".guided-option strong")).map((node) => node.textContent.trim()),
    summary: document.querySelector(".workflow-summary")?.innerText.replace(/\\s+/g, " ").trim() || "",
    buttons: Array.from(document.querySelectorAll("button")).map((button) => button.innerText.replace(/\\s+/g, " ").trim()).filter(Boolean),
    disabledButtons: Array.from(document.querySelectorAll("button:disabled")).map((button) => button.innerText.replace(/\\s+/g, " ").trim()).filter(Boolean),
    workflowTabsInsidePanel: Boolean(document.querySelector(".source-panel > .workflow-tabs")),
    workflowTabsLeadHierarchy: Boolean(document.querySelector(".source-panel > .panel-title + .workflow-tabs + .workflow-summary + .cockpit-health-panel")),
    workflowTabsTopOffset: Math.round((document.querySelector(".workflow-tabs")?.getBoundingClientRect().top || 0) - (document.querySelector(".source-panel")?.getBoundingClientRect().top || 0)),
    workflowTabsWithinInitialViewport: (() => {
      const rect = document.querySelector(".source-panel > .workflow-tabs")?.getBoundingClientRect();
      return Boolean(rect && rect.top >= 0 && rect.bottom <= window.innerHeight);
    })(),
    workflowTabsInTopbar: Boolean(document.querySelector(".topbar .workflow-tabs")),
    canvasVisible: Boolean(document.querySelector("canvas")),
    canvasPanelVisible: Boolean(document.querySelector(".canvas-panel")),
    annotationToolbarVisible: Boolean(document.querySelector(".canvas-panel .toolbar")),
    canvasPreviewMode: document.querySelector("canvas")?.dataset.previewMode || "",
    canvasPreviewName: document.querySelector("canvas")?.dataset.previewName || "",
    resultPreviewImages: document.querySelectorAll(".result-preview-image").length,
    resultPreviewLoaded: Boolean(document.querySelector(".result-preview-image")?.naturalWidth),
    resultPreviewFrameHeight: Math.round(document.querySelector(".result-preview-frame")?.getBoundingClientRect().height || 0),
    directionPreviewRows: document.querySelectorAll(".direction-preview-row").length,
    resultDownloadPanelInSource: Boolean(document.querySelector(".source-panel .result-download-panel")),
    resultDownloadPanelInWorkspace: Boolean(document.querySelector(".workspace .result-download-panel")),
    resultDownloadPanelComplete: Boolean(document.querySelector(".workspace .result-download-panel.complete")),
    resultDownloadPanelHeight: Math.round(document.querySelector(".workspace .result-download-panel")?.getBoundingClientRect().height || 0),
    resultDownloadActionButtons: document.querySelectorAll(".workspace .result-download-action").length,
    resultDownloadGridButtonsInWorkspace: document.querySelectorAll(".workspace .result-download-grid button").length,
    downloadModalVisible: Boolean(document.querySelector(".download-options-modal")),
    downloadModalButtons: Array.from(document.querySelectorAll(".download-options-modal .result-download-grid button"))
      .map((button) => button.innerText.replace(/\\s+/g, " ").trim())
      .filter(Boolean),
    animationSourceStatus: document.querySelector(".animation-source-status")?.innerText || "",
    animationSourceButton: Boolean(document.querySelector(".animation-source-status.source-status-button")),
    animationSourceCard: document.querySelector(".animation-step.complete .source-preview")?.textContent.replace(/\\s+/g, " ").trim() || "",
    imageEditSourceStatus: document.querySelector(".image-edit-source-status")?.innerText || "",
    imageEditSourceButton: Boolean(document.querySelector(".image-edit-source-status.source-status-button")),
    imageEditSourceImages: document.querySelectorAll(".image-edit-source-status img").length,
    sourceStatusButtons: document.querySelectorAll(".source-status-button").length,
    finalEditNoticeVisible: Boolean(document.querySelector(".edit-final-notice")),
    annotationRegionRows: document.querySelectorAll(".annotation-region-row").length,
    annotationComments: Array.from(document.querySelectorAll(".annotation-comment-field")).map((field) => field.value),
    editCompareVisible: Boolean(document.querySelector(".image-edit-compare")),
    editCompareImages: document.querySelectorAll(".edit-compare-grid img").length,
    historyItems: document.querySelectorAll(".history-item").length,
    historyVisibleCount: document.querySelector(".history-list")?.dataset.visibleCount || "",
    historyTotalCount: document.querySelector(".history-list")?.dataset.totalCount || "",
    codexFailureCards: document.querySelectorAll(".codex-failure-card").length,
    codexLogPanelVisible: Boolean(document.querySelector(".codex-log-panel")),
    codexLogFullscreen: Boolean(document.querySelector(".codex-log-panel.fullscreen")),
    codexLogFullscreenButtons: document.querySelectorAll(".codex-log-fullscreen-button").length,
    codexLogCards: document.querySelectorAll(".codex-log-card").length,
    spriteBenchVisible: Boolean(document.querySelector(".sprite-bench")),
    codexJobRows: document.querySelectorAll(".codex-job-row").length,
    codexJobShelfInHistory: Boolean(document.querySelector(".history-panel > .codex-job-shelf")),
    codexJobShelfInSource: Boolean(document.querySelector(".source-panel > .codex-job-shelf")),
    codexJobShelfBeforeHistoryList: (() => {
      const shelf = document.querySelector(".history-panel > .codex-job-shelf");
      const list = document.querySelector(".history-panel > .history-list");
      if (!shelf || !list) return false;
      return Boolean(shelf.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING);
    })(),
    animationPreviewImages: document.querySelectorAll(".animation-preview img").length,
    spriteSheetGridOverlays: document.querySelectorAll(".sprite-sheet-grid-overlay").length,
    promptPreviewImages: document.querySelectorAll(".prompt-card-preview img").length,
    animationPresetSampleSprites: document.querySelectorAll(".animation-sample-sprite").length,
    animationPresetModalSampleSprites: document.querySelectorAll(".animation-preset-modal .animation-sample-sprite").length,
    animationLibraryCards: document.querySelectorAll(".animation-library-card").length,
    workspaceExportAnimationPackButtons: Array.from(document.querySelectorAll(".download-options-modal .result-download-grid button"))
      .filter((button) => button.innerText.replace(/\\s+/g, " ").trim() === "Export Animation Pack").length,
    promptRawTextBlocks: document.querySelectorAll(".prompt-card-text, .prompt-card-negative").length
  }))()`);
}

async function maybeCapture(name) {
  if (!screenshotDir) return;
  const screenshot = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  await writeFile(join(screenshotDir, `ui-smoke-${name}-1280x720.png`), Buffer.from(screenshot.data, "base64"));
}

async function evaluate(expression) {
  const result = await cdp.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text || "Browser evaluation failed");
  }
  return result.result.value;
}

async function waitForEval(expressionFactory, label, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await evaluate(expressionFactory())) return;
    await delay(100);
  }
  let detail = "";
  try {
    const snapshot = await evaluate(`({
      url: location.href,
      title: document.title,
      text: document.body?.innerText?.slice(0, 1200) || "",
      errors: window.__uiSmokeErrors || []
    })`);
    detail = ` ${JSON.stringify(snapshot)}`;
  } catch (error) {
    detail = ` Unable to collect page snapshot: ${error.message}`;
  }
  throw new Error(`Timed out waiting for ${label}.${detail}`);
}

function startProcess(command, args, env = {}) {
  const child = spawn(command, args, {
    cwd: process.cwd(),
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });
  child.output = "";
  child.stdout.on("data", (chunk) => {
    child.output += chunk.toString("utf8");
  });
  child.stderr.on("data", (chunk) => {
    child.output += chunk.toString("utf8");
  });
  child.on("error", (error) => {
    child.output += `\n${error.message}`;
  });
  return child;
}

async function stopProcess(child) {
  if (!child || child.exitCode !== null || child.killed) return;
  child.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => child.once("close", resolve)),
    delay(1500)
  ]);
}

async function waitForHttp(url, label) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Keep waiting while the server starts.
    }
    await delay(150);
  }
  throw new Error(`Timed out waiting for ${label} at ${url}`);
}

async function waitForPageTarget(port) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      if (response.ok) {
        const targets = await response.json();
        const target = targets.find((item) => item.type === "page" && item.webSocketDebuggerUrl);
        if (target) return target;
      }
    } catch {
      // Keep waiting while the browser starts.
    }
    await delay(150);
  }
  throw new Error("Timed out waiting for browser debugging target");
}

async function createMockAnimationPack() {
  const zip = new JSZip();
  const manifest = {
    schema: "image-cockpit.animation.v1",
    title: "Smoke Run Pack",
    kind: "user",
    action: "run",
    directions: ["front", "front three-quarter", "side", "back three-quarter", "back"],
    grid: { columns: 8, rows: 5, gutter: 0 },
    cell: { width: 256, height: 256 },
    framesPerDirection: 8,
    playback: "ping-pong-reverse",
    createdAt: "2026-06-25T00:00:00.000Z",
    createdWith: "Image Cockpit for Codex Workflows",
    license: "ui-smoke",
    sourceNote: "Mock pack generated by scripts/ui-smoke.mjs.",
    promptSummary: "",
    tags: ["smoke", "run", "sprite"],
    files: {
      sheet: "sheet.png",
      previewGif: "preview.gif",
      previewWebp: "preview.webp",
      metadata: "metadata.json"
    }
  };
  zip.file("manifest.json", JSON.stringify(manifest, null, 2));
  zip.file("sheet.png", await readFile("public/samples/run-cycle-sheet.png"));
  zip.file("metadata.json", JSON.stringify({ source: "ui-smoke" }, null, 2));
  return zip.generateAsync({ type: "uint8array" });
}

function makeFullBodySourcePng() {
  const width = 320;
  const height = 960;
  const bytesPerPixel = 4;
  const stride = 1 + width * bytesPerPixel;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * stride;
    raw[rowOffset] = 0;
    for (let x = 0; x < width; x += 1) {
      const offset = rowOffset + 1 + x * bytesPerPixel;
      raw[offset] = 0;
      raw[offset + 1] = 0;
      raw[offset + 2] = 0;
      raw[offset + 3] = 0;
      const centerX = width / 2;
      const head = (x - centerX) ** 2 + (y - 118) ** 2 <= 54 ** 2;
      const hair = (x - centerX) ** 2 + (y - 76) ** 2 <= 64 ** 2;
      const body = Math.abs(x - centerX) <= 48 && y >= 168 && y <= 520;
      const leftArm = Math.abs(x - (centerX - 74)) <= 14 && y >= 205 && y <= 500;
      const rightArm = Math.abs(x - (centerX + 74)) <= 14 && y >= 205 && y <= 500;
      const leftLeg = Math.abs(x - (centerX - 30)) <= 18 && y >= 518 && y <= 840;
      const rightLeg = Math.abs(x - (centerX + 30)) <= 18 && y >= 518 && y <= 840;
      const feet = y >= 838 && y <= 888 && Math.abs(x - centerX) <= 88;
      const staff = Math.abs(x - (centerX + 108)) <= 6 && y >= 96 && y <= 892;
      if (hair || staff) {
        raw[offset] = 36;
        raw[offset + 1] = 30;
        raw[offset + 2] = 74;
        raw[offset + 3] = 255;
      }
      if (head) {
        raw[offset] = 236;
        raw[offset + 1] = 186;
        raw[offset + 2] = 132;
        raw[offset + 3] = 255;
      }
      if (body || leftArm || rightArm || leftLeg || rightLeg || feet) {
        raw[offset] = body ? 34 : 26;
        raw[offset + 1] = body ? 122 : 82;
        raw[offset + 2] = body ? 95 : 70;
        raw[offset + 3] = 255;
      }
    }
  }
  return makePng(width, height, raw);
}

function makeDirectionSplitFixturePng(directionIndex = 0) {
  const columns = 4;
  const rows = 2;
  const cellWidth = 256;
  const cellHeight = 256;
  const width = columns * cellWidth;
  const height = rows * cellHeight;
  const bytesPerPixel = 4;
  const stride = 1 + width * bytesPerPixel;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * stride;
    raw[rowOffset] = 0;
    for (let x = 0; x < width; x += 1) {
      const offset = rowOffset + 1 + x * bytesPerPixel;
      raw[offset] = 0;
      raw[offset + 1] = 255;
      raw[offset + 2] = 0;
      raw[offset + 3] = 255;
      const column = Math.floor(x / cellWidth);
      const row = Math.floor(y / cellHeight);
      const localX = x % cellWidth;
      const localY = y % cellHeight;
      const centerX = Math.round(cellWidth / 2 + Math.sin(column / Math.max(1, columns - 1) * Math.PI * 2) * 28);
      const centerY = Math.round(cellHeight * 0.58 + row * 3 + directionIndex * 0.5);
      const poseSwing = Math.round(Math.sin(column / Math.max(1, columns - 1) * Math.PI * 2) * 24);
      const body = Math.abs(localX - centerX) < 54 && Math.abs(localY - centerY) < 78;
      const head = (localX - centerX) ** 2 + (localY - (centerY - 82)) ** 2 < 42 ** 2;
      const feet = Math.abs(localX - centerX) < 72 && Math.abs(localY - (centerY + 88)) < 12;
      const leftArm = Math.abs(localX - (centerX - 62 - poseSwing * 0.45)) < 13 && localY >= centerY - 52 && localY <= centerY + 44;
      const rightArm = Math.abs(localX - (centerX + 62 + poseSwing * 0.45)) < 13 && localY >= centerY - 52 && localY <= centerY + 44;
      const leftLeg = Math.abs(localX - (centerX - 30 + poseSwing * 0.35)) < 15 && localY >= centerY + 40 && localY <= centerY + 98;
      const rightLeg = Math.abs(localX - (centerX + 30 - poseSwing * 0.35)) < 15 && localY >= centerY + 40 && localY <= centerY + 98;
      if (body || head || feet || leftArm || rightArm || leftLeg || rightLeg) {
        raw[offset] = 32 + row * 28 + directionIndex * 18 + column * 18;
        raw[offset + 1] = 44 + column * 26;
        raw[offset + 2] = 74 + row * 18 + column * 12;
        raw[offset + 3] = 255;
      }
    }
  }
  return makePng(width, height, raw);
}

function makePng(width, height, raw) {
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", Buffer.concat([u32(width), u32(height), Buffer.from([8, 6, 0, 0, 0])])),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0))
  ]);
}

function chunk(type, data) {
  const typeBytes = Buffer.from(type, "ascii");
  return Buffer.concat([u32(data.length), typeBytes, data, u32(crc32(Buffer.concat([typeBytes, data])))]);
}

function u32(value) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32BE(value >>> 0, 0);
  return buffer;
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function mockRunnerSource() {
  return `import { existsSync } from "node:fs";
import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { deflateSync } from "node:zlib";

if (process.argv.includes("--help")) {
  console.log("mock codex runner");
  process.exit(0);
}

let stdin = "";
process.stdin.setEncoding("utf8");
for await (const chunk of process.stdin) {
  stdin += chunk;
}

if (!stdin.includes("built-in image_gen")) {
  console.error("missing imagegen runner instructions");
  process.exit(2);
}

const jobId = process.env.IMAGE_COCKPIT_JOB_ID;
const jobPath = process.env.IMAGE_COCKPIT_JOB_PATH;
const outboxDir = process.env.IMAGE_COCKPIT_OUTBOX_DIR;
if (!jobId || !jobPath || !outboxDir) {
  console.error("missing Image Cockpit runner environment");
  process.exit(3);
}

const job = JSON.parse(await readFile(jobPath, "utf8"));
console.log(\`mock runner accepted \${jobId} \${job.workflowMode || "unknown"}\`);
for (let index = 1; index <= 28; index += 1) {
  console.log(\`mock runner progress \${jobId} \${String(index).padStart(2, "0")}/28\`);
}
console.log(\`mock runner tail marker \${jobId}\`);
const delayMs = Number(process.env.IMAGE_COCKPIT_MOCK_RUNNER_DELAY_MS || 0);
if (delayMs > 0) {
  await new Promise((resolve) => setTimeout(resolve, delayMs));
}

if (job.prompt.includes("policy blocked ui smoke")) {
  await writeFile(join(outboxDir, \`\${jobId}-blocked.json\`), JSON.stringify({
    status: "blocked",
    reasonKind: "policy_or_safety",
    userMessage: "The image could not be generated.",
    suggestion: "Revise the prompt and try again."
  }, null, 2), "utf8");
  console.log(\`mock blocked sidecar \${jobId}\`);
  process.exit(0);
}

if (job.prompt.includes("imagegen unavailable ui smoke")) {
  await writeFile(join(outboxDir, \`\${jobId}-blocked.json\`), JSON.stringify({
    status: "blocked",
    reasonKind: "imagegen_unavailable",
    userMessage: "Image generation is not available in this Codex environment.",
    suggestion: "Use manual handoff or another provider."
  }, null, 2), "utf8");
  console.log(\`mock imagegen unavailable sidecar \${jobId}\`);
  process.exit(0);
}

if (job.workflowMode === "image-edit") {
  const comments = (job.annotationContext?.annotations || []).map((annotation) => annotation.comment || "").join("\\n");
  const annotation = (job.annotationContext?.annotations || [])[0] || {};
  const promptContract = [job.prompt, job.jobNotes, ...(job.notes || [])].join("\\n");
  if (!job.selectedImage?.assetPath || job.annotationContext?.annotationCount < 1 || !comments.includes("text X")) {
    console.error("image edit job missing selected asset, numbered annotation, or comment");
    process.exit(4);
  }
  if (!annotation.imageRectNormalized || !annotation.imageRectPixels || !promptContract.includes("Preserve the original canvas size and aspect ratio") || !promptContract.includes("Do not zoom in, crop, or reframe")) {
    console.error("image edit job missing source-image coordinate metadata or full-body no-crop prompt contract");
    process.exit(4);
  }
  await writeFile(join(outboxDir, \`\${jobId}.png\`), makeSpriteSheetPng(320, 960, 1, 1, 320, 960, [0, 0, 0, 0]));
  console.log(\`mock transparent image edit completed \${jobId}\`);
  process.exit(0);
}

if (job.prompt.includes("temp candidate contact filter setup")) {
  await writeFile(join(outboxDir, \`\${jobId}.png\`), makeSpriteSheetPng(512, 512, 1, 1, 512, 512, [0, 255, 0, 255]));
  await new Promise((resolve) => setTimeout(resolve, 80));
  await writeFile(join(outboxDir, \`\${jobId}-candidate-contact.tmp.png\`), makeSpriteSheetPng(1024, 1024, 1, 1, 1024, 1024, [0, 255, 0, 255]));
  await writeFile(join(outboxDir, \`\${jobId}-preview-grid.png\`), makeSpriteSheetPng(1024, 1024, 1, 1, 1024, 1024, [0, 255, 0, 255]));
  console.log(\`mock temp candidate contact fixture completed \${jobId}\`);
  process.exit(0);
}

if (job.workflowMode === "effect-animation") {
  const effectContext = job.effectContext || {};
  const columns = Number(effectContext.layout?.columns || job.spriteContext?.grid?.columns || 4);
  const rows = Number(effectContext.layout?.rows || job.spriteContext?.grid?.rows || 2);
  const cellWidth = Number(effectContext.frameSize?.width || job.spriteContext?.cell?.width || 128);
  const cellHeight = Number(effectContext.frameSize?.height || job.spriteContext?.cell?.height || 128);
  const frameCount = Number(effectContext.frameCount || job.spriteContext?.frames || columns * rows);
  const png = makeEffectSheetPng(columns * cellWidth, rows * cellHeight, columns, rows, cellWidth, cellHeight, frameCount);
  await writeFile(join(outboxDir, \`\${jobId}-effect-sheet.png\`), png);
  await writeFile(join(outboxDir, \`\${jobId}-effect.json\`), JSON.stringify({
    schema: "image-cockpit.effect-animation.v1",
    jobId,
    effectContext,
    transparent: true
  }, null, 2), "utf8");
  console.log(\`mock effect animation completed \${jobId}\`);
  process.exit(0);
}

if (job.workflowMode !== "sprite-generate") {
  await writeFile(join(outboxDir, \`\${jobId}.png\`), makeSpriteSheetPng(512, 512, 1, 1, 512, 512, [0, 255, 0, 255]));
  console.log(\`mock exact image completed \${jobId}\`);
  process.exit(0);
}

const columns = Number(job.spriteContext?.grid?.columns || 8);
const rows = Number(job.spriteContext?.grid?.rows || 5);
const cellWidth = Number(job.spriteContext?.cell?.width || 256);
const cellHeight = Number(job.spriteContext?.cell?.height || 256);
const chroma = job.spriteContext?.chromaKey === "magenta" ? [255, 0, 255, 255] : [0, 255, 0, 255];
if (job.spriteContext?.variant === "standard") {
  const framesPerDirection = [4, 6, 8, 12].includes(Number(job.spriteContext?.framesPerDirection))
    ? Number(job.spriteContext.framesPerDirection)
    : 8;
  const directionColumns = framesPerDirection === 6 ? 3 : 4;
  const directionRows = framesPerDirection === 4 ? 1 : framesPerDirection === 12 ? 3 : 2;
  const directionSlugs = ["front", "front-three-quarter", "side", "back-three-quarter", "back"];
  const directionNames = ["front", "front three-quarter", "side", "back three-quarter", "back"];
  if (existsSync(${JSON.stringify(mockManifestFirstDirectionSplitMarkerPath)})) {
    await rm(${JSON.stringify(mockManifestFirstDirectionSplitMarkerPath)}, { force: true });
    for (const [index, slug] of directionSlugs.entries()) {
      if (slug === "side") continue;
      const png = makeSpriteSheetPng(cellWidth * directionColumns, cellHeight * directionRows, directionColumns, directionRows, cellWidth, cellHeight, chroma, index);
      await writeFile(join(outboxDir, \`\${jobId}-\${slug}.png\`), png);
    }
    await writeFile(join(outboxDir, \`\${jobId}-manifest.json\`), JSON.stringify({
      schema: "image-cockpit.direction-split-animation.v1",
      jobId,
      action: job.spriteContext?.action || "idle",
      directions: directionNames,
      framesPerDirection,
      grid: { columns: directionColumns, rows: directionRows, gutter: 0 },
      cell: { width: cellWidth, height: cellHeight },
      files: Object.fromEntries(directionSlugs.map((slug, index) => [directionNames[index], \`\${jobId}-\${slug}.png\`]))
    }, null, 2), "utf8");
    console.log(\`mock manifest-first direction split waiting for side \${jobId}\`);
    await new Promise((resolve) => setTimeout(resolve, 5200));
    const sideIndex = directionSlugs.indexOf("side");
    const sidePng = makeSpriteSheetPng(cellWidth * directionColumns, cellHeight * directionRows, directionColumns, directionRows, cellWidth, cellHeight, chroma, sideIndex);
    await writeFile(join(outboxDir, \`\${jobId}-side.png\`), sidePng);
    console.log(\`mock manifest-first direction split recovered \${jobId}\`);
    process.exit(0);
  }
  if (existsSync(${JSON.stringify(mockPartialDirectionSplitMarkerPath)})) {
    await rm(${JSON.stringify(mockPartialDirectionSplitMarkerPath)}, { force: true });
    for (const [index, slug] of directionSlugs.entries()) {
      if (index > 1) continue;
      const png = makeSpriteSheetPng(cellWidth * directionColumns, cellHeight * directionRows, directionColumns, directionRows, cellWidth, cellHeight, chroma, index);
      await writeFile(join(outboxDir, \`\${jobId}-\${slug}.png\`), png);
    }
    console.log(\`mock partial direction split waiting for manifest \${jobId}\`);
    await new Promise((resolve) => setTimeout(resolve, 5200));
    for (const [index, slug] of directionSlugs.entries()) {
      const png = makeSpriteSheetPng(cellWidth * directionColumns, cellHeight * directionRows, directionColumns, directionRows, cellWidth, cellHeight, chroma, index);
      await writeFile(join(outboxDir, \`\${jobId}-\${slug}.png\`), png);
    }
    await writeFile(join(outboxDir, \`\${jobId}-qa.json\`), JSON.stringify({ status: "pass", ignoredByUi: true }, null, 2), "utf8");
    await writeFile(join(outboxDir, \`\${jobId}-manifest.json\`), JSON.stringify({
      schema: "image-cockpit.direction-split-animation.v1",
      jobId,
      action: job.spriteContext?.action || "idle",
      directions: directionNames,
      framesPerDirection,
      grid: { columns: directionColumns, rows: directionRows, gutter: 0 },
      cell: { width: cellWidth, height: cellHeight },
      files: Object.fromEntries(directionSlugs.map((slug, index) => [directionNames[index], \`\${jobId}-\${slug}.png\`]))
    }, null, 2), "utf8");
    console.log(\`mock partial direction split recovered \${jobId}\`);
    process.exit(0);
  }
  if (existsSync(${JSON.stringify(mockQualityGateFailureMarkerPath)})) {
    for (const [index, slug] of directionSlugs.entries()) {
      const png = makeSpriteSheetPng(cellWidth * directionColumns, cellHeight * directionRows, directionColumns, directionRows, cellWidth, cellHeight, chroma, index);
      await writeFile(join(outboxDir, \`\${jobId}-\${slug}.png\`), png);
    }
    await writeFile(join(outboxDir, \`\${jobId}-manifest.json\`), JSON.stringify({
      schema: "image-cockpit.direction-split-animation.v1",
      jobId,
      action: job.spriteContext?.action || "idle",
      directions: directionNames,
      framesPerDirection,
      grid: { columns: directionColumns, rows: directionRows, gutter: 0 },
      cell: { width: cellWidth, height: cellHeight },
      files: Object.fromEntries(directionSlugs.map((slug, index) => [directionNames[index], \`\${jobId}-\${slug}.png\`])),
      qualityGate: {
        classification: "quality-failed",
        reason: "Chroma key removal failed",
        code: "chroma-key-removal-failed",
        historyAllowed: false,
        downloadAllowed: false,
        retryable: true
      }
    }, null, 2), "utf8");
    console.log(\`mock quality gate direction split failure \${jobId}\`);
    process.exit(0);
  }
  if (existsSync(${JSON.stringify(mockImportFailureMarkerPath)})) {
    for (const [index, slug] of directionSlugs.entries()) {
      if (slug === "side") continue;
      const png = makeSpriteSheetPng(cellWidth * directionColumns, cellHeight * directionRows, directionColumns, directionRows, cellWidth, cellHeight, chroma, index);
      await writeFile(join(outboxDir, \`\${jobId}-\${slug}.png\`), png);
    }
    await writeFile(join(outboxDir, \`\${jobId}-manifest.json\`), JSON.stringify({
      schema: "image-cockpit.direction-split-animation.v1",
      jobId,
      action: job.spriteContext?.action || "idle",
      directions: directionNames,
      framesPerDirection,
      grid: { columns: directionColumns, rows: directionRows, gutter: 0 },
      cell: { width: cellWidth, height: cellHeight },
      files: Object.fromEntries(directionSlugs.map((slug, index) => [directionNames[index], \`\${jobId}-\${slug}.png\`]))
    }, null, 2), "utf8");
    console.log(\`mock incomplete direction split completed \${jobId}\`);
    process.exit(0);
  }
  for (const [index, slug] of directionSlugs.entries()) {
    const png = makeSpriteSheetPng(cellWidth * directionColumns, cellHeight * directionRows, directionColumns, directionRows, cellWidth, cellHeight, chroma, index);
    await writeFile(join(outboxDir, \`\${jobId}-\${slug}.png\`), png);
  }
  await writeFile(join(outboxDir, \`\${jobId}-manifest.json\`), JSON.stringify({
    schema: "image-cockpit.direction-split-animation.v1",
    jobId,
    action: job.spriteContext?.action || "idle",
    directions: directionNames,
    framesPerDirection,
    grid: { columns: directionColumns, rows: directionRows, gutter: 0 },
    cell: { width: cellWidth, height: cellHeight },
    files: Object.fromEntries(directionSlugs.map((slug, index) => [directionNames[index], \`\${jobId}-\${slug}.png\`]))
  }, null, 2), "utf8");
  console.log(\`mock direction split sprite sheet completed \${jobId}\`);
  process.exit(0);
}

const width = columns * cellWidth;
const height = rows * cellHeight;
const png = makeSpriteSheetPng(width, height, columns, rows, cellWidth, cellHeight, chroma);
await writeFile(join(outboxDir, \`\${jobId}-mock-sprite-sheet.png\`), png);
console.log(\`mock sprite sheet completed \${jobId}\`);

function makeEffectSheetPng(width, height, columns, rows, cellWidth, cellHeight, frameCount) {
  const bytesPerPixel = 4;
  const stride = 1 + width * bytesPerPixel;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * stride;
    raw[rowOffset] = 0;
    for (let x = 0; x < width; x += 1) {
      const offset = rowOffset + 1 + x * bytesPerPixel;
      raw[offset + 3] = 0;
      const column = Math.floor(x / cellWidth);
      const row = Math.floor(y / cellHeight);
      const frameIndex = row * columns + column;
      if (frameIndex >= frameCount) continue;
      const localX = x % cellWidth;
      const localY = y % cellHeight;
      const cx = cellWidth / 2;
      const cy = cellHeight / 2;
      const dx = localX - cx;
      const dy = localY - cy;
      const distance = Math.hypot(dx, dy);
      const progress = frameIndex / Math.max(1, frameCount - 1);
      const radius = cellWidth * (0.18 + progress * 0.26);
      const angle = Math.atan2(dy, dx);
      const targetAngle = -1.8 + progress * 3.2;
      const angleDelta = Math.abs(Math.atan2(Math.sin(angle - targetAngle), Math.cos(angle - targetAngle)));
      const arc = Math.abs(distance - radius) < 5 + progress * 3 && angleDelta < 0.75;
      const spark = Math.abs(dx - (progress - 0.5) * cellWidth * 0.34) < 4 && Math.abs(dy + Math.sin(progress * Math.PI) * 18) < 22;
      if (arc || spark) {
        raw[offset] = 64 + Math.round(progress * 90);
        raw[offset + 1] = 210 + Math.round(progress * 30);
        raw[offset + 2] = 240;
        raw[offset + 3] = arc ? 230 : 180;
      }
    }
  }
  return makePng(width, height, raw);
}

function makeSpriteSheetPng(width, height, columns, rows, cellWidth, cellHeight, chroma, directionIndex = 0) {
  const bytesPerPixel = 4;
  const stride = 1 + width * bytesPerPixel;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * stride;
    raw[rowOffset] = 0;
    for (let x = 0; x < width; x += 1) {
      const offset = rowOffset + 1 + x * bytesPerPixel;
      raw[offset] = chroma[0];
      raw[offset + 1] = chroma[1];
      raw[offset + 2] = chroma[2];
      raw[offset + 3] = chroma[3];
      const column = Math.floor(x / cellWidth);
      const row = Math.floor(y / cellHeight);
      const localX = x % cellWidth;
      const localY = y % cellHeight;
      const centerX = Math.round(cellWidth / 2 + Math.sin(column / Math.max(1, columns - 1) * Math.PI * 2) * 28);
      const centerY = Math.round(cellHeight * 0.58 + row * 3 + directionIndex * 0.5);
      const poseSwing = Math.round(Math.sin(column / Math.max(1, columns - 1) * Math.PI * 2) * 24);
      const body = Math.abs(localX - centerX) < 54 && Math.abs(localY - centerY) < 78;
      const head = (localX - centerX) ** 2 + (localY - (centerY - 82)) ** 2 < 42 ** 2;
      const feet = Math.abs(localX - centerX) < 72 && Math.abs(localY - (centerY + 88)) < 12;
      const leftArm = Math.abs(localX - (centerX - 62 - poseSwing * 0.45)) < 13 && localY >= centerY - 52 && localY <= centerY + 44;
      const rightArm = Math.abs(localX - (centerX + 62 + poseSwing * 0.45)) < 13 && localY >= centerY - 52 && localY <= centerY + 44;
      const leftLeg = Math.abs(localX - (centerX - 30 + poseSwing * 0.35)) < 15 && localY >= centerY + 40 && localY <= centerY + 98;
      const rightLeg = Math.abs(localX - (centerX + 30 - poseSwing * 0.35)) < 15 && localY >= centerY + 40 && localY <= centerY + 98;
      if (body || head || feet || leftArm || rightArm || leftLeg || rightLeg) {
        raw[offset] = 32 + row * 28 + directionIndex * 18 + column * 18;
        raw[offset + 1] = 44 + column * 26;
        raw[offset + 2] = 74 + row * 18 + column * 12;
        raw[offset + 3] = 255;
      }
    }
  }
  return makePng(width, height, raw);
}

function makePng(width, height, raw) {
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", Buffer.concat([u32(width), u32(height), Buffer.from([8, 6, 0, 0, 0])])),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0))
  ]);
}

function chunk(type, data) {
  const typeBytes = Buffer.from(type, "ascii");
  return Buffer.concat([u32(data.length), typeBytes, data, u32(crc32(Buffer.concat([typeBytes, data])))]);
}

function u32(value) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32BE(value >>> 0, 0);
  return buffer;
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}
`;
}

async function createCdpClient(webSocketUrl) {
  const socket = new WebSocket(webSocketUrl);
  const pending = new Map();
  let nextId = 1;

  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });

  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (!message.id) return;
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    if (message.error) {
      request.reject(new Error(message.error.message));
      return;
    }
    request.resolve(message.result);
  });

  return {
    send(method, params = {}) {
      const id = nextId++;
      socket.send(JSON.stringify({ id, method, params }));
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
      });
    },
    close() {
      socket.close();
      return delay(100);
    }
  };
}

function findBrowserCommand() {
  const absoluteCandidates = [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
  ];
  const pathCandidates = [
    "google-chrome",
    "google-chrome-stable",
    "chromium",
    "chromium-browser",
    "microsoft-edge",
    "msedge"
  ];
  const absoluteMatch = absoluteCandidates.find((candidate) => existsSync(candidate));
  if (absoluteMatch) return absoluteMatch;

  const executableExtensions = process.platform === "win32" ? ["", ".exe", ".cmd", ".bat"] : [""];
  for (const dir of (process.env.PATH ?? "").split(delimiter).filter(Boolean)) {
    for (const command of pathCandidates) {
      for (const extension of executableExtensions) {
        const candidate = join(dir, `${command}${extension}`);
        if (existsSync(candidate)) return candidate;
      }
    }
  }
  return "";
}

function getOpenPort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => {
        if (address && typeof address === "object") {
          resolve(address.port);
          return;
        }
        reject(new Error("Could not allocate an open port"));
      });
    });
    server.on("error", reject);
  });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
