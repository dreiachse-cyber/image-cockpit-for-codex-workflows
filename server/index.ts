import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

const port = Number(process.env.IMAGE_COCKPIT_API_PORT ?? 8787);
const apiKey = process.env.OPENAI_API_KEY;
const imageModel = process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-2";

type GenerateRequest = {
  prompt?: string;
  negativePrompt?: string;
  seed?: string;
  size?: string;
  count?: number;
  quality?: string;
};

const server = createServer(async (request, response) => {
  response.setHeader("Access-Control-Allow-Origin", "http://127.0.0.1:5173");
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }

  try {
    if (request.method === "GET" && request.url === "/api/providers") {
      sendJson(response, 200, {
        providers: [
          { id: "local-file", label: "Local File", enabled: true, message: "Use images from this machine" },
          {
            id: "openai-images",
            label: "OpenAI Images",
            enabled: Boolean(apiKey),
            model: imageModel,
            message: apiKey ? `Ready: ${imageModel}` : "Set OPENAI_API_KEY and restart this server"
          },
          { id: "optional-adapter", label: "Optional Adapter", enabled: false, message: "No adapter configured" }
        ]
      });
      return;
    }

    if (request.method === "POST" && request.url === "/api/images/generate") {
      if (!apiKey) {
        sendJson(response, 409, { error: "OPENAI_API_KEY is not set for the local API server" });
        return;
      }

      const body = (await readJson(request)) as GenerateRequest;
      const prompt = [body.prompt, body.negativePrompt ? `Avoid: ${body.negativePrompt}` : "", body.seed ? `Seed note: ${body.seed}` : ""]
        .filter(Boolean)
        .join("\n");
      if (!prompt.trim()) {
        sendJson(response, 400, { error: "Prompt is required" });
        return;
      }

      const upstream = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: imageModel,
          prompt,
          size: normalizeSize(body.size),
          n: clamp(Math.floor(body.count ?? 1), 1, 4),
          quality: normalizeQuality(body.quality),
          output_format: "png"
        })
      });

      const payload = (await upstream.json()) as {
        data?: Array<{ b64_json?: string; url?: string }>;
        error?: { message?: string };
      };

      if (!upstream.ok) {
        sendJson(response, upstream.status, { error: payload.error?.message ?? "OpenAI image generation failed" });
        return;
      }

      sendJson(response, 200, {
        model: imageModel,
        images:
          payload.data
            ?.map((item) => item.b64_json || item.url)
            .filter((value): value is string => Boolean(value))
            .map((value) => (value.startsWith("http") ? value : `data:image/png;base64,${value}`)) ?? []
      });
      return;
    }

    sendJson(response, 404, { error: "Not found" });
  } catch (error) {
    sendJson(response, 500, { error: error instanceof Error ? error.message : "Internal server error" });
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Image Cockpit API server listening on http://127.0.0.1:${port}`);
});

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

function normalizeSize(size = "1024x1024") {
  return ["1024x1024", "1536x1024", "1024x1536"].includes(size) ? size : "1024x1024";
}

function normalizeQuality(quality = "auto") {
  return ["auto", "low", "medium", "high"].includes(quality) ? quality : "auto";
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
