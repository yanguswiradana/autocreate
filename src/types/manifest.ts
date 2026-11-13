import { z } from "zod";
import { PresetIdSchema } from "./blueprint";

export const OutputManifestSchema = z.object({
  version: z.literal("1.0"),
  jobId: z.string().min(1),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
  topic: z.string().min(1),
  hookTitle: z.string().min(1),
  preset: PresetIdSchema,
  brandTag: z.string().min(1),
  outputs: z.object({
    carouselSlides: z.array(z.string()),
    poster: z.string().nullable(),
    video: z.string().nullable(),
    rawImages: z.array(z.string()),
    audioFiles: z.array(z.string()),
    captionFile: z.string(),
    blueprintFile: z.string(),
  }),
  caption: z.string(),
  hashtags: z.array(z.string()),
  videoDurationSeconds: z.number().nullable(),
});

export type OutputManifest = z.infer<typeof OutputManifestSchema>;
