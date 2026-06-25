import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";

const nodeCommand = process.execPath;
const browserCommand = process.env.IMAGE_COCKPIT_BROWSER_COMMAND || findBrowserCommand();
const outputDir = resolve(process.env.IMAGE_COCKPIT_README_SCREENSHOT_DIR || "docs/demo/readme");
const viewport = {
  width: Number(process.env.IMAGE_COCKPIT_README_SCREENSHOT_WIDTH || 1600),
  height: Number(process.env.IMAGE_COCKPIT_README_SCREENSHOT_HEIGHT || 900)
};

if (!browserCommand) {
  console.error("README screenshot capture requires Chrome or Edge. Set IMAGE_COCKPIT_BROWSER_COMMAND to a browser executable.");
  process.exit(1);
}

const tempRoot = await mkdtempCompat(join(tmpdir(), "image-cockpit-readme-capture-"));
const handoffDir = join(tempRoot, "handoff");
const chromeProfileDir = join(tempRoot, "chrome-profile");
const apiPort = await getOpenPort();
const vitePort = await getOpenPort();
const debugPort = await getOpenPort();

let apiServer;
let viteServer;
let browserProcess;
let cdp;

try {
  await mkdir(outputDir, { recursive: true });
  apiServer = startProcess(nodeCommand, ["node_modules/tsx/dist/cli.mjs", "server/index.ts"], {
    IMAGE_COCKPIT_API_PORT: String(apiPort),
    IMAGE_COCKPIT_HANDOFF_DIR: handoffDir,
    IMAGE_COCKPIT_CODEX_AUTORUN: "0"
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
    `--window-size=${viewport.width},${viewport.height}`,
    "about:blank"
  ]);

  const target = await waitForPageTarget(debugPort);
  cdp = await createCdpClient(target.webSocketDebuggerUrl);
  await cdp.send("Page.enable");
  await cdp.send("DOM.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Page.addScriptToEvaluateOnNewDocument", {
    source: `
      localStorage.setItem("image-cockpit.language", "en");
      localStorage.removeItem("image-cockpit.pendingCodexJob");
    `
  });
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: viewport.width,
    height: viewport.height,
    deviceScaleFactor: 1,
    mobile: false
  });

  await openApp();
  await seedReadmeState("pixel");
  await openApp();
  await loadPromptExample("Boy Adventurer");
  await tidyWorkspaceScroll();
  await capture("pixel-art-generation.png");

  await openPromptExamplesModal();
  await capture("prompt-examples-modal.png");
  await closeModal();

  await seedReadmeState("pixel");
  await openApp();
  await selectWorkflowTab("Image Editing");
  await setPrimaryTextarea("Clean up the cloak edge, brighten the face slightly, and preserve the transparent background.");
  await drawReadmeAnnotation();
  await tidyWorkspaceScroll();
  await capture("image-editing.png");

  await seedReadmeState("animation");
  await openApp();
  await selectWorkflowTab("Animation Generation");
  await waitForEval(
    () => `document.querySelectorAll(".direction-preview-row img").length === 5 && document.body.innerText.includes("Sprite Sheet Preview")`,
    "Animation Generation readme preview",
    20000
  );
  await tidyWorkspaceScroll();
  await capture("animation-generation.png");

  console.log(`README screenshots captured in ${outputDir}`);
} finally {
  await cdp?.close();
  await stopProcess(browserProcess);
  await stopProcess(viteServer);
  await stopProcess(apiServer);
  await rm(tempRoot, { recursive: true, force: true });
}

async function mkdtempCompat(prefix) {
  const { mkdtemp } = await import("node:fs/promises");
  return mkdtemp(prefix);
}

async function openApp() {
  await cdp.send("Page.navigate", { url: `http://127.0.0.1:${vitePort}/` });
  await waitForEval(
    () => `Boolean(document.querySelector(".source-panel > .workflow-tabs")) && document.body.innerText.length > 100`,
    "Image Cockpit workspace"
  );
  await evaluate(`(() => {
    localStorage.setItem("image-cockpit.language", "en");
    document.querySelector(".source-panel")?.scrollTo(0, 0);
    document.querySelector(".history-list")?.scrollTo(0, 0);
    document.querySelector(".result-preview-frame")?.scrollTo(0, 0);
  })()`);
}

async function seedReadmeState(mode) {
  await waitForEval(() => `document.querySelectorAll(".history-item").length > 0`, "initial sample workspace");
  await evaluate(`(${seedReadmeStateInBrowser.toString()})(${JSON.stringify(mode)})`, 30000);
  await cdp.send("Page.reload", { ignoreCache: true });
  await waitForEval(
    () => `document.body.innerText.includes("Pixel Art Generation") && document.body.innerText.includes("boy-adventurer-prompt-example.png")`,
    "seeded README state",
    15000
  );
}

async function loadPromptExample(title) {
  await openPromptExamplesModal();
  await evaluate(`(() => {
    const cards = Array.from(document.querySelectorAll(".prompt-card"));
    const card = cards.find((item) => item.innerText.includes(${JSON.stringify(title)}));
    if (!card) throw new Error("Prompt example card not found: ${title}");
    const button = Array.from(card.querySelectorAll("button"))
      .find((item) => item.innerText.replace(/\\s+/g, " ").trim() === "Use Prompt");
    if (!button) throw new Error("Use Prompt button not found for ${title}");
    button.click();
  })()`);
  await waitForEval(() => `!document.querySelector(".prompt-modal")`, "Prompt Examples modal closed");
  await waitForEval(() => `document.querySelector("textarea")?.value.includes("cheerful young boy adventurer")`, "Boy Adventurer prompt loaded");
}

async function openPromptExamplesModal() {
  await selectWorkflowTab("Pixel Art Generation");
  await clickButtonByText("Prompt Examples");
  await waitForEval(
    () => `document.querySelector(".prompt-modal")?.innerText.includes("Boy Adventurer") && document.querySelectorAll(".prompt-card-preview img").length >= 18`,
    "Prompt Examples modal"
  );
  await evaluate(`(() => {
    const modal = document.querySelector(".prompt-modal");
    if (modal) modal.scrollTop = 0;
  })()`);
}

async function closeModal() {
  await evaluate(`(() => {
    const button = document.querySelector('.prompt-modal button[aria-label="Close"]');
    if (!button) throw new Error("Close button not found");
    button.click();
  })()`);
  await waitForEval(() => `!document.querySelector(".prompt-modal")`, "modal closes");
}

async function selectWorkflowTab(label) {
  await clickButtonByText(label);
  await waitForEval(() => `document.querySelector(".workflow-summary")?.innerText.includes(${JSON.stringify(label)})`, `${label} selected`);
}

async function drawReadmeAnnotation() {
  await waitForEval(
    () => `document.querySelector("canvas") && document.body.innerText.includes("Numbered edit regions")`,
    "Image Editing canvas"
  );
  const rect = await evaluate(`(() => {
    const canvas = document.querySelector("canvas");
    const rect = canvas.getBoundingClientRect();
    return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
  })()`);
  const start = { x: Math.round(rect.left + rect.width * 0.42), y: Math.round(rect.top + rect.height * 0.26) };
  const end = { x: Math.round(rect.left + rect.width * 0.62), y: Math.round(rect.top + rect.height * 0.70) };
  await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x: start.x, y: start.y, button: "left", clickCount: 1 });
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: end.x, y: end.y, button: "left" });
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: end.x, y: end.y, button: "left", clickCount: 1 });
  await waitForEval(() => `document.querySelectorAll(".annotation-region-row").length === 1`, "readme annotation row");
  await evaluate(`(() => {
    const field = document.querySelector(".annotation-comment-field");
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set
      || Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter.call(field, "Clean cloak edge; keep transparency.");
    field.dispatchEvent(new Event("input", { bubbles: true }));
  })()`);
  await waitForEval(
    () => `document.querySelector(".annotation-comment-field")?.value.includes("transparency")`,
    "readme annotation comment"
  );
}

async function setPrimaryTextarea(value) {
  await evaluate(`(() => {
    const field = document.querySelector(".source-panel textarea");
    if (!field) throw new Error("Primary textarea not found");
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set;
    setter.call(field, ${JSON.stringify(value)});
    field.dispatchEvent(new Event("input", { bubbles: true }));
  })()`);
  await waitForEval(
    () => `document.querySelector(".source-panel textarea")?.value === ${JSON.stringify(value)}`,
    "primary textarea update"
  );
}

async function tidyWorkspaceScroll() {
  await evaluate(`(() => {
    document.querySelector(".source-panel")?.scrollTo(0, 0);
    document.querySelector(".history-list")?.scrollTo(0, 0);
    document.querySelector(".result-preview-frame")?.scrollTo(0, 0);
    document.querySelector(".canvas-stage")?.scrollTo(0, 0);
  })()`);
  await delay(300);
}

async function capture(name) {
  await assertNoLocalPrivateText(name);
  const screenshot = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  await writeFile(join(outputDir, name), Buffer.from(screenshot.data, "base64"));
}

async function assertNoLocalPrivateText(label) {
  const text = await evaluate(`document.body.innerText`);
  const blocked = [/C:\\\\/i, /D:\\\\/i, /Users\\\\/i, /AppData/i, /codex-handoff/i, /tmp/i, /Temp/i, /codex-job-/i];
  const match = blocked.find((pattern) => pattern.test(text));
  if (match) throw new Error(`${label} includes private or temporary text matching ${match}`);
}

async function clickButtonByText(label) {
  const clicked = await evaluate(`(() => {
    const target = Array.from(document.querySelectorAll("button"))
      .find((button) => button.innerText.replace(/\\s+/g, " ").trim() === ${JSON.stringify(label)});
    if (!target) return false;
    target.click();
    return true;
  })()`);
  if (!clicked) throw new Error(`Button not found: ${label}`);
  await delay(250);
}

async function evaluate(expression, timeoutMs = 10000) {
  const result = await cdp.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
    timeout: timeoutMs
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

function seedReadmeStateInBrowser(mode) {
  const HISTORY_KEY = "image-cockpit.v3.history";
  const FRAMES_KEY = "image-cockpit.v3.frames";
  const ACTIONS_KEY = "image-cockpit.v3.actions";
  const LIBRARY_KEY = "image-cockpit.v3.animation-library";
  const DB_NAME = "image-cockpit-local-state";
  const STORE_NAME = "state";
  const createdAt = "2026-06-26T00:00:00.000Z";
  const cell = { width: 256, height: 256 };
  const anchor = { x: 128, y: 236 };

  const readAsDataUrl = async (path) => {
    const response = await fetch(path);
    if (!response.ok) throw new Error(`Could not fetch ${path}`);
    const blob = await response.blob();
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  };

  const imageInfo = (src) =>
    new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight, image });
      image.onerror = () => reject(new Error("Could not load image"));
      image.src = src;
    });

  const splitSheet = async (dataUrl, sourceId) => {
    const { image } = await imageInfo(dataUrl);
    const canvas = document.createElement("canvas");
    canvas.width = cell.width;
    canvas.height = cell.height;
    const context = canvas.getContext("2d");
    const frames = [];
    for (let row = 0; row < 5; row += 1) {
      for (let column = 0; column < 8; column += 1) {
        context.clearRect(0, 0, cell.width, cell.height);
        context.drawImage(
          image,
          column * cell.width,
          row * cell.height,
          cell.width,
          cell.height,
          0,
          0,
          cell.width,
          cell.height
        );
        const index = row * 8 + column;
        frames.push({
          id: `readme-idle-frame-${String(index + 1).padStart(2, "0")}`,
          name: `readme-idle-frame-${String(index + 1).padStart(2, "0")}.png`,
          dataUrl: canvas.toDataURL("image/png"),
          width: cell.width,
          height: cell.height,
          sourceId,
          index
        });
      }
    }
    return frames;
  };

  const saveIndexed = (key, value) =>
    new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(STORE_NAME)) database.createObjectStore(STORE_NAME);
      };
      request.onsuccess = () => {
        const database = request.result;
        const transaction = database.transaction(STORE_NAME, "readwrite");
        transaction.objectStore(STORE_NAME).put(value, key);
        transaction.oncomplete = () => {
          database.close();
          resolve();
        };
        transaction.onerror = () => {
          database.close();
          reject(transaction.error);
        };
      };
      request.onerror = () => reject(request.error);
    });

  return (async () => {
    const boyDataUrl = await readAsDataUrl("/prompt-examples/basic-boy-adventurer.png");
    const mageDataUrl = await readAsDataUrl("/prompt-examples/forest-mage-idle.png");
    const sheetDataUrl = await readAsDataUrl("/samples/idle-breathing-sheet.png");
    const boyInfo = await imageInfo(boyDataUrl);
    const mageInfo = await imageInfo(mageDataUrl);
    const sheetInfo = await imageInfo(sheetDataUrl);

    const sourceItem = {
      id: "readme-source-boy-adventurer",
      name: "boy-adventurer-prompt-example.png",
      dataUrl: boyDataUrl,
      provider: "codex-handoff",
      prompt: "Basic Character prompt example: cheerful young boy adventurer, full-body pixel art, transparent background.",
      seed: "readme-capture",
      size: `${boyInfo.width}x${boyInfo.height}`,
      createdAt,
      adopted: true,
      source: "generate"
    };
    const mageItem = {
      id: "readme-source-forest-mage",
      name: "forest-mage-idle-prompt-example.png",
      dataUrl: mageDataUrl,
      provider: "codex-handoff",
      prompt: "Prompt example source prepared for animation generation.",
      seed: "readme-capture",
      size: `${mageInfo.width}x${mageInfo.height}`,
      createdAt,
      adopted: false,
      source: "generate"
    };
    const animationItem = {
      id: "readme-animation-idle-breathing",
      name: "boy-adventurer-idle-breathing-5-direction-sheet.png",
      dataUrl: sheetDataUrl,
      provider: "codex-handoff",
      prompt: "Idle Breathing official preset: stable five-direction sprite sheet with clean frames.",
      seed: "readme-capture",
      size: `${sheetInfo.width}x${sheetInfo.height}`,
      createdAt,
      adopted: false,
      source: "generate",
      derivedFromId: sourceItem.id,
      derivedFromName: sourceItem.name
    };
    const frames = await splitSheet(sheetDataUrl, animationItem.id);
    const actions = [
      { name: "idle", fps: 12, loop: true, frameIds: frames.map((frame) => frame.id), cell, anchor },
      { name: "walk", fps: 12, loop: true, frameIds: [], cell, anchor },
      { name: "cast", fps: 10, loop: false, frameIds: [], cell, anchor },
      { name: "attack", fps: 10, loop: false, frameIds: [], cell, anchor },
      { name: "run", fps: 20, loop: true, playbackMode: "ping-pong-reverse", frameIds: [], cell, anchor }
    ];
    const history = mode === "animation"
      ? [animationItem, sourceItem, mageItem]
      : [sourceItem, mageItem, animationItem];

    localStorage.setItem("image-cockpit.language", "en");
    localStorage.removeItem("image-cockpit.pendingCodexJob");
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    localStorage.setItem(FRAMES_KEY, JSON.stringify(frames));
    localStorage.setItem(ACTIONS_KEY, JSON.stringify(actions));
    localStorage.setItem(LIBRARY_KEY, JSON.stringify([]));
    await Promise.all([
      saveIndexed(HISTORY_KEY, history),
      saveIndexed(FRAMES_KEY, frames),
      saveIndexed(ACTIONS_KEY, actions),
      saveIndexed(LIBRARY_KEY, [])
    ]);
  })();
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

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
