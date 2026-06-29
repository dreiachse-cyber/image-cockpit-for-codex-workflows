import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { delimiter, join, relative, resolve } from "node:path";

const nodeCommand = process.execPath;
const browserCommand = process.env.IMAGE_COCKPIT_BROWSER_COMMAND || findBrowserCommand();
const timeoutMs = Number(process.env.IMAGE_COCKPIT_SOURCE_BROWSER_TIMEOUT_MS ?? 900000);
const headless = process.env.IMAGE_COCKPIT_SOURCE_BROWSER_HEADLESS !== "0";
const sourceId = process.env.IMAGE_COCKPIT_SOURCE_BROWSER_ID || "source";
const sourcePrompt = process.env.IMAGE_COCKPIT_SOURCE_BROWSER_PROMPT || defaultSourcePrompt();
const sourceNegativePrompt = process.env.IMAGE_COCKPIT_SOURCE_BROWSER_NEGATIVE || defaultSourceNegativePrompt();
const sourceNotes = process.env.IMAGE_COCKPIT_SOURCE_BROWSER_NOTES || "Browser QA source generation. Create a single full-body animation-ready pixel-art source image. Do not create placeholder, SVG, diagram, or text-only output.";
const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const reportDir = resolve(process.env.IMAGE_COCKPIT_SOURCE_BROWSER_REPORT_DIR || join("docs", "qa", "image-source-browser-smoke", `${sourceId}-${timestamp}`));
const handoffDir = resolve(process.env.IMAGE_COCKPIT_SOURCE_BROWSER_HANDOFF_DIR || join(reportDir, "handoff"));
const tempRoot = await mkdtemp(join(tmpdir(), "image-cockpit-source-browser-"));
const chromeProfileDir = join(tempRoot, "chrome-profile");
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
  console.error("Image source browser smoke requires Chrome or Edge. Set IMAGE_COCKPIT_BROWSER_COMMAND to a browser executable.");
  process.exit(1);
}

try {
  await mkdir(reportDir, { recursive: true });
  await mkdir(handoffDir, { recursive: true });

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
    "initial Pixel Art Generation workspace"
  );
  await setImageGenerationFields(sourcePrompt, sourceNegativePrompt, sourceNotes);
  await waitForButtonEnabled("Generate Pixel Art");
  const before = await pageSnapshot();
  const startedAt = new Date().toISOString();
  await clickButtonByText("Generate Pixel Art");
  await waitForEval(() => `document.body?.innerText.includes("Codex Jobs")`, "Codex job shelf appears");
  const jobId = await waitForRunningJobId();
  const beforeScreenshotPath = join(reportDir, "source-before-terminal.png");
  await captureScreenshot(beforeScreenshotPath);

  await waitForSourceTerminal(jobId, before.historyItems, before.codexFailureCards);
  await delay(800);

  const after = await pageSnapshot();
  lastSnapshot = after;
  const screenshotPath = join(reportDir, "source-after-terminal.png");
  await captureScreenshot(screenshotPath);
  const resultsList = await getJson(apiPort, "/api/codex/results").catch((error) => ({ error: error.message, results: [] }));
  const matchingImages = Array.isArray(resultsList.results)
    ? resultsList.results.filter((result) => result.name.startsWith(jobId) && /^image\//.test(result.mimeType ?? ""))
    : [];
  const finalImage = matchingImages.find((result) => /(?:\.png|\.webp)$/i.test(result.name)) ?? matchingImages[0];
  const sourceImagePath = finalImage ? await writeReturnedImage(apiPort, finalImage.name, join(reportDir, `${sourceId}.png`)) : "";
  const deliveredToHistory = after.historyItems > before.historyItems;
  const deliveredToPreview = after.canvasPreviewMode === "result" && Boolean(after.canvasPreviewName);
  const outboxFinalPresent = Boolean(finalImage);
  const falseSuccess = deliveredToHistory && !outboxFinalPresent;
  const blockedReason = after.codexFailureTexts.join(" | ");
  const resultStatus = deliveredToHistory && deliveredToPreview && outboxFinalPresent && !falseSuccess ? "pass" : "fail";
  const finishedAt = new Date().toISOString();

  report = {
    schema: "image-cockpit.source-browser-smoke.v1",
    createdAt: finishedAt,
    source: {
      sourceId,
      sourcePrompt,
      sourceNegativePrompt,
      sourceNotes,
      startedAt,
      finishedAt,
      browserUrl,
      viewport: "1280x720",
      jobId,
      resultStatus,
      qualityRank: resultStatus === "pass" ? "visual-review" : "failed",
      failurePrimary: resultStatus === "pass" ? "" : blockedReason ? "source_generation_failed" : "delivery_missing",
      deliveredToHistory,
      deliveredToPreview,
      outboxFinalPresent,
      falseSuccess,
      blockedReason,
      selectedHistoryName: after.selectedHistoryName,
      selectedHistoryMeta: after.selectedHistoryMeta,
      artifactPaths: {
        sourceImage: toReportPath(sourceImagePath),
        beforeScreenshot: toReportPath(beforeScreenshotPath),
        afterScreenshot: toReportPath(screenshotPath),
        handoffDir: toReportPath(handoffDir)
      },
      outboxResults: Array.isArray(resultsList.results)
        ? resultsList.results.map((result) => ({
            name: result.name,
            path: toReportPath(result.path),
            mimeType: result.mimeType,
            size: result.size,
            qualityGate: result.qualityGate
          }))
        : [],
      outboxError: resultsList.error || "",
      browserSnapshot: browserSnapshotForReport(after)
    }
  };
  await writeReports(report);
  if (resultStatus !== "pass") {
    throw new Error(`Image source browser smoke failed: ${blockedReason || "source not delivered to history/preview/outbox"}`);
  }
  console.log("Image source browser smoke passed.");
  console.log(`sourceId=${sourceId}`);
  console.log(`jobId=${jobId}`);
  console.log(`sourceImage=${sourceImagePath}`);
  console.log(`reportDir=${reportDir}`);
} catch (error) {
  if (!report) {
    report = {
      schema: "image-cockpit.source-browser-smoke.v1",
      createdAt: new Date().toISOString(),
      source: {
        sourceId,
        sourcePrompt,
        resultStatus: "fail",
        failurePrimary: "source_generation_failed",
        blockedReason: error instanceof Error ? error.message : String(error),
        browserSnapshot: browserSnapshotForReport(lastSnapshot)
      }
    };
    await mkdir(reportDir, { recursive: true });
    if (cdp) {
      const failureScreenshotPath = join(reportDir, "source-failure.png");
      await captureScreenshot(failureScreenshotPath).catch(() => null);
      report.source.artifactPaths = {
        failureScreenshot: toReportPath(failureScreenshotPath),
        handoffDir: toReportPath(handoffDir)
      };
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
  return {
    IMAGE_COCKPIT_API_PORT: String(apiPort),
    IMAGE_COCKPIT_HANDOFF_DIR: handoffDir,
    IMAGE_COCKPIT_CODEX_AUTORUN: "1",
    IMAGE_COCKPIT_ARTIFACT_STABLE_MS: "0"
  };
}

async function installBrowserPrelude() {
  await cdp.send("Page.addScriptToEvaluateOnNewDocument", {
    source: `
      window.__sourceBrowserErrors = [];
      window.addEventListener("error", (event) => {
        window.__sourceBrowserErrors.push(event.message || "window error");
      });
      window.addEventListener("unhandledrejection", (event) => {
        window.__sourceBrowserErrors.push(String(event.reason?.message || event.reason || "unhandled rejection"));
      });
      localStorage.setItem("image-cockpit.language", "en");
      localStorage.removeItem("image-cockpit.pendingCodexJob");
    `
  });
}

async function setImageGenerationFields(prompt, negativePrompt, notes) {
  await evaluate(`(() => {
    const values = [${JSON.stringify(prompt)}, ${JSON.stringify(negativePrompt)}, ${JSON.stringify(notes)}];
    const textareas = Array.from(document.querySelectorAll(".source-panel textarea"));
    if (textareas.length < 3) throw new Error("Expected prompt, negative prompt, and notes textareas.");
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set;
    values.forEach((value, index) => {
      setter.call(textareas[index], value);
      textareas[index].dispatchEvent(new Event("input", { bubbles: true }));
    });
  })()`);
  await waitForEval(() => `document.querySelector(".source-panel textarea")?.value.includes(${JSON.stringify(prompt.slice(0, 40))})`, "source prompt populated");
}

async function waitForRunningJobId() {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    const jobId = await evaluate(`(() => {
      const texts = Array.from(document.querySelectorAll(".codex-job-row small"))
        .map((item) => item.innerText.trim());
      return texts.find((text) => /^codex-job-/.test(text)) || "";
    })()`);
    if (jobId) return jobId;
    await delay(200);
  }
  throw new Error("Timed out waiting for running source job id");
}

async function waitForSourceTerminal(jobId, historyCountBefore, failureCountBefore) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const snapshot = await pageSnapshot();
    lastSnapshot = snapshot;
    const delivered = snapshot.historyItems > historyCountBefore && snapshot.canvasPreviewMode === "result";
    const failed = snapshot.codexFailureCards > failureCountBefore;
    const jobRowsCleared = snapshot.codexJobRows === 0 || !snapshot.text.includes(jobId);
    if ((delivered || failed) && jobRowsCleared) return;
    await delay(1000);
  }
  throw new Error(`Timed out after ${timeoutMs}ms waiting for source job ${jobId}`);
}

async function writeReturnedImage(apiPort, resultName, outputPath) {
  const imported = await getJson(apiPort, `/api/codex/results/${encodeURIComponent(resultName)}`);
  const match = imported.dataUrl.match(/^data:image\/(?:png|webp);base64,(.+)$/);
  if (!match) throw new Error(`Returned source result was not a PNG/WebP data URL: ${resultName}`);
  await writeFile(outputPath, Buffer.from(match[1], "base64"));
  return outputPath;
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

async function pageSnapshot() {
  return evaluate(`(() => {
    const selectedHistory = document.querySelector(".history-item.selected");
    return {
      text: document.body.innerText.replace(/\\s+/g, " ").trim(),
      buttons: Array.from(document.querySelectorAll("button")).map((button) => button.innerText.replace(/\\s+/g, " ").trim()).filter(Boolean),
      disabledButtons: Array.from(document.querySelectorAll("button:disabled")).map((button) => button.innerText.replace(/\\s+/g, " ").trim()).filter(Boolean),
      historyItems: document.querySelectorAll(".history-item").length,
      codexJobRows: document.querySelectorAll(".codex-job-row").length,
      codexFailureCards: document.querySelectorAll(".codex-failure-card").length,
      codexFailureTexts: Array.from(document.querySelectorAll(".codex-failure-card"))
        .map((card) => card.innerText.replace(/\\s+/g, " ").trim())
        .filter(Boolean),
      canvasPreviewMode: document.querySelector("canvas")?.dataset.previewMode || "",
      canvasPreviewName: document.querySelector("canvas")?.dataset.previewName || "",
      selectedHistoryName: selectedHistory?.querySelector("strong")?.innerText.trim() || "",
      selectedHistoryMeta: selectedHistory?.innerText.replace(/\\s+/g, " ").trim() || "",
      browserErrors: window.__sourceBrowserErrors || []
    };
  })()`);
}

async function writeReports(currentReport) {
  const source = currentReport.source;
  await writeFile(join(reportDir, "source-result.json"), `${JSON.stringify(source, null, 2)}\n`, "utf8");
  await writeFile(join(reportDir, "report.md"), reportMarkdown(currentReport), "utf8");
}

function reportMarkdown(currentReport) {
  const source = currentReport.source;
  return `# Image Source Browser Smoke

Created: ${currentReport.createdAt}

## Source

- sourceId: ${source.sourceId}
- resultStatus: ${source.resultStatus}
- qualityRank: ${source.qualityRank || ""}
- jobId: ${source.jobId || ""}
- deliveredToHistory: ${Boolean(source.deliveredToHistory)}
- deliveredToPreview: ${Boolean(source.deliveredToPreview)}
- outboxFinalPresent: ${Boolean(source.outboxFinalPresent)}
- falseSuccess: ${Boolean(source.falseSuccess)}
- failurePrimary: ${source.failurePrimary || "none"}
- blockedReason: ${source.blockedReason || "none"}
- selectedHistoryName: ${source.selectedHistoryName || ""}

## Artifacts

- sourceImage: ${source.artifactPaths?.sourceImage || ""}
- beforeScreenshot: ${source.artifactPaths?.beforeScreenshot || ""}
- afterScreenshot: ${source.artifactPaths?.afterScreenshot || source.artifactPaths?.failureScreenshot || ""}
- handoffDir: ${source.artifactPaths?.handoffDir || ""}
`;
}

function browserSnapshotForReport(snapshot) {
  if (!snapshot || typeof snapshot !== "object") return snapshot;
  const { text, ...safeSnapshot } = snapshot;
  return {
    ...sanitizeReportValue(safeSnapshot),
    textOmitted: typeof text === "string",
    textLength: typeof text === "string" ? text.length : 0
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

async function captureScreenshot(filePath) {
  const screenshot = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  await writeFile(filePath, Buffer.from(screenshot.data, "base64"));
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

function toReportPath(value) {
  if (typeof value !== "string" || !/^[A-Za-z]:[\\/]/.test(value)) return value;
  const relativePath = relative(process.cwd(), value);
  if (relativePath && !relativePath.startsWith("..") && !relativePath.includes(":")) {
    return relativePath.replace(/\\/g, "/");
  }
  return "<local-path>";
}

function defaultSourcePrompt() {
  return "Create a single full-body pixel-art character asset: a young fantasy adventurer with compact readable silhouette, centered idle-animation-ready stance, clear feet contact, transparent background preferred, crisp 32-bit RPG pixel-art rendering, no scenery, no readable text, no logo, no watermark. Keep the entire head, hair, hands, equipment, and both feet fully inside the image with comfortable transparent padding around the character. If transparency is unavailable, use a perfectly flat solid #00ff00 chroma-key background with no shadows, gradients, texture, floor plane, or lighting variation.";
}

function defaultSourceNegativePrompt() {
  return "blur, text, watermark, logo, cropped head, cropped feet, cut off body, extra limbs, duplicate character, scenery, detailed background, floor shadow, photorealistic, 3d render, vector art";
}

function delay(ms) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}
