import { ImageResponse } from "next/og";
import { getRoomInviteDetails } from "@/lib/room-invite";

export function renderRoomInviteImage(roomCode: string): ImageResponse {
  const invite = getRoomInviteDetails(roomCode);

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        background: "#141426",
        color: "#F7F2E8",
        padding: "64px 72px",
        fontFamily: "Arial, sans-serif",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          width: 460,
          height: 460,
          right: -150,
          top: -170,
          borderRadius: 80,
          transform: "rotate(16deg)",
          background: "#FF5647",
          opacity: 0.12,
          display: "flex",
        }}
      />
      <div
        style={{
          position: "absolute",
          width: 300,
          height: 300,
          left: -140,
          bottom: -190,
          borderRadius: 60,
          transform: "rotate(-18deg)",
          background: "#2DD4B8",
          opacity: 0.14,
          display: "flex",
        }}
      />

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          zIndex: 1,
        }}
      >
        <div style={{ display: "flex", fontSize: 30, fontWeight: 800, letterSpacing: "-0.02em" }}>
          SlopBox Party Pack
        </div>
        <div
          style={{
            display: "flex",
            padding: "12px 20px",
            borderRadius: 999,
            background: "#2DD4B8",
            color: "#10101C",
            fontSize: 20,
            fontWeight: 800,
            letterSpacing: "0.08em",
          }}
        >
          {"YOU'RE INVITED"}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", zIndex: 1 }}>
        <div
          style={{
            display: "flex",
            color: "#A8A8BC",
            fontSize: 26,
            fontWeight: 700,
            letterSpacing: "0.18em",
          }}
        >
          JOIN ROOM
        </div>
        <div
          style={{
            display: "flex",
            color: "#FFD644",
            fontSize: 126,
            fontWeight: 900,
            lineHeight: 1,
            letterSpacing: "0.12em",
            marginTop: 16,
          }}
        >
          {invite.roomCode}
        </div>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          zIndex: 1,
        }}
      >
        <div style={{ display: "flex", color: "#C6C6D3", fontSize: 26 }}>
          Tap to join · Party games where AI plays too
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          {[
            ["#FF5647", 54],
            ["#2DD4B8", 42],
            ["#FFD644", 30],
          ].map(([color, width]) => (
            <div
              key={String(color)}
              style={{
                display: "flex",
                width: Number(width),
                height: 8,
                borderRadius: 99,
                background: String(color),
              }}
            />
          ))}
        </div>
      </div>
    </div>,
    { width: 1200, height: 630 },
  );
}
