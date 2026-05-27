// Performance feedback loop. Reads aggregate ROAS by (hook_archetype,
// actor_archetype) for a vertical, returns the top-N winners. `writeAdScript`
// (and friends) prepend a winners block to the system prompt so the next
// generation biases toward what already worked.
//
// All reads tolerate Supabase being unavailable — when down, returns an
// empty winners list and callers proceed with their normal prompt.

import { db } from "./db";
import { metaGet } from "./meta";

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

interface MetaInsight {
  ad_id: string;
  spend?: string;
  impressions?: string;
  ctr?: string;
  purchase_roas?: Array<{ value: string }>;
}

/**
 * Pull last 30 days of Meta ad-level insights and refresh `variant_perf`
 * rows we've previously recorded. We don't auto-create rows for ads we
 * didn't write to Supabase first — that mapping (ad → archetype) is
 * unknown post-hoc.
 */
export async function runLearnCron(opts: { datePreset?: string } = {}): Promise<{
  scanned: number;
  updated: number;
}> {
  if (!db) return { scanned: 0, updated: 0 };
  const datePreset = opts.datePreset || "last_30d";
  // Read the variant rows we know about.
  const { data: known } = await db.from(TABLE).select("id, variant_id, meta_ad_id");
  if (!Array.isArray(known) || known.length === 0) return { scanned: 0, updated: 0 };

  let updated = 0;
  for (const row of known as VariantPerfRow[]) {
    if (!row.meta_ad_id) continue;
    try {
      const insights = await metaGet<{ data: MetaInsight[] }>(`/${row.meta_ad_id}/insights`, {
        fields: "spend,impressions,clicks,ctr,purchase_roas",
        date_preset: datePreset,
      });
      const ins = insights.data?.[0];
      if (!ins) continue;
      const roas = ins.purchase_roas?.[0]?.value
        ? Number(ins.purchase_roas[0].value)
        : null;
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
