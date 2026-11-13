import fs from "node:fs";
import path from "node:path";
import "dotenv/config";
import { z } from "zod";
import { bundleRemotionProject, runContentJob } from "../services/pipeline";
import { VisualProvider } from "../services/visualFactory";
import { OutputTypeSchema, PresetIdSchema } from "../types/blueprint";

const BatchItemSchema = z.object({
  topic: z.string().min(1),
  preset: PresetIdSchema.default("noir_editorial"),
  outputs: z.array(OutputTypeSchema).default(["carousel", "video"]),
  brandTag: z.string().optional(),
  slides: z.number().int().min(3).max(10).default(5),
  voice: z.string().optional(),
  visual: z
    .enum([
      "procedural",
      "unsplash",
      "wikimedia",
      "pollinations",
      "gemini",
      "pexels",
    ])
    .optional(),
  noTts: z.boolean().default(false),
  bgm: z.string().optional(),
});

const BatchListSchema = z.array(BatchItemSchema).min(1);

function parseBatchArgs(argv: string[]) {
  let filePath = "topics.json";
  let mock = false;

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--file" && argv[i + 1]) {
      filePath = argv[i + 1];
      i++;
    } else if (argv[i] === "--mock") {
      mock = true;
    }
  }
  return { filePath, mock };
}

async function main() {
  const { filePath, mock } = parseBatchArgs(process.argv.slice(2));
  const resolvedPath = path.resolve(process.cwd(), filePath);

  if (!fs.existsSync(resolvedPath)) {
    throw new Error(
      `File batch tidak ditemukan: ${resolvedPath}\nSalin topics.example.json menjadi topics.json terlebih dahulu.`
    );
  }

  const raw = JSON.parse(fs.readFileSync(resolvedPath, "utf-8"));
  const items = BatchListSchema.parse(raw);

  console.log(`\n=== AUTOCREATE BATCH (${items.length} topik) ===`);

  const needsRemotion = items.some((item) =>
    item.outputs.some((o) => ["carousel", "poster", "video"].includes(o))
  );
  const sharedServeUrl = needsRemotion
    ? await bundleRemotionProject()
    : undefined;

  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    console.log(`\n[${i + 1}/${items.length}] Memproses: "${item.topic}"`);
    try {
      const jobDir = await runContentJob({
        topic: item.topic,
        preset: item.preset,
        outputs: item.outputs,
        brandTag: item.brandTag,
        slides: item.slides,
        mock,
        visualProvider: item.visual as VisualProvider | undefined,
        voice: item.voice,
        noTts: item.noTts,
        bgm: item.bgm,
        serveUrl: sharedServeUrl,
      });
      console.log(`  ✓ Selesai → ${jobDir}`);
      successCount++;
    } catch (err) {
      console.error(
        `  ✗ Gagal memproses "${item.topic}":`,
        err instanceof Error ? err.message : err
      );
      failCount++;
    }
  }

  console.log(
    `\n=== BATCH SELESAI: ${successCount} berhasil, ${failCount} gagal ===\n`
  );
  if (failCount > 0 && successCount === 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Gagal menjalankan batch generator:", err);
  process.exit(1);
});
