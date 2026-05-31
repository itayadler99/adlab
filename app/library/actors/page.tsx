// Actor library browse page — arcads-style picker UI.
// Filter by vibe + region. Click an actor to copy its slug for use in
// /api/nicola/prompt or /api/variants/actors.

"use client";

import { useEffect, useState } from "react";
import type { Actor, Vibe, Region } from "@/lib/actor-library";

const VIBES: (Vibe | "all")[] = ["all", "founder", "hype", "warm", "street", "luxury", "geek", "athlete"];
const REGIONS: (Region | "all")[] = ["all", "TLV", "JLM", "Negev", "North", "diaspora"];

export default function ActorsPage() {
  const [actors, setActors] = useState<Actor[]>([]);
  const [vibe, setVibe] = useState<Vibe | "all">("all");
  const [region, setRegion] = useState<Region | "all">("all");
  const [copied, setCopied] = useState<string>("");

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
    <main style={{ padding: 24, maxWidth: 1100, margin: "0 auto", fontFamily: "system-ui" }}>
      <h1 style={{ marginBottom: 4 }}>Actor Library</h1>
      <p style={{ color: "#666", marginTop: 0 }}>
        Israeli-first AI personas. Pick a slug → paste into the prompt builder.
      </p>

      <div style={{ display: "flex", gap: 16, marginBottom: 20, flexWrap: "wrap" }}>
        <label>
          Vibe&nbsp;
          <select value={vibe} onChange={(e) => setVibe(e.target.value as Vibe | "all")}>
            {VIBES.map((v) => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
        </label>
        <label>
          Region&nbsp;
          <select value={region} onChange={(e) => setRegion(e.target.value as Region | "all")}>
            {REGIONS.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </label>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))", gap: 14 }}>
        {actors.map((a) => (
          <div
            key={a.slug}
            onClick={() => {
              navigator.clipboard.writeText(a.slug);
              setCopied(a.slug);
              setTimeout(() => setCopied(""), 1200);
            }}
            style={{
              border: "1px solid #e2e2e2",
              borderRadius: 10,
              padding: 14,
              cursor: "pointer",
              background: copied === a.slug ? "#eaffea" : "#fff",
            }}
          >
            <div style={{ fontWeight: 600 }}>{a.displayName}</div>
            <div style={{ fontSize: 12, color: "#666", margin: "4px 0" }}>
              {a.vibe} · {a.region} · {a.gender} · {a.ageRange[0]}-{a.ageRange[1]}
            </div>
            <div style={{ fontSize: 13, color: "#222" }}>{a.subject}</div>
            <div style={{ marginTop: 8, fontSize: 11, color: "#888" }}>
              {a.tags.map((t) => (
                <span key={t} style={{ background: "#f2f2f2", padding: "2px 6px", marginRight: 4, borderRadius: 4 }}>{t}</span>
              ))}
            </div>
            <code style={{ fontSize: 11, color: "#999", marginTop: 6, display: "block" }}>
              {copied === a.slug ? "copied ✓" : a.slug}
            </code>
          </div>
        ))}
      </div>
    </main>
  );
}
