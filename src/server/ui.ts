import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import "dotenv/config";
import {
  bundleRemotionProject,
  rerenderFromBlueprint,
  runContentJob,
} from "../services/pipeline";
import { discoverTopics } from "../services/topicFinder";
import { VisualProvider } from "../services/visualFactory";
import {
  AspectRatioSchema,
  ContentBlueprintSchema,
  LanguageSchema,
  OutputTypeSchema,
  PresetIdSchema,
} from "../types/blueprint";

const PORT = Number(process.env.PORT || 4173);
const PUBLIC_DIR = path.resolve(process.cwd(), "public");
const OUTPUTS_DIR = path.resolve(process.cwd(), "outputs");

let cachedServeUrl: string | undefined;

async function getServeUrl(): Promise<string> {
  if (!cachedServeUrl) {
    cachedServeUrl = await bundleRemotionProject();
  }
  return cachedServeUrl;
}

function listOutputJobs() {
  if (!fs.existsSync(OUTPUTS_DIR)) return [];
  const dirs = fs
    .readdirSync(OUTPUTS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort()
    .reverse();

  return dirs.map((name) => {
    const dir = path.join(OUTPUTS_DIR, name);
    const carouselDir = path.join(dir, "carousel");
    const slides = fs.existsSync(carouselDir)
      ? fs
          .readdirSync(carouselDir)
          .filter((f) => f.endsWith(".png"))
          .sort()
      : [];
    const rawDir = path.join(dir, "raw_images");
    const rawImages = fs.existsSync(rawDir)
      ? fs
          .readdirSync(rawDir)
          .filter((f) => /\.(png|svg|jpe?g)$/i.test(f))
          .sort()
      : [];
    const hasPoster = fs.existsSync(path.join(dir, "poster.png"));
    const hasVideo = fs.existsSync(path.join(dir, "video.mp4"));
    const captionPath = path.join(dir, "caption.txt");
    const caption = fs.existsSync(captionPath)
      ? fs.readFileSync(captionPath, "utf-8")
      : "";
    const blueprintPath = path.join(dir, "blueprint.json");
    let topicTitle = "";
    let preset = "";
    let blueprint: unknown = null;
    if (fs.existsSync(blueprintPath)) {
      try {
        blueprint = JSON.parse(fs.readFileSync(blueprintPath, "utf-8"));
        const bp = blueprint as { topic?: string; preset?: string };
        topicTitle = bp.topic || "";
        preset = bp.preset || "";
      } catch {
        // ignore malformed blueprint
      }
    }
    return {
      name,
      topicTitle,
      preset,
      blueprint,
      slides,
      rawImages,
      hasPoster,
      hasVideo,
      caption,
    };
  });
}

function sendJson(res: http.ServerResponse, status: number, data: unknown) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

function serveStaticFile(res: http.ServerResponse, filePath: string) {
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }
  const ext = path.extname(filePath).toLowerCase();
  const contentType =
    ext === ".html"
      ? "text/html; charset=utf-8"
      : ext === ".png"
        ? "image/png"
        : ext === ".svg"
          ? "image/svg+xml"
          : ext === ".mp4"
            ? "video/mp4"
            : ext === ".json"
              ? "application/json; charset=utf-8"
              : "application/octet-stream";
  res.writeHead(200, { "Content-Type": contentType });
  fs.createReadStream(filePath).pipe(res);
}

const server = http.createServer(async (req, res) => {
  const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);

  if (req.method === "GET" && urlPath === "/") {
    return serveStaticFile(res, path.join(PUBLIC_DIR, "index.html"));
  }

  if (req.method === "GET" && urlPath === "/api/outputs") {
    return sendJson(res, 200, listOutputJobs());
  }

  if (req.method === "POST" && urlPath === "/api/discover") {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", async () => {
      try {
        const payload = JSON.parse(body || "{}");
        const topics = await discoverTopics({
          count: Number(payload.count) || 3,
          mock: Boolean(payload.mock),
        });
        return sendJson(res, 200, { topics });
      } catch (err) {
        return sendJson(res, 500, {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    });
    return;
  }

  if (req.method === "GET" && urlPath.startsWith("/api/outputs/") && urlPath.endsWith("/manifest")) {
    const name = urlPath.slice("/api/outputs/".length, -"/manifest".length);
    const target = path.resolve(OUTPUTS_DIR, name, "manifest.json");
    if (!name || !target.startsWith(OUTPUTS_DIR)) {
      return sendJson(res, 403, { error: "Forbidden" });
    }
    if (!fs.existsSync(target)) {
      return sendJson(res, 404, { error: "manifest.json tidak ditemukan" });
    }
    return sendJson(res, 200, JSON.parse(fs.readFileSync(target, "utf-8")));
  }

  if (req.method === "DELETE" && urlPath.startsWith("/api/outputs/")) {
    const name = urlPath.slice("/api/outputs/".length);
    const target = path.resolve(OUTPUTS_DIR, name);
    if (!name || !target.startsWith(OUTPUTS_DIR) || target === OUTPUTS_DIR) {
      return sendJson(res, 403, { error: "Forbidden" });
    }
    if (fs.existsSync(target)) {
      fs.rmSync(target, { recursive: true, force: true });
    }
    return sendJson(res, 200, { ok: true });
  }

  if (req.method === "GET" && urlPath.startsWith("/outputs/")) {
    const rel = urlPath.slice("/outputs/".length);
    const target = path.resolve(OUTPUTS_DIR, rel);
    if (!target.startsWith(OUTPUTS_DIR)) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }
    return serveStaticFile(res, target);
  }

  if (req.method === "POST" && urlPath === "/api/rerender") {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", async () => {
      try {
        const payload = JSON.parse(body || "{}");
        const folderName = String(payload.folderName || "").trim();
        const jobDir = path.resolve(OUTPUTS_DIR, folderName);
        if (
          !folderName ||
          !jobDir.startsWith(OUTPUTS_DIR) ||
          jobDir === OUTPUTS_DIR
        ) {
          return sendJson(res, 403, { error: "Forbidden" });
        }

        const blueprint = ContentBlueprintSchema.parse(payload.blueprint);
        const outputs = Array.isArray(payload.outputs)
          ? payload.outputs.map((o: unknown) => OutputTypeSchema.parse(o))
          : ["carousel", "video"];

        const needsRemotion = outputs.some((o: string) =>
          ["carousel", "poster", "video"].includes(o)
        );
        const serveUrl = needsRemotion ? await getServeUrl() : undefined;

        await rerenderFromBlueprint({
          jobDir,
          blueprint,
          outputs,
          voice: payload.voice ? String(payload.voice) : undefined,
          bgm: payload.bgm ? String(payload.bgm) : undefined,
          bgmVolume:
            typeof payload.bgmVolume === "number"
              ? payload.bgmVolume
              : undefined,
          serveUrl,
        });

        return sendJson(res, 200, { ok: true, folderName });
      } catch (err) {
        return sendJson(res, 500, {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    });
    return;
  }

  if (req.method === "POST" && urlPath === "/api/generate") {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", async () => {
      try {
        const payload = JSON.parse(body || "{}");
        const topic = String(payload.topic || "").trim();
        if (!topic) {
          return sendJson(res, 400, { error: "Topik wajib diisi." });
        }
        const preset = PresetIdSchema.parse(payload.preset || "noir_editorial");
        const outputs = Array.isArray(payload.outputs)
          ? payload.outputs.map((o: unknown) => OutputTypeSchema.parse(o))
          : ["carousel", "video"];

        const needsRemotion = outputs.some((o: string) =>
          ["carousel", "poster", "video"].includes(o)
        );
        const serveUrl = needsRemotion ? await getServeUrl() : undefined;

        const jobDir = await runContentJob({
          topic,
          preset,
          outputs,
          slides: Number(payload.slides) || 5,
          language: LanguageSchema.parse(payload.language || "id"),
          aspectRatio: AspectRatioSchema.parse(payload.aspectRatio || "4:5"),
          mock: Boolean(payload.mock),
          visualProvider: payload.visualProvider as VisualProvider | undefined,
          voice: payload.voice ? String(payload.voice) : undefined,
          bgm: payload.bgm ? String(payload.bgm) : undefined,
          bgmVolume:
            typeof payload.bgmVolume === "number"
              ? payload.bgmVolume
              : undefined,
          serveUrl,
        });

        const manifestPath = path.join(jobDir, "manifest.json");
        const manifest = fs.existsSync(manifestPath)
          ? JSON.parse(fs.readFileSync(manifestPath, "utf-8"))
          : null;

        return sendJson(res, 200, {
          ok: true,
          folderName: path.basename(jobDir),
          jobDir,
          manifest,
        });
      } catch (err) {
        return sendJson(res, 500, {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    });
    return;
  }

  res.writeHead(404);
  res.end("Not found");
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`\nAutocreate Studio UI berjalan di: http://127.0.0.1:${PORT}\n`);
});
