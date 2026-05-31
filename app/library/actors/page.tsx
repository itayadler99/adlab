// Actor library browse page — arcads-style picker UI.
// Filter by vibe + region. Click an actor to copy its slug for use in
// /api/nicola/prompt or /api/variants/actors.
//
// dir="ltr" overrides the global RTL — actor metadata + slugs are English-only.
// Colors use the app's dark theme tokens (var(--background)/--foreground).

"use client";

import { useEffect, useState } from "react";
import type { Actor, Vibe, Region } from "@/lib/actor-library";

const VIBES: (Vibe | "all")[] = ["all", "founder", "hype", "warm", "street", "luxury", "geek", "athlete"];
const REGIONS: (Region | "all")[] = ["all", "TLV", "JLM", "Negev", "North", "diaspora"];

const CARD_BG = "rgba(255,255,255,0.04)";
const CARD_BG_HOVER = "rgba(139,92,246,0.12)";
const CARD_BORDER = "rgba(255,255,255,0.1)";
const TEXT_MUTED = "rgba(255,255,255,0.55)";
const TEXT_DIM = "rgba(255,255,255,0.4)";
const TAG_BG = "rgba(255,255,255,0.08)";
const SELECT_BG = "rgba(255,255,255,0.06)";

export default function ActorsPage() {
  const [actors, setActors] = useState<Actor[]>([]);
  const [vibe, setVibe] = useState<Vibe | "all">("all");
  const [region, setRegion] = useState<Region | "all">("all");
  const [copied, setCopied] = useState<string>("");
  const [hovered, setHovered] = useState<string>("");

  useEffect(() => {
    const qs = new URLSearchParams();
    if (vibe !== "all") qs.set("vibe", vibe);
    if (region !== "all") qs.set("region", region);
    fetch(`/api/actors?${qs.toString()}`)
      .then((r) => r.json())
      .then((d) => setActors(d.actors ?? []))
      .catch(() => setActors([]));
  }, [vibe, region]);

  return (
    <main
      dir="ltr"
      style={{
        padding: 32,
        maxWidth: 1200,
        margin: "0 auto",
        color: "var(--foreground)",
        minHeight: "100vh",
      }}
    >
      <h1 style={{ margin: 0, fontSize: 28 }}>Actor Library</h1>
      <p style={{ color: TEXT_MUTED, marginTop: 6, marginBottom: 20 }}>
        Israeli-first AI personas. Click a card to copy its slug → paste into the prompt builder.
      </p>

      <div style={{ display: "flex", gap: 14, marginBottom: 24, flexWrap: "wrap", alignItems: "center" }}>
        <label style={{ color: TEXT_MUTED, fontSize: 13 }}>
          Vibe{" "}
          <select
            value={vibe}
            onChange={(e) => setVibe(e.target.value as Vibe | "all")}
            style={{
              background: SELECT_BG,
              color: "var(--foreground)",
              border: `1px solid ${CARD_BORDER}`,
              borderRadius: 6,
              padding: "6px 10px",
              fontSize: 13,
            }}
          >
            {VIBES.map((v) => (
              <option key={v} value={v} style={{ background: "#0a0a0a" }}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label style={{ color: TEXT_MUTED, fontSize: 13 }}>
          Region{" "}
          <select
            value={region}
            onChange={(e) => setRegion(e.target.value as Region | "all")}
            style={{
              background: SELECT_BG,
              color: "var(--foreground)",
              border: `1px solid ${CARD_BORDER}`,
              borderRadius: 6,
              padding: "6px 10px",
              fontSize: 13,
            }}
          >
            {REGIONS.map((r) => (
              <option key={r} value={r} style={{ background: "#0a0a0a" }}>
                {r}
              </option>
            ))}
          </select>
        </label>
        <span style={{ color: TEXT_DIM, fontSize: 12, marginLeft: "auto" }}>
          {actors.length} actor{actors.length === 1 ? "" : "s"}
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 14 }}>
        {actors.map((a) => {
          const isCopied = copied === a.slug;
          const isHover = hovered === a.slug;
          return (
            <div
              key={a.slug}
              onMouseEnter={() => setHovered(a.slug)}
              onMouseLeave={() => setHovered("")}
              onClick={() => {
                navigator.clipboard.writeText(a.slug);
                setCopied(a.slug);
                setTimeout(() => setCopied(""), 1400);
              }}
              style={{
                border: `1px solid ${isCopied ? "rgba(74,222,128,0.6)" : CARD_BORDER}`,
                borderRadius: 12,
                padding: 16,
                cursor: "pointer",
                background: isCopied ? "rgba(74,222,128,0.12)" : isHover ? CARD_BG_HOVER : CARD_BG,
                transition: "background 120ms, border-color 120ms",
              }}
            >
              <div style={{ fontWeight: 600, fontSize: 15 }}>{a.displayName}</div>
              <div style={{ fontSize: 12, color: TEXT_MUTED, margin: "4px 0 8px" }}>
                {a.vibe} · {a.region} · {a.gender} · {a.ageRange[0]}-{a.ageRange[1]}
              </div>
              <div style={{ fontSize: 13, color: "var(--foreground)", opacity: 0.85, lineHeight: 1.45 }}>
                {a.subject}
              </div>
              <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 4 }}>
                {a.tags.map((t) => (
                  <span
                    key={t}
                    style={{
                      background: TAG_BG,
                      padding: "2px 7px",
                      borderRadius: 4,
                      fontSize: 11,
                      color: TEXT_MUTED,
                    }}
                  >
                    {t}
                  </span>
                ))}
              </div>
              <code
                style={{
                  fontSize: 11,
                  color: isCopied ? "rgba(74,222,128,0.95)" : TEXT_DIM,
                  marginTop: 10,
                  display: "block",
                  fontFamily: "ui-monospace, SFMono-Regular, monospace",
                }}
              >
                {isCopied ? "copied ✓" : a.slug}
              </code>
            </div>
          );
        })}
      </div>
    </main>
  );
}
