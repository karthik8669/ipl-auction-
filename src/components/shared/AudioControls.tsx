"use client";

import { useState } from "react";
import { audioManager } from "@/lib/audioManager";

export function AudioControls() {
  const [musicOn, setMusicOn] = useState(true);
  const [sfxOn, setSfxOn] = useState(true);
  const [open, setOpen] = useState(false);

  return (
    <div
      style={{
        position: "fixed",
        bottom: 20,
        right: 20,
        zIndex: 100,
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-end",
        gap: 8,
      }}
    >
      {open && (
        <div
          style={{
            background: "rgba(7,24,44,0.95)",
            border: "1px solid #1a3a5c",
            borderRadius: 14,
            padding: "14px 18px",
            backdropFilter: "blur(12px)",
            display: "flex",
            flexDirection: "column",
            gap: 10,
            minWidth: 160,
            boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
          }}
        >
          <div
            style={{
              fontFamily: "Rajdhani, sans-serif",
              fontWeight: 700,
              fontSize: 11,
              color: "#5a8ab0",
              letterSpacing: 3,
              textTransform: "uppercase",
              marginBottom: 4,
            }}
          >
            Audio
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            <span style={{ color: "#ddeeff", fontSize: 13 }}>🎵 Music</span>
            <div
              onClick={() => {
                const next = !musicOn;
                setMusicOn(next);
                audioManager.setMusicEnabled(next);
                if (next) audioManager.startAuctionMusic();
              }}
              style={{
                width: 40,
                height: 22,
                borderRadius: 11,
                background: musicOn ? "#D4AF37" : "#1a3a5c",
                cursor: "pointer",
                position: "relative",
                transition: "background 0.2s",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  top: 3,
                  left: musicOn ? 21 : 3,
                  width: 16,
                  height: 16,
                  borderRadius: "50%",
                  background: "#fff",
                  transition: "left 0.2s",
                }}
              />
            </div>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            <span style={{ color: "#ddeeff", fontSize: 13 }}>🔊 SFX</span>
            <div
              onClick={() => {
                const next = !sfxOn;
                setSfxOn(next);
                audioManager.setSfxEnabled(next);
              }}
              style={{
                width: 40,
                height: 22,
                borderRadius: 11,
                background: sfxOn ? "#D4AF37" : "#1a3a5c",
                cursor: "pointer",
                position: "relative",
                transition: "background 0.2s",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  top: 3,
                  left: sfxOn ? 21 : 3,
                  width: 16,
                  height: 16,
                  borderRadius: "50%",
                  background: "#fff",
                  transition: "left 0.2s",
                }}
              />
            </div>
          </div>
        </div>
      )}

      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          width: 44,
          height: 44,
          borderRadius: "50%",
          background: "rgba(7,24,44,0.95)",
          border: "1px solid #1a3a5c",
          cursor: "pointer",
          fontSize: 18,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backdropFilter: "blur(12px)",
          boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
          transition: "border-color 0.2s",
          color: "#fff",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#D4AF37")}
        onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#1a3a5c")}
      >
        {musicOn || sfxOn ? "🔊" : "🔇"}
      </button>
    </div>
  );
}
