import { z } from "zod";

export const BrandkitOverrideSchema = z.object({
  brandTag: z.string().optional(),
  brandName: z.string().optional(),
  logoUrl: z.string().optional(),
  bgPrimary: z.string().optional(),
  accentColor: z.string().optional(),
  textPrimary: z.string().optional(),
  fontDisplay: z.string().optional(),
  fontBody: z.string().optional(),
  brandVoice: z.string().optional(),
  brandPersonality: z.string().optional(),
  targetAudience: z.string().optional(),
  forbiddenWords: z.array(z.string()).optional(),
  description: z.string().optional(),
});

export type BrandkitOverride = z.infer<typeof BrandkitOverrideSchema>;

/**
 * Maps a BrandResource JSON payload from `brandkit-sistem` (`GET /api/brands/{id}`)
 * into Autocreate's `BrandkitOverride` structure.
 */
export function mapBrandkitSistemToOverride(raw: unknown): BrandkitOverride {
  const payload =
    raw && typeof raw === "object" && "data" in raw
      ? (raw as { data: Record<string, unknown> }).data
      : (raw as Record<string, unknown>);

  if (!payload || typeof payload !== "object") {
    return {};
  }

  const name = typeof payload.name === "string" ? payload.name.trim() : undefined;
  const description =
    typeof payload.description === "string" ? payload.description.trim() : undefined;
  const logoUrl =
    typeof payload.logo_url === "string" ? payload.logo_url : undefined;

  const identity =
    payload.identity && typeof payload.identity === "object"
      ? (payload.identity as Record<string, unknown>)
      : {};

  // Extract HEX colors flexibly from various identity shapes
  const hexMatches = JSON.stringify(identity).match(/#[0-9A-Fa-f]{6}\b/g) ?? [];
  const accentColor = hexMatches[0];

  const brandVoice = extractTextField(identity, [
    "brand_voice",
    "voice",
    "tone",
    "tone_of_voice",
  ]);
  const brandPersonality = extractTextField(identity, [
    "brand_personality",
    "personality",
  ]);

  const slug = name
    ? `@${name.toLowerCase().replace(/[^a-z0-9]+/g, "")}`
    : undefined;

  return {
    brandTag: slug,
    brandName: name,
    logoUrl,
    accentColor,
    brandVoice,
    brandPersonality,
    description,
  };
}

function extractTextField(
  obj: Record<string, unknown>,
  keys: string[]
): string | undefined {
  for (const k of keys) {
    const val = obj[k];
    if (typeof val === "string" && val.trim()) return val.trim();
    if (Array.isArray(val)) return val.map(String).join(", ");
    if (val && typeof val === "object") return JSON.stringify(val);
  }
  return undefined;
}
