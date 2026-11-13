import fs from "node:fs";
import path from "node:path";
import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { OutputTypeSchema, PresetIdSchema } from "../types/blueprint";

export interface FeedsConfig {
  feeds: string[];
  count: number;
  nicheHint: string;
  defaultPreset: "noir_editorial" | "midnight_tech" | "monochrome_luxury";
  defaultOutputs: Array<"carousel" | "poster" | "raw_image" | "video">;
}

export interface RssArticle {
  title: string;
  link: string;
}

const CuratedTopicSchema = z.object({
  topic: z.string().min(1),
  preset: PresetIdSchema,
  reason: z.string().optional(),
});

const CuratedListSchema = z.array(CuratedTopicSchema).min(1);

export function loadFeedsConfig(): FeedsConfig {
  const cfgPath = path.resolve(process.cwd(), "feeds.config.json");
  if (!fs.existsSync(cfgPath)) {
    return {
      feeds: ["https://hnrss.org/frontpage"],
      count: 3,
      nicheHint: "AI, teknologi, produktivitas",
      defaultPreset: "midnight_tech",
      defaultOutputs: ["carousel", "video"],
    };
  }
  return JSON.parse(fs.readFileSync(cfgPath, "utf-8")) as FeedsConfig;
}

/**
 * Fetches and parses RSS 2.0 / Atom feeds into a flat list of article titles & links.
 */
export async function fetchRssArticles(
  feedUrls: string[],
  limitPerFeed = 8
): Promise<RssArticle[]> {
  const articles: RssArticle[] = [];

  for (const url of feedUrls) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "AutocreateStudio/0.1" },
      });
      if (!res.ok) continue;
      const xml = await res.text();
      const parsed = parseFeedXml(xml).slice(0, limitPerFeed);
      articles.push(...parsed);
    } catch {
      // skip unreachable feed
    }
  }

  return articles;
}

function parseFeedXml(xml: string): RssArticle[] {
  const items: RssArticle[] = [];
  const itemMatches = xml.match(/<(item|entry)\b[\s\S]*?<\/\1>/gi) ?? [];

  for (const block of itemMatches) {
    const titleMatch = block.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const linkHrefMatch = block.match(/<link[^>]*href=["']([^"']+)["'][^>]*\/?>/i);
    const linkTextMatch = block.match(/<link[^>]*>([\s\S]*?)<\/link>/i);

    const rawTitle = titleMatch?.[1] || "";
    const title = decodeXmlEntities(rawTitle.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")).trim();
    const link = (linkHrefMatch?.[1] || linkTextMatch?.[1] || "").trim();

    if (title.length > 5) {
      items.push({ title, link });
    }
  }

  return items;
}

function decodeXmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'");
}

function getExistingTopics(): Set<string> {
  const outputsDir = path.resolve(process.cwd(), "outputs");
  const existing = new Set<string>();
  if (!fs.existsSync(outputsDir)) return existing;

  for (const entry of fs.readdirSync(outputsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const bpPath = path.join(outputsDir, entry.name, "blueprint.json");
    if (!fs.existsSync(bpPath)) continue;
    try {
      const bp = JSON.parse(fs.readFileSync(bpPath, "utf-8"));
      if (bp.topic) existing.add(String(bp.topic).toLowerCase());
    } catch {
      // ignore
    }
  }
  return existing;
}

/**
 * Curates fresh Indonesian social-media topics from RSS headlines
 * using Gemini API with OpenCode Go fallback (or deterministic mock).
 */
export async function discoverTopics(options?: {
  count?: number;
  mock?: boolean;
}): Promise<
  Array<{
    topic: string;
    preset: "noir_editorial" | "midnight_tech" | "monochrome_luxury";
    outputs: Array<"carousel" | "poster" | "raw_image" | "video">;
    reason?: string;
  }>
> {
  const cfg = loadFeedsConfig();
  const count = options?.count ?? cfg.count ?? 3;
  const articles = await fetchRssArticles(cfg.feeds);
  const existing = getExistingTopics();

  if (options?.mock || articles.length === 0) {
    const pool =
      articles.length > 0
        ? articles.slice(0, count).map((a) => ({
            topic: `Insight Terbaru: ${a.title.slice(0, 72)}`,
            preset: cfg.defaultPreset,
            outputs: cfg.defaultOutputs,
            reason: "Dari RSS Feed",
          }))
        : [
            {
              topic: "Kenapa Agen AI Akan Mengubah Cara Kerja Tim Kecil",
              preset: cfg.defaultPreset,
              outputs: cfg.defaultOutputs,
              reason: "Topik cadangan",
            },
          ];
    return pool;
  }

  const headlines = articles
    .slice(0, 20)
    .map((a, idx) => `${idx + 1}. ${a.title}`)
    .join("\n");

  const systemPrompt = `Kamu adalah Content Strategist. Dari daftar headline berita/artikel berikut, pilih ${count} ide paling menarik untuk audiens Indonesia di niche "${cfg.nicheHint}".
Ubah menjadi judul topik Bahasa Indonesia yang catchy, singkat (maksimal 10 kata), dan tidak duplikat dengan topik lama: ${Array.from(existing).slice(0, 10).join(" | ") || "tidak ada"}.
Pilih preset terbaik untuk tiap topik: "noir_editorial", "midnight_tech", atau "monochrome_luxury".
Kembalikan HANYA JSON array valid: [{"topic": string, "preset": string, "reason": string}]`;

  const userPrompt = `Headline terbaru:\n${headlines}`;

  let curated: z.infer<typeof CuratedListSchema>;
  try {
    curated = await curateWithAi(systemPrompt, userPrompt);
  } catch (err) {
    console.warn(
      "[TopicFinder] AI kurasi gagal, pakai headline langsung:",
      err instanceof Error ? err.message : err
    );
    curated = articles.slice(0, count).map((a) => ({
      topic: a.title.slice(0, 80),
      preset: cfg.defaultPreset,
      reason: "Fallback langsung dari RSS",
    }));
  }

  return curated.slice(0, count).map((item) => ({
    topic: item.topic,
    preset: item.preset,
    outputs: cfg.defaultOutputs.map((o) => OutputTypeSchema.parse(o)),
    reason: item.reason,
  }));
}

async function curateWithAi(
  systemPrompt: string,
  userPrompt: string
): Promise<z.infer<typeof CuratedListSchema>> {
  const geminiKey = process.env.GEMINI_API_KEY;
  const opencodeKey = process.env.OPENCODE_API_KEY;

  if (geminiKey && geminiKey !== "your_gemini_api_key_here") {
    try {
      const ai = new GoogleGenAI({ apiKey: geminiKey });
      const res = await ai.models.generateContent({
        model: process.env.GEMINI_TEXT_MODEL || "gemini-3.8-flash",
        contents: userPrompt,
        config: {
          systemInstruction: systemPrompt,
          responseMimeType: "application/json",
        },
      });
      const text = res.text?.trim() || "";
      return CuratedListSchema.parse(parseJsonArray(text));
    } catch (err) {
      if (!opencodeKey || opencodeKey === "your_opencode_api_key_here") {
        throw err;
      }
    }
  }

  if (opencodeKey && opencodeKey !== "your_opencode_api_key_here") {
    const baseUrl = (
      process.env.OPENCODE_BASE_URL || "https://opencode.ai/zen/go/v1"
    ).replace(/\/+$/, "");
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${opencodeKey}`,
      },
      body: JSON.stringify({
        model: process.env.OPENCODE_MODEL || "glm-5.3-flash",
        temperature: 0.6,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });
    if (!res.ok) throw new Error(`OpenCode HTTP ${res.status}`);
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = data.choices?.[0]?.message?.content?.trim() || "";
    return CuratedListSchema.parse(parseJsonArray(text));
  }

  throw new Error("Tidak ada API key AI yang dikonfigurasi.");
}

function parseJsonArray(raw: string): unknown {
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  return JSON.parse(cleaned);
}
