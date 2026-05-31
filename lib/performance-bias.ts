// Performance feedback loop. Reads aggregate ROAS by (hook_archetype,
// actor_archetype) for a vertical, returns the top-N winners. `writeAdScript`
// (and friends) prepend a winners block to the system prompt so the next
// generation biases toward what already worked.
//
// All reads tolerate Supabase being unavailable — when down, returns an
// empty winners list and callers proceed with their normal prompt.

import { db } from "./db";
import { getCampaignInsightsMulti, roasOf, spendOf, type InsightRow } from "./meta";

export interface ArchetypeWinner {
  hookArchetype: string;
  actorArchetype?: string;
  vertical: string;
  avgRoas: number;
  totalSpend: number;
  sampleSize: number;
}

export interface VariantPerfRow {
  id?: string;
  variant_id: string;
  hook_archetype?: string;
  actor_archetype?: string;
  vertical?: string;
  ctr?: number;
  roas?: number;
  spend?: number;
  impressions?: number;
  meta_ad_id?: string;
  is_winner?: boolean;
  manually_marked?: boolean;
}

const TABLE = "variant_perf";

export async function upsertVariantPerf(row: VariantPerfRow): Promise<void> {
  if (!db) return;
  try {
    await db.from(TABLE).upsert(
      { ...row, updated_at: new Date().toISOString() },
      { onConflict: "variant_id" }
    );
  } catch {
    /* writes are best-effort — the next learn cron will pick it up */
  }
}

export async function markWinner(variantId: string, isWinner: boolean): Promise<void> {
  if (!db) throw new Error("Supabase not configured");
  await db
    .from(TABLE)
    .update({
      is_winner: isWinner,
      manually_marked: isWinner,
      updated_at: new Date().toISOString(),
    })
    .eq("variant_id", variantId);
}

/**
 * Returns the top N (hook_archetype, actor_archetype) combos by avg ROAS
 * for a vertical, weighted by sample size (min 1 sample, log-scaled).
 */
export async function topArchetypes(
  vertical: string,
  limit = 3
): Promise<ArchetypeWinner[]> {
  if (!db) return [];
  try {
    const { data } = await db
      .from(TABLE)
      .select("hook_archetype, actor_archetype, vertical, roas, spend")
      .eq("vertical", vertical)
      .not("roas", "is", null);
    if (!Array.isArray(data) || data.length === 0) return [];
    const agg = new Map<string, { hookArchetype: string; actorArchetype?: string; roas: number[]; spend: number }>();
    for (const r of data as VariantPerfRow[]) {
      if (!r.hook_archetype) continue;
      const key = `${r.hook_archetype}|${r.actor_archetype || ""}`;
      const e = agg.get(key) || {
        hookArchetype: r.hook_archetype,
        actorArchetype: r.actor_archetype,
        roas: [],
        spend: 0,
      };
      e.roas.push(Number(r.roas));
      e.spend += Number(r.spend) || 0;
      agg.set(key, e);
    }
    const winners: ArchetypeWinner[] = [];
    for (const e of agg.values()) {
      const avg = e.roas.reduce((a, b) => a + b, 0) / e.roas.length;
      winners.push({
        hookArchetype: e.hookArchetype,
        actorArchetype: e.actorArchetype,
        vertical,
        avgRoas: avg,
        totalSpend: e.spend,
        sampleSize: e.roas.length,
      });
    }
    // Score = avgRoas * log10(1 + sampleSize). Filters out one-hit-wonders.
    winners.sort(
      (a, b) =>
        b.avgRoas * Math.log10(1 + b.sampleSize) -
        a.avgRoas * Math.log10(1 + a.sampleSize)
    );
    return winners.slice(0, limit);
  } catch {
    return [];
  }
}

/**
 * Format winners as a short bullet block to prepend to a generation prompt.
 * Empty string when no winners — caller can safely concatenate.
 */
export function winnersPrompt(winners: ArchetypeWinner[]): string {
  if (winners.length === 0) return "";
  const lines = winners.map(
    (w, i) =>
      `${i + 1}. hook="${w.hookArchetype}"${w.actorArchetype ? ` actor="${w.actorArchetype}"` : ""} (ROAS ${w.avgRoas.toFixed(2)}, n=${w.sampleSize})`
  );
  return [
    "PRIOR WINNERS for this vertical (bias toward these archetypes):",
    ...lines,
    "",
  ].join("\n");
}

// ---- Daily learn cron --------------------------------------------------------

/** Pick the most complete window for the stored signal, preferring lifetime. */
function pickWindow(
  lifetime: InsightRow | null,
  d30: InsightRow | null,
  d7: InsightRow | null
): InsightRow | null {
  // Lifetime (date_preset=maximum) is the most stable "what worked" signal.
  // Fall back to 30d then 7d if a younger ad has no lifetime aggregate yet.
  if (lifetime && spendOf(lifetime) > 0) return lifetime;
  if (d30 && spendOf(d30) > 0) return d30;
  if (d7 && spendOf(d7) > 0) return d7;
  return lifetime || d30 || d7;
}

/**
 * Refresh `variant_perf` rows we've previously recorded with fresh Meta
 * ad-level insights. Per Itay's ironclad rule we read lifetime + 7d + 30d
 * for every ad and store the lifetime aggregate (with 30d/7d fallbacks for
 * young ads). We don't auto-create rows for ads we didn't write first — that
 * mapping (ad → archetype) is unknown post-hoc.
 */
export async function runLearnCron(): Promise<{
  scanned: number;
  updated: number;
}> {
  if (!db) return { scanned: 0, updated: 0 };
  // Read the variant rows we know about.
  const { data: known } = await db.from(TABLE).select("id, variant_id, meta_ad_id");
  if (!Array.isArray(known) || known.length === 0) return { scanned: 0, updated: 0 };

  let updated = 0;
  for (const row of known as VariantPerfRow[]) {
    if (!row.meta_ad_id) continue;
    try {
      const { lifetime, d7, d30 } = await getCampaignInsightsMulti(row.meta_ad_id);
      const ins = pickWindow(lifetime, d30, d7);
      if (!ins) continue;
      const roas = roasOf(ins);
      const ctr = ins.ctr ? Number(ins.ctr) : null;
      const spend = ins.spend ? Number(ins.spend) : null;
      const impressions = ins.impressions ? Number(ins.impressions) : null;
      await db
        .from(TABLE)
        .update({
          ctr,
          roas,
          spend,
          impressions,
          updated_at: new Date().toISOString(),
        })
        .eq("variant_id", row.variant_id);
      updated++;
    } catch {
      /* skip rows that fail; next cron retries */
    }
  }
  return { scanned: known.length, updated };
}
