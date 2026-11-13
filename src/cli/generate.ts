import "dotenv/config";
import { runContentJob } from "../services/pipeline";
import { VisualProvider } from "../services/visualFactory";
import {
  AspectRatio,
  AspectRatioSchema,
  Language,
  LanguageSchema,
  OutputType,
  OutputTypeSchema,
  PresetId,
  PresetIdSchema,
} from "../types/blueprint";

interface CliArgs {
  topic: string;
  preset: PresetId;
  outputs: OutputType[];
  brandTag?: string;
  slides: number;
  language: Language;
  aspectRatio: AspectRatio;
  mock: boolean;
  visualProvider?: VisualProvider;
  voice?: string;
  noTts: boolean;
  bgm?: string;
  bgmVolume?: number;
}

function parseArgs(argv: string[]): CliArgs {
  const args: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
    } else {
      args[key] = next;
      i++;
    }
  }

  const topic =
    typeof args.topic === "string"
      ? args.topic
      : "5 Kebiasaan Kecil yang Mengubah Fokus Kerja";

  const preset = PresetIdSchema.parse(
    typeof args.preset === "string" ? args.preset : "noir_editorial"
  );

  const rawOutputs =
    typeof args.outputs === "string"
      ? args.outputs.split(",").map((s) => s.trim())
      : ["carousel", "poster", "raw_image", "video"];

  const outputs = rawOutputs.map((o) => OutputTypeSchema.parse(o));

  return {
    topic,
    preset,
    outputs,
    brandTag: typeof args.brand === "string" ? args.brand : undefined,
    slides: typeof args.slides === "string" ? Number(args.slides) : 5,
    language: LanguageSchema.parse(
      typeof args.lang === "string" ? args.lang : "id"
    ),
    aspectRatio: AspectRatioSchema.parse(
      typeof args.ratio === "string" ? args.ratio : "4:5"
    ),
    mock: Boolean(args.mock),
    visualProvider:
      typeof args.visual === "string"
        ? (args.visual as VisualProvider)
        : undefined,
    voice: typeof args.voice === "string" ? args.voice : undefined,
    noTts: Boolean(args["no-tts"]),
    bgm: typeof args.bgm === "string" ? args.bgm : undefined,
    bgmVolume:
      typeof args["bgm-volume"] === "string"
        ? Number(args["bgm-volume"])
        : undefined,
  };
}

async function main() {
  const cli = parseArgs(process.argv.slice(2));
  const jobDir = await runContentJob(cli);
  console.log(`\nSelesai! Semua output tersimpan di:\n${jobDir}\n`);
}

main().catch((err) => {
  console.error("Gagal menjalankan generator:", err);
  process.exit(1);
});
