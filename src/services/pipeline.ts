import fs from "node:fs";
import path from "node:path";
import { bundle } from "@remotion/bundler";
import { renderMedia, renderStill, selectComposition } from "@remotion/renderer";
import { loadBrandConfig } from "../config/brand";
import { generateBlueprint } from "./gemini";
import { generateVoiceovers, WordTiming } from "./tts";
import { generateRawVisuals, VisualProvider } from "./visualFactory";
import { OutputType, PresetId } from "../types/blueprint";

export interface ContentJobOptions {
  topic: string;
  preset: PresetId;
  outputs: OutputType[];
  brandTag?: string;
  slides?: number;
  mock?: boolean;
  visualProvider?: VisualProvider;
  voice?: string;
  noTts?: boolean;
  bgm?: string;
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
    mock = false,
    visualProvider,
    voice,
    noTts = false,
    bgm,
  } = options;

  let logoDataUri: string | undefined;
  if (brandConfig.logoPath) {
    const resolvedLogo = path.resolve(process.cwd(), brandConfig.logoPath);
    if (fs.existsSync(resolvedLogo)) {
      logoDataUri = fileToDataUri(resolvedLogo);
    }
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const jobDir = path.resolve(
    process.cwd(),
    "outputs",
    `${timestamp}_${slugify(topic)}`
  );

  console.log(
    `\n[1/4] Membuat Content Blueprint (${mock ? "MOCK" : "GEMINI/FALLBACK"})...`
  );
  const blueprint = await generateBlueprint({
    topic,
    preset,
    brandTag,
    slideCount: slides,
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

  const sceneAudioDataUris: Record<number, string> = {};
  let sceneWordTimings: Record<number, WordTiming[]> = {};
  let bgmDataUri: string | undefined;

  if (outputs.includes("video")) {
    if (!noTts) {
      console.log(
        `[2.5/4] Membuat Voiceover Edge-TTS (${voice || process.env.TTS_VOICE || "id-ID-ArdiNeural"})...`
      );
      try {
        const audioDir = path.join(jobDir, "audio");
        const ttsResult = await generateVoiceovers(blueprint, audioDir, voice);
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

    const defaultBgm = path.resolve(process.cwd(), "assets", "ambient_dark.mp3");
    const bgmPath = bgm ? path.resolve(process.cwd(), bgm) : defaultBgm;
    if (fs.existsSync(bgmPath)) {
      bgmDataUri = fileToDataUri(bgmPath);
    }
  }

  const needsRemotion = outputs.some((o) =>
    ["carousel", "poster", "video"].includes(o)
  );

  if (needsRemotion) {
    let serveUrl = options.serveUrl;
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
        const inputProps = {
          preset: blueprint.preset,
          brandTag: blueprint.brandTag,
          hookTitle: blueprint.hookTitle,
          totalSlides: blueprint.scenes.length,
          scene,
          bgDataUri: sceneBgDataUris[scene.index],
          logoDataUri,
          coverBadge: brandConfig.coverBadge,
          ctaBadge: brandConfig.ctaBadge,
          ctaFooterText: brandConfig.ctaFooterText,
          swipeFooterText: brandConfig.swipeFooterText,
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

  return jobDir;
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
