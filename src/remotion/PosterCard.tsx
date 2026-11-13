import React from "react";
import { AbsoluteFill, Img } from "remotion";
import { getThemePreset } from "../presets/themes";
import { ContentBlueprint } from "../types/blueprint";

export interface PosterCardProps {
  blueprint: ContentBlueprint;
  bgDataUri?: string;
  logoDataUri?: string;
}

export const PosterCard: React.FC<PosterCardProps> = ({
  blueprint,
  bgDataUri,
  logoDataUri,
}) => {
  const theme = getThemePreset(blueprint.preset);
  const contentScenes = blueprint.scenes.filter((s) => s.role === "content");

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
          padding: "68px 72px",
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
              fontSize: 56,
              lineHeight: 1.15,
              color: theme.textPrimary,
            }}
          >
            {blueprint.hookTitle}
          </h1>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {contentScenes.slice(0, 4).map((scene, idx) => (
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
                  fontSize: 32,
                  color: theme.accent,
                  fontWeight: 700,
                  lineHeight: 1.1,
                }}
              >
                0{idx + 1}
              </span>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div
                  style={{
                    fontSize: 28,
                    fontWeight: 700,
                    color: theme.textPrimary,
                  }}
                >
                  {scene.slideTitle}
                </div>
                <div
                  style={{
                    fontSize: 22,
                    lineHeight: 1.4,
                    color: theme.textSecondary,
                  }}
                >
                  {scene.slideBody}
                </div>
              </div>
            </div>
          ))}
        </div>

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
