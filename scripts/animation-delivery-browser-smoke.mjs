import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { delimiter, join, relative, resolve } from "node:path";

const nodeCommand = process.execPath;
const browserCommand = process.env.IMAGE_COCKPIT_BROWSER_COMMAND || findBrowserCommand();
const runnerMode = (process.env.IMAGE_COCKPIT_ANIMATION_DELIVERY_RUNNER || "mock").toLowerCase();
const timeoutMs = Number(process.env.IMAGE_COCKPIT_ANIMATION_DELIVERY_TIMEOUT_MS ?? (runnerMode === "real" ? 900000 : 90000));
const headless = process.env.IMAGE_COCKPIT_ANIMATION_DELIVERY_HEADLESS !== "0";
const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const reportDir = resolve(process.env.IMAGE_COCKPIT_ANIMATION_DELIVERY_REPORT_DIR || join("docs", "qa", "animation-delivery-reliability", timestamp));
const handoffDir = resolve(process.env.IMAGE_COCKPIT_ANIMATION_DELIVERY_HANDOFF_DIR || join(reportDir, "handoff"));
const tempRoot = await mkdtemp(join(tmpdir(), "image-cockpit-animation-delivery-"));
const chromeProfileDir = join(tempRoot, "chrome-profile");
const mockRunnerPath = join(tempRoot, "mock-animation-delivery-runner.mjs");
const apiPort = await getOpenPort();
const vitePort = await getOpenPort();
const debugPort = await getOpenPort();

let apiServer;
let viteServer;
let browserProcess;
let cdp;
let report;
let lastSnapshot = null;

if (!browserCommand) {
  console.error("Animation delivery browser smoke requires Chrome or Edge. Set IMAGE_COCKPIT_BROWSER_COMMAND to a browser executable.");
  process.exit(1);
}

try {
  await mkdir(reportDir, { recursive: true });
  await mkdir(handoffDir, { recursive: true });
  if (runnerMode === "mock") await writeFile(mockRunnerPath, mockRunnerSource(), "utf8");

  const sourceImageDataUrl = await loadSourceImageDataUrl();
  const sourceImageFilePath = await writeSourceImageFile(sourceImageDataUrl);
  const startedAt = new Date().toISOString();

  apiServer = startProcess(nodeCommand, ["node_modules/tsx/dist/cli.mjs", "server/index.ts"], apiEnv());
  await waitForHttp(`http://127.0.0.1:${apiPort}/api/providers`, "local API");

  viteServer = startProcess(nodeCommand, ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", String(vitePort), "--strictPort"], {
    IMAGE_COCKPIT_API_TARGET: `http://127.0.0.1:${apiPort}`
  });
  await waitForHttp(`http://127.0.0.1:${vitePort}/`, "Vite app");

  browserProcess = startProcess(browserCommand, [
    ...(headless ? ["--headless=new"] : []),
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
  await installBrowserPrelude();

  const browserUrl = `http://127.0.0.1:${vitePort}/`;
  await cdp.send("Page.navigate", { url: browserUrl });
  await waitForEval(
    () => `document.body?.innerText.includes("Pixel Art Generation") && Boolean(document.querySelector(".source-panel > .workflow-tabs"))`,
    "initial workspace"
  );
  await selectWorkflowTab("Animation Generation");
  const selectedSourceName = await uploadAnimationSource(sourceImageFilePath, "animation-delivery-source.png");
  lastSnapshot = await pageSnapshot();
  await waitForButtonEnabled("Generate Animation");
  const before = await pageSnapshot();
  lastSnapshot = before;
  const historyCountBefore = before.historyItems;
  await clickButtonByText("Generate Animation");
  lastSnapshot = await pageSnapshot();
  await waitForEval(() => `document.body?.innerText.includes("Codex Jobs")`, "Codex job shelf appears");
  await waitForDeliveryTerminal();
  await delay(500);

  const after = await pageSnapshot();
  const resultsList = await getJson(apiPort, "/api/codex/results").catch((error) => ({ error: error.message, results: [] }));
  const screenshotPath = join(reportDir, "browser-final-1280x720.png");
  const screenshot = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  await writeFile(screenshotPath, Buffer.from(screenshot.data, "base64"));

  const finishedAt = new Date().toISOString();
  const usableResults = Array.isArray(resultsList.results)
    ? resultsList.results.filter((result) => result.qualityGate?.classification === "usable-final")
    : [];
  const finalManifestResults = usableResults.filter((result) => /-manifest\.json$/i.test(result.name));
  const deliveredToHistory = after.historyItems > historyCountBefore || after.text.includes("Animation generated");
  const deliveredToPreview =
    after.canvasPreviewMode === "result" &&
    after.resultPreviewLoaded &&
    after.animationPreviewImages >= 6 &&
    after.directionPreviewRows >= 5;
  const downloadableFinal = after.resultDownloadPanelComplete && after.downloadModalButtons.includes("Export Animation Pack");
  const outboxFinalPresent = usableResults.length > 0 && finalManifestResults.length > 0;
  const falseSuccess = (deliveredToHistory || downloadableFinal) && !outboxFinalPresent;
  const deliverySucceeded = deliveredToHistory && deliveredToPreview && downloadableFinal && outboxFinalPresent && !falseSuccess;
  const failureCodes = deliverySucceeded
    ? []
    : [
        !deliveredToHistory ? "not_delivered_to_history" : "",
        !deliveredToPreview ? "not_delivered_to_preview" : "",
        !downloadableFinal ? "not_downloadable_final" : "",
        !outboxFinalPresent ? "outbox_final_missing" : "",
        falseSuccess ? "false_success" : ""
      ].filter(Boolean);
  const uiFailureText = Array.isArray(after.codexFailureTexts) ? after.codexFailureTexts.join(" | ") : "";
  const failureReason = deliverySucceeded
    ? ""
    : `${failureCodes.join(", ")}${uiFailureText ? `; ui: ${uiFailureText}` : ""}`;

  report = {
    schema: "image-cockpit.animation-delivery-browser-smoke.v1",
    createdAt: finishedAt,
    runnerMode,
    browserUrl,
    viewport: "1280x720",
    reportDir: toReportPath(reportDir),
    handoffDir: toReportPath(handoffDir),
    trial: {
      id: `browser-delivery-${timestamp}`,
      sourceType: selectedSourceName === "animation-delivery-source.png" ? "browser file upload from public prompt example" : "app sample fallback source",
      sourceName: selectedSourceName,
      motionPreset: "default standard animation",
      startedAt,
      finishedAt,
      browserUrl,
      resultStatus: deliverySucceeded ? "pass" : "fail",
      qualityRank: deliverySucceeded ? "silver-or-better" : "failed",
      deliveredToHistory,
      deliveredToPreview,
      downloadableFinal,
      outboxFinalPresent,
      falseSuccess,
      stuckRunning: after.codexJobRows > 0,
      failureCodes,
      failureReason,
      uiFailureText,
      artifactPaths: {
        screenshot: toReportPath(screenshotPath),
        reportDir: toReportPath(reportDir),
        handoffDir: toReportPath(handoffDir)
      },
      browserSnapshot: browserSnapshotForReport(after),
      outboxResults: Array.isArray(resultsList.results)
        ? resultsList.results.map((result) => ({
            name: result.name,
            path: toReportPath(result.path),
            mimeType: result.mimeType,
            qualityGate: result.qualityGate,
            artifact: sanitizeReportValue(result.artifact)
          }))
        : [],
      outboxError: sanitizeReportValue(resultsList.error || "")
    }
  };

  await writeReports(report);
  if (!deliverySucceeded) {
    throw new Error(`Animation browser delivery failed: ${failureReason || "unknown failure"}`);
  }
  console.log("Animation delivery browser smoke passed.");
  console.log(`reportDir=${reportDir}`);
  console.log(`handoffDir=${handoffDir}`);
} catch (error) {
  if (!report) {
    report = {
      schema: "image-cockpit.animation-delivery-browser-smoke.v1",
      createdAt: new Date().toISOString(),
      runnerMode,
      viewport: "1280x720",
      reportDir: toReportPath(reportDir),
      handoffDir: toReportPath(handoffDir),
      trial: {
        id: `browser-delivery-${timestamp}`,
        resultStatus: "fail",
        failureReason: error instanceof Error ? error.message : String(error),
        browserSnapshot: browserSnapshotForReport(lastSnapshot)
      }
    };
    await mkdir(reportDir, { recursive: true });
    if (cdp) {
      const failureScreenshotPath = join(reportDir, "browser-failure-1280x720.png");
      const screenshot = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false }).catch(() => null);
      if (screenshot?.data) {
        await writeFile(failureScreenshotPath, Buffer.from(screenshot.data, "base64")).catch(() => null);
        report.trial.artifactPaths = { screenshot: toReportPath(failureScreenshotPath), reportDir: toReportPath(reportDir), handoffDir: toReportPath(handoffDir) };
      }
    }
    await writeReports(report).catch(() => null);
  }
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  console.error(`reportDir=${reportDir}`);
  process.exitCode = 1;
} finally {
  await cdp?.close().catch(() => null);
  await stopProcess(browserProcess);
  await stopProcess(viteServer);
  await stopProcess(apiServer);
  await rm(tempRoot, { recursive: true, force: true });
}

function apiEnv() {
  const env = {
    IMAGE_COCKPIT_API_PORT: String(apiPort),
    IMAGE_COCKPIT_HANDOFF_DIR: handoffDir,
    IMAGE_COCKPIT_CODEX_AUTORUN: "1",
    IMAGE_COCKPIT_ARTIFACT_STABLE_MS: "0"
  };
  if (runnerMode === "mock") {
    return {
      ...env,
      IMAGE_COCKPIT_CODEX_COMMAND: nodeCommand,
      IMAGE_COCKPIT_CODEX_HELP_ARGS_JSON: JSON.stringify([mockRunnerPath, "--help"]),
      IMAGE_COCKPIT_CODEX_EXEC_ARGS_JSON: JSON.stringify([mockRunnerPath]),
      IMAGE_COCKPIT_MOCK_RUNNER_DELAY_MS: process.env.IMAGE_COCKPIT_MOCK_RUNNER_DELAY_MS || "900"
    };
  }
  return env;
}

async function loadSourceImageDataUrl() {
  const sourcePath = process.env.IMAGE_COCKPIT_ANIMATION_DELIVERY_SOURCE || "public/prompt-examples/basic-young-male-hero.png";
  const bytes = await readFile(sourcePath);
  return `data:image/png;base64,${bytes.toString("base64")}`;
}

async function installBrowserPrelude() {
  await cdp.send("Page.addScriptToEvaluateOnNewDocument", {
    source: `
      window.__animationDeliveryErrors = [];
      window.addEventListener("error", (event) => {
        window.__animationDeliveryErrors.push(event.message || "window error");
      });
      window.addEventListener("unhandledrejection", (event) => {
        window.__animationDeliveryErrors.push(String(event.reason?.message || event.reason || "unhandled rejection"));
      });
      localStorage.setItem("image-cockpit.language", "en");
      localStorage.removeItem("image-cockpit.pendingCodexJob");
    `
  });
}

async function writeSourceImageFile(sourceImageDataUrl) {
  const match = sourceImageDataUrl.match(/^data:image\/png;base64,(.+)$/);
  if (!match) throw new Error("Animation delivery source image must be a PNG data URL");
  const filePath = join(reportDir, "animation-delivery-source.png");
  await writeFile(filePath, Buffer.from(match[1], "base64"));
  return filePath;
}

async function waitForDeliveryTerminal() {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const snapshot = await pageSnapshot();
    const hasPassSignal =
      snapshot.text.includes("Animation generated") &&
      snapshot.animationPreviewImages >= 6 &&
      snapshot.directionPreviewRows >= 5 &&
      snapshot.resultDownloadPanelComplete;
    const hasFailureSignal =
      snapshot.text.includes("Animation tournament failed") ||
      snapshot.text.includes("no history or final download item was added") ||
      snapshot.codexFailureCards > 0;
    if (hasPassSignal || hasFailureSignal) {
      if (snapshot.resultDownloadPanelComplete) {
        await openDownloadModal().catch(() => null);
      }
      return;
    }
    await delay(1000);
  }
  throw new Error(`Timed out after ${timeoutMs}ms waiting for browser delivery terminal state`);
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
  await waitForEval(() => `document.body?.innerText.includes(${JSON.stringify(label)})`, `${label} workflow tab`);
}

async function clickButtonByText(label) {
  await evaluate(`(() => {
    const button = Array.from(document.querySelectorAll("button")).find((item) => item.innerText.replace(/\\s+/g, " ").trim() === ${JSON.stringify(label)});
    if (!button) throw new Error("Button not found: ${label}");
    button.click();
  })()`);
}

async function uploadAnimationSource(filePath, fileName) {
  await waitForEval(() => `Boolean(document.querySelector('input[type="file"][accept="image/*"]'))`, "image upload input");
  const inputHandle = await cdp.send("Runtime.evaluate", {
    expression: `document.querySelector('input[type="file"][accept="image/*"]')`,
    returnByValue: false
  });
  if (!inputHandle.result.objectId) throw new Error("Image upload input was not found");
  await cdp.send("DOM.setFileInputFiles", {
    objectId: inputHandle.result.objectId,
    files: [filePath]
  });
  await waitForEval(
    () => `document.body?.innerText.includes(${JSON.stringify(fileName)}) && document.body?.innerText.includes("Selected source")`,
    "uploaded animation source"
  );
  return fileName;
}

async function waitForButtonEnabled(label) {
  await waitForEval(
    () => `Array.from(document.querySelectorAll("button")).some((button) => button.innerText.replace(/\\s+/g, " ").trim() === ${JSON.stringify(label)} && !button.disabled)`,
    `${label} button enabled`
  );
}

async function openDownloadModal() {
  await evaluate(`(() => {
    const button = document.querySelector(".workspace .result-download-action");
    if (!button) throw new Error("Download action not found");
    button.click();
  })()`);
  await waitForEval(() => `Boolean(document.querySelector(".download-options-modal"))`, "Download modal opens");
}

async function pageSnapshot() {
  return evaluate(`(() => ({
    text: document.body.innerText.replace(/\\s+/g, " ").trim(),
    buttons: Array.from(document.querySelectorAll("button")).map((button) => button.innerText.replace(/\\s+/g, " ").trim()).filter(Boolean),
    disabledButtons: Array.from(document.querySelectorAll("button:disabled")).map((button) => button.innerText.replace(/\\s+/g, " ").trim()).filter(Boolean),
    historyItems: document.querySelectorAll(".history-item").length,
    codexJobRows: document.querySelectorAll(".codex-job-row").length,
    codexFailureCards: document.querySelectorAll(".codex-failure-card").length,
    codexFailureTexts: Array.from(document.querySelectorAll(".codex-failure-card"))
      .map((card) => card.innerText.replace(/\\s+/g, " ").trim())
      .filter(Boolean),
    codexLogCards: document.querySelectorAll(".codex-log-card").length,
    canvasPreviewMode: document.querySelector("canvas")?.dataset.previewMode || "",
    canvasPreviewName: document.querySelector("canvas")?.dataset.previewName || "",
    resultPreviewImages: document.querySelectorAll(".result-preview-image").length,
    resultPreviewLoaded: Boolean(document.querySelector(".result-preview-image")?.naturalWidth),
    animationPreviewImages: document.querySelectorAll(".animation-preview img").length,
    directionPreviewRows: document.querySelectorAll(".direction-preview-row").length,
    resultDownloadPanelComplete: Boolean(document.querySelector(".workspace .result-download-panel.complete")),
    downloadModalVisible: Boolean(document.querySelector(".download-options-modal")),
    downloadModalButtons: Array.from(document.querySelectorAll(".download-options-modal .result-download-grid button"))
      .map((button) => button.innerText.replace(/\\s+/g, " ").trim())
      .filter(Boolean),
    animationSourceStatus: document.querySelector(".animation-source-status")?.innerText || "",
    animationSourceCard: document.querySelector(".animation-step.complete .source-preview")?.innerText.replace(/\\s+/g, " ").trim() || "",
    browserErrors: window.__animationDeliveryErrors || []
  }))()`);
}

async function writeReports(currentReport) {
  const trial = currentReport.trial;
  const summary = {
    schema: "image-cockpit.animation-delivery-rate-summary.v1",
    createdAt: currentReport.createdAt,
    runnerMode: currentReport.runnerMode,
    totalTrials: 1,
    passedTrials: trial.resultStatus === "pass" ? 1 : 0,
    browserDeliveryRate: trial.resultStatus === "pass" ? 1 : 0,
    falseSuccessCount: trial.falseSuccess ? 1 : 0,
    stuckRunningCount: trial.stuckRunning ? 1 : 0,
    failures: trial.resultStatus === "pass" ? [] : [{ id: trial.id, reason: trial.failureReason }]
  };
  await writeFile(join(reportDir, "browser-trials.json"), `${JSON.stringify([trial], null, 2)}\n`, "utf8");
  await writeFile(join(reportDir, "delivery-rate-summary.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  await writeFile(join(reportDir, "report.md"), reportMarkdown(currentReport, summary), "utf8");
}

function browserSnapshotForReport(snapshot) {
  if (!snapshot || typeof snapshot !== "object") return snapshot;
  const { text, ...safeSnapshot } = snapshot;
  return {
    ...sanitizeReportValue(safeSnapshot),
    textOmitted: typeof text === "string",
    textLength: typeof text === "string" ? text.length : 0,
    hasAnimationGeneratedText: typeof text === "string" ? text.includes("Animation generated") : false
  };
}

function sanitizeReportValue(value) {
  if (typeof value === "string") return toReportPath(value);
  if (Array.isArray(value)) return value.map((item) => sanitizeReportValue(item));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [key, sanitizeReportValue(entry)])
  );
}

function toReportPath(value) {
  if (typeof value !== "string" || !/^[A-Za-z]:[\\/]/.test(value)) return value;
  const relativePath = relative(process.cwd(), value);
  if (relativePath && !relativePath.startsWith("..") && !relativePath.includes(":")) {
    return relativePath.replace(/\\/g, "/");
  }
  return "<local-path>";
}

function reportMarkdown(currentReport, summary) {
  const trial = currentReport.trial;
  return `# Animation Delivery Browser Smoke

Created: ${currentReport.createdAt}

## Summary

- runnerMode: ${currentReport.runnerMode}
- browserUrl: ${currentReport.browserUrl || ""}
- viewport: ${currentReport.viewport}
- totalTrials: ${summary.totalTrials}
- passedTrials: ${summary.passedTrials}
- browserDeliveryRate: ${summary.browserDeliveryRate}
- falseSuccessCount: ${summary.falseSuccessCount}
- stuckRunningCount: ${summary.stuckRunningCount}

## Trial

- id: ${trial.id}
- resultStatus: ${trial.resultStatus}
- sourceType: ${trial.sourceType || ""}
- sourceName: ${trial.sourceName || ""}
- deliveredToHistory: ${Boolean(trial.deliveredToHistory)}
- deliveredToPreview: ${Boolean(trial.deliveredToPreview)}
- downloadableFinal: ${Boolean(trial.downloadableFinal)}
- outboxFinalPresent: ${Boolean(trial.outboxFinalPresent)}
- falseSuccess: ${Boolean(trial.falseSuccess)}
- stuckRunning: ${Boolean(trial.stuckRunning)}
- failureReason: ${trial.failureReason || "none"}
- uiFailureText: ${trial.uiFailureText || "none"}

## Artifacts

- screenshot: ${trial.artifactPaths?.screenshot || ""}
- handoffDir: ${currentReport.handoffDir}
- browser-trials.json
- delivery-rate-summary.json
`;
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

async function waitForEval(expressionFactory, label, waitMs = 10000) {
  const deadline = Date.now() + waitMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      if (await evaluate(expressionFactory())) return;
      lastError = null;
    } catch (error) {
      lastError = error;
    }
    await delay(150);
  }
  const suffix = lastError instanceof Error ? ` Last browser error: ${lastError.message}` : "";
  throw new Error(`Timed out waiting for ${label}.${suffix}`);
}

async function getJson(port, path) {
  const response = await fetch(`http://127.0.0.1:${port}${path}`);
  if (!response.ok) throw new Error(`${path} failed: ${response.status} ${await response.text()}`);
  return response.json();
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
    new Promise((resolveStop) => child.once("close", resolveStop)),
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
      // Keep waiting while servers start.
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

async function createCdpClient(webSocketUrl) {
  const socket = new WebSocket(webSocketUrl);
  const pending = new Map();
  let nextId = 1;

  await new Promise((resolveOpen, rejectOpen) => {
    socket.addEventListener("open", resolveOpen, { once: true });
    socket.addEventListener("error", rejectOpen, { once: true });
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
      return new Promise((resolveSend, rejectSend) => {
        pending.set(id, { resolve: resolveSend, reject: rejectSend });
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
  return new Promise((resolvePort, rejectPort) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => {
        if (address && typeof address === "object") {
          resolvePort(address.port);
          return;
        }
        rejectPort(new Error("Could not allocate an open port"));
      });
    });
    server.on("error", rejectPort);
  });
}

function mockRunnerSource() {
  return `
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { deflateSync } from "node:zlib";

if (process.argv.includes("--help")) {
  console.log("mock animation delivery runner");
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
await mkdir(outboxDir, { recursive: true });
console.log(\`mock animation delivery accepted \${jobId}\`);
await new Promise((resolve) => setTimeout(resolve, Number(process.env.IMAGE_COCKPIT_MOCK_RUNNER_DELAY_MS || 900)));

if (job.workflowMode !== "sprite-generate" || job.spriteContext?.variant !== "standard") {
  await writeFile(join(outboxDir, \`\${jobId}.png\`), makeSpriteSheetPng(512, 512, 1, 1, 512, 512, [0, 255, 0, 255]));
  console.log(\`mock non-animation image completed \${jobId}\`);
  process.exit(0);
}

const directionSlugs = ["front", "front-three-quarter", "side", "back-three-quarter", "back"];
const directionNames = ["front", "front three-quarter", "side", "back three-quarter", "back"];
const cellWidth = Number(job.spriteContext?.cell?.width || 256);
const cellHeight = Number(job.spriteContext?.cell?.height || 256);
const chroma = job.spriteContext?.chromaKey === "magenta" ? [255, 0, 255, 255] : [0, 255, 0, 255];

for (const [index, slug] of directionSlugs.entries()) {
  const png = makeSpriteSheetPng(cellWidth * 4, cellHeight * 2, 4, 2, cellWidth, cellHeight, chroma, index);
  await writeFile(join(outboxDir, \`\${jobId}-\${slug}.png\`), png);
}
await writeFile(join(outboxDir, \`\${jobId}-manifest.json\`), JSON.stringify({
  schema: "image-cockpit.direction-split-animation.v1",
  jobId,
  action: job.spriteContext?.action || "idle",
  directions: directionNames,
  framesPerDirection: 8,
  grid: { columns: 4, rows: 2, gutter: 0 },
  cell: { width: cellWidth, height: cellHeight },
  files: Object.fromEntries(directionSlugs.map((slug, index) => [directionNames[index], \`\${jobId}-\${slug}.png\`])),
  qualityGate: {
    classification: "usable-final",
    reason: "Mock animation delivery final result.",
    code: "mock-animation-delivery-final",
    historyAllowed: true,
    downloadAllowed: true,
    retryable: false
  }
}, null, 2), "utf8");
console.log(\`mock direction split sprite sheet completed \${jobId}\`);

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

function delay(ms) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}
