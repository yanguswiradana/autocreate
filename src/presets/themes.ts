import { PresetId } from "../types/blueprint";
import type { BrandkitOverride } from "../types/brandkit";

export interface ThemePreset {
  id: PresetId;
  name: string;
  bgPrimary: string;
  bgSecondary: string;
  surface: string;
  textPrimary: string;
  textSecondary: string;
  accent: string;
  accentSoft: string;
  border: string;
  fontDisplay: string;
  fontBody: string;
  visualStyleAnchor: string;
  overlayGradient: string;
}

export const THEME_PRESETS: Record<PresetId, ThemePreset> = {
  noir_editorial: {
    id: "noir_editorial",
    name: "Noir Editorial",
    bgPrimary: "#0C0C0F",
    bgSecondary: "#141419",
    surface: "rgba(22, 22, 28, 0.78)",
    textPrimary: "#F4EFE6",
    textSecondary: "#B3ABA0",
    accent: "#D4AF37",
    accentSoft: "rgba(212, 175, 55, 0.16)",
    border: "rgba(212, 175, 55, 0.28)",
    fontDisplay: "Georgia, 'Times New Roman', serif",
    fontBody: "'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    visualStyleAnchor:
      "dark moody editorial photography, chiaroscuro lighting, subtle warm gold highlights, deep shadows, minimalist luxury aesthetic, no text, no watermark",
    overlayGradient:
      "linear-gradient(180deg, rgba(12,12,15,0.55) 0%, rgba(12,12,15,0.82) 55%, rgba(12,12,15,0.96) 100%)",
  },
  midnight_tech: {
    id: "midnight_tech",
    name: "Midnight Tech",
    bgPrimary: "#070B14",
    bgSecondary: "#0E1628",
    surface: "rgba(15, 23, 42, 0.76)",
    textPrimary: "#F1F5F9",
    textSecondary: "#94A3B8",
    accent: "#38BDF8",
    accentSoft: "rgba(56, 189, 248, 0.14)",
    border: "rgba(56, 189, 248, 0.26)",
    fontDisplay: "'Segoe UI', Inter, system-ui, sans-serif",
    fontBody: "'Segoe UI', Inter, system-ui, sans-serif",
    visualStyleAnchor:
      "futuristic dark midnight blue aesthetic, subtle cyan rim light, sleek minimalist tech atmosphere, clean depth of field, no text, no watermark",
    overlayGradient:
      "linear-gradient(180deg, rgba(7,11,20,0.5) 0%, rgba(7,11,20,0.82) 55%, rgba(7,11,20,0.96) 100%)",
  },
  monochrome_luxury: {
    id: "monochrome_luxury",
    name: "Monochrome Luxury",
    bgPrimary: "#090909",
    bgSecondary: "#151515",
    surface: "rgba(20, 20, 20, 0.8)",
    textPrimary: "#FAFAFA",
    textSecondary: "#A3A3A3",
    accent: "#E5E5E5",
    accentSoft: "rgba(255, 255, 255, 0.1)",
    border: "rgba(255, 255, 255, 0.22)",
    fontDisplay: "Georgia, 'Times New Roman', serif",
    fontBody: "'Segoe UI', Helvetica, Arial, sans-serif",
    visualStyleAnchor:
      "high contrast black and white fine art photography, dramatic studio lighting, minimalist architectural shadows, subtle film grain, no text, no watermark",
    overlayGradient:
      "linear-gradient(180deg, rgba(9,9,9,0.55) 0%, rgba(9,9,9,0.84) 55%, rgba(9,9,9,0.97) 100%)",
  },
  warm_cinematic: {
    id: "warm_cinematic",
    name: "Warm Cinematic",
    bgPrimary: "#120D0A",
    bgSecondary: "#1D1510",
    surface: "rgba(32, 22, 16, 0.78)",
    textPrimary: "#FEF3C7",
    textSecondary: "#D6B89C",
    accent: "#F59E0B",
    accentSoft: "rgba(245, 158, 11, 0.16)",
    border: "rgba(245, 158, 11, 0.28)",
    fontDisplay: "Georgia, 'Times New Roman', serif",
    fontBody: "'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    visualStyleAnchor:
      "warm golden hour cinematic film photography, soft amber rim lighting, subtle 35mm film grain, rich earthy shadows, no text, no watermark",
    overlayGradient:
      "linear-gradient(180deg, rgba(18,13,10,0.48) 0%, rgba(18,13,10,0.8) 55%, rgba(18,13,10,0.96) 100%)",
  },
  neon_cyber: {
    id: "neon_cyber",
    name: "Neon Cyber",
    bgPrimary: "#090612",
    bgSecondary: "#130D24",
    surface: "rgba(22, 14, 42, 0.8)",
    textPrimary: "#F8FAFC",
    textSecondary: "#A5B4FC",
    accent: "#DDF77B",
    accentSoft: "rgba(221, 247, 123, 0.16)",
    border: "rgba(221, 247, 123, 0.3)",
    fontDisplay: "'Segoe UI', Inter, system-ui, sans-serif",
    fontBody: "'Segoe UI', Inter, system-ui, sans-serif",
    visualStyleAnchor:
      "high contrast cyber dark studio aesthetic, electric lime and subtle violet rim glow, sharp modern geometry, clean focal subject, no text, no watermark",
    overlayGradient:
      "linear-gradient(180deg, rgba(9,6,18,0.5) 0%, rgba(9,6,18,0.82) 55%, rgba(9,6,18,0.96) 100%)",
  },
  clean_paper: {
    id: "clean_paper",
    name: "Clean Paper",
    bgPrimary: "#F7F4EE",
    bgSecondary: "#EDE8DF",
    surface: "rgba(255, 255, 255, 0.88)",
    textPrimary: "#18181B",
    textSecondary: "#52525B",
    accent: "#DC2626",
    accentSoft: "rgba(220, 38, 38, 0.12)",
    border: "rgba(24, 24, 27, 0.14)",
    fontDisplay: "Georgia, 'Times New Roman', serif",
    fontBody: "'Segoe UI', Inter, system-ui, sans-serif",
    visualStyleAnchor:
      "bright minimalist daylight editorial photography, warm off-white paper aesthetic, crisp natural shadows, clean magazine composition, no text, no watermark",
    overlayGradient:
      "linear-gradient(180deg, rgba(247,244,238,0.35) 0%, rgba(247,244,238,0.78) 55%, rgba(247,244,238,0.95) 100%)",
  },
};

export function getThemePreset(
  id: PresetId,
  brandkit?: BrandkitOverride
): ThemePreset {
  const base = THEME_PRESETS[id];
  if (!brandkit) return base;

  const accent = brandkit.accentColor || base.accent;
  return {
    ...base,
    bgPrimary: brandkit.bgPrimary || base.bgPrimary,
    textPrimary: brandkit.textPrimary || base.textPrimary,
    accent,
    accentSoft: brandkit.accentColor ? `${accent}24` : base.accentSoft,
    border: brandkit.accentColor ? `${accent}47` : base.border,
    fontDisplay: brandkit.fontDisplay || base.fontDisplay,
    fontBody: brandkit.fontBody || base.fontBody,
  };
}
