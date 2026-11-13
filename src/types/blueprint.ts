import { z } from "zod";

export const PresetIdSchema = z.enum([
  "noir_editorial",
  "midnight_tech",
  "monochrome_luxury",
]);

export type PresetId = z.infer<typeof PresetIdSchema>;

export const OutputTypeSchema = z.enum([
  "carousel",
  "poster",
  "raw_image",
  "video",
]);

export type OutputType = z.infer<typeof OutputTypeSchema>;

export const SceneSchema = z.object({
  index: z.number().int().min(1),
  role: z.enum(["cover", "content", "cta"]),
  slideTitle: z.string().min(1),
  slideBody: z.string().min(1),
  narrationText: z.string().min(1),
  visualPrompt: z.string().min(1),
  durationSeconds: z.number().min(2).max(15).default(4),
});

export type Scene = z.infer<typeof SceneSchema>;

export const ContentBlueprintSchema = z.object({
  topic: z.string().min(1),
  hookTitle: z.string().min(1),
  subtitle: z.string().min(1),
  brandTag: z.string().default("@autocreate"),
  preset: PresetIdSchema,
  scenes: z.array(SceneSchema).min(3).max(10),
  caption: z.string().min(1),
  hashtags: z.array(z.string()).min(3).max(15),
});

export type ContentBlueprint = z.infer<typeof ContentBlueprintSchema>;
