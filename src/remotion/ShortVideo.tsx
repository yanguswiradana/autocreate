import React from "react";
import {
  AbsoluteFill,
  Audio,
  Img,
  Sequence,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { getThemePreset } from "../presets/themes";
import type { WordTiming } from "../services/tts";
import { ContentBlueprint, Scene } from "../types/blueprint";

export interface ShortVideoProps {
  blueprint: ContentBlueprint;
  sceneBgDataUris: Record<number, string>;
  sceneAudioDataUris?: Record<number, string>;
  sceneWordTimings?: Record<number, WordTiming[]>;
  bgmDataUri?: string;
  logoDataUri?: string;
}

const SceneSegment: React.FC<{
  scene: Scene;
  brandTag: string;
  preset: ContentBlueprint["preset"];
  bgDataUri?: string;
  logoDataUri?: string;
  wordTimings?: WordTiming[];
  totalScenes: number;
}> = ({
  scene,
  brandTag,
  preset,
  bgDataUri,
  logoDataUri,
  wordTimings,
  totalScenes,
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames, fps } = useVideoConfig();
  const theme = getThemePreset(preset);
  const currentSec = frame / fps;

  const scale = interpolate(frame, [0, durationInFrames], [1.0, 1.09], {
    extrapolateRight: "clamp",
  });
  const textOpacity = interpolate(frame, [0, 12], [0, 1], {
    extrapolateRight: "clamp",
  });
  const translateY = interpolate(frame, [0, 14], [24, 0], {
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: theme.bgPrimary,
        color: theme.textPrimary,
        fontFamily: theme.fontBody,
      }}
    >
      {bgDataUri ? (
        <Img
          src={bgDataUri}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            opacity: 0.72,
            transform: `scale(${scale})`,
            filter:
              preset === "monochrome_luxury"
                ? "grayscale(1) brightness(0.72) contrast(1.18)"
                : "brightness(0.74) contrast(1.12) saturate(0.65)",
          }}
        />
      ) : null}

      <div
        style={{
          position: "absolute",
          inset: 0,
          background: theme.overlayGradient,
        }}
      />

      <div
        style={{
          position: "relative",
          zIndex: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          height: "100%",
          padding: "110px 72px 140px",
          boxSizing: "border-box",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            {logoDataUri ? (
              <Img
                src={logoDataUri}
                style={{
                  height: 36,
                  width: 36,
                  objectFit: "contain",
                  borderRadius: 6,
                }}
              />
            ) : null}
            <span
              style={{
                fontSize: 26,
                letterSpacing: 3,
                textTransform: "uppercase",
                color: theme.accent,
                fontWeight: 600,
              }}
            >
              {brandTag}
            </span>
          </div>
          <span
            style={{
              fontSize: 22,
              color: theme.textSecondary,
              padding: "8px 18px",
              borderRadius: 999,
              border: `1px solid ${theme.border}`,
              backgroundColor: theme.surface,
            }}
          >
            {scene.index} / {totalScenes}
          </span>
        </div>

        <div
          style={{
            opacity: textOpacity,
            transform: `translateY(${translateY}px)`,
            display: "flex",
            flexDirection: "column",
            gap: 28,
          }}
        >
          <h1
            style={{
              margin: 0,
              fontFamily: theme.fontDisplay,
              fontSize: scene.role === "cover" ? 74 : 62,
              lineHeight: 1.15,
              color: theme.textPrimary,
            }}
          >
            {scene.slideTitle}
          </h1>

          <div
            style={{
              width: 84,
              height: 4,
              backgroundColor: theme.accent,
              borderRadius: 2,
            }}
          />

          <p
            style={{
              margin: 0,
              fontSize: 36,
              lineHeight: 1.5,
              color: theme.textSecondary,
            }}
          >
            {scene.slideBody}
          </p>
        </div>

        {/* Dynamic Highlight Subtitle Box */}
        <DynamicSubtitle
          narrationText={scene.narrationText}
          wordTimings={wordTimings}
          currentSec={currentSec}
          durationSec={durationInFrames / fps}
          theme={theme}
          opacity={textOpacity}
        />
      </div>
    </AbsoluteFill>
  );
};

const DynamicSubtitle: React.FC<{
  narrationText: string;
  wordTimings?: WordTiming[];
  currentSec: number;
  durationSec: number;
  theme: ReturnType<typeof getThemePreset>;
  opacity: number;
}> = ({ narrationText, wordTimings, currentSec, durationSec, theme, opacity }) => {
  const words: WordTiming[] =
    wordTimings && wordTimings.length > 0
      ? wordTimings
      : narrationText
          .split(/\s+/)
          .filter(Boolean)
          .map((w, idx, arr) => {
            const step = Math.max(0.2, (durationSec - 0.3) / Math.max(1, arr.length));
            return { word: w, startSec: idx * step, endSec: (idx + 1) * step };
          });

  const CHUNK_SIZE = 4;
  const chunks: WordTiming[][] = [];
  for (let i = 0; i < words.length; i += CHUNK_SIZE) {
    chunks.push(words.slice(i, i + CHUNK_SIZE));
  }

  let activeChunk = chunks[chunks.length - 1] ?? [];
  for (const chunk of chunks) {
    const first = chunk[0];
    const last = chunk[chunk.length - 1];
    if (currentSec >= first.startSec && currentSec <= last.endSec + 0.15) {
      activeChunk = chunk;
      break;
    }
    if (currentSec < first.startSec) {
      activeChunk = chunk;
      break;
    }
  }

  return (
    <div
      style={{
        opacity,
        padding: "24px 30px",
        borderRadius: 20,
        backgroundColor: theme.surface,
        border: `1px solid ${theme.border}`,
        display: "flex",
        flexWrap: "wrap",
        justifyContent: "center",
        alignItems: "center",
        gap: "10px 14px",
        minHeight: 112,
      }}
    >
      {activeChunk.map((wt, idx) => {
        const isActive =
          currentSec >= wt.startSec && currentSec <= wt.endSec + 0.12;
        return (
          <span
            key={`${wt.startSec}-${idx}`}
            style={{
              fontSize: 38,
              fontWeight: isActive ? 800 : 600,
              lineHeight: 1.3,
              color: isActive ? theme.accent : theme.textPrimary,
              transform: isActive ? "scale(1.07)" : "scale(1)",
              display: "inline-block",
              textShadow: isActive
                ? `0 0 18px ${theme.accentSoft}`
                : "none",
            }}
          >
            {wt.word}
          </span>
        );
      })}
    </div>
  );
};

export const ShortVideo: React.FC<ShortVideoProps> = ({
  blueprint,
  sceneBgDataUris,
  sceneAudioDataUris = {},
  sceneWordTimings = {},
  bgmDataUri,
  logoDataUri,
}) => {
  const { fps, durationInFrames } = useVideoConfig();
  const frame = useCurrentFrame();
  const theme = getThemePreset(blueprint.preset);

  let currentStart = 0;
  const segments = blueprint.scenes.map((scene) => {
    const duration = Math.max(1, Math.round(scene.durationSeconds * fps));
    const from = currentStart;
    currentStart += duration;
    return { scene, from, duration };
  });

  const progressPct = Math.min(100, (frame / Math.max(1, durationInFrames)) * 100);

  return (
    <AbsoluteFill style={{ backgroundColor: theme.bgPrimary }}>
      {bgmDataUri ? <Audio src={bgmDataUri} loop volume={0.14} /> : null}

      {segments.map(({ scene, from, duration }) => (
        <Sequence key={scene.index} from={from} durationInFrames={duration}>
          {sceneAudioDataUris[scene.index] ? (
            <Audio src={sceneAudioDataUris[scene.index]} volume={1} />
          ) : null}
          <SceneSegment
            scene={scene}
            brandTag={blueprint.brandTag}
            preset={blueprint.preset}
            bgDataUri={sceneBgDataUris[scene.index]}
            logoDataUri={logoDataUri}
            wordTimings={sceneWordTimings[scene.index]}
            totalScenes={blueprint.scenes.length}
          />
        </Sequence>
      ))}

      {/* Top progress bar */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 8,
          backgroundColor: "rgba(255,255,255,0.08)",
          zIndex: 10,
        }}
      >
        <div
          style={{
            width: `${progressPct}%`,
            height: "100%",
            backgroundColor: theme.accent,
          }}
        />
      </div>
    </AbsoluteFill>
  );
};
