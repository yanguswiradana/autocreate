import fs from "node:fs";
import path from "node:path";

export interface BrandConfig {
  brandTag: string;
  brandName: string;
  coverBadge: string;
  ctaBadge: string;
  ctaFooterText: string;
  swipeFooterText: string;
  logoPath: string;
}

const DEFAULT_BRAND: BrandConfig = {
  brandTag: "@autocreate",
  brandName: "Autocreate Studio",
  coverBadge: "INSIGHT BRIEF",
  ctaBadge: "KEY TAKEAWAY",
  ctaFooterText: "Simpan & bagikan jika bermanfaat",
  swipeFooterText: "Geser untuk lanjut →",
  logoPath: "",
};

/**
 * Loads brand customization from `brand.config.json` in project root,
 * falling back to safe defaults for any missing fields.
 */
export function loadBrandConfig(): BrandConfig {
  const configPath = path.resolve(process.cwd(), "brand.config.json");
  if (!fs.existsSync(configPath)) {
    return DEFAULT_BRAND;
  }
  try {
    const raw = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    return { ...DEFAULT_BRAND, ...raw };
  } catch {
    return DEFAULT_BRAND;
  }
}
