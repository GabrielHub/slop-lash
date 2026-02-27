import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "SlopBox Party Pack — Party games where AI plays too";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OGImage() {
  return new ImageResponse(
    (
      <div
        style={{
          background: "#1A1A2E",
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        {/* Title */}
        <div
          style={{
            fontSize: 96,
            fontWeight: 800,
            color: "#FF5647",
            letterSpacing: "-0.02em",
            lineHeight: 1,
          }}
        >
          SlopBox Party Pack
        </div>

        {/* Tagline */}
        <div
          style={{
            fontSize: 32,
            color: "#9CA3AF",
            marginTop: 24,
          }}
        >
          Party games where AI plays too
        </div>

        {/* Color accent bar */}
        <div
          style={{
            display: "flex",
            gap: 12,
            marginTop: 48,
          }}
        >
          <div
            style={{
              width: 48,
              height: 6,
              borderRadius: 3,
              background: "#FF5647",
            }}
          />
          <div
            style={{
              width: 48,
              height: 6,
              borderRadius: 3,
              background: "#2DD4B8",
            }}
          />
          <div
            style={{
              width: 48,
              height: 6,
              borderRadius: 3,
              background: "#FFD644",
            }}
          />
        </div>
      </div>
    ),
    { ...size }
  );
}
