// Brand kit: per-store logo/colors/font/voice that get woven into every ad.
//
// Order of resolution:
//   1. Supabase row in brand_kits (if Supabase is configured + reachable).
//   2. Hard-coded defaults keyed by store_id (fallback when Supabase blocked).
//   3. Generic neutral kit (last resort).
//
// Every consumer (autopilot, postprocess logo overlay, TTS voice id) calls
// `getBrandKit(storeId)` and treats the result as the source of truth.
import { db } from "./db";

export interface BrandKit {
  storeId: string;
  logoUrl?: string;
  primaryHex?: string;
  secondaryHex?: string;
  fontFamily?: string;
  fontUrl?: string;
  voiceId?: string;
}

const DEFAULTS: Record<string, BrandKit> = {
  montier_us: {
    storeId: "montier_us",
    logoUrl: "https://cdn.shopify.com/s/files/1/0668/2870/0386/files/MONTIER_LOGO_WHITE.png",
    primaryHex: "#0a0a0a",
    secondaryHex: "#d4af37",
    fontFamily: "Heebo",
    voiceId: "21m00Tcm4TlvDq8ikWAM",
  },
  sneakers: {
    storeId: "sneakers",
    primaryHex: "#000000",
    secondaryHex: "#ff3b30",
    fontFamily: "Inter",
    voiceId: "21m00Tcm4TlvDq8ikWAM",
  },
  studio: {
    storeId: "studio",
    primaryHex: "#1a1a1a",
    secondaryHex: "#e5e5e5",
    fontFamily: "Inter",
  },
  treyzer: {
    storeId: "treyzer",
    primaryHex: "#111111",
    secondaryHex: "#f4d03f",
    fontFamily: "Heebo",
  },
};

const GENERIC: BrandKit = {
  storeId: "generic",
  primaryHex: "#0a0a0a",
  secondaryHex: "#ffffff",
  fontFamily: "Inter",
};

export function getBrandKitFallback(storeId: string): BrandKit {
  return DEFAULTS[storeId] ?? { ...GENERIC, storeId };
}

export async function getBrandKit(storeId: string): Promise<BrandKit> {
  if (!db) return getBrandKitFallback(storeId);
  try {
    const { data, error } = await db
      .from("brand_kits")
      .select("*")
      .eq("store_id", storeId)
      .eq("is_active", true)
      .maybeSingle();
    if (error || !data) return getBrandKitFallback(storeId);
    return {
      storeId,
      logoUrl: data.logo_url ?? DEFAULTS[storeId]?.logoUrl,
      primaryHex: data.primary_hex ?? DEFAULTS[storeId]?.primaryHex,
      secondaryHex: data.secondary_hex ?? DEFAULTS[storeId]?.secondaryHex,
      fontFamily: data.font_family ?? DEFAULTS[storeId]?.fontFamily,
      fontUrl: data.font_url,
      voiceId: data.voice_id ?? DEFAULTS[storeId]?.voiceId,
    };
  } catch {
    return getBrandKitFallback(storeId);
  }
}

export async function upsertBrandKit(kit: BrandKit): Promise<BrandKit> {
  if (!db) throw new Error("Supabase not configured — brand kit cannot persist");
  const { data, error } = await db
    .from("brand_kits")
    .upsert(
      {
        store_id: kit.storeId,
        logo_url: kit.logoUrl,
        primary_hex: kit.primaryHex,
        secondary_hex: kit.secondaryHex,
        font_family: kit.fontFamily,
        font_url: kit.fontUrl,
        voice_id: kit.voiceId,
        is_active: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "store_id" }
    )
    .select()
    .single();
  if (error) throw error;
  return {
    storeId: data.store_id,
    logoUrl: data.logo_url,
    primaryHex: data.primary_hex,
    secondaryHex: data.secondary_hex,
    fontFamily: data.font_family,
    fontUrl: data.font_url,
    voiceId: data.voice_id,
  };
}

/**
 * Convert a hex color (#rrggbb) into a ffmpeg `curves` arg that tints the
 * mid-tones slightly toward that color. Used by postprocess to bias the
 * final ad toward brand primary without nuking skin tones.
 */
export function hexToCurvesTint(hex?: string): string | null {
  if (!hex) return null;
  const m = hex.replace("#", "").match(/^([0-9a-f]{6})$/i);
  if (!m) return null;
  const r = parseInt(m[1].slice(0, 2), 16) / 255;
  const g = parseInt(m[1].slice(2, 4), 16) / 255;
  const b = parseInt(m[1].slice(4, 6), 16) / 255;
  // Bias midtones gently — full strength would crush realism.
  const rm = (0.5 + (r - 0.5) * 0.18).toFixed(2);
  const gm = (0.5 + (g - 0.5) * 0.18).toFixed(2);
  const bm = (0.5 + (b - 0.5) * 0.18).toFixed(2);
  return `curves=r='0/0 0.5/${rm} 1/1':g='0/0 0.5/${gm} 1/1':b='0/0 0.5/${bm} 1/1'`;
}
