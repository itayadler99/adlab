// Client-facing brand-kit persistence wrapper.
//
// Thin typed helpers over the `/api/brand-kit` route so UI code (the brand
// kit page) never hand-rolls fetch calls. The server-side resolution +
// Supabase persistence lives in `lib/brand-kit.ts`; this file only talks to
// the HTTP surface and stays usable from client components.

export interface BrandKit {
  storeId: string;
  logoUrl?: string;
  primaryHex?: string;
  secondaryHex?: string;
  fontFamily?: string;
  fontUrl?: string;
  voiceId?: string;
}

/** Fonts we can reliably load + that read well in Hebrew. */
export const BRAND_FONTS = ["Heebo", "Assistant", "Rubik", "Inter"] as const;

/** GET the resolved kit for a store (server falls back to defaults). */
export async function fetchBrandKit(storeId: string): Promise<BrandKit> {
  const res = await fetch(
    `/api/brand-kit?store_id=${encodeURIComponent(storeId)}`,
    { cache: "no-store" }
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "טעינת ערכת המותג נכשלה");
  }
  const { kit } = (await res.json()) as { kit: BrandKit };
  return kit;
}

/**
 * Upsert a kit. Throws a Hebrew message when Supabase isn't configured so the
 * UI can explain that defaults are still applied but nothing was saved.
 */
export async function saveBrandKit(kit: BrandKit): Promise<BrandKit> {
  const res = await fetch("/api/brand-kit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(kit),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const raw = body.error as string | undefined;
    if (raw && /supabase/i.test(raw)) {
      throw new Error(
        "אחסון המותג אינו מחובר. ההגדרות יחולו לפי ברירת המחדל אך לא יישמרו."
      );
    }
    throw new Error(raw || "שמירת ערכת המותג נכשלה");
  }
  return (body as { kit: BrandKit }).kit;
}

/** Basic #rrggbb validation for the color pickers. */
export function isHex(value: string): boolean {
  return /^#[0-9a-f]{6}$/i.test(value.trim());
}
