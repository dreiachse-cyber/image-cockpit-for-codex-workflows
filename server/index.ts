import { mkdir, readdir, writeFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { join, resolve } from "node:path";

const port = Number(process.env.IMAGE_COCKPIT_API_PORT ?? 8787);
const handoffRoot = resolve(process.env.IMAGE_COCKPIT_HANDOFF_DIR ?? "codex-handoff");
const inboxDir = join(handoffRoot, "inbox");
const outboxDir = join(handoffRoot, "outbox");

type CodexJobRequest = {
  prompt?: string;
  negativePrompt?: string;
  seed?: string;
  size?: string;
  count?: number;
  quality?: string;
  selectedImageName?: string;
  selectedImageSize?: string;
  selectedImageSource?: string;
  action?: string;
  frames?: number;
};

const server = createServer(async (request, response) => {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }

  try {
    await ensureHandoffDirs();

    if (request.method === "GET" && request.url === "/api/providers") {
      sendJson(response, 200, {
        providers: [
          { id: "local-file", label: "Local File", enabled: true, message: "Use images from this machine" },
          {
            id: "codex-handoff",
            label: "Codex Handoff",
            enabled: true,
            path: inboxDir,
            message: "Write local jobs for Codex to pick up"
          },
          {
            id: "local-inbox",
            label: "Local Inbox",
            enabled: true,
            path: outboxDir,
            message: "Import results returned by Codex"
          }
        ]
      });
      return;
    }

    if (request.method === "GET" && request.url === "/api/codex/jobs") {
      const files = await readdir(inboxDir);
      sendJson(response, 200, {
        inboxPath: inboxDir,
        jobs: files.filter((file) => file.endsWith(".json")).sort().reverse().slice(0, 20)
      });
      return;
    }

    if (request.method === "POST" && request.url === "/api/codex/jobs") {
      const body = (await readJson(request)) as CodexJobRequest;
      if (!body.prompt?.trim()) {
        sendJson(response, 400, { error: "Prompt is required for a Codex handoff job" });
        return;
      }

      const createdAt = new Date().toISOString();
      const id = `codex-job-${createdAt.replace(/[:.]/g, "-")}`;
      const job = {
        id,
        createdAt,
        kind: "image-cockpit.codex-handoff",
        intent: "Ask local Codex to create or revise image assets, then return files to the outbox.",
        prompt: body.prompt,
        negativePrompt: body.negativePrompt ?? "",
        generationHints: {
          seed: body.seed ?? "",
          size: body.size ?? "1024x1024",
          count: body.count ?? 1,
          quality: body.quality ?? "auto"
        },
        selectedImage: {
          name: body.selectedImageName ?? "",
          size: body.selectedImageSize ?? "",
          source: body.selectedImageSource ?? ""
        },
        spriteContext: {
          action: body.action ?? "",
          frames: body.frames ?? 0
        },
        returnTo: {
          outboxDir,
          expected: ["png", "webp", "gif", "json"]
        },
        notes: [
          "This app does not call OpenAI APIs directly.",
          "Codex or the user should perform generation/editing externally and place results in the outbox or import them through the UI."
        ]
      };
      const path = join(inboxDir, `${id}.json`);
      await writeFile(path, JSON.stringify(job, null, 2), "utf8");
      sendJson(response, 200, { id, path, inboxPath: inboxDir, createdAt });
      return;
    }

    sendJson(response, 404, { error: "Not found" });
  } catch (error) {
    sendJson(response, 500, { error: error instanceof Error ? error.message : "Internal server error" });
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Image Cockpit local handoff server listening on http://127.0.0.1:${port}`);
  console.log(`Codex handoff inbox: ${inboxDir}`);
});

async function ensureHandoffDirs() {
  await mkdir(inboxDir, { recursive: true });
  await mkdir(outboxDir, { recursive: true });
}

function readJson(request: IncomingMessage) {
  return new Promise<unknown>((resolve, reject) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      try {
        const text = Buffer.concat(chunks).toString("utf8");
        resolve(text ? JSON.parse(text) : {});
      } catch (error) {
        reject(error);
      }
    });
    request.on("error", reject);
  });
}

function sendJson(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}
