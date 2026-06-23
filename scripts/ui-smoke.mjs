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
    `
  });
  await cdp.send("Page.navigate", { url: `http://127.0.0.1:${vitePort}/` });
  await waitForEval(() => `document.querySelectorAll(".guided-option").length === 2`, "Guided Start options");

  await assertGuidedStart();
  await assertLanguageSwitch();
  await assertPromptExamples();
  await assertCodexQueue();
  await assertWorkflow({
    index: 0,
    label: "Pixel Art Generation",
    route: "Route: Codex Handoff",
    buttons: ["Generate Pixel Art"],
    hiddenButtons: ["Import Latest", "Import File"],
    hiddenText: ["Sprite Actions", "Export Sprite"],
    requiredText: ["Pixel Art Prompt", "Generation Notes", "Preview", "Generation can take a few minutes."],
    exerciseButton: "Generate Pixel Art",
    expectedAfterExercise: "Imported from Local Inbox"
  });
  await assertWorkflow({
    index: 1,
    label: "Animation Generation",
    route: "Route: Codex Handoff",
    buttons: ["Upload Pixel Art", "Generate Animation", "Animated GIF", "Animated WebP", "Sprite Sheet"],
    hiddenButtons: ["Import Latest", "Import File"],
    hiddenText: ["Sprite Actions", "Export Sprite"],
    requiredText: ["1. Upload Pixel Art", "2. Choose Motion", "3. Generate", "4. Download", "Motion Prompt", "Prompt", "Preset", "5-direction chroma-key sprite sheet", "GIF Preview", "WebP Preview", "Sprite Sheet Preview"],
    preExerciseButtonChecks: [{ button: "Preset", expectedText: "Additional Prompt (optional)" }, { button: "Prompt", expectedText: "Motion Prompt" }],
    exerciseButton: "Generate Animation",
    expectedAfterExercise: "Animation generated",
    expectedAfterExerciseText: ["Animation frames ready", "Animated WebP", "512x512"],
    postExerciseButtons: ["Animated WebP", "Sprite Sheet"],
    expectedPreviewImages: 3,
    reloadAfterExercise: true
  });

  console.log("UI smoke passed.");
} finally {
  await cdp?.close();
  await stopProcess(browserProcess);
  await stopProcess(viteServer);
  await stopProcess(apiServer);
  await rm(tempRoot, { recursive: true, force: true });
}

async function assertGuidedStart() {
  const snapshot = await pageSnapshot();
  assert(snapshot.guidedOptions.length === 2, "Start screen should show two workflow options");
  ["Pixel Art Generation", "Animation Generation"].forEach((label) => {
    assert(snapshot.text.includes(label), `Guided Start missing ${label}`);
  });
  assert(snapshot.text.includes("No direct OpenAI API calls"), "Guided Start should state the local-first boundary");
  await maybeCapture("guided-start");
}

async function assertLanguageSwitch() {
  await evaluate(`(() => {
    const select = document.querySelector(".language-control select");
    select.value = "ja";
    select.dispatchEvent(new Event("change", { bubbles: true }));
  })()`);
  await waitForEval(() => `document.body.innerText.includes("作りたいものを選んでください")`, "Japanese Guided Start copy");
  await evaluate(`(() => {
    const select = document.querySelector(".language-control select");
    select.value = "en";
    select.dispatchEvent(new Event("change", { bubbles: true }));
  })()`);
  await waitForEval(() => `document.body.innerText.includes("Choose what to make")`, "English Guided Start copy");
}

async function assertPromptExamples() {
  await clickGuidedOption(0);
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
  assert(snapshot.text.includes("Pixel-art prompts tuned for Codex imagegen."), "Prompt Examples intro should be visible");
  assert(snapshot.buttons.includes("Copy Prompt"), "Prompt Examples should expose copy buttons");
  assert(snapshot.buttons.includes("Use Prompt"), "Prompt Examples should expose use buttons");
  const examplePrompt = await evaluate(`document.querySelector(".prompt-card-text")?.textContent || ""`);
  assert(examplePrompt.includes("clockwork mushroom courier"), "Prompt example text should be available for copy");
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

  await evaluate(`document.querySelector(".guided-link")?.click()`);
  await waitForEval(() => `document.querySelectorAll(".guided-option").length === 2`, "return to Guided Start after Prompt Examples");
}

async function assertCodexQueue() {
  await clickGuidedOption(0);
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

  await waitForEval(() => `document.querySelectorAll(".codex-job-row").length === 0`, "Codex queue drains after results return", 18000);
  await assertNoBrowserErrors("Codex queue");
  await evaluate(`document.querySelector(".guided-link")?.click()`);
  await waitForEval(() => `document.querySelectorAll(".guided-option").length === 2`, "return to Guided Start after Codex queue");
}

async function assertWorkflow({
  index,
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
  reloadAfterExercise = false
}) {
  await clickGuidedOption(index);
  await waitForEval(() => `document.body.innerText.includes(${JSON.stringify(label)})`, label);
  const snapshot = await pageSnapshot();
  assert(snapshot.text.includes(label), `${label} should be visible after selection`);
  assert(snapshot.buttons.includes("Pixel Art Generation"), `${label} should expose the Pixel Art Generation tab`);
  assert(snapshot.buttons.includes("Animation Generation"), `${label} should expose the Animation Generation tab`);
  assert(snapshot.workflowTabsInsidePanel, `${label} should place workflow tabs under 1. Workflow`);
  assert(!snapshot.workflowTabsInTopbar, `${label} should not place workflow tabs in the global header`);
  assert(snapshot.summary.includes(route), `${label} should select ${route}`);
  assert(snapshot.canvasVisible, `${label} should render the canvas`);
  assert(!snapshot.spriteBenchVisible, `${label} should keep the Sprite Actions panel hidden for now`);
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
    for (const button of postExerciseButtons) {
      await clickButtonByText(button);
    }
    await delay(250);
    await assertNoBrowserErrors(label);
    if (reloadAfterExercise) {
      await delay(500);
      await cdp.send("Page.reload", { ignoreCache: true });
      await waitForEval(() => `document.querySelectorAll(".guided-option").length === 2`, `${label} reload returned to Guided Start`);
      await clickGuidedOption(index);
      await waitForEval(() => `document.body.innerText.includes("Animation frames ready")`, `${label} persisted animation frames after reload`);
      await waitForEval(() => `document.body.innerText.includes("512x512")`, `${label} persisted 512x512 frame size after reload`);
      await assertNoBrowserErrors(`${label} reload persistence`);
    }
  }
  await maybeCapture(label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""));
  await evaluate(`document.querySelector(".guided-link")?.click()`);
  await waitForEval(() => `document.querySelectorAll(".guided-option").length === 2`, "return to Guided Start");
}

async function clickGuidedOption(index) {
  await evaluate(`document.querySelectorAll(".guided-option")[${index}]?.click()`);
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
    workflowTabsInsidePanel: Boolean(document.querySelector(".source-panel > .workflow-tabs")),
    workflowTabsInTopbar: Boolean(document.querySelector(".topbar .workflow-tabs")),
    canvasVisible: Boolean(document.querySelector("canvas")),
    spriteBenchVisible: Boolean(document.querySelector(".sprite-bench")),
    codexJobRows: document.querySelectorAll(".codex-job-row").length,
    animationPreviewImages: document.querySelectorAll(".animation-preview img").length
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
    throw new Error(result.exceptionDetails.text || "Browser evaluation failed");
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
