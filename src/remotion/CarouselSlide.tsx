import React from "react";
import { AbsoluteFill, Img } from "remotion";
import { getThemePreset } from "../presets/themes";
import {
  AspectRatio,
  PresetId,
  Scene,
  SlideLayout,
} from "../types/blueprint";
import type { BrandkitOverride } from "../types/brandkit";

export interface CarouselSlideProps {
  preset: PresetId;
  brandTag: string;
  hookTitle: string;
  totalSlides: number;
  scene: Scene;
  aspectRatio?: AspectRatio;
  brandkit?: BrandkitOverride;
  bgDataUri?: string;
  logoDataUri?: string;
  coverBadge?: string;
  ctaBadge?: string;
  ctaFooterText?: string;
  swipeFooterText?: string;
}

export const CarouselSlide: React.FC<CarouselSlideProps> = ({
  preset,
  brandTag,
  totalSlides,
  scene,
  aspectRatio = "4:5",
  brandkit,
  bgDataUri,
  logoDataUri,
  coverBadge = "INSIGHT BRIEF",
  ctaBadge = "KEY TAKEAWAY",
  ctaFooterText = "Simpan & bagikan jika bermanfaat",
  swipeFooterText = "Geser untuk lanjut →",
}) => {
  const theme = getThemePreset(preset, brandkit);
  const isCover = scene.role === "cover";
  const isCta = scene.role === "cta";
  const isSquare = aspectRatio === "1:1";
  const isVertical = aspectRatio === "9:16";
  const isLandscape = aspectRatio === "16:9";

  const layout: SlideLayout =
    scene.layout ||
    (isCover
      ? "editorial"
      : isCta
        ? "split_card"
        : scene.index % 3 === 0
          ? "quote_focus"
          : scene.index % 3 === 1
            ? "big_number"
            : "split_card");

  const titleSize = isCover
    ? isSquare || isLandscape
      ? 64
      : 76
    : isSquare || isLandscape
      ? 52
      : 60;

  const containerPadding = isVertical
    ? "120px 80px 140px"
    : isLandscape
      ? "56px 110px"
      : isSquare
        ? "56px 72px"
        : "76px 80px";

  return (
    <AbsoluteFill
      style={{
        backgroundColor: theme.bgPrimary,
        color: theme.textPrimary,
        fontFamily: theme.fontBody,
        overflow: "hidden",
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

      {/* Subtle top & bottom framing */}
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
        {/* Header Bar */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            borderBottom: `1px solid ${theme.border}`,
            paddingBottom: 24,
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
                fontSize: 24,
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
              letterSpacing: 2,
              padding: "8px 18px",
              borderRadius: 999,
              border: `1px solid ${theme.border}`,
              backgroundColor: theme.surface,
            }}
          >
            {String(scene.index).padStart(2, "0")} /{" "}
            {String(totalSlides).padStart(2, "0")}
          </span>
        </div>

        {/* Main Content */}
        {layout === "big_number" ? (
          <div
            style={{
              position: "relative",
              display: "flex",
              flexDirection: "column",
              gap: 28,
            }}
          >
            <div
              style={{
                fontFamily: theme.fontDisplay,
                fontSize: isSquare || isLandscape ? 140 : 180,
                fontWeight: 800,
                lineHeight: 0.9,
                color: theme.accent,
                opacity: 0.28,
                letterSpacing: -4,
                marginBottom: -20,
              }}
            >
              {String(scene.index).padStart(2, "0")}
            </div>
            <h1
              style={{
                margin: 0,
                fontFamily: theme.fontDisplay,
                fontSize: titleSize,
                lineHeight: 1.14,
                fontWeight: 700,
                color: theme.textPrimary,
                letterSpacing: -0.5,
              }}
            >
              {scene.slideTitle}
            </h1>
            <div
              style={{
                width: 96,
                height: 3,
                backgroundColor: theme.accent,
                borderRadius: 2,
              }}
            />
            <p
              style={{
                margin: 0,
                fontSize: 35,
                lineHeight: 1.52,
                color: theme.textSecondary,
                maxWidth: "94%",
              }}
            >
              {scene.slideBody}
            </p>
          </div>
        ) : layout === "quote_focus" ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              textAlign: "center",
              gap: 28,
              padding: "24px 16px",
            }}
          >
            <div
              style={{
                fontFamily: theme.fontDisplay,
                fontSize: 88,
                lineHeight: 0.6,
                color: theme.accent,
                opacity: 0.85,
              }}
            >
              “
            </div>
            <h1
              style={{
                margin: 0,
                fontFamily: theme.fontDisplay,
                fontSize: titleSize,
                lineHeight: 1.16,
                fontWeight: 700,
                color: theme.textPrimary,
                letterSpacing: -0.4,
                maxWidth: "94%",
              }}
            >
              {scene.slideTitle}
            </h1>
            <div
              style={{
                width: 72,
                height: 3,
                backgroundColor: theme.accent,
                borderRadius: 2,
              }}
            />
            <p
              style={{
                margin: 0,
                fontSize: 34,
                lineHeight: 1.55,
                color: theme.textSecondary,
                maxWidth: "88%",
              }}
            >
              {scene.slideBody}
            </p>
          </div>
        ) : layout === "split_card" ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 28,
              padding: isSquare || isLandscape ? "36px 40px" : "44px 44px",
              borderRadius: 24,
              backgroundColor: theme.surface,
              border: `1px solid ${theme.border}`,
              boxShadow: "0 24px 60px rgba(0,0,0,0.42)",
              borderLeft: `6px solid ${theme.accent}`,
            }}
          >
            {isCover && (
              <div
                style={{
                  alignSelf: "flex-start",
                  fontSize: 18,
                  letterSpacing: 3.5,
                  textTransform: "uppercase",
                  color: theme.accent,
                  backgroundColor: theme.accentSoft,
                  border: `1px solid ${theme.border}`,
                  padding: "8px 18px",
                  borderRadius: 999,
                  fontWeight: 600,
                }}
              >
                {coverBadge}
              </div>
            )}
            {isCta && (
              <div
                style={{
                  alignSelf: "flex-start",
                  fontSize: 18,
                  letterSpacing: 3.5,
                  textTransform: "uppercase",
                  color: theme.accent,
                  backgroundColor: theme.accentSoft,
                  border: `1px solid ${theme.border}`,
                  padding: "8px 18px",
                  borderRadius: 999,
                  fontWeight: 600,
                }}
              >
                {ctaBadge}
              </div>
            )}
            <h1
              style={{
                margin: 0,
                fontFamily: theme.fontDisplay,
                fontSize: titleSize - 4,
                lineHeight: 1.15,
                fontWeight: 700,
                color: theme.textPrimary,
                letterSpacing: -0.4,
              }}
            >
              {scene.slideTitle}
            </h1>
            <p
              style={{
                margin: 0,
                fontSize: 33,
                lineHeight: 1.52,
                color: theme.textSecondary,
              }}
            >
              {scene.slideBody}
            </p>
          </div>
        ) : (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 32,
              marginTop: isCover ? 40 : 0,
            }}
          >
            {isCover && (
              <div
                style={{
                  alignSelf: "flex-start",
                  fontSize: 20,
                  letterSpacing: 3.5,
                  textTransform: "uppercase",
                  color: theme.accent,
                  backgroundColor: theme.accentSoft,
                  border: `1px solid ${theme.border}`,
                  padding: "10px 22px",
                  borderRadius: 999,
                  fontWeight: 600,
                }}
              >
                {coverBadge}
              </div>
            )}

            {isCta && (
              <div
                style={{
                  alignSelf: "flex-start",
                  fontSize: 20,
                  letterSpacing: 3.5,
                  textTransform: "uppercase",
                  color: theme.accent,
                  backgroundColor: theme.accentSoft,
                  border: `1px solid ${theme.border}`,
                  padding: "10px 22px",
                  borderRadius: 999,
                  fontWeight: 600,
                }}
              >
                {ctaBadge}
              </div>
            )}

            <h1
              style={{
                margin: 0,
                fontFamily: theme.fontDisplay,
                fontSize: titleSize,
                lineHeight: 1.14,
                fontWeight: 700,
                color: theme.textPrimary,
                letterSpacing: -0.5,
              }}
            >
              {scene.slideTitle}
            </h1>

            <div
              style={{
                width: 96,
                height: 3,
                backgroundColor: theme.accent,
                borderRadius: 2,
              }}
            />

            <p
              style={{
                margin: 0,
                fontSize: isCover ? 34 : 36,
                lineHeight: 1.52,
                color: theme.textSecondary,
                maxWidth: "92%",
              }}
            >
              {scene.slideBody}
            </p>
          </div>
        )}

        {/* Footer */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            paddingTop: 24,
            borderTop: `1px solid ${theme.border}`,
          }}
        >
          <span style={{ fontSize: 22, color: theme.textSecondary }}>
            {isCta ? ctaFooterText : swipeFooterText}
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            {Array.from({ length: totalSlides }).map((_, idx) => (
              <div
                key={idx}
                style={{
                  width: idx + 1 === scene.index ? 28 : 10,
                  height: 10,
                  borderRadius: 999,
                  backgroundColor:
                    idx + 1 === scene.index ? theme.accent : theme.border,
                }}
              />
            ))}
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
