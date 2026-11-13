import fs from "node:fs";
import path from "node:path";
import { bundle } from "@remotion/bundler";
import { renderMedia, renderStill, selectComposition } from "@remotion/renderer";
import { loadBrandConfig } from "../config/brand";
import { generateBlueprint } from "./gemini";
import { generateVoiceovers, WordTiming } from "./tts";
import { generateRawVisuals, VisualProvider } from "./visualFactory";
import {
  AspectRatio,
  ContentBlueprint,
  Language,
  OutputType,
  PresetId,
} from "../types/blueprint";
import { OutputManifest } from "../types/manifest";

export interface ContentJobOptions {
  topic: string;
  preset: PresetId;
  outputs: OutputType[];
  brandTag?: string;
  slides?: number;
  language?: Language;
  aspectRatio?: AspectRatio;
  mock?: boolean;
  visualProvider?: VisualProvider;
  voice?: string;
  noTts?: boolean;
  bgm?: string;
  bgmVolume?: number;
  /** Optional pre-bundled Remotion serveUrl to speed up batch runs */
  serveUrl?: string;
}

export async function bundleRemotionProject(): Promise<string> {
  const entryPoint = path.resolve(process.cwd(), "src/remotion/index.ts");
  return bundle({ entryPoint });
}

/**
 * Runs the full content generation pipeline for a single topic
 * and returns the output directory path.
 */
export async function runContentJob(
  options: ContentJobOptions
): Promise<string> {
  const brandConfig = loadBrandConfig();
  const {
    topic,
    preset,
    outputs,
    brandTag = brandConfig.brandTag,
    slides = 5,
    language = "id",
    aspectRatio = "4:5",
    mock = false,
    visualProvider,
    voice,
    noTts = false,
    bgm,
    bgmVolume,
  } = options;

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const jobDir = path.resolve(
    process.cwd(),
    "outputs",
    `${timestamp}_${slugify(topic)}`
  );

  console.log(
    `\n[1/4] Membuat Content Blueprint (${mock ? "MOCK" : "GEMINI/FALLBACK"}, ${language.toUpperCase()}, ${aspectRatio})...`
  );
  const blueprint = await generateBlueprint({
    topic,
    preset,
    brandTag,
    slideCount: slides,
    language,
    aspectRatio,
    mock,
  });

  fs.mkdirSync(jobDir, { recursive: true });
  fs.writeFileSync(
    path.join(jobDir, "blueprint.json"),
    JSON.stringify(blueprint, null, 2),
    "utf-8"
  );
  fs.writeFileSync(
    path.join(jobDir, "caption.txt"),
    `${blueprint.caption}\n\n${blueprint.hashtags.join(" ")}\n`,
    "utf-8"
  );

  console.log(`[2/4] Menghasilkan Raw Visual Assets...`);
  const rawDir = path.join(jobDir, "raw_images");
  const visuals = await generateRawVisuals(blueprint, rawDir, visualProvider);

  const sceneBgDataUris: Record<number, string> = {};
  for (const [idxStr, filePath] of Object.entries(visuals.sceneImages)) {
    sceneBgDataUris[Number(idxStr)] = fileToDataUri(filePath);
  }

  return renderJobFromBlueprint({
    jobDir,
    blueprint,
    sceneBgDataUris,
    outputs,
    voice,
    noTts,
    bgm,
    bgmVolume,
    serveUrl: options.serveUrl,
  });
}

export interface RerenderOptions {
  jobDir: string;
  blueprint: ContentBlueprint;
  outputs: OutputType[];
  voice?: string;
  noTts?: boolean;
  bgm?: string;
  bgmVolume?: number;
  serveUrl?: string;
}

/**
 * Re-renders selected outputs from an edited ContentBlueprint without calling AI again,
 * reusing existing raw_images on disk.
 */
export async function rerenderFromBlueprint(
  options: RerenderOptions
): Promise<string> {
  const {
    jobDir,
    blueprint,
    outputs,
    voice,
    noTts = false,
    bgm,
    bgmVolume,
    serveUrl,
  } = options;

  fs.mkdirSync(jobDir, { recursive: true });
  fs.writeFileSync(
    path.join(jobDir, "blueprint.json"),
    JSON.stringify(blueprint, null, 2),
    "utf-8"
  );
  fs.writeFileSync(
    path.join(jobDir, "caption.txt"),
    `${blueprint.caption}\n\n${blueprint.hashtags.join(" ")}\n`,
    "utf-8"
  );

  const rawDir = path.join(jobDir, "raw_images");
  const sceneBgDataUris: Record<number, string> = {};

  for (const scene of blueprint.scenes) {
    const candidates = [
      path.join(rawDir, `raw_scene_${scene.index}.png`),
      path.join(rawDir, `raw_scene_${scene.index}.jpg`),
      path.join(rawDir, `raw_scene_${scene.index}.svg`),
    ];
    const existing = candidates.find((p) => fs.existsSync(p));
    if (existing) {
      sceneBgDataUris[scene.index] = fileToDataUri(existing);
    }
  }

  if (Object.keys(sceneBgDataUris).length === 0) {
    const visuals = await generateRawVisuals(blueprint, rawDir, "procedural");
    for (const [idxStr, filePath] of Object.entries(visuals.sceneImages)) {
      sceneBgDataUris[Number(idxStr)] = fileToDataUri(filePath);
    }
  }

  return renderJobFromBlueprint({
    jobDir,
    blueprint,
    sceneBgDataUris,
    outputs,
    voice,
    noTts,
    bgm,
    bgmVolume,
    serveUrl,
  });
}

async function renderJobFromBlueprint(params: {
  jobDir: string;
  blueprint: ContentBlueprint;
  sceneBgDataUris: Record<number, string>;
  outputs: OutputType[];
  voice?: string;
  noTts?: boolean;
  bgm?: string;
  bgmVolume?: number;
  serveUrl?: string;
}): Promise<string> {
  const {
    jobDir,
    blueprint,
    sceneBgDataUris,
    outputs,
    voice,
    noTts = false,
    bgm,
    bgmVolume = 0.14,
  } = params;

  const brandConfig = loadBrandConfig();
  let logoDataUri: string | undefined;
  if (brandConfig.logoPath) {
    const resolvedLogo = path.resolve(process.cwd(), brandConfig.logoPath);
    if (fs.existsSync(resolvedLogo)) {
      logoDataUri = fileToDataUri(resolvedLogo);
    }
  }

  const sceneAudioDataUris: Record<number, string> = {};
  let sceneWordTimings: Record<number, WordTiming[]> = {};
  let bgmDataUri: string | undefined;

  if (outputs.includes("video")) {
    if (!noTts) {
      const effectiveVoice =
        voice ||
        process.env.TTS_VOICE ||
        (blueprint.language === "en" ? "en-US-AndrewNeural" : "id-ID-ArdiNeural");
      console.log(`[2.5/4] Membuat Voiceover Edge-TTS (${effectiveVoice})...`);
      try {
        const audioDir = path.join(jobDir, "audio");
        const ttsResult = await generateVoiceovers(
          blueprint,
          audioDir,
          effectiveVoice
        );
        sceneWordTimings = ttsResult.sceneWordTimings;
        for (const scene of blueprint.scenes) {
          const dur = ttsResult.sceneDurations[scene.index];
          if (dur) scene.durationSeconds = dur;
          const filePath = ttsResult.sceneAudioFiles[scene.index];
          if (filePath) sceneAudioDataUris[scene.index] = fileToDataUri(filePath);
        }
        fs.writeFileSync(
          path.join(jobDir, "blueprint.json"),
          JSON.stringify(blueprint, null, 2),
          "utf-8"
        );
      } catch (err) {
        console.warn(
          "[TTS] Gagal membuat voiceover, video akan dirender tanpa suara narasi:",
          err instanceof Error ? err.message : err
        );
      }
    }

    const bgmPath = resolveBgmPath(bgm);
    if (bgmPath && fs.existsSync(bgmPath)) {
      bgmDataUri = fileToDataUri(bgmPath);
    }
  }

  const needsRemotion = outputs.some((o) =>
    ["carousel", "poster", "video"].includes(o)
  );

  if (needsRemotion) {
    let serveUrl = params.serveUrl;
    if (!serveUrl) {
      console.log(`[3/4] Bundling Remotion project...`);
      serveUrl = await bundleRemotionProject();
    } else {
      console.log(`[3/4] Menggunakan Remotion bundle yang sudah siap...`);
    }

    console.log(`[4/4] Rendering outputs: ${outputs.join(", ")}...`);

    if (outputs.includes("carousel")) {
      const carouselDir = path.join(jobDir, "carousel");
      fs.mkdirSync(carouselDir, { recursive: true });

      for (const scene of blueprint.scenes) {
        const isEn = blueprint.language === "en";
        const inputProps = {
          preset: blueprint.preset,
          brandTag: blueprint.brandTag,
          hookTitle: blueprint.hookTitle,
          totalSlides: blueprint.scenes.length,
          scene,
          aspectRatio: blueprint.aspectRatio || "4:5",
          bgDataUri: sceneBgDataUris[scene.index],
          logoDataUri,
          coverBadge: brandConfig.coverBadge,
          ctaBadge: brandConfig.ctaBadge,
          ctaFooterText: isEn ? "Save & share if helpful" : brandConfig.ctaFooterText,
          swipeFooterText: isEn ? "Swipe to continue →" : brandConfig.swipeFooterText,
        };
        const composition = await selectComposition({
          serveUrl,
          id: "CarouselSlide",
          inputProps,
        });
        await renderStill({
          composition,
          serveUrl,
          output: path.join(carouselDir, `slide_${scene.index}.png`),
          inputProps,
        });
      }
      console.log(`  ✓ Carousel selesai (${blueprint.scenes.length} slide PNG)`);
    }

    if (outputs.includes("poster")) {
      const inputProps = {
        blueprint,
        bgDataUri: sceneBgDataUris[1],
        logoDataUri,
      };
      const composition = await selectComposition({
        serveUrl,
        id: "PosterCard",
        inputProps,
      });
      await renderStill({
        composition,
        serveUrl,
        output: path.join(jobDir, "poster.png"),
        inputProps,
      });
      console.log(`  ✓ Poster selesai (poster.png)`);
    }

    if (outputs.includes("video")) {
      const inputProps = {
        blueprint,
        sceneBgDataUris,
        sceneAudioDataUris,
        sceneWordTimings,
        bgmDataUri,
        bgmVolume,
        logoDataUri,
      };
      const composition = await selectComposition({
        serveUrl,
        id: "ShortVideo",
        inputProps,
      });
      await renderMedia({
        composition,
        serveUrl,
        codec: "h264",
        outputLocation: path.join(jobDir, "video.mp4"),
        inputProps,
      });
      console.log(`  ✓ Video selesai (video.mp4)`);
    }
  }

  writeJobManifest(jobDir, blueprint);
  return jobDir;
}

function resolveBgmPath(bgm?: string): string | null {
  if (bgm === "none") return null;
  if (!bgm || bgm === "ambient_dark") {
    return path.resolve(process.cwd(), "assets", "ambient_dark.mp3");
  }
  if (bgm === "lofi_calm") {
    return path.resolve(process.cwd(), "assets", "lofi_calm.mp3");
  }
  if (bgm === "cinematic_pulse") {
    return path.resolve(process.cwd(), "assets", "cinematic_pulse.mp3");
  }
  return path.resolve(process.cwd(), bgm);
}

function writeJobManifest(jobDir: string, blueprint: ContentBlueprint): OutputManifest {
  const manifestPath = path.join(jobDir, "manifest.json");
  let createdAt = new Date().toISOString();
  if (fs.existsSync(manifestPath)) {
    try {
      const prev = JSON.parse(fs.readFileSync(manifestPath, "utf-8")) as {
        createdAt?: string;
      };
      if (prev.createdAt) createdAt = prev.createdAt;
    } catch {
      // ignore
    }
  }

  const carouselDir = path.join(jobDir, "carousel");
  const carouselSlides = fs.existsSync(carouselDir)
    ? fs
        .readdirSync(carouselDir)
        .filter((f) => f.endsWith(".png"))
        .sort()
        .map((f) => `carousel/${f}`)
    : [];

  const rawDir = path.join(jobDir, "raw_images");
  const rawImages = fs.existsSync(rawDir)
    ? fs
        .readdirSync(rawDir)
        .filter((f) => /\.(png|svg|jpe?g)$/i.test(f))
        .sort()
        .map((f) => `raw_images/${f}`)
    : [];

  const audioDir = path.join(jobDir, "audio");
  const audioFiles = fs.existsSync(audioDir)
    ? fs
        .readdirSync(audioDir)
        .filter((f) => f.endsWith(".mp3"))
        .sort()
        .map((f) => `audio/${f}`)
    : [];

  const hasPoster = fs.existsSync(path.join(jobDir, "poster.png"));
  const hasVideo = fs.existsSync(path.join(jobDir, "video.mp4"));
  const videoDurationSeconds = hasVideo
    ? Number(
        blueprint.scenes
          .reduce((sum, s) => sum + s.durationSeconds, 0)
          .toFixed(2)
      )
    : null;

  const manifest: OutputManifest = {
    version: "1.0",
    jobId: path.basename(jobDir),
    createdAt,
    updatedAt: new Date().toISOString(),
    topic: blueprint.topic,
    hookTitle: blueprint.hookTitle,
    preset: blueprint.preset,
    brandTag: blueprint.brandTag,
    outputs: {
      carouselSlides,
      poster: hasPoster ? "poster.png" : null,
      video: hasVideo ? "video.mp4" : null,
      rawImages,
      audioFiles,
      captionFile: "caption.txt",
      blueprintFile: "blueprint.json",
    },
    caption: blueprint.caption,
    hashtags: blueprint.hashtags,
    videoDurationSeconds,
  };

  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf-8");
  return manifest;
}

function fileToDataUri(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const mime =
    ext === ".svg"
      ? "image/svg+xml"
      : ext === ".jpg" || ext === ".jpeg"
        ? "image/jpeg"
        : ext === ".mp3"
          ? "audio/mpeg"
          : ext === ".wav"
            ? "audio/wav"
            : "image/png";
  const base64 = fs.readFileSync(filePath).toString("base64");
  return `data:${mime};base64,${base64}`;
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 48);
}
