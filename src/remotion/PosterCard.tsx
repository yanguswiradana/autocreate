import React from "react";
import { AbsoluteFill, Img } from "remotion";
import { getThemePreset } from "../presets/themes";
import { ContentBlueprint } from "../types/blueprint";
import type { BrandkitOverride } from "../types/brandkit";

export interface PosterCardProps {
  blueprint: ContentBlueprint;
  brandkit?: BrandkitOverride;
  bgDataUri?: string;
  logoDataUri?: string;
}

export const PosterCard: React.FC<PosterCardProps> = ({
  blueprint,
  brandkit,
  bgDataUri,
  logoDataUri,
}) => {
  const theme = getThemePreset(blueprint.preset, brandkit);
  const contentScenes = blueprint.scenes.filter((s) => s.role === "content");
  const isSquare = blueprint.aspectRatio === "1:1";
  const isVertical = blueprint.aspectRatio === "9:16";
  const isLandscape = blueprint.aspectRatio === "16:9";
  const series = blueprint.series || "edukasi";
  const maxItems = isSquare ? 3 : 4;
  const items = contentScenes.slice(0, maxItems);
  const hookScale = blueprint.hookTitle.length > 56 ? 0.8 : blueprint.hookTitle.length > 38 ? 0.9 : 1;
  const hookFontSize = Math.round((isLandscape ? 48 : 56) * hookScale);

  const isNewsPoster = series === "fakta_cepat" || series === "kronologi";
  const isComparePoster = series === "komparasi";
  const isSpotlightPoster = series === "promo_brand" || series === "opini_quote" || series === "storytelling";
  const isChecklistPoster = series === "checklist";

  const containerPadding = isVertical
    ? "110px 72px 130px"
    : isLandscape
      ? "52px 96px"
      : isSquare
        ? "48px 64px"
        : "68px 72px";

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
            opacity: 0.65,
            filter:
              blueprint.preset === "monochrome_luxury"
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
          padding: containerPadding,
          boxSizing: "border-box",
        }}
      >
        <div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              marginBottom: 18,
            }}
          >
            {logoDataUri ? (
              <Img
                src={logoDataUri}
                style={{
                  height: 30,
                  width: 30,
                  objectFit: "contain",
                  borderRadius: 6,
                }}
              />
            ) : null}
            <div
              style={{
                fontSize: 20,
                letterSpacing: 3,
                textTransform: "uppercase",
                color: theme.accent,
                fontWeight: 600,
              }}
            >
              {blueprint.brandTag} • SUMMARY POSTER
            </div>
          </div>
          <h1
            style={{
              margin: 0,
              fontFamily: theme.fontDisplay,
              fontSize: hookFontSize,
              lineHeight: 1.14,
              color: theme.textPrimary,
              overflowWrap: "anywhere",
            }}
          >
            {blueprint.hookTitle}
          </h1>
        </div>

        {isNewsPoster ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {bgDataUri && !isLandscape && (
              <div style={{ width: "100%", height: isSquare ? 210 : 280, borderRadius: 18, overflow: "hidden", border: `2px solid ${theme.accent}` }}>
                <Img src={bgDataUri} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              </div>
            )}
            <div style={{ display: "grid", gridTemplateColumns: isLandscape ? "1fr 1fr" : "1fr", gap: 14 }}>
              {items.slice(0, isSquare ? 2 : 3).map((scene, idx) => (
                <div
                  key={scene.index}
                  style={{
                    padding: "18px 22px",
                    borderRadius: 14,
                    backgroundColor: "rgba(10,10,14,0.82)",
                    borderLeft: `6px solid ${theme.accent}`,
                    borderTop: `1px solid ${theme.border}`,
                    borderRight: `1px solid ${theme.border}`,
                    borderBottom: `1px solid ${theme.border}`,
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                  }}
                >
                  <span style={{ fontSize: 15, letterSpacing: 2.5, textTransform: "uppercase", color: theme.accent, fontWeight: 700 }}>
                    {series === "kronologi" ? `TAHAP 0${idx + 1}` : `FAKTA #0${idx + 1}`} · {scene.slideTitle}
                  </span>
                  <div style={{ fontSize: 21, lineHeight: 1.38, color: theme.textSecondary, overflowWrap: "anywhere" }}>
                    {scene.slideBody}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : isComparePoster ? (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            {items.map((scene, idx) => (
              <div
                key={scene.index}
                style={{
                  padding: "22px 24px",
                  borderRadius: 18,
                  backgroundColor: idx % 2 === 0 ? "rgba(255,255,255,0.04)" : theme.surface,
                  border: idx % 2 === 0 ? `1px solid ${theme.border}` : `2px solid ${theme.accent}`,
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                }}
              >
                <span style={{ fontSize: 14, letterSpacing: 2.5, textTransform: "uppercase", color: idx % 2 === 0 ? theme.textSecondary : theme.accent, fontWeight: 700 }}>
                  {idx % 2 === 0 ? "SISI A" : "SISI B"} · 0{idx + 1}
                </span>
                <div style={{ fontSize: 25, fontWeight: 700, color: theme.textPrimary, overflowWrap: "anywhere" }}>
                  {scene.slideTitle}
                </div>
                <div style={{ fontSize: 20, lineHeight: 1.4, color: theme.textSecondary, overflowWrap: "anywhere" }}>
                  {scene.slideBody}
                </div>
              </div>
            ))}
          </div>
        ) : isSpotlightPoster ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <div style={{ padding: "30px 34px", borderRadius: 22, backgroundColor: theme.surface, border: `2px solid ${theme.accent}`, boxShadow: `0 18px 45px ${theme.accentSoft}`, display: "flex", flexDirection: "column", gap: 10 }}>
              <span style={{ fontSize: 15, letterSpacing: 3, textTransform: "uppercase", color: theme.accent, fontWeight: 700 }}>
                {series === "promo_brand" ? "VALUE UTAMA" : "SOROTAN EDITORIAL"}
              </span>
              <div style={{ fontFamily: theme.fontDisplay, fontSize: 32, fontWeight: 700, color: theme.textPrimary, lineHeight: 1.25, overflowWrap: "anywhere" }}>
                {items[0]?.slideTitle || blueprint.subtitle}
              </div>
              <div style={{ fontSize: 23, lineHeight: 1.45, color: theme.textSecondary, overflowWrap: "anywhere" }}>
                {items[0]?.slideBody || blueprint.topic}
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: isLandscape ? "1fr 1fr" : "1fr 1fr", gap: 14 }}>
              {items.slice(1, 3).map((scene, idx) => (
                <div key={scene.index} style={{ padding: "18px 22px", borderRadius: 16, backgroundColor: "rgba(255,255,255,0.03)", border: `1px solid ${theme.border}`, display: "flex", flexDirection: "column", gap: 6 }}>
                  <span style={{ fontSize: 14, color: theme.accent, fontWeight: 700 }}>0{idx + 2} · {scene.slideTitle}</span>
                  <div style={{ fontSize: 19, lineHeight: 1.38, color: theme.textSecondary, overflowWrap: "anywhere" }}>{scene.slideBody}</div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div
            style={{
              display: isLandscape ? "grid" : "flex",
              gridTemplateColumns: isLandscape ? "1fr 1fr" : undefined,
              flexDirection: isLandscape ? undefined : "column",
              gap: isSquare || isLandscape ? 14 : 20,
            }}
          >
            {items.map((scene, idx) => (
              <div
                key={scene.index}
                style={{
                  padding: "24px 28px",
                  borderRadius: 18,
                  backgroundColor: theme.surface,
                  border: `1px solid ${theme.border}`,
                  display: "flex",
                  gap: 20,
                  alignItems: "flex-start",
                }}
              >
                <span
                  style={{
                    fontFamily: theme.fontDisplay,
                    fontSize: isChecklistPoster ? 26 : 32,
                    color: isChecklistPoster ? theme.bgPrimary : theme.accent,
                    backgroundColor: isChecklistPoster ? theme.accent : "transparent",
                    width: isChecklistPoster ? 38 : undefined,
                    height: isChecklistPoster ? 38 : undefined,
                    borderRadius: isChecklistPoster ? 999 : undefined,
                    display: isChecklistPoster ? "flex" : undefined,
                    alignItems: isChecklistPoster ? "center" : undefined,
                    justifyContent: isChecklistPoster ? "center" : undefined,
                    fontWeight: 700,
                    lineHeight: 1.1,
                    flexShrink: 0,
                  }}
                >
                  {isChecklistPoster ? "✓" : `0${idx + 1}`}
                </span>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <div
                    style={{
                      fontSize: 28,
                      fontWeight: 700,
                      color: theme.textPrimary,
                      overflowWrap: "anywhere",
                    }}
                  >
                    {scene.slideTitle}
                  </div>
                  <div
                    style={{
                      fontSize: 22,
                      lineHeight: 1.4,
                      color: theme.textSecondary,
                      overflowWrap: "anywhere",
                    }}
                  >
                    {scene.slideBody}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div
          style={{
            borderTop: `1px solid ${theme.border}`,
            paddingTop: 20,
            display: "flex",
            justifyContent: "space-between",
            fontSize: 20,
            color: theme.textSecondary,
          }}
        >
          <span>{blueprint.subtitle}</span>
          <span style={{ color: theme.accent }}>Save for later</span>
        </div>
      </div>
    </AbsoluteFill>
  );
};
