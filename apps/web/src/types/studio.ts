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
  instruction: string;
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
  voice: string;
  bgm: string;
  bgmVolume: number;
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
  aiVision?: {
    suggestedTopic: string;
    suggestedHook: string;
    styleSummary: string;
  } | null;
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
  {
    id: "noir_editorial",
    label: "Noir Editorial",
    desc: "Gelap kontras tinggi, aksen hangat, tipografi editorial.",
    bgPrimary: "#0C0C0F",
    bgSecondary: "#141419",
    textPrimary: "#F4EFE6",
    accent: "#D4AF37",
    fontStyle: "serif",
  },
  {
    id: "midnight_tech",
    label: "Midnight Tech",
    desc: "Nuansa futuristik gelap dengan garis presisi modern.",
    bgPrimary: "#070B14",
    bgSecondary: "#0E1628",
    textPrimary: "#F1F5F9",
    accent: "#38BDF8",
    fontStyle: "sans",
  },
  {
    id: "monochrome_luxury",
    label: "Monochrome Luxury",
    desc: "Minimalis monokrom berkelas dengan ruang napas luas.",
    bgPrimary: "#090909",
    bgSecondary: "#151515",
    textPrimary: "#FAFAFA",
    accent: "#E5E5E5",
    fontStyle: "serif",
  },
  {
    id: "warm_cinematic",
    label: "Warm Cinematic",
    desc: "Nuansa film hangat keemasan untuk storytelling & dokumenter.",
    bgPrimary: "#120D0A",
    bgSecondary: "#1D1510",
    textPrimary: "#FEF3C7",
    accent: "#F59E0B",
    fontStyle: "serif",
  },
  {
    id: "neon_cyber",
    label: "Neon Cyber",
    desc: "Gelap energik dengan aksen neon lime tajam & modern.",
    bgPrimary: "#090612",
    bgSecondary: "#130D24",
    textPrimary: "#F8FAFC",
    accent: "#DDF77B",
    fontStyle: "sans",
  },
  {
    id: "clean_paper",
    label: "Clean Paper",
    desc: "Terang ala majalah editorial di atas kertas putih gading.",
    bgPrimary: "#F7F4EE",
    bgSecondary: "#EDE8DF",
    textPrimary: "#18181B",
    accent: "#DC2626",
    fontStyle: "serif",
  },
] as const;

export const SERIES_OPTIONS = [
  {
    id: "edukasi",
    label: "Edukasi & Tips",
    desc: "Langkah praktis, angka besar, & kartu poin.",
    previewTag: "01 · TIPS",
    previewTitle: "3 Langkah Praktis",
    previewShape: "big_number",
  },
  {
    id: "fakta_cepat",
    label: "Fakta Cepat & Hook",
    desc: "Headline berita tebal, kutipan, & highlight.",
    previewTag: "HEADLINE",
    previewTitle: "Fakta Mengejutkan",
    previewShape: "news_headline",
  },
  {
    id: "storytelling",
    label: "Storytelling",
    desc: "Foto split atas-bawah, kutipan reflektif, & insight.",
    previewTag: "STORY",
    previewTitle: "Awal Cerita & Konflik",
    previewShape: "photo_top_split",
  },
  {
    id: "promo_brand",
    label: "Promo & Brand",
    desc: "Headline masalah, kartu solusi, & CTA tegas.",
    previewTag: "SOLUSI",
    previewTitle: "Problem -> Solusi",
    previewShape: "split_card",
  },
  {
    id: "komparasi",
    label: "Mitos vs Fakta",
    desc: "Perbandingan dua sisi kontras: Mitos vs Realita.",
    previewTag: "VS · KONTRAST",
    previewTitle: "Mitos vs Fakta",
    previewShape: "versus_split",
  },
  {
    id: "kronologi",
    label: "Kronologi & Timeline",
    desc: "Alur kejadian bertahap dengan garis penghubung.",
    previewTag: "TIMELINE",
    previewTitle: "Tahap 1 -> Dampak",
    previewShape: "timeline_step",
  },
  {
    id: "checklist",
    label: "Checklist & Panduan",
    desc: "Daftar poin centang praktis siap simpan.",
    previewTag: "✓ CHECKLIST",
    previewTitle: "Daftar Cek Praktis",
    previewShape: "checklist_card",
  },
  {
    id: "opini_quote",
    label: "Opini & Quote Editorial",
    desc: "Foto penuh dengan kutipan editorial tajam.",
    previewTag: "OPINI",
    previewTitle: "Kutipan & Sudut Pandang",
    previewShape: "full_bleed_caption",
  },
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
  { id: "wikimedia", label: "Cari Foto Internet (Wikimedia)" },
  { id: "pollinations", label: "Pollinations AI" },
  { id: "gemini", label: "Gemini Imagen" },
] as const;

export const LANGUAGES = [
  { id: "id", label: "Indonesia (ID)" },
  { id: "en", label: "English (EN)" },
] as const;

export const VOICE_OPTIONS = [
  { id: "id-ID-ArdiNeural", label: "Ardi (Pria ID)" },
  { id: "id-ID-GadisNeural", label: "Gadis (Wanita ID)" },
  { id: "en-US-AndrewNeural", label: "Andrew (Male EN)" },
  { id: "en-US-AriaNeural", label: "Aria (Female EN)" },
] as const;

export const BGM_OPTIONS = [
  { id: "ambient_dark", label: "Ambient Dark" },
  { id: "lofi_calm", label: "Lofi Calm" },
  { id: "cinematic_pulse", label: "Cinematic Pulse" },
  { id: "none", label: "Tanpa BGM" },
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
  instruction: "",
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
  voice: "id-ID-ArdiNeural",
  bgm: "ambient_dark",
  bgmVolume: 0.14,
  mock: false,
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

export function formatFriendlyError(raw?: string | null): string {
  const msg = (raw || "").trim();
  if (!msg) return "Terjadi gangguan saat memproses render. Silakan coba lagi.";
  const lower = msg.toLowerCase();
  if (lower.includes("429") || lower.includes("quota") || lower.includes("resource_exhausted") || lower.includes("rate limit")) {
    return "Kuota atau batas permintaan AI sedang penuh. Coba tunggu sebentar, ganti provider/API key di Setting, atau aktifkan Mock: ON untuk uji layout.";
  }
  if (lower.includes("401") || lower.includes("403") || lower.includes("api key") || lower.includes("unauthorized")) {
    return "API Key AI tidak valid atau belum aktif. Periksa kembali kunci di menu Setting → Provider AI.";
  }
  if (lower.includes("econnrefused") || lower.includes("timeout") || lower.includes("502") || lower.includes("504") || lower.includes("fetch failed")) {
    return "Koneksi ke layanan renderer/eksternal terputus atau timeout. Pastikan container aktif lalu klik Coba Lagi.";
  }
  if (lower.includes("extract") || lower.includes("url") || lower.includes("404")) {
    return "Link referensi gagal diakses atau diblokir situs sumber. Coba salin teks intinya langsung ke chat.";
  }
  return msg.length > 180 ? `${msg.slice(0, 177)}...` : msg;
}
