import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import "dotenv/config";
import {
  bundleRemotionProject,
  rerenderFromBlueprint,
  runContentJob,
  saveSceneImageFromDataUri,
} from "../services/pipeline";
import { discoverTopics } from "../services/topicFinder";
import { extractReferenceUrls } from "../services/urlExtractor";
import { VisualProvider } from "../services/visualFactory";
import {
  AspectRatioSchema,
  ContentBlueprintSchema,
  LanguageSchema,
  OutputTypeSchema,
  PresetIdSchema,
  SeriesPresetSchema,
} from "../types/blueprint";
import {
  BrandkitOverride,
  BrandkitOverrideSchema,
  mapBrandkitSistemToOverride,
} from "../types/brandkit";
import {
  appendProductionLog,
  clearProductionLogs,
  LogSource,
  readProductionLogs,
} from "../utils/productionLog";
import { createZipBuffer, ZipEntry } from "../utils/zip";

async function runLoggedJob<T>(
  source: LogSource,
  meta: {
    topic: string;
    series?: string;
    preset: string;
    aspectRatio: string;
    outputs: string[];
  },
  fn: () => Promise<{ result: T; folderName?: string }>
): Promise<T> {
  const startedMs = Date.now();
  const startedAt = new Date(startedMs).toISOString();
  try {
    const { result, folderName } = await fn();
    appendProductionLog({
      id: `log_${startedMs.toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      startedAt,
      finishedAt: new Date().toISOString(),
      durationMs: Date.now() - startedMs,
      source,
      topic: meta.topic,
      series: meta.series,
      preset: meta.preset,
      aspectRatio: meta.aspectRatio,
      outputs: meta.outputs,
      status: "success",
      folderName,
    });
    return result;
  } catch (err) {
    appendProductionLog({
      id: `log_${startedMs.toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      startedAt,
      finishedAt: new Date().toISOString(),
      durationMs: Date.now() - startedMs,
      source,
      topic: meta.topic,
      series: meta.series,
      preset: meta.preset,
      aspectRatio: meta.aspectRatio,
      outputs: meta.outputs,
      status: "error",
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

interface BatchItem {
  topic: string;
  status: "queued" | "running" | "done" | "error";
  folderName?: string;
  error?: string;
}

interface BatchRun {
  id: string;
  createdAt: string;
  status: "running" | "completed";
  items: BatchItem[];
}

const batchRuns = new Map<string, BatchRun>();

function collectZipEntries(jobDir: string): ZipEntry[] {
  const entries: ZipEntry[] = [];
  const addFile = (absPath: string, zipName: string) => {
    if (fs.existsSync(absPath) && fs.statSync(absPath).isFile()) {
      entries.push({ name: zipName, data: fs.readFileSync(absPath) });
    }
  };

  for (const rootFile of [
    "poster.png",
    "video.mp4",
    "caption.txt",
    "blueprint.json",
    "manifest.json",
  ]) {
    addFile(path.join(jobDir, rootFile), rootFile);
  }

  for (const subDir of ["carousel", "raw_images"]) {
    const dirPath = path.join(jobDir, subDir);
    if (fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory()) {
      for (const file of fs.readdirSync(dirPath).sort()) {
        addFile(path.join(dirPath, file), `${subDir}/${file}`);
      }
    }
  }
  return entries;
}

const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || "127.0.0.1";
const PUBLIC_DIR = path.resolve(process.cwd(), "public");
const OUTPUTS_DIR = path.resolve(process.cwd(), "outputs");

function resolveOutputPath(...segments: string[]): string | null {
  if (segments.some((s) => !s || s.includes("\0"))) return null;
  const resolved = path.resolve(OUTPUTS_DIR, ...segments);
  const prefix = OUTPUTS_DIR.endsWith(path.sep)
    ? OUTPUTS_DIR
    : OUTPUTS_DIR + path.sep;
  return resolved.startsWith(prefix) ? resolved : null;
}

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
          .filter((f) => /\.(png|svg|jpe?g|webp)$/i.test(f))
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
        : ext === ".jpg" || ext === ".jpeg"
          ? "image/jpeg"
          : ext === ".webp"
            ? "image/webp"
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

  if (req.method === "GET" && urlPath === "/api/brandkit/brands") {
    const baseUrl = (
      process.env.BRANDKIT_API_URL || "http://127.0.0.1:8000/api"
    ).replace(/\/+$/, "");
    try {
      const upstream = await fetch(`${baseUrl}/brands`);
      if (!upstream.ok) {
        return sendJson(res, upstream.status, {
          error: `Brandkit API HTTP ${upstream.status}`,
        });
      }
      const data = await upstream.json();
      return sendJson(res, 200, data);
    } catch (err) {
      return sendJson(res, 502, {
        error:
          "Tidak dapat terhubung ke Brandkit API: " +
          (err instanceof Error ? err.message : String(err)),
      });
    }
  }

  if (req.method === "POST" && urlPath === "/api/jobs") {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", async () => {
      try {
        const payload = JSON.parse(body || "{}");
        const brief = payload.brief || payload;
        const topic = String(brief.topic || "").trim();
        if (!topic) {
          return sendJson(res, 400, { error: "brief.topic wajib diisi." });
        }

        let brandkit: BrandkitOverride | undefined;
        if (payload.brandkitUrl) {
          const bkRes = await fetch(String(payload.brandkitUrl));
          if (!bkRes.ok) {
            return sendJson(res, 502, {
              error: `Gagal mengambil brandkit dari ${payload.brandkitUrl} (HTTP ${bkRes.status})`,
            });
          }
          brandkit = mapBrandkitSistemToOverride(await bkRes.json());
        } else if (payload.brandId) {
          const baseUrl = (
            process.env.BRANDKIT_API_URL || "http://127.0.0.1:8000/api"
          ).replace(/\/+$/, "");
          const bkRes = await fetch(`${baseUrl}/brands/${payload.brandId}`);
          if (!bkRes.ok) {
            return sendJson(res, 502, {
              error: `Gagal mengambil brandkit ID ${payload.brandId} (HTTP ${bkRes.status})`,
            });
          }
          brandkit = mapBrandkitSistemToOverride(await bkRes.json());
        } else if (payload.brandkit) {
          // Accept either direct BrandkitOverride or raw BrandResource from brandkit-sistem
          const rawBk = payload.brandkit;
          brandkit =
            rawBk && typeof rawBk === "object" && ("identity" in rawBk || "logo_url" in rawBk)
              ? mapBrandkitSistemToOverride(rawBk)
              : BrandkitOverrideSchema.parse(rawBk);
        }

        const preset = PresetIdSchema.parse(brief.preset || "noir_editorial");
        const series = brief.series ? SeriesPresetSchema.parse(brief.series) : undefined;
        const aspectRatio = AspectRatioSchema.parse(brief.aspectRatio || "4:5");
        const outputs = Array.isArray(brief.outputs)
          ? brief.outputs.map((o: unknown) => OutputTypeSchema.parse(o))
          : ["carousel", "video"];

        const needsRemotion = outputs.some((o: string) =>
          ["carousel", "poster", "video"].includes(o)
        );
        const serveUrl = needsRemotion ? await getServeUrl() : undefined;

        const jobDir = await runLoggedJob(
          "api",
          { topic, series, preset, aspectRatio, outputs },
          async () => {
            const dir = await runContentJob({
              topic,
              preset,
              series,
              outputs,
              brandkit,
              slides: Number(brief.slides) || 5,
              language: LanguageSchema.parse(brief.language || "id"),
              aspectRatio,
              mock: Boolean(brief.mock),
              visualProvider: brief.visualProvider as VisualProvider | undefined,
              voice: brief.voice ? String(brief.voice) : undefined,
              bgm: brief.bgm ? String(brief.bgm) : undefined,
              bgmVolume:
                typeof brief.bgmVolume === "number" ? brief.bgmVolume : undefined,
              apiKeys:
                brief.apiKeys && typeof brief.apiKeys === "object"
                  ? {
                      gemini: brief.apiKeys.gemini
                        ? String(brief.apiKeys.gemini)
                        : undefined,
                      opencode: brief.apiKeys.opencode
                        ? String(brief.apiKeys.opencode)
                        : undefined,
                    }
                  : undefined,
              aiModels:
                brief.aiModels && typeof brief.aiModels === "object"
                  ? {
                      gemini: brief.aiModels.gemini
                        ? String(brief.aiModels.gemini)
                        : undefined,
                      opencode: brief.aiModels.opencode
                        ? String(brief.aiModels.opencode)
                        : undefined,
                    }
                  : undefined,
              customSceneImages:
                brief.customSceneImages &&
                typeof brief.customSceneImages === "object"
                  ? (brief.customSceneImages as Record<number, string>)
                  : payload.customSceneImages &&
                      typeof payload.customSceneImages === "object"
                    ? (payload.customSceneImages as Record<number, string>)
                    : undefined,
              referenceUrls: Array.isArray(brief.referenceUrls)
                ? brief.referenceUrls.map((u: unknown) => String(u)).filter(Boolean)
                : Array.isArray(payload.referenceUrls)
                  ? payload.referenceUrls.map((u: unknown) => String(u)).filter(Boolean)
                  : undefined,
              serveUrl,
            });
            return { result: dir, folderName: path.basename(dir) };
          }
        );

        const manifestPath = path.join(jobDir, "manifest.json");
        const manifest = fs.existsSync(manifestPath)
          ? JSON.parse(fs.readFileSync(manifestPath, "utf-8"))
          : null;

        if (payload.webhookUrl && manifest) {
          try {
            await fetch(String(payload.webhookUrl), {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ event: "job.completed", manifest }),
            });
          } catch (whErr) {
            console.warn("[Webhook] Gagal mengirim ke Sender:", whErr);
          }
        }

        return sendJson(res, 200, {
          ok: true,
          folderName: path.basename(jobDir),
          jobDir,
          brandkitApplied: brandkit ?? null,
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
    const target = resolveOutputPath(name, "manifest.json");
    if (!target) {
      return sendJson(res, 403, { error: "Forbidden" });
    }
    if (!fs.existsSync(target)) {
      return sendJson(res, 404, { error: "manifest.json tidak ditemukan" });
    }
    return sendJson(res, 200, JSON.parse(fs.readFileSync(target, "utf-8")));
  }

  if (req.method === "GET" && urlPath.startsWith("/api/outputs/") && urlPath.endsWith("/zip")) {
    const name = urlPath.slice("/api/outputs/".length, -"/zip".length);
    const jobDir = resolveOutputPath(name);
    if (!jobDir) {
      return sendJson(res, 403, { error: "Forbidden" });
    }
    if (!fs.existsSync(jobDir)) {
      return sendJson(res, 404, { error: "Project tidak ditemukan" });
    }
    const entries = collectZipEntries(jobDir);
    if (entries.length === 0) {
      return sendJson(res, 404, { error: "Tidak ada file untuk di-zip" });
    }
    const zipBuf = createZipBuffer(entries);
    const safeName = name.replace(/[^a-zA-Z0-9._-]/g, "_");
    res.writeHead(200, {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${safeName}.zip"`,
      "Content-Length": zipBuf.length,
    });
    res.end(zipBuf);
    return;
  }

  if (req.method === "POST" && urlPath === "/api/extract-urls") {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", async () => {
      try {
        const payload = JSON.parse(body || "{}");
        const urls = Array.isArray(payload.urls)
          ? payload.urls.map((u: unknown) => String(u || "").trim()).filter(Boolean)
          : [];
        if (urls.length === 0) {
          return sendJson(res, 400, { error: "Masukkan minimal 1 URL." });
        }
        const results = await extractReferenceUrls(urls);
        return sendJson(res, 200, { results });
      } catch (err) {
        return sendJson(res, 500, {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    });
    return;
  }

  if (req.method === "GET" && urlPath === "/api/logs") {
    return sendJson(res, 200, { logs: readProductionLogs(100) });
  }

  if (req.method === "DELETE" && urlPath === "/api/logs") {
    clearProductionLogs();
    return sendJson(res, 200, { ok: true });
  }

  if (req.method === "GET" && urlPath === "/api/batch") {
    const list = Array.from(batchRuns.values()).reverse().slice(0, 10);
    return sendJson(res, 200, { batches: list });
  }

  if (req.method === "GET" && urlPath.startsWith("/api/batch/")) {
    const id = urlPath.slice("/api/batch/".length);
    const batch = batchRuns.get(id);
    if (!batch) {
      return sendJson(res, 404, { error: "Batch tidak ditemukan" });
    }
    return sendJson(res, 200, batch);
  }

  if (req.method === "POST" && urlPath === "/api/batch") {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", async () => {
      try {
        const payload = JSON.parse(body || "{}");
        const rawTopics: string[] = Array.isArray(payload.topics)
          ? payload.topics.map((t: unknown) => String(t || "").trim()).filter(Boolean)
          : [];
        if (rawTopics.length === 0) {
          return sendJson(res, 400, { error: "Minimal 1 topik wajib diisi." });
        }
        const preset = PresetIdSchema.parse(payload.preset || "noir_editorial");
        const series = payload.series ? SeriesPresetSchema.parse(payload.series) : undefined;
        const outputs = Array.isArray(payload.outputs)
          ? payload.outputs.map((o: unknown) => OutputTypeSchema.parse(o))
          : ["carousel", "video"];
        const slides = Number(payload.slides) || 5;
        const language = LanguageSchema.parse(payload.language || "id");
        const aspectRatio = AspectRatioSchema.parse(payload.aspectRatio || "4:5");
        const mock = Boolean(payload.mock);
        const visualProvider = payload.visualProvider as VisualProvider | undefined;
        const voice = payload.voice ? String(payload.voice) : undefined;
        const bgm = payload.bgm ? String(payload.bgm) : undefined;
        const bgmVolume =
          typeof payload.bgmVolume === "number" ? payload.bgmVolume : undefined;
        const referenceUrls = Array.isArray(payload.referenceUrls)
          ? payload.referenceUrls.map((u: unknown) => String(u)).filter(Boolean)
          : undefined;

        const batchId = `batch_${Date.now().toString(36)}`;
        const batch: BatchRun = {
          id: batchId,
          createdAt: new Date().toISOString(),
          status: "running",
          items: rawTopics.map((topic) => ({ topic, status: "queued" })),
        };
        batchRuns.set(batchId, batch);

        // Run sequentially in background so Remotion Chromium doesn't overload CPU
        (async () => {
          const needsRemotion = outputs.some((o: string) =>
            ["carousel", "poster", "video"].includes(o)
          );
          let serveUrl: string | undefined;
          try {
            serveUrl = needsRemotion ? await getServeUrl() : undefined;
          } catch (err) {
            for (const item of batch.items) {
              item.status = "error";
              item.error = err instanceof Error ? err.message : String(err);
            }
            batch.status = "completed";
            return;
          }

          for (const item of batch.items) {
            item.status = "running";
            try {
              const jobDir = await runLoggedJob(
                "batch",
                { topic: item.topic, series, preset, aspectRatio, outputs },
                async () => {
                  const dir = await runContentJob({
                    topic: item.topic,
                    preset,
                    series,
                    outputs,
                    slides,
                    language,
                    aspectRatio,
                    mock,
                    visualProvider,
                    voice,
                    bgm,
                    bgmVolume,
                    referenceUrls,
                    serveUrl,
                  });
                  return { result: dir, folderName: path.basename(dir) };
                }
              );
              item.status = "done";
              item.folderName = path.basename(jobDir);
            } catch (err) {
              item.status = "error";
              item.error = err instanceof Error ? err.message : String(err);
            }
          }
          batch.status = "completed";
        })();

        return sendJson(res, 202, batch);
      } catch (err) {
        return sendJson(res, 400, {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    });
    return;
  }

  if (req.method === "DELETE" && urlPath.startsWith("/api/outputs/")) {
    const name = urlPath.slice("/api/outputs/".length);
    const target = resolveOutputPath(name);
    if (!target) {
      return sendJson(res, 403, { error: "Forbidden" });
    }
    if (fs.existsSync(target)) {
      fs.rmSync(target, { recursive: true, force: true });
    }
    return sendJson(res, 200, { ok: true });
  }

  if (req.method === "GET" && urlPath.startsWith("/outputs/")) {
    const rel = urlPath.slice("/outputs/".length);
    const target = resolveOutputPath(rel);
    if (!target) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }
    return serveStaticFile(res, target);
  }

  if (
    req.method === "POST" &&
    urlPath.startsWith("/api/outputs/") &&
    urlPath.endsWith("/scene-image")
  ) {
    const folderName = urlPath.slice(
      "/api/outputs/".length,
      -"/scene-image".length
    );
    const jobDir = resolveOutputPath(folderName);
    if (!jobDir || !fs.existsSync(jobDir)) {
      return sendJson(res, 404, { error: "Project tidak ditemukan." });
    }

    const MAX_BYTES = 20 * 1024 * 1024;
    let body = "";
    let tooLarge = false;
    req.on("data", (chunk) => {
      if (tooLarge) return;
      body += chunk;
      if (Buffer.byteLength(body, "utf-8") > MAX_BYTES) {
        tooLarge = true;
        sendJson(res, 413, { error: "Ukuran file gambar maksimal ~15MB." });
        req.destroy();
      }
    });
    req.on("end", () => {
      if (tooLarge) return;
      try {
        const payload = JSON.parse(body || "{}");
        const sceneIndex = Number(payload.sceneIndex);
        const dataUri = String(payload.dataUri || "");
        if (!Number.isInteger(sceneIndex) || sceneIndex < 1) {
          return sendJson(res, 400, { error: "sceneIndex tidak valid." });
        }
        const savedPath = saveSceneImageFromDataUri(
          path.join(jobDir, "raw_images"),
          sceneIndex,
          dataUri
        );
        const filename = path.basename(savedPath);
        return sendJson(res, 200, {
          ok: true,
          sceneIndex,
          filename,
          url: `/outputs/${encodeURIComponent(folderName)}/raw_images/${encodeURIComponent(filename)}?t=${Date.now()}`,
        });
      } catch (err) {
        return sendJson(res, 400, {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    });
    return;
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
        const jobDir = resolveOutputPath(folderName);
        if (!jobDir) {
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

        await runLoggedJob(
          "rerender",
          {
            topic: blueprint.topic,
            series: blueprint.series,
            preset: blueprint.preset,
            aspectRatio: blueprint.aspectRatio,
            outputs,
          },
          async () => {
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
            return { result: true, folderName };
          }
        );

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
        const referenceUrls = Array.isArray(payload.referenceUrls)
          ? payload.referenceUrls.map((u: unknown) => String(u)).filter(Boolean)
          : undefined;
        if (!topic && (!referenceUrls || referenceUrls.length === 0)) {
          return sendJson(res, 400, {
            error: "Topik atau minimal 1 Link Referensi wajib diisi.",
          });
        }
        const preset = PresetIdSchema.parse(payload.preset || "noir_editorial");
        const series = payload.series ? SeriesPresetSchema.parse(payload.series) : undefined;
        const outputs = Array.isArray(payload.outputs)
          ? payload.outputs.map((o: unknown) => OutputTypeSchema.parse(o))
          : ["carousel", "video"];

        const needsRemotion = outputs.some((o: string) =>
          ["carousel", "poster", "video"].includes(o)
        );
        const serveUrl = needsRemotion ? await getServeUrl() : undefined;

        const aspectRatio = AspectRatioSchema.parse(payload.aspectRatio || "4:5");
        const jobDir = await runLoggedJob(
          "manual",
          {
            topic: topic || referenceUrls?.[0] || "Ringkasan Referensi",
            series,
            preset,
            aspectRatio,
            outputs,
          },
          async () => {
            const dir = await runContentJob({
              topic,
              preset,
              series,
              outputs,
              slides: Number(payload.slides) || 5,
              language: LanguageSchema.parse(payload.language || "id"),
              aspectRatio,
              mock: Boolean(payload.mock),
              visualProvider: payload.visualProvider as VisualProvider | undefined,
              voice: payload.voice ? String(payload.voice) : undefined,
              bgm: payload.bgm ? String(payload.bgm) : undefined,
              bgmVolume:
                typeof payload.bgmVolume === "number"
                  ? payload.bgmVolume
                  : undefined,
              customSceneImages:
                payload.customSceneImages &&
                typeof payload.customSceneImages === "object"
                  ? (payload.customSceneImages as Record<number, string>)
                  : undefined,
              referenceUrls,
              serveUrl,
            });
            return { result: dir, folderName: path.basename(dir) };
          }
        );

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

server.listen(PORT, HOST, () => {
  console.log(`\nAutocreate Studio UI berjalan di: http://${HOST}:${PORT}\n`);
});
