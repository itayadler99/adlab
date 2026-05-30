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
 * Per-vertical music-bed mix config. Single source of truth for the sidechain
 * duck so the postprocess mux (lib/postprocess.ts `addMusicBed`) and the
 * captions/preview API read the same numbers instead of magic constants.
 *
 * `musicDb` is the bed gain relative to source (negative = quieter under VO).
 * `sidechain` keys the ffmpeg `sidechaincompress` filter off the VO so the bed
 * ducks the moment speech starts:
 *   - threshold  level at which ducking engages (lower = ducks on quieter VO)
 *   - ratio      how hard the bed is pushed down (higher = more duck)
 *   - attack/ms  how fast the duck clamps when VO starts
 *   - release/ms how fast the bed recovers in the gaps between words
 */
export interface SidechainParams {
  threshold: number;
  ratio: number;
  attack: number; // ms
  release: number; // ms
}

export interface MusicBedConfig {
  musicDb: number;
  sidechain: SidechainParams;
}

const MUSIC_BED_CONFIG: Record<Vertical, MusicBedConfig> = {
  // Luxury ambient under a calm read — keep the bed low and duck gently so it
  // never fights the VO.
  jewelry:   { musicDb: -18, sidechain: { threshold: 0.04, ratio: 6,  attack: 15, release: 350 } },
  // Hip-hop bed — louder, punchier duck that snaps back fast for rhythm.
  sneakers:  { musicDb: -12, sidechain: { threshold: 0.06, ratio: 10, attack: 10, release: 250 } },
  // Lo-fi corporate — middle of the road.
  saas:      { musicDb: -16, sidechain: { threshold: 0.05, ratio: 8,  attack: 20, release: 300 } },
  // Cinematic ambient — slightly present bed, smooth recovery.
  studio:    { musicDb: -15, sidechain: { threshold: 0.05, ratio: 8,  attack: 20, release: 320 } },
  universal: { musicDb: -16, sidechain: { threshold: 0.05, ratio: 8,  attack: 20, release: 300 } },
};

export function musicBedConfig(vertical: Vertical): MusicBedConfig {
  return MUSIC_BED_CONFIG[vertical] ?? MUSIC_BED_CONFIG.universal;
}

/**
 * Build the ffmpeg `sidechaincompress=...` filter argument for a vertical so
 * callers don't hand-roll the param string.
 */
export function sidechainFilter(vertical: Vertical): string {
  const { sidechain: s } = musicBedConfig(vertical);
  return `sidechaincompress=threshold=${s.threshold}:ratio=${s.ratio}:attack=${s.attack}:release=${s.release}`;
}

/**
 * VO loudness target for the final mux. Meta/IG normalize to roughly -14 LUFS
 * integrated, so we target that with a -1 dBTP ceiling. Exposed here (rather
 * than hardcoded in the postprocess mux) so the audio mix is data-driven from a
 * single place. `lra` is the loudness range; lower = more consistent level.
 */
export interface LoudnessTarget {
  i: number; // integrated LUFS
  tp: number; // true-peak ceiling dBTP
  lra: number; // loudness range
}

export const VO_LOUDNESS: LoudnessTarget = { i: -14, tp: -1, lra: 11 };

/** ffmpeg `loudnorm=...` filter argument for the VO loudness target. */
export function loudnormFilter(target: LoudnessTarget = VO_LOUDNESS): string {
  return `loudnorm=I=${target.i}:TP=${target.tp}:LRA=${target.lra}`;
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

export interface ResolvedMusicBed {
  vertical: Vertical;
  /** Absolute path to the chosen track, or null when none is available. */
  trackPath: string | null;
  config: MusicBedConfig;
  /** Ready-to-use ffmpeg `sidechaincompress=...` filter argument. */
  sidechainFilter: string;
  /** Ready-to-use ffmpeg `loudnorm=...` filter for the VO. */
  loudnormFilter: string;
}

/**
 * One-call resolution for a store: vertical → track → mix config → sidechain +
 * loudnorm filters. Lets callers (postprocess mux, preview UI) get everything
 * they need without stitching the helpers together. `trackPath` is null when
 * the vertical's music directory is empty — callers then ship VO-only audio.
 */
export async function resolveMusicBed(storeId?: string): Promise<ResolvedMusicBed> {
  const vertical = pickVertical(storeId);
  const trackPath = await pickMusicTrack(vertical);
  return {
    vertical,
    trackPath,
    config: musicBedConfig(vertical),
    sidechainFilter: sidechainFilter(vertical),
    loudnormFilter: loudnormFilter(),
  };
}
