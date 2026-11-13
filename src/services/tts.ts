import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";
import { ContentBlueprint } from "../types/blueprint";

export interface WordTiming {
  word: string;
  startSec: number;
  endSec: number;
}

export interface GeneratedAudio {
  /** Map from scene index (1-based) to generated .mp3 file path */
  sceneAudioFiles: Record<number, string>;
  /** Updated duration in seconds per scene index */
  sceneDurations: Record<number, number>;
  /** Word-level timestamps per scene index */
  sceneWordTimings: Record<number, WordTiming[]>;
}

/**
 * Generates Edge-TTS voiceover MP3 files + word-level timestamps
 * for each scene's narrationText, and measures exact audio duration via ffprobe.
 */
export async function generateVoiceovers(
  blueprint: ContentBlueprint,
  audioDir: string,
  voiceName = process.env.TTS_VOICE || "id-ID-ArdiNeural"
): Promise<GeneratedAudio> {
  fs.mkdirSync(audioDir, { recursive: true });

  const tts = new MsEdgeTTS();
  await tts.setMetadata(
    voiceName,
    OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3,
    { wordBoundaryEnabled: true }
  );

  const sceneAudioFiles: Record<number, string> = {};
  const sceneDurations: Record<number, number> = {};
  const sceneWordTimings: Record<number, WordTiming[]> = {};

  try {
    for (const scene of blueprint.scenes) {
      const tempDir = path.join(audioDir, `_tmp_${scene.index}`);
      fs.mkdirSync(tempDir, { recursive: true });

      const { audioFilePath, metadataFilePath } = await tts.toFile(
        tempDir,
        scene.narrationText
      );
      const finalPath = path.join(audioDir, `voice_scene_${scene.index}.mp3`);
      fs.renameSync(audioFilePath, finalPath);

      const durationSec = probeAudioDuration(finalPath);
      const wordTimings = parseWordMetadata(
        metadataFilePath,
        scene.narrationText,
        durationSec
      );

      fs.rmSync(tempDir, { recursive: true, force: true });

      sceneAudioFiles[scene.index] = finalPath;
      sceneDurations[scene.index] = Math.max(
        2.5,
        Number((durationSec + 0.45).toFixed(2))
      );
      sceneWordTimings[scene.index] = wordTimings;
    }
  } finally {
    tts.close();
  }

  return { sceneAudioFiles, sceneDurations, sceneWordTimings };
}

function parseWordMetadata(
  metadataFilePath: string | null,
  fallbackText: string,
  durationSec: number
): WordTiming[] {
  if (metadataFilePath && fs.existsSync(metadataFilePath)) {
    try {
      const raw = JSON.parse(fs.readFileSync(metadataFilePath, "utf-8")) as {
        Metadata?: Array<{
          Type?: string;
          Data?: {
            Offset?: number;
            Duration?: number;
            text?: { Text?: string };
          };
        }>;
      };
      const boundaries = (raw.Metadata ?? [])
        .filter((m) => m.Type === "WordBoundary" && m.Data?.text?.Text)
        .map((m) => {
          const startSec = (m.Data?.Offset ?? 0) / 10_000_000;
          const durSec = Math.max(0.12, (m.Data?.Duration ?? 2_000_000) / 10_000_000);
          return {
            word: String(m.Data?.text?.Text || "").trim(),
            startSec,
            endSec: startSec + durSec,
          };
        })
        .filter((w) => w.word.length > 0);

      if (boundaries.length > 0) {
        return boundaries;
      }
    } catch {
      // fall through to even-spaced fallback
    }
  }

  const words = fallbackText.split(/\s+/).filter(Boolean);
  const step = durationSec / Math.max(1, words.length);
  return words.map((word, idx) => ({
    word,
    startSec: idx * step,
    endSec: (idx + 1) * step,
  }));
}

function probeAudioDuration(filePath: string): number {
  try {
    const out = execFileSync(
      "ffprobe",
      [
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        filePath,
      ],
      { encoding: "utf-8" }
    ).trim();
    const parsed = Number.parseFloat(out);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 4;
  } catch {
    return 4;
  }
}
