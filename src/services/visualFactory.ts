import fs from "node:fs";
import path from "node:path";
import { GoogleGenAI } from "@google/genai";
import { THEME_PRESETS } from "../presets/themes";
import { ContentBlueprint, PresetId } from "../types/blueprint";

export type VisualProvider =
  | "procedural"
  | "unsplash"
  | "wikimedia"
  | "pollinations"
  | "gemini"
  | "pexels";

export interface GeneratedVisuals {
  /** Map from scene index (1-based) to absolute or relative file path */
  sceneImages: Record<number, string>;
}

/**
 * Generates raw aesthetic background images for each scene.
 * Supports "procedural" (free local SVG data/file), "gemini" (Imagen API), or "pexels".
 */
export async function generateRawVisuals(
  blueprint: ContentBlueprint,
  rawDir: string,
  providerOverride?: VisualProvider
): Promise<GeneratedVisuals> {
  fs.mkdirSync(rawDir, { recursive: true });

  const provider =
    providerOverride ||
    (process.env.VISUAL_PROVIDER as VisualProvider) ||
    "procedural";

  const sceneImages: Record<number, string> = {};

  for (const scene of blueprint.scenes) {
    const outSvgOrPng =
      provider === "procedural"
        ? path.join(rawDir, `raw_scene_${scene.index}.svg`)
        : path.join(rawDir, `raw_scene_${scene.index}.png`);

    if (provider === "gemini") {
      try {
        await generateWithGeminiImagen(scene.visualPrompt, outSvgOrPng);
        sceneImages[scene.index] = outSvgOrPng;
        continue;
      } catch (err) {
        console.warn(
          `[VisualFactory] Gemini image gagal di scene ${scene.index}, fallback ke procedural:`,
          err instanceof Error ? err.message : err
        );
      }
    } else if (provider === "unsplash") {
      try {
        await fetchFromUnsplash(scene.visualPrompt, scene.index, outSvgOrPng);
        sceneImages[scene.index] = outSvgOrPng;
        continue;
      } catch (err) {
        console.warn(
          `[VisualFactory] Unsplash gagal di scene ${scene.index}, fallback ke procedural:`,
          err instanceof Error ? err.message : err
        );
      }
    } else if (provider === "pollinations") {
      try {
        await generateWithPollinations(scene.visualPrompt, scene.index, outSvgOrPng);
        sceneImages[scene.index] = outSvgOrPng;
        continue;
      } catch (err) {
        console.warn(
          `[VisualFactory] Pollinations gagal di scene ${scene.index}, fallback ke procedural:`,
          err instanceof Error ? err.message : err
        );
      }
    } else if (provider === "wikimedia") {
      try {
        await fetchFromWikimedia(scene.visualPrompt, scene.index, outSvgOrPng);
        sceneImages[scene.index] = outSvgOrPng;
        continue;
      } catch (err) {
        console.warn(
          `[VisualFactory] Wikimedia gagal di scene ${scene.index}, fallback ke procedural:`,
          err instanceof Error ? err.message : err
        );
      }
    } else if (provider === "pexels") {
      try {
        await fetchFromPexels(scene.visualPrompt, scene.index, outSvgOrPng);
        sceneImages[scene.index] = outSvgOrPng;
        continue;
      } catch (err) {
        console.warn(
          `[VisualFactory] Pexels gagal di scene ${scene.index}, fallback ke procedural:`,
          err instanceof Error ? err.message : err
        );
      }
    }

    const fallbackPath = path.join(rawDir, `raw_scene_${scene.index}.svg`);
    writeProceduralBackdrop(blueprint.preset, scene.index, fallbackPath);
    sceneImages[scene.index] = fallbackPath;
  }

  return { sceneImages };
}

async function generateWithGeminiImagen(
  prompt: string,
  outputPath: string
): Promise<void> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "your_gemini_api_key_here") {
    throw new Error("GEMINI_API_KEY belum diset.");
  }

  const model = process.env.GEMINI_IMAGE_MODEL || "imagen-3.0-generate-002";
  const ai = new GoogleGenAI({ apiKey });

  const response = await ai.models.generateImages({
    model,
    prompt,
    config: {
      numberOfImages: 1,
      aspectRatio: "3:4",
    },
  });

  const base64 = response.generatedImages?.[0]?.image?.imageBytes;
  if (!base64) {
    throw new Error("Tidak ada imageBytes dari Gemini Imagen.");
  }

  fs.writeFileSync(outputPath, Buffer.from(base64, "base64"));
}

async function fetchFromUnsplash(
  query: string,
  sceneIndex: number,
  outputPath: string
): Promise<void> {
  const accessKey = process.env.UNSPLASH_ACCESS_KEY;
  if (!accessKey) {
    throw new Error("UNSPLASH_ACCESS_KEY belum diset.");
  }

  const shortQuery = extractSearchKeywords(query, sceneIndex);
  const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(shortQuery)}&per_page=8&orientation=portrait`;

  const res = await fetch(url, {
    headers: { Authorization: `Client-ID ${accessKey}` },
  });
  if (!res.ok) {
    throw new Error(`Unsplash HTTP ${res.status}`);
  }

  const data = (await res.json()) as {
    results?: Array<{ urls?: { regular?: string; full?: string } }>;
  };
  const results = data.results ?? [];
  if (results.length === 0) {
    throw new Error("Tidak ada foto ditemukan di Unsplash.");
  }

  const chosen = results[(sceneIndex - 1) % results.length];
  const photoUrl = chosen?.urls?.regular || chosen?.urls?.full;
  if (!photoUrl) {
    throw new Error("URL foto Unsplash kosong.");
  }

  const imgRes = await fetch(photoUrl);
  if (!imgRes.ok) {
    throw new Error(`Unsplash image HTTP ${imgRes.status}`);
  }
  fs.writeFileSync(outputPath, Buffer.from(await imgRes.arrayBuffer()));
}

function extractSearchKeywords(query: string, sceneIndex: number): string {
  const stopWords = new Set([
    "dark",
    "moody",
    "luxury",
    "minimalist",
    "subtle",
    "representing",
    "focal",
    "object",
    "with",
    "and",
    "the",
    "for",
    "sleek",
    "calm",
    "abstract",
  ]);
  const words = query
    .split(",")[0]
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !stopWords.has(w));

  const fallbackTopics = [
    "architecture",
    "workspace",
    "library",
    "night city",
    "mountain twilight",
  ];
  return (
    words.slice(0, 2).join(" ") ||
    fallbackTopics[(sceneIndex - 1) % fallbackTopics.length]
  );
}

async function generateWithPollinations(
  prompt: string,
  sceneIndex: number,
  outputPath: string
): Promise<void> {
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=1080&height=1350&nologo=true&seed=${Date.now() + sceneIndex}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Pollinations HTTP ${res.status}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 1024) {
    throw new Error("Respons gambar Pollinations terlalu kecil.");
  }
  fs.writeFileSync(outputPath, buf);
}

async function fetchFromWikimedia(
  query: string,
  sceneIndex: number,
  outputPath: string
): Promise<void> {
  const stopWords = new Set([
    "dark",
    "moody",
    "luxury",
    "minimalist",
    "subtle",
    "representing",
    "focal",
    "object",
    "with",
    "and",
    "the",
    "for",
    "sleek",
    "calm",
    "abstract",
  ]);
  const words = query
    .split(",")[0]
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !stopWords.has(w));

  const fallbackTopics = [
    "architecture",
    "workspace",
    "library",
    "night city",
    "mountain twilight",
  ];
  const shortQuery =
    words.slice(0, 2).join(" ") ||
    fallbackTopics[(sceneIndex - 1) % fallbackTopics.length];

  const apiUrl = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6&gsrsearch=${encodeURIComponent(shortQuery)}&gsrlimit=8&prop=imageinfo&iiprop=url|mime&iiurlwidth=1080&format=json`;

  const res = await fetch(apiUrl, {
    headers: { "User-Agent": "AutocreateStudio/0.1 (local-dev)" },
  });
  if (!res.ok) {
    throw new Error(`Wikimedia HTTP ${res.status}`);
  }

  const data = (await res.json()) as {
    query?: {
      pages?: Record<
        string,
        { imageinfo?: Array<{ thumburl?: string; url?: string; mime?: string }> }
      >;
    };
  };

  const candidates = Object.values(data.query?.pages ?? {})
    .map((p) => p.imageinfo?.[0])
    .filter((info) => info?.mime?.startsWith("image/") && (info.thumburl || info.url));

  if (candidates.length === 0) {
    throw new Error("Tidak ada gambar ditemukan di Wikimedia.");
  }

  const chosen = candidates[(sceneIndex - 1) % candidates.length];
  const imgUrl = chosen?.thumburl || chosen?.url;
  if (!imgUrl) {
    throw new Error("URL gambar Wikimedia kosong.");
  }

  const imgRes = await fetch(imgUrl, {
    headers: { "User-Agent": "AutocreateStudio/0.1 (local-dev)" },
  });
  if (!imgRes.ok) {
    throw new Error(`Wikimedia image HTTP ${imgRes.status}`);
  }
  fs.writeFileSync(outputPath, Buffer.from(await imgRes.arrayBuffer()));
}

async function fetchFromPexels(
  query: string,
  sceneIndex: number,
  outputPath: string
): Promise<void> {
  const apiKey = process.env.PEXELS_API_KEY;
  if (!apiKey) {
    throw new Error("PEXELS_API_KEY belum diset.");
  }

  const shortQuery = query.split(",")[0].trim().slice(0, 60) || "minimalist dark";
  const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(shortQuery)}&per_page=8&orientation=portrait`;

  const res = await fetch(url, {
    headers: { Authorization: apiKey },
  });
  if (!res.ok) {
    throw new Error(`Pexels HTTP ${res.status}`);
  }

  const data = (await res.json()) as {
    photos?: Array<{ src?: { large2x?: string; large?: string } }>;
  };
  const photos = data.photos ?? [];
  const chosen = photos[(sceneIndex - 1) % photos.length];
  const photoUrl = chosen?.src?.large2x || chosen?.src?.large;
  if (!photoUrl) {
    throw new Error("Tidak ada foto ditemukan di Pexels.");
  }

  const imgRes = await fetch(photoUrl);
  const buf = Buffer.from(await imgRes.arrayBuffer());
  fs.writeFileSync(outputPath, buf);
}

/**
 * Generates a crisp, dark & elegant procedural SVG backdrop (1080x1350)
 * so raw_image output and backdrops always work offline at zero cost.
 */
function writeProceduralBackdrop(
  preset: PresetId,
  sceneIndex: number,
  outputPath: string
): void {
  const theme = THEME_PRESETS[preset];
  const cx1 = 220 + ((sceneIndex * 190) % 640);
  const cy1 = 260 + ((sceneIndex * 230) % 720);
  const cx2 = 860 - ((sceneIndex * 150) % 520);
  const cy2 = 1020 - ((sceneIndex * 170) % 560);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350">
  <defs>
    <radialGradient id="glow1" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="${theme.accent}" stop-opacity="0.22"/>
      <stop offset="60%" stop-color="${theme.accent}" stop-opacity="0.05"/>
      <stop offset="100%" stop-color="${theme.bgPrimary}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="${theme.textPrimary}" stop-opacity="0.09"/>
      <stop offset="100%" stop-color="${theme.bgPrimary}" stop-opacity="0"/>
    </radialGradient>
    <pattern id="grid" width="90" height="90" patternUnits="userSpaceOnUse">
      <path d="M 90 0 L 0 0 0 90" fill="none" stroke="${theme.border}" stroke-width="0.6" stroke-opacity="0.35"/>
    </pattern>
  </defs>
  <rect width="1080" height="1350" fill="${theme.bgPrimary}"/>
  <rect width="1080" height="1350" fill="url(#grid)"/>
  <circle cx="${cx1}" cy="${cy1}" r="520" fill="url(#glow1)"/>
  <circle cx="${cx2}" cy="${cy2}" r="440" fill="url(#glow2)"/>
  <circle cx="${cx1}" cy="${cy1}" r="${180 + sceneIndex * 24}" fill="none" stroke="${theme.border}" stroke-width="1.2" stroke-opacity="0.5"/>
  <circle cx="${cx1}" cy="${cy1}" r="${280 + sceneIndex * 18}" fill="none" stroke="${theme.border}" stroke-width="0.8" stroke-dasharray="6 10" stroke-opacity="0.35"/>
</svg>`;

  fs.writeFileSync(outputPath, svg, "utf-8");
}
