import { NextResponse } from "next/server";
import type { Soul } from "@/components/SoulIdPicker";

// ---------------------------------------------------------------------------
// GET /api/souls
// ---------------------------------------------------------------------------
// Returns the list of Higgsfield character avatars ("Souls").
// Once the Higgsfield REST API is live, replace the PLACEHOLDER block below
// with a real fetch to their endpoint and forward the result.
// ---------------------------------------------------------------------------

const HIGGSFIELD_API_BASE = process.env.HIGGSFIELD_API_URL ?? "";
const HIGGSFIELD_API_KEY = process.env.HIGGSFIELD_API_KEY ?? "";

// Placeholder data — removed once real API is wired up.
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

async function fetchHiggsfieldSouls(): Promise<Soul[]> {
  if (!HIGGSFIELD_API_BASE || !HIGGSFIELD_API_KEY) {
    // API not configured yet — return placeholders.
    return PLACEHOLDER_SOULS;
  }

  const res = await fetch(`${HIGGSFIELD_API_BASE}/v1/souls`, {
    headers: {
      Authorization: `Bearer ${HIGGSFIELD_API_KEY}`,
      "Content-Type": "application/json",
    },
    next: { revalidate: 300 }, // cache for 5 minutes
  });

  if (!res.ok) {
    console.error(
      `[souls] Higgsfield API error: ${res.status} ${res.statusText}`
    );
    // Fall back to placeholders so the UI still renders.
    return PLACEHOLDER_SOULS;
  }

  // Expected shape from Higgsfield:
  // { souls: [{ id, name, thumbnail_url, gender, style }] }
  const json = await res.json();
  const raw: Array<{
    id: string;
    name: string;
    thumbnail_url: string;
    gender?: string;
    style?: string;
  }> = json.souls ?? [];

  return raw.map((s) => ({
    id: s.id,
    name: s.name,
    thumbnailUrl: s.thumbnail_url,
    gender: s.gender,
    style: s.style,
  }));
}

export async function GET() {
  try {
    const souls = await fetchHiggsfieldSouls();
    const apiReady = Boolean(HIGGSFIELD_API_BASE && HIGGSFIELD_API_KEY);
    return NextResponse.json({ souls, apiReady });
  } catch (err) {
    console.error("[souls] unexpected error", err);
    return NextResponse.json(
      { souls: PLACEHOLDER_SOULS, apiReady: false },
      { status: 200 } // still 200 so UI degrades gracefully
    );
  }
}
