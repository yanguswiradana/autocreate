export interface ExtractedReference {
  url: string;
  title: string;
  content: string;
  method: "direct" | "jina";
  ok: boolean;
  error?: string;
}

const MAX_URLS = 4;
const MAX_CHARS_PER_URL = 3500;

export function isSafePublicHttpUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl.trim());
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return false;
    }
    const host = parsed.hostname.toLowerCase();
    if (
      host === "localhost" ||
      host === "::1" ||
      host === "0.0.0.0" ||
      host.endsWith(".local") ||
      host.endsWith(".internal")
    ) {
      return false;
    }
    if (
      /^127\./.test(host) ||
      /^10\./.test(host) ||
      /^192\.168\./.test(host) ||
      /^169\.254\./.test(host) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host)
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

function cleanHtmlToText(html: string): { title: string; text: string } {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch
    ? decodeEntities(titleMatch[1].replace(/\s+/g, " ").trim())
    : "";

  const stripped = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
    .replace(/<header[\s\S]*?<\/header>/gi, " ")
    .replace(/<\/(p|div|h[1-6]|li|tr|blockquote|article|section)>/gi, "\n")
    .replace(/<[^>]+>/g, " ");

  const text = decodeEntities(stripped)
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return { title, text };
}

function decodeEntities(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ");
}

async function fetchDirect(
  url: string,
  maxChars: number
): Promise<ExtractedReference | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8",
      },
    });
    if (!res.ok) return null;
    const ct = (res.headers.get("content-type") || "").toLowerCase();
    if (!ct.includes("text/html") && !ct.includes("text/plain") && !ct.includes("xhtml")) {
      return null;
    }
    const raw = await res.text();
    const { title, text } = ct.includes("text/plain")
      ? { title: url, text: raw.trim() }
      : cleanHtmlToText(raw);

    if (text.length < 250) return null;
    return {
      url,
      title: title || url,
      content: text.slice(0, maxChars),
      method: "direct",
      ok: true,
    };
  } catch {
    return null;
  }
}

async function fetchViaJinaReader(
  url: string,
  maxChars: number
): Promise<ExtractedReference> {
  try {
    const res = await fetch(`https://r.jina.ai/${url}`, {
      signal: AbortSignal.timeout(12000),
      headers: {
        Accept: "text/plain",
        "X-Return-Format": "markdown",
      },
    });
    if (!res.ok) {
      return {
        url,
        title: url,
        content: "",
        method: "jina",
        ok: false,
        error: `HTTP ${res.status}`,
      };
    }
    const raw = (await res.text()).trim();
    const titleLine = raw.match(/^Title:\s*(.+)$/m);
    const title = titleLine ? titleLine[1].trim() : url;
    const cleaned = raw
      .replace(/^Title:.*\n?/m, "")
      .replace(/^URL Source:.*\n?/m, "")
      .replace(/^Markdown Content:\s*\n?/m, "")
      .trim();

    if (cleaned.length < 80) {
      return {
        url,
        title,
        content: "",
        method: "jina",
        ok: false,
        error: "Konten halaman terlalu sedikit atau terblokir.",
      };
    }

    return {
      url,
      title,
      content: cleaned.slice(0, maxChars),
      method: "jina",
      ok: true,
    };
  } catch (err) {
    return {
      url,
      title: url,
      content: "",
      method: "jina",
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function extractSingleUrl(
  rawUrl: string,
  maxChars = MAX_CHARS_PER_URL
): Promise<ExtractedReference> {
  const url = rawUrl.trim();
  if (!isSafePublicHttpUrl(url)) {
    return {
      url,
      title: url,
      content: "",
      method: "direct",
      ok: false,
      error: "URL harus http(s) publik yang valid.",
    };
  }

  const direct = await fetchDirect(url, maxChars);
  if (direct) return direct;

  return fetchViaJinaReader(url, maxChars);
}

export async function extractReferenceUrls(
  urls: string[],
  maxUrls = MAX_URLS
): Promise<ExtractedReference[]> {
  const unique = Array.from(
    new Set(urls.map((u) => u.trim()).filter(Boolean))
  ).slice(0, maxUrls);

  if (unique.length === 0) return [];
  return Promise.all(unique.map((u) => extractSingleUrl(u)));
}

export function formatReferencesForPrompt(refs: ExtractedReference[]): string {
  const valid = refs.filter((r) => r.ok && r.content.trim().length > 0);
  if (valid.length === 0) return "";
  return valid
    .map(
      (r, idx) =>
        `[Sumber ${idx + 1}: ${r.title} (${r.url})]\n${r.content}`
    )
    .join("\n\n---\n\n");
}
