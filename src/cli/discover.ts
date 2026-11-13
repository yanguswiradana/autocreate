import fs from "node:fs";
import path from "node:path";
import "dotenv/config";
import { bundleRemotionProject, runContentJob } from "../services/pipeline";
import { discoverTopics } from "../services/topicFinder";

function parseArgs(argv: string[]) {
  let count: number | undefined;
  let mock = false;
  let run = false;
  let outFile = "topics.json";

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--count" && argv[i + 1]) {
      count = Number(argv[i + 1]);
      i++;
    } else if (argv[i] === "--out" && argv[i + 1]) {
      outFile = argv[i + 1];
      i++;
    } else if (argv[i] === "--mock") {
      mock = true;
    } else if (argv[i] === "--run") {
      run = true;
    }
  }
  return { count, mock, run, outFile };
}

async function main() {
  const { count, mock, run, outFile } = parseArgs(process.argv.slice(2));
  console.log(`\n[1/2] Mengambil RSS feed & mengkurasi topik...`);

  const topics = await discoverTopics({ count, mock });
  const outPath = path.resolve(process.cwd(), outFile);
  const batchPayload = topics.map(({ topic, preset, outputs }) => ({
    topic,
    preset,
    outputs,
  }));

  fs.writeFileSync(outPath, JSON.stringify(batchPayload, null, 2), "utf-8");
  console.log(`\n[2/2] ${topics.length} topik tersimpan ke ${outPath}:`);
  for (const t of topics) {
    console.log(`  • [${t.preset}] ${t.topic}`);
  }

  if (run) {
    console.log(`\nMenjalankan batch render untuk ${topics.length} topik...`);
    const serveUrl = await bundleRemotionProject();
    for (const item of batchPayload) {
      const dir = await runContentJob({
        topic: item.topic,
        preset: item.preset,
        outputs: item.outputs,
        mock,
        serveUrl,
      });
      console.log(`  ✓ Selesai → ${dir}`);
    }
  } else {
    console.log(`\nJalankan \`npm run batch\` untuk merender semua topik di atas.\n`);
  }
}

main().catch((err) => {
  console.error("Gagal menjalankan Auto-Topic Finder:", err);
  process.exit(1);
});
