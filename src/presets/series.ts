import type { SeriesPreset, SlideLayout, VideoTransition } from "../types/blueprint";

export interface SeriesPresetConfig {
  id: SeriesPreset;
  name: string;
  description: string;
  promptDirective: string;
  defaultTransition: VideoTransition;
  defaultLayoutPattern: SlideLayout[];
}

export const SERIES_PRESETS: Record<SeriesPreset, SeriesPresetConfig> = {
  edukasi: {
    id: "edukasi",
    name: "Edukasi & Tips",
    description: "Struktur langkah praktis, poin jelas, dan actionable takeaway.",
    promptDirective:
      "Gunakan pendekatan edukatif yang terstruktur: Slide cover menjanjikan solusi praktis, slide konten berisi langkah atau poin konkret yang mudah dipraktikkan, dan CTA mengajak simpan serta bagikan.",
    defaultTransition: "crossfade",
    defaultLayoutPattern: ["editorial", "big_number", "split_card", "highlight_box"],
  },
  fakta_cepat: {
    id: "fakta_cepat",
    name: "Fakta Cepat & Hook",
    description: "Hook mengejutkan, fakta singkat padat, ritme cepat.",
    promptDirective:
      "Gunakan gaya fakta cepat yang memicu rasa ingin tahu: Slide cover berupa fakta atau pertanyaan mengejutkan, slide konten singkat & punchy (mitos vs realita atau angka kunci), dan CTA mengajak diskusi di komentar.",
    defaultTransition: "zoom",
    defaultLayoutPattern: ["news_headline", "big_number", "quote_focus", "highlight_box"],
  },
  storytelling: {
    id: "storytelling",
    name: "Storytelling / Refleksi",
    description: "Alur cerita emosional, narasi mengalir, dan insight mendalam.",
    promptDirective:
      "Gunakan alur storytelling (situasi awal -> konflik/titik balik -> pelajaran): Narasi terasa personal dan reflektif, judul slide tajam namun hangat, dan CTA mengajak audiens berbagi pengalaman.",
    defaultTransition: "crossfade",
    defaultLayoutPattern: ["editorial", "photo_top_split", "quote_focus", "highlight_box"],
  },
  promo_brand: {
    id: "promo_brand",
    name: "Promo & Brand Value",
    description: "Fokus pain point audiens, nilai solusi, dan ajakan aksi jelas.",
    promptDirective:
      "Gunakan kerangka copywriting brand (Problem -> Insight -> Solution -> CTA): Soroti masalah nyata audiens, tampilkan nilai solusi brand secara elegan tanpa hard-selling berlebihan, dan akhiri dengan CTA yang tegas.",
    defaultTransition: "slide",
    defaultLayoutPattern: ["news_headline", "split_card", "photo_top_split", "highlight_box"],
  },
  komparasi: {
    id: "komparasi",
    name: "Mitos vs Fakta / Komparasi",
    description: "Perbandingan dua sisi secara kontras: Mitos vs Realita atau Sebelum vs Sesudah.",
    promptDirective:
      "Gunakan format perbandingan kontras: Slide cover menantang anggapan umum, tiap slide konten membandingkan dua sisi secara tegas (misalnya Mitos vs Fakta atau Cara Lama vs Cara Baru dalam 1 kalimat tiap sisi), dan CTA mengajak audiens memilih tim mana di komentar.",
    defaultTransition: "slide",
    defaultLayoutPattern: ["news_headline", "versus_split", "split_card", "highlight_box"],
  },
  kronologi: {
    id: "kronologi",
    name: "Kronologi & Timeline",
    description: "Alur kejadian atau perkembangan bertahap dari awal hingga dampak terkini.",
    promptDirective:
      "Gunakan alur kronologis bertahap (Tahap 1 -> Tahap 2 -> Titik Balik -> Dampak Terkini): Cocok untuk berita berseri atau sejarah singkat. Tiap slide punya penanda urutan/waktu yang jelas dan narasi padat.",
    defaultTransition: "crossfade",
    defaultLayoutPattern: ["editorial", "timeline_step", "photo_top_split", "highlight_box"],
  },
  checklist: {
    id: "checklist",
    name: "Checklist & Panduan",
    description: "Daftar langkah siap praktik berbentuk kartu centang yang mudah disimpan.",
    promptDirective:
      "Gunakan format checklist praktis: Slide cover menjanjikan daftar cek siap pakai, setiap slide konten berisi 1 poin verifikasi/aksi konkret yang ringkas, dan CTA mengajak audiens menyimpan (Save) sebagai panduan.",
    defaultTransition: "crossfade",
    defaultLayoutPattern: ["editorial", "checklist_card", "big_number", "highlight_box"],
  },
  opini_quote: {
    id: "opini_quote",
    name: "Opini & Quote Editorial",
    description: "Kutipan tajam, sudut pandang editorial, dan visual penuh berkarakter.",
    promptDirective:
      "Gunakan gaya opini editorial yang berwibawa dan reflektif: Slide cover berupa pernyataan pemantik diskusi, slide konten memadukan kutipan tajam dan analisis singkat, dan CTA mengundang diskusi berkualitas.",
    defaultTransition: "zoom",
    defaultLayoutPattern: ["full_bleed_caption", "quote_focus", "editorial", "highlight_box"],
  },
};

export function getSeriesPreset(series?: SeriesPreset): SeriesPresetConfig {
  return SERIES_PRESETS[series || "edukasi"];
}
