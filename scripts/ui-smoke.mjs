import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";

const nodeCommand = process.execPath;
const browserCommand = process.env.IMAGE_COCKPIT_BROWSER_COMMAND || findBrowserCommand();
const tinyPng =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";

if (!browserCommand) {
  console.error("UI smoke requires Chrome or Edge. Set IMAGE_COCKPIT_BROWSER_COMMAND to a browser executable.");
  process.exit(1);
}

const tempRoot = await mkdtemp(join(tmpdir(), "image-cockpit-ui-smoke-"));
const handoffDir = join(tempRoot, "handoff");
const chromeProfileDir = join(tempRoot, "chrome-profile");
const mockRunnerPath = join(tempRoot, "mock-codex-runner.mjs");
const apiPort = await getOpenPort();
const vitePort = await getOpenPort();
const debugPort = await getOpenPort();
const screenshotDir = process.env.IMAGE_COCKPIT_UI_SMOKE_SCREENSHOT_DIR;

let apiServer;
let viteServer;
let browserProcess;
let cdp;

try {
  await writeFile(mockRunnerPath, mockRunnerSource(), "utf8");
  apiServer = startProcess(nodeCommand, ["node_modules/tsx/dist/cli.mjs", "server/index.ts"], {
    IMAGE_COCKPIT_API_PORT: String(apiPort),
    IMAGE_COCKPIT_HANDOFF_DIR: handoffDir,
    IMAGE_COCKPIT_CODEX_AUTORUN: "1",
    IMAGE_COCKPIT_CODEX_COMMAND: nodeCommand,
    IMAGE_COCKPIT_CODEX_HELP_ARGS_JSON: JSON.stringify([mockRunnerPath, "--help"]),
    IMAGE_COCKPIT_CODEX_EXEC_ARGS_JSON: JSON.stringify([mockRunnerPath]),
    IMAGE_COCKPIT_MOCK_RUNNER_DELAY_MS: "1200"
  });
  await waitForHttp(`http://127.0.0.1:${apiPort}/api/providers`, "local API");

  viteServer = startProcess(nodeCommand, ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", String(vitePort), "--strictPort"], {
    IMAGE_COCKPIT_API_TARGET: `http://127.0.0.1:${apiPort}`
  });
  await waitForHttp(`http://127.0.0.1:${vitePort}/`, "Vite app");

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
      }
    `
  });
  await cdp.send("Page.navigate", { url: `http://127.0.0.1:${vitePort}/` });
  await waitForEval(
    () => `document.body.innerText.includes("Pixel Art Generation") && Boolean(document.querySelector(".source-panel > .workflow-tabs"))`,
    "initial Pixel Art Generation workspace"
  );

  await assertInitialWorkspace();
  await assertLanguageSwitch();
  await assertPromptExamples();
  await assertAnimationPresetExamples();
  await assertCodexFailureNotice();
  await assertCodexQueue();
  await assertImageEditing();
  await assertWorkflow({
    label: "Pixel Art Generation",
    route: "Route: Codex Handoff",
    buttons: ["Generate Pixel Art", "PNG", "Animated GIF", "Animated WebP"],
    hiddenButtons: ["Import Latest", "Import File"],
    hiddenText: ["Sprite Actions", "Export Sprite"],
    requiredText: ["Pixel Art Prompt", "Generation Notes", "Preview", "Generation can take a few minutes."],
    exerciseButton: "Generate Pixel Art",
    expectedAfterExercise: "Imported from Local Inbox",
    expectedCanvasPreviewModeAfterExercise: "result",
    // release-audit marker: downloadSelectedImageAnimation
    postExerciseButtons: ["Animated GIF", "Animated WebP"]
  });
  await assertWorkflow({
    label: "Animation Generation",
    route: "Route: Codex Handoff",
    buttons: ["Upload Pixel Art", "5-Direction Sheet", "hatch-pet", "Generate Animation", "Animated GIF", "Animated WebP", "Sprite Sheet"],
    hiddenButtons: ["Import Latest", "Import File"],
    hiddenText: ["Sprite Actions", "Export Sprite"],
    requiredText: ["1. Upload Pixel Art", "Generation Method", "2. Choose Motion", "3. Generate", "4. Download", "Motion Prompt", "Prompt", "Preset", "5-direction chroma-key sprite sheet"],
    preExerciseButtonChecks: [
      { button: "hatch-pet", expectedText: "hatch-pet locks the atlas" },
      { button: "5-Direction Sheet", expectedText: "5-direction chroma-key sprite sheet" },
      { button: "Preset", expectedText: "Additional Prompt (optional)" },
      { button: "Prompt", expectedText: "Motion Prompt" }
    ],
    exerciseButton: "Generate Animation",
    expectedAfterExercise: "Animation generated",
    expectedAfterExerciseText: ["Animation frames ready", "Generated from", "Directional Previews", "GIF Preview", "WebP Preview", "Sprite Sheet Preview", "Animated WebP", "512x512"],
    postExerciseButtons: ["Animated WebP", "Sprite Sheet"],
    expectedCanvasPreviewModeAfterExercise: "result",
    expectedPreviewImages: 11,
    expectedAnimationPreviewImagesAfterExercise: 11,
    expectedDirectionPreviewCount: 5,
    reloadAfterExercise: true
  });
  await assertAnimationResultNotEditable();
  if (!screenshotDir) await assertHistoryIncrementalRendering();

  console.log("UI smoke passed.");
} finally {
  await cdp?.close();
  await stopProcess(browserProcess);
  await stopProcess(viteServer);
  await stopProcess(apiServer);
  await rm(tempRoot, { recursive: true, force: true });
}

async function assertInitialWorkspace() {
  const snapshot = await pageSnapshot();
  assert(snapshot.guidedOptions.length === 0, "Initial screen should not show Guided Start options");
  assert(!snapshot.buttons.includes("Start"), "Initial workspace should not expose the old Start button");
  assert(snapshot.text.includes("Pixel Art Generation"), "Initial screen should open the Pixel Art Generation workspace");
  assert(snapshot.buttons.includes("Pixel Art Generation"), "Initial workspace should expose Pixel Art Generation tab");
  assert(snapshot.buttons.includes("Image Editing"), "Initial workspace should expose Image Editing tab");
  assert(snapshot.buttons.includes("Animation Generation"), "Initial workspace should expose Animation Generation tab");
  assert(snapshot.workflowTabsInsidePanel, "Initial workspace should place workflow tabs under 1. Workflow");
  assert(snapshot.canvasVisible, "Initial workspace should render the preview canvas immediately");
  assert(snapshot.imageDownloadPanelInWorkspace, "Initial workspace should place the image download card under the preview workspace");
  await maybeCapture("initial-workspace");
}

async function assertLanguageSwitch() {
  await evaluate(`(() => {
    const select = document.querySelector(".language-control select");
    select.value = "ja";
    select.dispatchEvent(new Event("change", { bubbles: true }));
  })()`);
  await waitForEval(() => `document.body.innerText.includes("ピクセルアートの生成")`, "Japanese workspace copy");
  await evaluate(`(() => {
    const select = document.querySelector(".language-control select");
    select.value = "en";
    select.dispatchEvent(new Event("change", { bubbles: true }));
  })()`);
  await waitForEval(() => `document.body.innerText.includes("Pixel Art Generation")`, "English workspace copy");
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
  await clickButtonByText("Prompt Examples");
  await waitForEval(() => `document.querySelector(".prompt-modal")?.innerText.includes("Clockwork Mushroom Courier")`, "Prompt Examples modal");
  const snapshot = await pageSnapshot();
  assert(snapshot.text.includes("Pick by preview image"), "Prompt Examples intro should be visible");
  assert(snapshot.buttons.includes("Copy Prompt"), "Prompt Examples should expose copy buttons");
  assert(snapshot.buttons.includes("Use Prompt"), "Prompt Examples should expose use buttons");
  assert(snapshot.promptPreviewImages >= 6, `Prompt Examples should show image previews, got ${snapshot.promptPreviewImages}`);
  assert(snapshot.promptRawTextBlocks === 0, `Prompt Examples should hide raw prompt text, got ${snapshot.promptRawTextBlocks} raw blocks`);
  const firstPreviewLoaded = await evaluate(`Boolean(document.querySelector(".prompt-card-preview img")?.naturalWidth)`);
  assert(firstPreviewLoaded, "Prompt Examples preview images should load");
  assert(!snapshot.text.includes("Create one original pixel-art game asset"), "Prompt Examples should not display raw prompt contents");
  await maybeCapture("prompt-examples-modal");

  await clickButtonByText("Use Prompt");
  await waitForEval(
    () => `document.body.innerText.includes("Prompt example loaded into Pixel Art Generation")`,
    "Prompt example loaded"
  );
  const loadedPrompt = await evaluate(`document.querySelector("textarea")?.value || ""`);
  assert(loadedPrompt.includes("clockwork mushroom courier"), "Use Prompt should load the example into the prompt field");
  const modalClosed = await evaluate(`!document.querySelector(".prompt-modal")`);
  assert(modalClosed, "Use Prompt should close the Prompt Examples modal");

  await selectWorkflowTab("Pixel Art Generation");
}

async function assertAnimationPresetExamples() {
  await selectWorkflowTab("Animation Generation");
  await waitForEval(() => `document.body.innerText.includes("Animation Generation")`, "Animation Generation for preset examples");
  await clickButtonByText("Preset");
  await waitForEval(() => `document.body.innerText.includes("Additional Prompt (optional)")`, "Animation preset tab");
  const triggerPlacement = await evaluate(`(() => {
    const presets = document.querySelector(".motion-presets");
    const trigger = document.querySelector(".animation-preset-example-trigger");
    return Boolean(trigger && presets && presets.nextElementSibling === trigger);
  })()`);
  assert(triggerPlacement, "Animation Preset Examples trigger should sit directly below the preset buttons");

  await clickButtonByText("Preset Examples");
  await waitForEval(() => `document.querySelector(".animation-preset-modal")?.innerText.includes("Idle Breathing Loop")`, "Animation Preset Examples modal");
  const snapshot = await pageSnapshot();
  assert(snapshot.text.includes("Pick an animated sample"), "Animation Preset Examples intro should be visible");
  assert(snapshot.buttons.includes("Use Preset"), "Animation Preset Examples should expose use buttons");
  assert(snapshot.animationPresetSampleSprites === 9, `Animation Preset Examples should show 9 animated sprite samples, got ${snapshot.animationPresetSampleSprites}`);
  assert(snapshot.text.includes("Victory Cheer"), "Animation Preset Examples should include the added preset cards");
  assert(snapshot.promptRawTextBlocks === 0, `Animation Preset Examples should hide raw prompt text, got ${snapshot.promptRawTextBlocks} raw blocks`);
  const animationName = await evaluate(`getComputedStyle(document.querySelector(".animation-sample-sprite")).animationName`);
  assert(animationName && animationName !== "none", "Animation Preset Examples samples should be animated");
  await maybeCapture("animation-preset-examples-modal");

  await clickButtonByText("Use Preset");
  await waitForEval(
    () => `document.body.innerText.includes("Animation preset loaded")`,
    "Animation preset loaded"
  );
  const selectedPreset = await evaluate(`document.querySelector(".motion-presets button.active")?.innerText.replace(/\\s+/g, " ").trim() || ""`);
  assert(selectedPreset === "idle", `Use Preset should select idle, got ${selectedPreset}`);
  const loadedPrompt = await evaluate(`document.querySelector(".animation-step textarea")?.value || ""`);
  assert(loadedPrompt.includes("idle breathing loop"), "Use Preset should load the preset motion prompt");
  const modalClosed = await evaluate(`!document.querySelector(".animation-preset-modal")`);
  assert(modalClosed, "Use Preset should close the Animation Preset Examples modal");

  await selectWorkflowTab("Pixel Art Generation");
}

async function assertCodexQueue() {
  await selectWorkflowTab("Pixel Art Generation");
  await waitForEval(() => `document.body.innerText.includes("Pixel Art Generation")`, "Pixel Art Generation for Codex queue");
  await evaluate(`document.querySelector("textarea").value = "queue smoke pixel hero"; document.querySelector("textarea").dispatchEvent(new Event("input", { bubbles: true }))`);

  await clickButtonByText("Generate Pixel Art");
  await waitForEval(() => `document.body.innerText.includes("Codex Jobs") && document.body.innerText.includes("Active 1/2")`, "first Codex job running");
  await waitForButtonEnabled("Generate Pixel Art");

  await clickButtonByText("Generate Pixel Art");
  await waitForEval(() => `document.body.innerText.includes("Active 2/2")`, "two Codex jobs running");
  await waitForButtonEnabled("Queue Codex Job");

  await clickButtonByText("Queue Codex Job");
  await waitForEval(() => `document.body.innerText.includes("Queued") && document.body.innerText.includes("Waiting for an open slot")`, "third Codex job queued");
  const snapshot = await pageSnapshot();
  assert(snapshot.buttons.includes("Queue Codex Job"), "Codex queue should switch the primary action to Queue Codex Job at two active jobs");
  assert(snapshot.text.includes("Codex job queued"), "Codex queue should report that the third job was queued");
  assert(snapshot.codexJobRows === 3, `Codex queue should show 3 job rows, got ${snapshot.codexJobRows}`);
  assert(snapshot.codexJobShelfInHistory, "Codex job shelf should appear above the Results cards in the right column");
  assert(!snapshot.codexJobShelfInSource, "Codex job shelf should not remain in the left source column");
  assert(snapshot.codexJobShelfBeforeHistoryList, "Codex job shelf should sit before the result card list");
  await maybeCapture("codex-job-shelf-results");

  await waitForEval(() => `document.querySelectorAll(".codex-job-row").length === 0`, "Codex queue drains after results return", 18000);
  await assertNoBrowserErrors("Codex queue");
  await selectWorkflowTab("Pixel Art Generation");
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
  await waitForEval(() => `document.body.innerText.includes("Imported from Local Inbox")`, "Codex queue continues after failure", 18000);
  snapshot = await pageSnapshot();
  assert(snapshot.historyItems > historyCountBefore, "Codex should import a real image after a previous failure");
  assert(snapshot.codexFailureCards === 1, "Codex failure notice should remain visible after later success");
  await assertNoBrowserErrors("Codex failure notice");
  await maybeCapture("codex-failure-notice");
  await selectWorkflowTab("Pixel Art Generation");
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
  assert(snapshot.buttons.includes("PNG"), "Image Editing should expose the image PNG download action");
  assert(snapshot.buttons.includes("Animated GIF"), "Image Editing should expose the animated GIF download action");
  assert(snapshot.buttons.includes("Animated WebP"), "Image Editing should expose the animated WebP download action");
  assert(snapshot.imageDownloadPanelInWorkspace, "Image Editing should place the image download card under the preview workspace");
  assert(snapshot.annotationToolbarVisible, "Image Editing should show the rectangle selection toolbar");
  assert(snapshot.canvasPreviewMode === "edit", `Image Editing should use edit canvas mode, got ${snapshot.canvasPreviewMode}`);
  assert(snapshot.text.includes("Numbered edit regions"), "Image Editing should show numbered edit regions");
  assert(!snapshot.text.includes("Before / After"), "Image Editing should not show the old Before / After card in the source panel");
  assert(!snapshot.buttons.includes("Annotated PNG"), "Image Editing should hide the old annotation PNG button");
  assert(!snapshot.buttons.includes("Brush"), "Image Editing should hide the old brush tool");
  assert(!snapshot.buttons.includes("Arrow"), "Image Editing should hide the old arrow tool");
  await waitForEval(
    () => `(() => {
      const canvas = document.querySelector("canvas");
      if (!canvas || getComputedStyle(canvas).display === "none") return false;
      const rect = canvas.getBoundingClientRect();
      return rect.width > 300 && rect.height > 160;
    })()`,
    "Image Editing canvas ready"
  );

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
  assert(snapshot.imageDownloadPanelInWorkspace, "Image Editing should keep the image download card under the preview after edit");
  assert(snapshot.imageDownloadPanelComplete, "Image Editing should mark the selected edited image as downloadable");
  assert(snapshot.canvasPreviewMode === "edit", `Image Editing should keep edit canvas mode after import, got ${snapshot.canvasPreviewMode}`);
  await assertNoBrowserErrors("Image Editing");
  await maybeCapture("image-editing-edit-source");
  await selectWorkflowTab("Pixel Art Generation");
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
  expectedPreviewImages = 0,
  expectedAnimationPreviewImagesAfterExercise,
  expectedDirectionPreviewCount = 0,
  expectedCanvasPreviewModeAfterExercise = "",
  expectedAnnotationToolbarVisible = false,
  reloadAfterExercise = false
}) {
  await selectWorkflowTab(label);
  await waitForEval(() => `document.body.innerText.includes(${JSON.stringify(label)})`, label);
  const snapshot = await pageSnapshot();
  assert(snapshot.text.includes(label), `${label} should be visible after selection`);
  assert(snapshot.buttons.includes("Pixel Art Generation"), `${label} should expose the Pixel Art Generation tab`);
  assert(snapshot.buttons.includes("Image Editing"), `${label} should expose the Image Editing tab`);
  assert(snapshot.buttons.includes("Animation Generation"), `${label} should expose the Animation Generation tab`);
  assert(snapshot.workflowTabsInsidePanel, `${label} should place workflow tabs under 1. Workflow`);
  assert(!snapshot.workflowTabsInTopbar, `${label} should not place workflow tabs in the global header`);
  assert(snapshot.summary.includes(route), `${label} should select ${route}`);
  assert(snapshot.canvasVisible, `${label} should render the canvas`);
  assert(
    snapshot.annotationToolbarVisible === expectedAnnotationToolbarVisible,
    `${label} Preview toolbar visibility should be ${expectedAnnotationToolbarVisible}`
  );
  assert(!snapshot.spriteBenchVisible, `${label} should keep the Sprite Actions panel hidden for now`);
  if (label === "Animation Generation") {
    assert(snapshot.downloadPanelInWorkspace, "Animation Generation should place the download card under the preview workspace");
    assert(!snapshot.downloadPanelInSource, "Animation Generation should not leave the download card in the left source panel");
    assert(snapshot.animationPreviewImages === 0, "Animation Generation should not show stale animation preview images before a selected animation result exists");
  } else {
    assert(snapshot.imageDownloadPanelInWorkspace, `${label} should place the image download card under the preview workspace`);
    assert(!snapshot.downloadPanelInSource, `${label} should not put download cards in the left source panel`);
  }
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
    await clickButtonByText(exerciseButton);
    await waitForEval(() => `document.body.innerText.includes(${JSON.stringify(expectedAfterExercise)})`, `${label} generated result`);
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
      assert(postSnapshot.downloadPanelInWorkspace, `${label} should keep the download panel visible under the preview`);
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
        if (label !== "Animation Generation") {
          assert(previewSnapshot.imageDownloadPanelComplete, `${label} should mark the selected image as downloadable`);
        }
      }
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
      await waitForEval(() => `document.body.innerText.includes("512x512")`, `${label} persisted 512x512 frame size after reload`);
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
    downloadPanelInSource: Boolean(document.querySelector(".source-panel .animation-download-panel")),
    downloadPanelInWorkspace: Boolean(document.querySelector(".workspace .animation-download-panel")),
    imageDownloadPanelInWorkspace: Boolean(document.querySelector(".workspace .image-download-panel")),
    imageDownloadPanelComplete: Boolean(document.querySelector(".workspace .image-download-panel.complete")),
    animationSourceStatus: document.querySelector(".animation-download-source-status, .animation-source-status")?.innerText || "",
    imageEditSourceStatus: document.querySelector(".image-edit-source-status")?.innerText || "",
    imageEditSourceImages: document.querySelectorAll(".image-edit-source-status img").length,
    finalEditNoticeVisible: Boolean(document.querySelector(".edit-final-notice")),
    annotationRegionRows: document.querySelectorAll(".annotation-region-row").length,
    annotationComments: Array.from(document.querySelectorAll(".annotation-comment-field")).map((field) => field.value),
    editCompareVisible: Boolean(document.querySelector(".image-edit-compare")),
    editCompareImages: document.querySelectorAll(".edit-compare-grid img").length,
    historyItems: document.querySelectorAll(".history-item").length,
    historyVisibleCount: document.querySelector(".history-list")?.dataset.visibleCount || "",
    historyTotalCount: document.querySelector(".history-list")?.dataset.totalCount || "",
    codexFailureCards: document.querySelectorAll(".codex-failure-card").length,
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
    promptPreviewImages: document.querySelectorAll(".prompt-card-preview img").length,
    animationPresetSampleSprites: document.querySelectorAll(".animation-sample-sprite").length,
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
  throw new Error(`Timed out waiting for ${label}`);
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

function mockRunnerSource() {
  return `import { readFile, writeFile } from "node:fs/promises";
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

if (job.workflowMode === "image-edit") {
  const comments = (job.annotationContext?.annotations || []).map((annotation) => annotation.comment || "").join("\\n");
  if (!job.selectedImage?.assetPath || job.annotationContext?.annotationCount < 1 || !comments.includes("text X")) {
    console.error("image edit job missing selected asset, numbered annotation, or comment");
    process.exit(4);
  }
}

if (job.workflowMode !== "sprite-generate") {
  await writeFile(join(outboxDir, \`\${jobId}-mock-image.png\`), makeSpriteSheetPng(512, 512, 1, 1, 512, 512, [0, 255, 0, 255]));
  console.log(\`mock image completed \${jobId}\`);
  process.exit(0);
}

const columns = Number(job.spriteContext?.grid?.columns || 8);
const rows = Number(job.spriteContext?.grid?.rows || 5);
const cellWidth = Number(job.spriteContext?.cell?.width || 512);
const cellHeight = Number(job.spriteContext?.cell?.height || 512);
const width = columns * cellWidth;
const height = rows * cellHeight;
const chroma = job.spriteContext?.chromaKey === "magenta" ? [255, 0, 255, 255] : [0, 255, 0, 255];
const png = makeSpriteSheetPng(width, height, columns, rows, cellWidth, cellHeight, chroma);
await writeFile(join(outboxDir, \`\${jobId}-mock-sprite-sheet.png\`), png);
console.log(\`mock sprite sheet completed \${jobId}\`);

function makeSpriteSheetPng(width, height, columns, rows, cellWidth, cellHeight, chroma) {
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
      const centerY = Math.round(cellHeight * 0.58 + row * 3);
      const body = Math.abs(localX - centerX) < 54 && Math.abs(localY - centerY) < 78;
      const head = (localX - centerX) ** 2 + (localY - (centerY - 82)) ** 2 < 42 ** 2;
      const feet = Math.abs(localX - centerX) < 72 && Math.abs(localY - (centerY + 88)) < 12;
      if (body || head || feet) {
        raw[offset] = 32 + row * 28;
        raw[offset + 1] = 44 + column * 10;
        raw[offset + 2] = 74 + row * 18;
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
