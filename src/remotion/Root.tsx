import React from "react";
import { Composition } from "remotion";
import { ContentBlueprint } from "../types/blueprint";
import { CarouselSlide, CarouselSlideProps } from "./CarouselSlide";
import { PosterCard, PosterCardProps } from "./PosterCard";
import { ShortVideo, ShortVideoProps } from "./ShortVideo";

const DEFAULT_BLUEPRINT: ContentBlueprint = {
  topic: "Kebiasaan Kecil yang Mengubah Hidup",
  hookTitle: "Kebiasaan Kecil yang Mengubah Hidup",
  subtitle: "Ringkasan tajam yang jarang disadari.",
  brandTag: "@autocreate",
  preset: "noir_editorial",
  language: "id",
  aspectRatio: "4:5",
  scenes: [
    {
      index: 1,
      role: "cover",
      slideTitle: "Kebiasaan Kecil yang Mengubah Hidup",
      slideBody: "Kenapa konsistensi 1% selalu mengalahkan motivasi sesaat.",
      narrationText: "Pernah sadar kenapa perubahan kecil lebih bertahan lama?",
      visualPrompt: "dark moody editorial",
      durationSeconds: 4,
    },
    {
      index: 2,
      role: "content",
      slideTitle: "Fokus pada Sistem",
      slideBody: "Sistem yang baik membuat kamu tetap bergerak saat energi rendah.",
      narrationText: "Bangun sistem kecil yang mudah dijalankan setiap hari.",
      visualPrompt: "dark moody architecture",
      durationSeconds: 4,
    },
    {
      index: 3,
      role: "cta",
      slideTitle: "Simpan & Terapkan",
      slideBody: "Bagikan ke teman yang butuh pengingat ini.",
      narrationText: "Simpan postingan ini sebagai pengingat.",
      visualPrompt: "dark luxury horizon",
      durationSeconds: 3,
    },
  ],
  caption: "Konsistensi kecil setiap hari.",
  hashtags: ["#edukasi", "#mindset", "#produktivitas"],
};

export const RemotionRoot: React.FC = () => {
  const fps = 30;

  return (
    <>
      <Composition
        id="CarouselSlide"
        component={CarouselSlide as unknown as React.FC<Record<string, unknown>>}
        durationInFrames={1}
        fps={fps}
        width={1080}
        height={1350}
        defaultProps={
          {
            preset: DEFAULT_BLUEPRINT.preset,
            brandTag: DEFAULT_BLUEPRINT.brandTag,
            hookTitle: DEFAULT_BLUEPRINT.hookTitle,
            totalSlides: DEFAULT_BLUEPRINT.scenes.length,
            scene: DEFAULT_BLUEPRINT.scenes[0],
            aspectRatio: "4:5",
          } satisfies CarouselSlideProps
        }
        calculateMetadata={({ props }) => {
          const typedProps = props as unknown as CarouselSlideProps;
          return {
            width: 1080,
            height: typedProps.aspectRatio === "1:1" ? 1080 : 1350,
          };
        }}
      />

      <Composition
        id="PosterCard"
        component={PosterCard as unknown as React.FC<Record<string, unknown>>}
        durationInFrames={1}
        fps={fps}
        width={1080}
        height={1350}
        defaultProps={
          {
            blueprint: DEFAULT_BLUEPRINT,
          } satisfies PosterCardProps
        }
        calculateMetadata={({ props }) => {
          const typedProps = props as unknown as PosterCardProps;
          return {
            width: 1080,
            height: typedProps.blueprint.aspectRatio === "1:1" ? 1080 : 1350,
          };
        }}
      />

      <Composition
        id="ShortVideo"
        component={ShortVideo as unknown as React.FC<Record<string, unknown>>}
        durationInFrames={330}
        fps={fps}
        width={1080}
        height={1920}
        defaultProps={
          {
            blueprint: DEFAULT_BLUEPRINT,
            sceneBgDataUris: {},
          } satisfies ShortVideoProps
        }
        calculateMetadata={({ props }) => {
          const typedProps = props as unknown as ShortVideoProps;
          const totalSec = typedProps.blueprint.scenes.reduce(
            (sum, s) => sum + s.durationSeconds,
            0
          );
          return {
            durationInFrames: Math.max(30, Math.round(totalSec * fps)),
          };
        }}
      />
    </>
  );
};
