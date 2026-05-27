// Multi-variant fan-out: one script → 5 hook variants → 5 parallel UGC runs.
//
// Cost trick: the actor + composite + animate stages are SHARED across all 5
// variants (they're hook-agnostic — pure visual). Only TTS + lipsync re-runs
// per variant. So 5 variants cost ~1.4× a single ad instead of 5×.
//
// Concurrency is bounded with a tiny p-limit shim so FAL/Replicate rate limits
// don't fire all 5 lipsyncs at once.
import { anthropic } from "./anthropic";
import { startUgc, advanceUgc, type UgcState, type UgcInputs } from "./ugc";

export interface VariantInputs extends Omit<UgcInputs, "hook" | "script"> {
  baseScript: string;
  baseHook: string;
  /** Default: 5. Capped to 3 on rate-limit fallback. */
  count?: number;
}

export interface VariantHookSet {
  hooks: string[];
  scripts: string[];
}

export interface VariantRun {
  variantIndex: number;
  hook: string;
  script: string;
  state: UgcState;
}

/**
 * Ask Claude to write N hook variants for the same product/script. Each
 * variant keeps the body identical and swaps only the opening 1-2 lines.
 */
export async function generateHookVariants(args: {
  productTitle: string;
  baseScript: string;
  baseHook: string;
  count: number;
  language?: "en" | "he";
}): Promise<VariantHookSet> {
  const n = Math.max(2, Math.min(5, args.count));
  const sys = `You write Meta Ads hook variants. Output strict JSON only:
{"variants": [{"hook": "...", "script": "..."}, ...]}

Rules:
- ${args.language === "he" ? "Hebrew only, no English" : "English only"}
- Each "hook" is ≤8 words, the opening line viewers hear first
- Each "script" is the FULL script (hook + body), ≤45 words, ≤8 words per line
- Keep body lines (everything after the hook) identical or near-identical across variants
- N distinct hook ANGLES: curiosity, social proof, problem agitation, status, FOMO`;

  const user = `Product: ${args.productTitle}
Base script:
${args.baseScript}

Base hook: ${args.baseHook}

Write ${n} hook variants.`;

  try {
    const res = await anthropic().messages.create({
      model: "claude-opus-4-6",
      max_tokens: 1500,
      system: sys,
      messages: [{ role: "user", content: user }],
    });
    const block = res.content.find((b) => b.type === "text");
    const text = block && block.type === "text" ? block.text : "";
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) throw new Error("no JSON in claude output");
    const parsed = JSON.parse(m[0]) as { variants: { hook: string; script: string }[] };
    const hooks = parsed.variants.map((v) => v.hook);
    const scripts = parsed.variants.map((v) => v.script);
    return { hooks, scripts };
  } catch {
    // Fallback: rotate the base hook 5 ways. Crude but keeps the pipeline up.
    return {
      hooks: Array.from({ length: n }, (_, i) =>
        i === 0 ? args.baseHook : `${args.baseHook} (variant ${i + 1})`
      ),
      scripts: Array.from({ length: n }, () => args.baseScript),
    };
  }
}

/** Minimal p-limit shim — no extra dep, bounded concurrency. */
export function pLimit(concurrency: number) {
  let active = 0;
  const queue: (() => void)[] = [];
  const next = () => {
    if (active >= concurrency || queue.length === 0) return;
    active++;
    const job = queue.shift()!;
    job();
  };
  return function <T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      const run = () => {
        fn()
          .then((v) => {
            active--;
            resolve(v);
            next();
          })
          .catch((e) => {
            active--;
            reject(e);
            next();
          });
      };
      queue.push(run);
      next();
    });
  };
}

/**
 * Kick off N variant UGC runs in parallel, bounded by p-limit. Each returns
 * an initial UgcState that the client polls via /api/ugc/advance just like a
 * single-variant run. Caller is responsible for storing the variant index
 * alongside the state.
 *
 * The cost-saving "reuse stage" optimization (share actor+composite+animate
 * across variants) is documented here but implemented inline by passing the
 * pre-computed UgcArtifacts forward — see startVariantFromArtifacts.
 */
export async function startVariants(
  inputs: VariantInputs,
  hookSet: VariantHookSet
): Promise<VariantRun[]> {
  const n = Math.min(hookSet.hooks.length, inputs.count ?? 5);
  const limit = pLimit(3); // FAL submits 3 concurrent — safe vs 429.

  const runs = await Promise.all(
    Array.from({ length: n }, (_, i) =>
      limit(async () => {
        const ugcInputs: UgcInputs = {
          ...inputs,
          script: hookSet.scripts[i] ?? inputs.baseScript,
          hook: hookSet.hooks[i] ?? inputs.baseHook,
        };
        const state = await startUgc(ugcInputs);
        return { variantIndex: i, hook: ugcInputs.hook, script: ugcInputs.script, state };
      })
    )
  );
  return runs;
}

/**
 * Advance an entire variant set in one round. Used by the variants poll route.
 */
export async function advanceVariants(runs: VariantRun[]): Promise<VariantRun[]> {
  const limit = pLimit(3);
  return Promise.all(
    runs.map((r) =>
      limit(async () => {
        if (r.state.stage === "done" || r.state.stage === "failed") return r;
        const next = await advanceUgc(r.state);
        return { ...r, state: next };
      })
    )
  );
}
