"use client";

import { useState } from "react";
import { clsx } from "clsx";

export interface Soul {
  id: string;
  name: string;
  thumbnailUrl: string;
  gender?: string;
  style?: string;
}

// Placeholder souls until Higgsfield REST API opens up.
// Replace this list (and the fetch logic below) with real API data.
const PLACEHOLDER_SOULS: Soul[] = [
  {
    id: "soul_placeholder_1",
    name: "Alex",
    thumbnailUrl: "/souls/placeholder_alex.png",
    gender: "neutral",
    style: "casual",
  },
  {
    id: "soul_placeholder_2",
    name: "Jordan",
    thumbnailUrl: "/souls/placeholder_jordan.png",
    gender: "neutral",
    style: "professional",
  },
  {
    id: "soul_placeholder_3",
    name: "Morgan",
    thumbnailUrl: "/souls/placeholder_morgan.png",
    gender: "neutral",
    style: "energetic",
  },
  {
    id: "soul_placeholder_4",
    name: "Riley",
    thumbnailUrl: "/souls/placeholder_riley.png",
    gender: "neutral",
    style: "friendly",
  },
];

function SoulCard({
  soul,
  selected,
  onClick,
}: {
  soul: Soul;
  selected: boolean;
  onClick: () => void;
}) {
  const [imgError, setImgError] = useState(false);

  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "relative flex flex-col items-center gap-2 rounded-xl border-2 p-3 transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-violet-500",
        selected
          ? "border-violet-500 bg-violet-950/60 shadow-lg shadow-violet-900/40"
          : "border-white/10 bg-white/5 hover:border-white/30 hover:bg-white/10"
      )}
      aria-pressed={selected}
      title={soul.name}
    >
      {selected && (
        <span className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-violet-500 text-xs text-white">
          ✓
        </span>
      )}

      <div className="h-20 w-20 overflow-hidden rounded-lg bg-white/10">
        {!imgError ? (
          <img
            src={soul.thumbnailUrl}
            alt={soul.name}
            className="h-full w-full object-cover"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-3xl">
            🧑
          </div>
        )}
      </div>

      <span className="text-sm font-medium text-white">{soul.name}</span>
      {soul.style && (
        <span className="text-xs text-white/50 capitalize">{soul.style}</span>
      )}
    </button>
  );
}

interface SoulIdPickerProps {
  value: string | null;
  onChange: (soulId: string | null) => void;
  className?: string;
  /** Pass custom souls from an API response; falls back to placeholders */
  souls?: Soul[];
  loading?: boolean;
  error?: string | null;
  apiReady?: boolean;
}

export default function SoulIdPicker({
  value,
  onChange,
  className,
  souls,
  loading = false,
  error = null,
  apiReady = false,
}: SoulIdPickerProps) {
  const displaySouls = souls && souls.length > 0 ? souls : PLACEHOLDER_SOULS;

  return (
    <div className={clsx("space-y-3", className)}>
      <div className="flex items-center justify-between">
        <label className="text-sm font-semibold text-white/80">
          דמות
        </label>
        {!apiReady && (
          <span className="rounded-full bg-yellow-500/20 px-2 py-0.5 text-xs text-yellow-300">
            תצוגה מקדימה. החיבור בקרוב.
          </span>
        )}
      </div>

      {error && (
        <p className="rounded-lg bg-red-900/30 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-white/50">
          <span className="animate-spin">⏳</span> טוען דמויות
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {displaySouls.map((soul) => (
            <SoulCard
              key={soul.id}
              soul={soul}
              selected={value === soul.id}
              onClick={() => onChange(value === soul.id ? null : soul.id)}
            />
          ))}
        </div>
      )}

      {value && (
        <p className="text-xs text-white/40">
          דמות נבחרה:{" "}
          <span className="font-mono text-violet-400 ltr-island">{value}</span>
        </p>
      )}

      {!apiReady && (
        <p className="text-xs text-white/30">
          בחירת הדמות תוחל אוטומטית ברגע שחיבור הדמויות ייפתח. הדמויות המוצגות
          הן לתצוגה בלבד.
        </p>
      )}
    </div>
  );
}
