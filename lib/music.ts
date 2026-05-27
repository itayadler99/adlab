// Music bed library. Per-vertical tracks live under `public/music/<vertical>/`
// — drop royalty-free .mp3 files there and they're auto-discovered.
//
// Resolution order:
//   1. `public/music/<vertical>/*.mp3` — random pick
//   2. `public/music/universal/*.mp3` — vertical fallback
//   3. null — caller skips the music mix and ships VO-only audio
//
// Tracks are NOT bundled in git (royalty-free licensing matters; we keep an
// empty .gitkeep so the directory exists). See BLOCKERS.md for the drop list.

import { readdir, stat } from "node:fs/promises";
import path from "node:path";

export type Vertical = "jewelry" | "sneakers" | "saas" | "studio" | "universal";

const VERTICAL_MAP: Record<string, Vertical> = {
  montier_us: "jewelry",
  sneakers: "sneakers",
  studio: "studio",
  treyzer: "saas",
};

export function pickVertical(storeId?: string): Vertical {
  if (!storeId) return "universal";
  return VERTICAL_MAP[storeId] ?? "universal";
}

async function listMp3s(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir);
    const mp3s = entries.filter((f) => /\.mp3$/i.test(f));
    // Confirm each is a real file (handle .gitkeep, dotfiles).
    const checked: string[] = [];
    for (const f of mp3s) {
      const p = path.join(dir, f);
      try {
        const st = await stat(p);
        if (st.isFile() && st.size > 1024) checked.push(p);
      } catch {
        /* skip */
      }
    }
    return checked;
  } catch {
    return [];
  }
}

/**
 * Resolve a music track for a vertical. Returns absolute filesystem path or
 * null if nothing usable is available.
 */
export async function pickMusicTrack(vertical: Vertical): Promise<string | null> {
  const publicDir = path.resolve(process.cwd(), "public", "music");
  const tries: Vertical[] = vertical === "universal" ? ["universal"] : [vertical, "universal"];
  for (const v of tries) {
    const tracks = await listMp3s(path.join(publicDir, v));
    if (tracks.length > 0) {
      const idx = Math.floor(Math.random() * tracks.length);
      return tracks[idx];
    }
  }
  return null;
}
