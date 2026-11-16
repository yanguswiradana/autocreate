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
};

export function getSeriesPreset(series?: SeriesPreset): SeriesPresetConfig {
  return SERIES_PRESETS[series || "edukasi"];
}
