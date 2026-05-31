// Identity-lock checklist for AI avatar/clone pipelines.
//
// Lifted from the theabhisheik EXTENDED AI Clone Workflow (companion to the
// Nicola 5-page manual). Use after Step 1 (Face) and after every Step 2
// (Dataset) regen — if any of the four anchors drifts, the downstream
// motion model will blend faces between frames and the clone collapses.
//
// Pattern:
//   const score = scoreIdentityLock({ eyesDistanceMatches: true, ... });
//   if (!score.pass) regenerate();   // fail-closed before paying for upscale

export interface IdentityLockChecklist {
  /** Eyes stay at the same inter-pupillary distance vs reference. */
  eyesDistanceMatches: boolean;
  /** Nose bridge + tip shape unchanged. */
  noseShapeMatches: boolean;
  /** Jaw width + chin angle unchanged. */
  jawWidthMatches: boolean;
  /** Hairline starting point + density unchanged. */
  hairlineMatches: boolean;
  /** Skin tone within 1 shade of reference (optional but recommended). */
  skinToneCloseEnough?: boolean;
}

export interface IdentityLockScore {
  /** True only when all four required anchors pass. */
  pass: boolean;
  /** 0-4 count of required anchors that matched. */
  anchorsMatched: number;
  /** Human-readable failures for the regen prompt feedback loop. */
  drift: string[];
}

export function scoreIdentityLock(c: IdentityLockChecklist): IdentityLockScore {
  const drift: string[] = [];
  let matched = 0;
  if (c.eyesDistanceMatches) matched++; else drift.push("eyes inter-pupillary distance drifted");
  if (c.noseShapeMatches) matched++; else drift.push("nose bridge/tip shape drifted");
  if (c.jawWidthMatches) matched++; else drift.push("jaw width / chin angle drifted");
  if (c.hairlineMatches) matched++; else drift.push("hairline drifted");
  if (c.skinToneCloseEnough === false) drift.push("skin tone shifted >1 shade (warning)");
  return { pass: matched === 4, anchorsMatched: matched, drift };
}

/**
 * Throwing variant for pipeline guards.
 *
 * Use at the boundary between dataset gen and upscale to stop a bad batch
 * before paying Higgsfield/Magnific credits.
 */
export function assertIdentityLock(c: IdentityLockChecklist): void {
  const s = scoreIdentityLock(c);
  if (!s.pass) {
    throw new Error(
      `identity-lock fail (${s.anchorsMatched}/4 anchors):\n  - ${s.drift.join("\n  - ")}`
    );
  }
}

/**
 * Build the regen feedback line you append to the next prompt attempt.
 * E.g. "preserve eyes distance, preserve hairline" → injects identity-lock
 * directives that NanoBanana/Flux respect on retry.
 */
export function buildRegenDirective(drift: string[]): string {
  if (drift.length === 0) return "";
  const directives = drift
    .map((d) => {
      if (d.includes("eyes")) return "preserve inter-pupillary distance exactly";
      if (d.includes("nose")) return "preserve nose bridge and tip shape exactly";
      if (d.includes("jaw")) return "preserve jaw width and chin angle exactly";
      if (d.includes("hairline")) return "preserve hairline starting point and density exactly";
      if (d.includes("skin tone")) return "preserve original skin tone exactly";
      return "";
    })
    .filter(Boolean);
  return directives.length ? `Preserve identity exactly: ${directives.join(", ")}.` : "";
}
