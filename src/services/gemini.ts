import { GoogleGenAI } from "@google/genai";
import { THEME_PRESETS } from "../presets/themes";
import {
  ContentBlueprint,
  ContentBlueprintSchema,
  PresetId,
} from "../types/blueprint";

export interface GenerateBlueprintOptions {
  topic: string;
  preset: PresetId;
  brandTag?: string;
  slideCount?: number;
  mock?: boolean;
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
    brandTag = "@autocreate",
    slideCount = 5,
    mock = false,
  } = options;

  if (mock) {
    return buildMockBlueprint(topic, preset, brandTag);
  }

  const theme = THEME_PRESETS[preset];
  const systemPrompt = `Kamu adalah Creative Director untuk konten media sosial bertema "${theme.name}" (gelap, elegan, tajam, tidak klise).
Tugasmu mengubah sebuah topik menjadi ContentBlueprint JSON dalam Bahasa Indonesia yang siap dirender menjadi Multi-Slide Carousel DAN Short-Form Video.

Aturan ketat:
1. Total scenes = ${slideCount} (Scene 1 role="cover", Scene terakhir role="cta", sisanya role="content").
2. slideTitle: singkat, punchy, maksimal 7 kata.
3. slideBody: padat & mudah dibaca di layar HP, maksimal 22 kata.
4. narrationText: bahasa lisan Indonesia yang natural untuk voiceover video (1-2 kalimat per scene).
5. visualPrompt: deskripsi visual dalam Bahasa Inggris untuk latar belakang polos (tanpa teks), wajib selaras dengan gaya: "${theme.visualStyleAnchor}".
6. durationSeconds: estimasi durasi baca narrationText (antara 3 sampai 6 detik).
7. Kembalikan HANYA JSON valid sesuai skema berikut tanpa markdown code fence.`;

  const userPrompt = `Topik: "${topic}"
Brand tag: "${brandTag}"
Preset: "${preset}"

Format JSON yang wajib diikuti:
{
  "topic": string,
  "hookTitle": string,
  "subtitle": string,
  "brandTag": string,
  "preset": "${preset}",
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
  const hasGemini = isConfigured(process.env.GEMINI_API_KEY, "your_gemini_api_key_here");
  const hasOpenCode = isConfigured(process.env.OPENCODE_API_KEY, "your_opencode_api_key_here");

  if (mode === "opencode") {
    return generateWithOpenCode(systemPrompt, userPrompt);
  }

  if (mode === "gemini") {
    return generateWithGemini(systemPrompt, userPrompt);
  }

  // mode === "auto": try Gemini first, then fall back to OpenCode Go
  if (hasGemini) {
    try {
      return await generateWithGemini(systemPrompt, userPrompt);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (hasOpenCode) {
        console.warn(
          `[AI Director] Gemini gagal (${msg}), beralih ke fallback OpenCode Go...`
        );
        return generateWithOpenCode(systemPrompt, userPrompt);
      }
      console.warn(
        `[AI Director] Gemini gagal dan OPENCODE_API_KEY belum ada di .env, fallback tidak aktif.`
      );
      throw err;
    }
  }

  if (hasOpenCode) {
    console.log("[AI Director] GEMINI_API_KEY kosong, menggunakan OpenCode Go...");
    return generateWithOpenCode(systemPrompt, userPrompt);
  }

  throw new Error(
    "GEMINI_API_KEY dan OPENCODE_API_KEY belum diisi di .env. Jalankan dengan --mock untuk testing tanpa API key."
  );
}

function isConfigured(val: string | undefined, placeholder: string): boolean {
  return Boolean(val && val.trim() !== "" && val.trim() !== placeholder);
}

async function generateWithGemini(
  systemPrompt: string,
  userPrompt: string
): Promise<ContentBlueprint> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!isConfigured(apiKey, "your_gemini_api_key_here")) {
    throw new Error("GEMINI_API_KEY belum diisi.");
  }

  const model = process.env.GEMINI_TEXT_MODEL || "gemini-3.8-flash";
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
  userPrompt: string
): Promise<ContentBlueprint> {
  const apiKey = process.env.OPENCODE_API_KEY;
  if (!isConfigured(apiKey, "your_opencode_api_key_here")) {
    throw new Error("OPENCODE_API_KEY belum diisi.");
  }

  const baseUrl = (
    process.env.OPENCODE_BASE_URL || "https://opencode.ai/zen/go/v1"
  ).replace(/\/+$/, "");
  const model = process.env.OPENCODE_MODEL || "glm-5.3-flash";

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
  brandTag: string
): ContentBlueprint {
  const theme = THEME_PRESETS[preset];
  return {
    topic,
    hookTitle: topic,
    subtitle: "Ringkasan tajam yang jarang disadari banyak orang.",
    brandTag,
    preset,
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
