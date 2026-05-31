// Campaign-level ROAS scan + verdicts. This is the "learn loop" decision layer
// that check-winners drives. It is deliberately separate from
// performance-bias.ts (which works at the variant/archetype level for biasing
// future scripts).
//
// Itay's ironclad rules baked in here:
//   - read lifetime + 7d + 30d (via getCampaignInsightsMulti).
//   - LEARNING PHASE: no judgment before ~3-5 days AND 50 conversions. A
//     high-ROAS campaign still in learning is "promising", not yet a "winner".
//   - KILL RULE: 0 purchases lifetime + spend > ₪200 (account currency). This
//     is the explicit exception that fires regardless of learning phase.
//   - auto-pause is opt-in; default is report-only.

import {
  getCampaigns,
  getCampaignInsightsMulti,
  setCampaignStatus,
  roasOf,
  spendOf,
  purchaseCount,
} from "./meta";
import { db } from "./db";

export interface ScanConfig {
  roasThreshold: number;
  killSpendThreshold: number;
  minConversions: number;
  minDays: number;
  autoKill: boolean;
  accountId?: string;
}

export type Classification = "winner" | "promising" | "kill" | "learning" | "watch";

export interface CampaignVerdict {
  campaignId: string;
  campaignName: string;
  decisionRoas: number | null;
  roas7d: number | null;
  roas30d: number | null;
  lifetimeSpend: number;
  lifetimePurchases: number;
  daysRunning: number | null;
  active: boolean;
  inLearning: boolean;
  classification: Classification;
  paused: boolean;
}

export interface ScanResult {
  scanned: number;
  config: ScanConfig;
  winners: CampaignVerdict[];
  promising: CampaignVerdict[];
  killCandidates: CampaignVerdict[];
  verdicts: CampaignVerdict[];
}

export function resolveScanConfig(overrides: Partial<ScanConfig> = {}): ScanConfig {
  return {
    roasThreshold: overrides.roasThreshold ?? Number(process.env.WINNER_ROAS_THRESHOLD || 3),
    killSpendThreshold:
      overrides.killSpendThreshold ?? Number(process.env.KILL_SPEND_THRESHOLD || 200),
    minConversions: overrides.minConversions ?? Number(process.env.LEARNING_MIN_CONVERSIONS || 50),
    minDays: overrides.minDays ?? Number(process.env.LEARNING_MIN_DAYS || 4),
    autoKill: overrides.autoKill ?? process.env.META_AUTO_KILL === "1",
    accountId: overrides.accountId,
  };
}

function daysSince(iso?: string): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return Math.floor((Date.now() - t) / 86400000);
}

/** Classify a single campaign from its multi-window insights. */
export function classify(
  campaign: { id: string; name?: string; created_time?: string; status?: string; effective_status?: string },
  windows: { lifetime: any; d7: any; d30: any },
  cfg: ScanConfig
): CampaignVerdict {
  const decisionRoas = roasOf(windows.lifetime) ?? roasOf(windows.d30) ?? roasOf(windows.d7);
  const lifetimeSpend = spendOf(windows.lifetime);
  const lifetimePurchases = purchaseCount(windows.lifetime);
  const daysRunning = daysSince(campaign.created_time);
  const active = (campaign.effective_status ?? campaign.status) === "ACTIVE";

  // Learning phase: not enough time AND/OR not enough conversions to judge.
  const tooYoung = daysRunning != null && daysRunning < cfg.minDays;
  const tooFewConversions = lifetimePurchases < cfg.minConversions;
  const inLearning = tooYoung || tooFewConversions;

  const isKill = active && lifetimePurchases === 0 && lifetimeSpend > cfg.killSpendThreshold;

  let classification: Classification;
  if (isKill) {
    classification = "kill";
  } else if (decisionRoas !== null && decisionRoas > cfg.roasThreshold) {
    classification = inLearning ? "promising" : "winner";
  } else if (inLearning) {
    classification = "learning";
  } else {
    classification = "watch";
  }

  return {
    campaignId: campaign.id,
    campaignName: campaign.name ?? campaign.id,
    decisionRoas,
    roas7d: roasOf(windows.d7),
    roas30d: roasOf(windows.d30),
    lifetimeSpend,
    lifetimePurchases,
    daysRunning,
    active,
    inLearning,
    classification,
    paused: false,
  };
}

/** Full account scan: pulls campaigns, classifies each, optionally auto-pauses kills. */
export async function scanCampaigns(overrides: Partial<ScanConfig> = {}): Promise<ScanResult> {
  const cfg = resolveScanConfig(overrides);
  const campaigns = await getCampaigns("ALL", cfg.accountId);
  const verdicts: CampaignVerdict[] = [];

  for (const c of campaigns) {
    try {
      const windows = await getCampaignInsightsMulti(c.id);
      const verdict = classify(c, windows, cfg);
      if (verdict.classification === "kill" && cfg.autoKill) {
        try {
          await setCampaignStatus(c.id, "PAUSED");
          verdict.paused = true;
        } catch (err) {
          console.error(`auto-kill failed for ${c.id}:`, err);
        }
      }
      verdicts.push(verdict);
    } catch (err) {
      console.error(`scan failed for campaign ${c.id}:`, err);
    }
  }

  return {
    scanned: campaigns.length,
    config: cfg,
    winners: verdicts.filter((v) => v.classification === "winner"),
    promising: verdicts.filter((v) => v.classification === "promising"),
    killCandidates: verdicts.filter((v) => v.classification === "kill"),
    verdicts,
  };
}

/**
 * Best-effort audit log of a scan to Supabase (`roas_scan_log`). No-ops when
 * Supabase isn't configured; never throws into the cron.
 */
export async function persistScan(result: ScanResult): Promise<void> {
  if (!db) return;
  try {
    await db.from("roas_scan_log").insert({
      scanned: result.scanned,
      winners: result.winners,
      promising: result.promising,
      kill_candidates: result.killCandidates,
      config: result.config,
      created_at: new Date().toISOString(),
    });
  } catch {
    /* audit is best-effort */
  }
}
