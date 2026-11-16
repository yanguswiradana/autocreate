export interface ContentJobRecord {
  id: number;
  topic: string;
  preset: string;
  series?: string | null;
  aspect_ratio: string;
  language: string;
  outputs: string[];
  reference_urls?: string[] | null;
  status: "queued" | "processing" | "completed" | "failed";
  source: string;
  batch_id?: string | null;
  folder_name?: string | null;
  manifest?: {
    jobId?: string;
    slides?: string[];
    poster?: string | null;
    video?: string | null;
    outputs?: {
      carouselSlides?: string[];
      poster?: string | null;
      video?: string | null;
    };
    caption?: string;
    hashtags?: string[];
  } | null;
  error_message?: string | null;
  duration_ms?: number | null;
  created_at: string;
}

export interface RefCheckResult {
  url: string;
  title: string;
  content: string;
  method: "direct" | "jina";
  ok: boolean;
  error?: string;
}

export interface RssTopic {
  topic: string;
  preset: string;
  link?: string;
}

export type NavView = "chat" | "template" | "render" | "riwayat" | "video-editor" | "setting";

export interface FaqEntry {
  q: string;
  a: string;
}

export const FAQ_ITEMS: FaqEntry[] = [
  {
    q: "Bagaimana alur penggunaan Autocreate Studio?",
    a: "Alurnya cukup 4 langkah terpandu:\n1. Pilih awalan di layar utama (Dari Topik, Remix Konten, atau Tiru Gaya/Link) — atau langsung ketik topik/URL di chat bawah.\n2. Di Kartu Konfigurasi, klik Format Output, Rasio, Preset Visual, dan Jumlah Slide (atau klik Langsung Generate untuk cepat).\n3. Cek Kartu Ringkasan lalu klik Gas Generate Sekarang.\n4. Klik Buka Preview untuk lihat slide/video, salin caption, atau Download ZIP.",
  },
  {
    q: "Cara pakai Link Referensi berita/artikel?",
    a: "Pilih kartu 'Tiru gaya / Link' atau langsung tempel URL (https://...) di kolom chat bawah lalu tekan Enter.\n\nSistem otomatis mengekstrak isi artikel. Jika judul belum diisi, sistem memakai judul artikel sebagai topik utama.",
  },
  {
    q: "Cara Remix proyek lama dengan @ Remix?",
    a: "Klik tombol '@ Remix' di bar composer bawah (atau pilih proyek dari daftar Terakhir di sidebar → klik 'Remix Konten Ini').\n\nKonteks proyek lama otomatis dimuat, lalu kamu tinggal memilih format, rasio, atau preset baru.",
  },
  {
    q: "Bedanya Mock: ON vs OFF & Visual Provider?",
    a: "• Mock: ON — Testing cepat tanpa membakar token AI, cocok untuk cek layout & durasi render.\n• Mock: OFF — AI menulis naskah asli.\n• Provider Visual: Procedural (paling cepat), Pollinations AI, atau Gemini Imagen.",
  },
  {
    q: "Rasio 4:5, 1:1, 9:16, 16:9 & aturan Poster?",
    a: "• 4:5 — Portrait untuk IG Feed & Carousel\n• 1:1 — Square untuk Feed / X / LinkedIn\n• 9:16 — Vertical penuh untuk Reels, TikTok, Shorts & Story\n• 16:9 — Landscape untuk YouTube / presentasi\n\nCatatan: Jika hanya memilih format Poster, jumlah slide otomatis terkunci ke 1.",
  },
  {
    q: "Cara pakai Mode Batch & Download ZIP?",
    a: "Aktifkan tombol 'Batch: ON' di bar composer bawah, lalu tulis 1 topik per baris (tekan Shift+Enter untuk baris baru).\n\nUntuk mengunduh semua hasil render sekaligus, buka Preview proyek lalu klik 'Download ZIP'.",
  },
];

export type GuidedStep =
  | "idle"
  | "awaiting_brief"
  | "awaiting_config"
  | "awaiting_confirm"
  | "generating"
  | "completed";

export type StarterMode = "topic" | "remix" | "link";

export interface BrandkitConfig {
  enabled: boolean;
  brandName: string;
  handle: string;
  tagline: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  fontFamily: string;
  logoDataUrl: string | null;
  notes: string;
}

export interface DraftConfig {
  mode: StarterMode;
  topic: string;
  isBatch: boolean;
  referenceUrls: string[];
  refResults: RefCheckResult[];
  preset: string;
  series: string;
  outputs: string[];
  aspectRatio: string;
  language: string;
  visualProvider: string;
  slides: number;
  mock: boolean;
  customSceneImages: Record<number, string>;
  brandkit: BrandkitConfig;
}

export interface VideoReferenceAnalysis {
  width: number;
  height: number;
  durationSeconds: number;
  aspectRatio: string;
  preset: string;
  pacing: string;
  recommendedSlides: number;
  palette: {
    primaryColor: string;
    secondaryColor: string;
    accentColor: string;
  };
  keyframes: string[];
}

export interface ChatMessage {
  id: string;
  from: "user" | "ai";
  title?: string;
  text: string;
  meta?: string;
  kind?: "text" | "rss_picker" | "ref_status" | "video_ref" | "config_card" | "confirm_card" | "job_progress";
  rssTopics?: RssTopic[];
  refResults?: RefCheckResult[];
  videoRef?: VideoReferenceAnalysis;
  jobId?: number;
}

export const PRESET_OPTIONS = [
  { id: "noir_editorial", label: "Noir Editorial", desc: "Gelap kontras tinggi, aksen hangat, tipografi editorial." },
  { id: "midnight_tech", label: "Midnight Tech", desc: "Nuansa futuristik gelap dengan garis presisi modern." },
  { id: "monochrome_luxury", label: "Monochrome Luxury", desc: "Minimalis monokrom berkelas dengan ruang napas luas." },
  { id: "warm_cinematic", label: "Warm Cinematic", desc: "Nuansa film hangat keemasan untuk storytelling & dokumenter." },
  { id: "neon_cyber", label: "Neon Cyber", desc: "Gelap energik dengan aksen neon lime tajam & modern." },
  { id: "clean_paper", label: "Clean Paper", desc: "Terang ala majalah editorial di atas kertas putih gading." },
] as const;

export const SERIES_OPTIONS = [
  { id: "edukasi", label: "Edukasi & Tips" },
  { id: "fakta_cepat", label: "Fakta Cepat & Hook" },
  { id: "storytelling", label: "Storytelling" },
  { id: "promo_brand", label: "Promo & Brand" },
] as const;

export const OUTPUT_OPTIONS = [
  { id: "carousel", label: "Carousel (PNG)" },
  { id: "video", label: "Video (MP4)" },
  { id: "poster", label: "Poster (PNG)" },
  { id: "raw", label: "Raw Image" },
] as const;

export const ASPECT_RATIOS = [
  { id: "4:5", label: "4:5 (Feed)" },
  { id: "1:1", label: "1:1 (Square)" },
  { id: "9:16", label: "9:16 (Reels/Story)" },
  { id: "16:9", label: "16:9 (Landscape)" },
] as const;

export const SLIDE_COUNTS = [3, 5, 7, 10] as const;

export const VISUAL_PROVIDERS = [
  { id: "procedural", label: "Procedural (Cepat)" },
  { id: "pollinations", label: "Pollinations AI" },
  { id: "gemini", label: "Gemini Imagen" },
] as const;

export const LANGUAGES = [
  { id: "id", label: "Indonesia (ID)" },
  { id: "en", label: "English (EN)" },
] as const;

export const BRANDKIT_FONT_OPTIONS = [
  "Plus Jakarta Sans",
  "Inter",
  "Space Grotesk",
  "Montserrat",
  "Playfair Display",
] as const;

export const DEFAULT_BRANDKIT_CONFIG: BrandkitConfig = {
  enabled: false,
  brandName: "",
  handle: "",
  tagline: "",
  primaryColor: "#ddf77b",
  secondaryColor: "#181824",
  accentColor: "#f4f4f5",
  fontFamily: "Plus Jakarta Sans",
  logoDataUrl: null,
  notes: "",
};

export const DEFAULT_DRAFT_CONFIG: DraftConfig = {
  mode: "topic",
  topic: "",
  isBatch: false,
  referenceUrls: [],
  refResults: [],
  preset: "noir_editorial",
  series: "edukasi",
  outputs: ["carousel", "video"],
  aspectRatio: "4:5",
  language: "id",
  visualProvider: "procedural",
  slides: 5,
  mock: true,
  customSceneImages: {},
  brandkit: DEFAULT_BRANDKIT_CONFIG,
};

export function readImageFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("Gagal membaca file gambar."));
    };
    reader.onerror = () => reject(new Error("Gagal membaca file gambar."));
    reader.readAsDataURL(file);
  });
}
