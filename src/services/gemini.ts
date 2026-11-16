import { GoogleGenAI } from "@google/genai";
import { getSeriesPreset } from "../presets/series";
import { THEME_PRESETS } from "../presets/themes";
import {
  AspectRatio,
  ContentBlueprint,
  ContentBlueprintSchema,
  Language,
  PresetId,
  SeriesPreset,
} from "../types/blueprint";
import type { BrandkitOverride } from "../types/brandkit";

export interface GenerateBlueprintOptions {
  topic: string;
  preset: PresetId;
  series?: SeriesPreset;
  brandTag?: string;
  slideCount?: number;
  language?: Language;
  aspectRatio?: AspectRatio;
  brandkit?: BrandkitOverride;
  referenceContext?: string;
  mock?: boolean;
  apiKeys?: {
    gemini?: string;
    opencode?: string;
  };
  aiModels?: {
    gemini?: string;
    opencode?: string;
  };
}

type AiProviderMode = "auto" | "gemini" | "opencode";

/**
 * Generates a structured ContentBlueprint in Indonesian.
 * Supports Gemini API with automatic fallback to OpenCode Go (OpenAI-compatible),
 * or deterministic mock output when `mock` is true.
 */
export async function generateBlueprint(
  options: GenerateBlueprintOptions
): Promise<ContentBlueprint> {
  const {
    topic,
    preset,
    series,
    brandTag = "@autocreate",
    slideCount = 5,
    language = "id",
    aspectRatio = "4:5",
    brandkit,
    referenceContext,
    mock = false,
    apiKeys,
    aiModels,
  } = options;

  const seriesConfig = getSeriesPreset(series);

  if (mock) {
    return applySeriesDefaults(
      buildMockBlueprint(topic, preset, brandTag, language, aspectRatio),
      series
    );
  }

  const theme = THEME_PRESETS[preset];
  const langLabel = language === "en" ? "Bahasa Inggris (English)" : "Bahasa Indonesia";
  const brandNotes: string[] = [];
  if (brandkit?.brandName) brandNotes.push(`Nama Brand: ${brandkit.brandName}`);
  if (brandkit?.description) brandNotes.push(`Profil Bisnis: ${brandkit.description}`);
  if (brandkit?.brandVoice) brandNotes.push(`Brand Voice / Tone: ${brandkit.brandVoice}`);
  if (brandkit?.brandPersonality) brandNotes.push(`Personality: ${brandkit.brandPersonality}`);
  if (brandkit?.targetAudience) brandNotes.push(`Target Audiens: ${brandkit.targetAudience}`);
  if (brandkit?.forbiddenWords?.length) {
    brandNotes.push(`Kata yang DILARANG: ${brandkit.forbiddenWords.join(", ")}`);
  }
  const brandSection = brandNotes.length
    ? `\nPanduan Brandkit Wajib:\n- ${brandNotes.join("\n- ")}\n`
    : "";

  const referenceSection = referenceContext?.trim()
    ? `\nBahan Referensi / Sumber Berita Wajib (gunakan fakta, data, dan poin kunci dari sumber di bawah ini; jangan mengarang fakta di luar sumber):\n${referenceContext.trim()}\n`
    : "";

  const systemPrompt = `Kamu adalah Creative Director untuk konten media sosial bertema "${theme.name}" (gelap, elegan, tajam, tidak klise).
Tugasmu mengubah sebuah topik menjadi ContentBlueprint JSON dalam ${langLabel} yang siap dirender menjadi Multi-Slide Carousel DAN Short-Form Video.
Seri / Gaya Konten: "${seriesConfig.name}" — ${seriesConfig.promptDirective}
${brandSection}${referenceSection}
Aturan ketat:
1. Seluruh teks konten (hookTitle, subtitle, slideTitle, slideBody, narrationText, caption, hashtags) WAJIB ditulis dalam ${langLabel}.
2. Total scenes = ${slideCount} (Scene 1 role="cover", Scene terakhir role="cta", sisanya role="content").
3. slideTitle: singkat, punchy, maksimal 7 kata.
4. slideBody: padat & mudah dibaca di layar HP, maksimal 22 kata.
5. narrationText: bahasa lisan yang natural untuk voiceover video (1-2 kalimat per scene).
6. visualPrompt: deskripsi visual dalam Bahasa Inggris untuk latar belakang polos (tanpa teks), wajib selaras dengan gaya: "${theme.visualStyleAnchor}".
7. durationSeconds: estimasi durasi baca narrationText (antara 3 sampai 6 detik).
8. Kembalikan HANYA JSON valid sesuai skema berikut tanpa markdown code fence.`;

  const userPrompt = `Topik: "${topic}"
Brand tag: "${brandTag}"
Preset: "${preset}"
Bahasa: "${language}"
Rasio: "${aspectRatio}"

Format JSON yang wajib diikuti:
{
  "topic": string,
  "hookTitle": string,
  "subtitle": string,
  "brandTag": string,
  "preset": "${preset}",
  "language": "${language}",
  "aspectRatio": "${aspectRatio}",
  "scenes": [
    {
      "index": number,
      "role": "cover" | "content" | "cta",
      "slideTitle": string,
      "slideBody": string,
      "narrationText": string,
      "visualPrompt": string,
      "durationSeconds": number
    }
  ],
  "caption": string,
  "hashtags": string[]
}`;

  const mode = (process.env.AI_PROVIDER as AiProviderMode) || "auto";
  const geminiKey = apiKeys?.gemini || process.env.GEMINI_API_KEY;
  const opencodeKey = apiKeys?.opencode || process.env.OPENCODE_API_KEY;
  const hasGemini = isConfigured(geminiKey, "your_gemini_api_key_here");
  const hasOpenCode = isConfigured(opencodeKey, "your_opencode_api_key_here");

  let bp: ContentBlueprint;

  if (mode === "opencode") {
    bp = await generateWithOpenCode(systemPrompt, userPrompt, opencodeKey, aiModels?.opencode);
  } else if (mode === "gemini") {
    bp = await generateWithGemini(systemPrompt, userPrompt, geminiKey, aiModels?.gemini);
  } else if (hasGemini) {
    try {
      bp = await generateWithGemini(systemPrompt, userPrompt, geminiKey, aiModels?.gemini);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (hasOpenCode) {
        console.warn(
          `[AI Director] Gemini gagal (${msg}), beralih ke fallback OpenCode Go...`
        );
        bp = await generateWithOpenCode(systemPrompt, userPrompt, opencodeKey, aiModels?.opencode);
      } else {
        console.warn(
          `[AI Director] Gemini gagal dan OPENCODE_API_KEY belum ada di .env, fallback tidak aktif.`
        );
        throw err;
      }
    }
  } else if (hasOpenCode) {
    console.log("[AI Director] GEMINI_API_KEY kosong, menggunakan OpenCode Go...");
    bp = await generateWithOpenCode(systemPrompt, userPrompt, opencodeKey, aiModels?.opencode);
  } else {
    throw new Error(
      "GEMINI_API_KEY dan OPENCODE_API_KEY belum diisi di .env. Jalankan dengan --mock untuk testing tanpa API key."
    );
  }

  return applySeriesDefaults(bp, series);
}

function applySeriesDefaults(
  bp: ContentBlueprint,
  series?: SeriesPreset
): ContentBlueprint {
  const cfg = getSeriesPreset(series);
  const pattern = cfg.defaultLayoutPattern;
  return {
    ...bp,
    series: series || bp.series || "edukasi",
    videoTransition: bp.videoTransition || cfg.defaultTransition,
    scenes: bp.scenes.map((scene, idx) => ({
      ...scene,
      layout:
        scene.layout ||
        (scene.role === "cover"
          ? "editorial"
          : scene.role === "cta"
            ? pattern[pattern.length - 1]
            : pattern[idx % pattern.length]),
    })),
  };
}

function isConfigured(val: string | undefined, placeholder: string): boolean {
  return Boolean(val && val.trim() !== "" && val.trim() !== placeholder);
}

async function generateWithGemini(
  systemPrompt: string,
  userPrompt: string,
  overrideKey?: string,
  overrideModel?: string
): Promise<ContentBlueprint> {
  const apiKey = overrideKey || process.env.GEMINI_API_KEY;
  if (!isConfigured(apiKey, "your_gemini_api_key_here")) {
    throw new Error("GEMINI_API_KEY belum diisi.");
  }

  const model = overrideModel || process.env.GEMINI_TEXT_MODEL || "gemini-3.8-flash";
  const ai = new GoogleGenAI({ apiKey });

  const response = await ai.models.generateContent({
    model,
    contents: userPrompt,
    config: {
      systemInstruction: systemPrompt,
      responseMimeType: "application/json",
    },
  });

  const rawText = response.text?.trim();
  if (!rawText) {
    throw new Error("Gemini mengembalikan respons kosong.");
  }

  return parseBlueprintJson(rawText);
}

async function generateWithOpenCode(
  systemPrompt: string,
  userPrompt: string,
  overrideKey?: string,
  overrideModel?: string
): Promise<ContentBlueprint> {
  const apiKey = overrideKey || process.env.OPENCODE_API_KEY;
  if (!isConfigured(apiKey, "your_opencode_api_key_here")) {
    throw new Error("OPENCODE_API_KEY belum diisi.");
  }

  const baseUrl = (
    process.env.OPENCODE_BASE_URL || "https://opencode.ai/zen/go/v1"
  ).replace(/\/+$/, "");
  const model = overrideModel || process.env.OPENCODE_MODEL || "glm-5.3-flash";

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.7,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    }),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`OpenCode Go HTTP ${res.status}: ${errBody.slice(0, 300)}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const rawText = data.choices?.[0]?.message?.content?.trim();
  if (!rawText) {
    throw new Error("OpenCode Go mengembalikan respons kosong.");
  }

  return parseBlueprintJson(rawText);
}

function parseBlueprintJson(rawText: string): ContentBlueprint {
  const cleaned = rawText
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const parsed = JSON.parse(cleaned);
  return ContentBlueprintSchema.parse(parsed);
}

function buildMockBlueprint(
  topic: string,
  preset: PresetId,
  brandTag: string,
  language: Language,
  aspectRatio: AspectRatio
): ContentBlueprint {
  const theme = THEME_PRESETS[preset];
  if (language === "en") {
    return {
      topic,
      hookTitle: topic,
      subtitle: "Sharp insights most people overlook.",
      brandTag,
      preset,
      language,
      aspectRatio,
      scenes: [
        {
          index: 1,
          role: "cover",
          slideTitle: topic,
          slideBody: "Why small consistent habits always beat bursts of motivation.",
          narrationText: `Ever noticed why ${topic} quietly shapes your long-term results?`,
          visualPrompt: `Minimalist dark luxury focal object representing ${topic}, ${theme.visualStyleAnchor}`,
          durationSeconds: 4,
        },
        {
          index: 2,
          role: "content",
          slideTitle: "1. Build Systems, Not Moods",
          slideBody: "Motivation fluctuates daily. A simple system keeps you moving even on low-energy days.",
          narrationText: "First, stop relying on mood. Build a small system you can run even when tired.",
          visualPrompt: `Sleek dark geometric architecture with subtle light beam, ${theme.visualStyleAnchor}`,
          durationSeconds: 4,
        },
        {
          index: 3,
          role: "content",
          slideTitle: "2. Remove Starting Friction",
          slideBody: "The fewer steps between you and the task, the harder it is to procrastinate.",
          narrationText: "Second, remove friction in the first two minutes so starting feels effortless.",
          visualPrompt: `Minimalist desk in dark room with single warm lamp, ${theme.visualStyleAnchor}`,
          durationSeconds: 4,
        },
        {
          index: 4,
          role: "cta",
          slideTitle: "Save & Apply Today",
          slideBody: "Share this with someone who needs the reminder, and follow for more.",
          narrationText: "Save this post as a reminder, and follow for the next breakdown.",
          visualPrompt: `Calm dark luxury horizon at twilight, minimalist silhouette, ${theme.visualStyleAnchor}`,
          durationSeconds: 3,
        },
      ],
      caption: `${topic}\n\nMost people look for big breakthroughs, when the real edge comes from small daily execution.\n\nSave this post for later.`,
      hashtags: ["#productivity", "#mindset", "#focus", "#growth", "#strategy"],
    };
  }
  return {
    topic,
    hookTitle: topic,
    subtitle: "Ringkasan tajam yang jarang disadari banyak orang.",
    brandTag,
    preset,
    language,
    aspectRatio,
    scenes: [
      {
        index: 1,
        role: "cover",
        slideTitle: topic,
        slideBody: "Kenapa hal kecil yang konsisten selalu mengalahkan motivasi sesaat.",
        narrationText: `Pernah sadar kenapa topik tentang ${topic} sering menentukan hasil jangka panjang kita?`,
        visualPrompt: `Minimalist dark luxury focal object representing ${topic}, ${theme.visualStyleAnchor}`,
        durationSeconds: 4,
      },
      {
        index: 2,
        role: "content",
        slideTitle: "1. Fokus pada Sistem, Bukan Mood",
        slideBody: "Motivasi naik turun setiap hari. Sistem yang sederhana membuat kamu tetap berjalan saat energi rendah.",
        narrationText: "Pertama, berhenti mengandalkan mood. Bangun sistem kecil yang tetap bisa dijalankan bahkan saat kamu lelah.",
        visualPrompt: `Sleek dark geometric architecture with subtle light beam, ${theme.visualStyleAnchor}`,
        durationSeconds: 4,
      },
      {
        index: 3,
        role: "content",
        slideTitle: "2. Kurangi Gesekan di Awal",
        slideBody: "Semakin sedikit langkah sebelum memulai, semakin kecil peluang kamu menunda pekerjaan penting.",
        narrationText: "Kedua, hilangkan hambatan di dua menit pertama. Siapkan semuanya malam sebelumnya agar besok tinggal eksekusi.",
        visualPrompt: `Minimalist desk in dark room with single warm lamp, ${theme.visualStyleAnchor}`,
        durationSeconds: 4,
      },
      {
        index: 4,
        role: "content",
        slideTitle: "3. Efek Majemuk yang Tak Terlihat",
        slideBody: "Perubahan 1% per hari terasa sepele di minggu pertama, tapi menciptakan jarak besar setelah 6 bulan.",
        narrationText: "Ketiga, ingat efek majemuk. Perubahan satu persen terasa sepele hari ini, namun tak terkejar dalam enam bulan.",
        visualPrompt: `Abstract dark obsidian waves with subtle golden rim light, ${theme.visualStyleAnchor}`,
        durationSeconds: 4,
      },
      {
        index: 5,
        role: "cta",
        slideTitle: "Simpan & Terapkan Hari Ini",
        slideBody: "Bagikan ke teman yang butuh pengingat ini, dan follow untuk insight berikutnya.",
        narrationText: "Simpan postingan ini sebagai pengingat, dan ikuti akun ini untuk pembahasan berikutnya.",
        visualPrompt: `Calm dark luxury horizon at twilight, minimalist silhouette, ${theme.visualStyleAnchor}`,
        durationSeconds: 3,
      },
    ],
    caption: `${topic}\n\nSering kali kita mencari strategi besar, padahal kuncinya ada di eksekusi kecil yang konsisten setiap hari.\n\nSimpan postingan ini supaya tidak lupa.`,
    hashtags: [
      "#edukasi",
      "#pengembangandiri",
      "#produktivitas",
      "#mindset",
      "#kontenedukasi",
    ],
  };
}
