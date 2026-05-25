// Vercel Cron + self-chain: drains BACKLOG.md autonomously.
// Per item: 1 commit (Git Data API), lease lock (no dupes), static import validation.
// Required env: ANTHROPIC_API_KEY, GITHUB_TOKEN (repo scope), GITHUB_REPO ("owner/name").
// Optional env: CRON_SECRET (Vercel auto-sends as Bearer header).

import { NextResponse, after } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export const runtime = "nodejs";
export const maxDuration = 300;

const MODEL = "claude-sonnet-4-6";

type FileOp = { path: string; action: "write" | "delete"; content?: string };
type Plan = { summary: string; files: FileOp[] };

// Brace-balanced extractor: ignores braces inside strings.
function extractJSON(s: string): string | null {
  const start = s.indexOf("{");
  if (start === -1) return null;
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
    } else {
      if (c === '"') inStr = true;
      else if (c === "{") depth++;
      else if (c === "}") { depth--; if (depth === 0) return s.slice(start, i + 1); }
    }
  }
  return null;
}

function gh(token: string, repo: string) {
  const base = `https://api.github.com/repos/${repo}`;
  const h: Record<string, string> = {
    Authorization: `token ${token}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "adlab-auto-build",
  };
  const api = async (path: string, init: RequestInit = {}) => {
    const r = await fetch(`${base}${path}`, { ...init, headers: { ...h, "Content-Type": "application/json", ...(init.headers || {}) } });
    return r;
  };
  return {
    async getFile(path: string): Promise<{ content: string; sha: string } | null> {
      const r = await api(`/contents/${encodeURIComponent(path)}`);
      if (r.status === 404) return null;
      if (!r.ok) throw new Error(`GET ${path}: ${r.status} ${await r.text()}`);
      const j: any = await r.json();
      return { content: Buffer.from(j.content, "base64").toString("utf-8"), sha: j.sha };
    },
    async putFile(path: string, content: string, message: string, sha?: string): Promise<{ ok: boolean; conflict?: boolean }> {
      const body: any = { message, content: Buffer.from(content, "utf-8").toString("base64"), branch: "main" };
      if (sha) body.sha = sha;
      const r = await api(`/contents/${encodeURIComponent(path)}`, { method: "PUT", body: JSON.stringify(body) });
      if (r.status === 409 || r.status === 422) return { ok: false, conflict: true };
      if (!r.ok) throw new Error(`PUT ${path}: ${r.status} ${await r.text()}`);
      return { ok: true };
    },
    async listTree(): Promise<{ path: string; sha: string; mode: string; type: string }[]> {
      const r = await api(`/git/trees/main?recursive=1`);
      if (!r.ok) return [];
      const j: any = await r.json();
      return (j.tree || []).filter((n: any) => n.type === "blob");
    },
    async getBranchSha(): Promise<{ commitSha: string; treeSha: string }> {
      const r = await api(`/git/ref/heads/main`);
      const j: any = await r.json();
      const commitSha = j.object.sha;
      const cr = await api(`/git/commits/${commitSha}`);
      const cj: any = await cr.json();
      return { commitSha, treeSha: cj.tree.sha };
    },
    async createBlob(content: string): Promise<string> {
      const r = await api(`/git/blobs`, { method: "POST", body: JSON.stringify({ content: Buffer.from(content, "utf-8").toString("base64"), encoding: "base64" }) });
      if (!r.ok) throw new Error(`createBlob: ${r.status} ${await r.text()}`);
      return (await r.json()).sha;
    },
    async createTree(baseTreeSha: string, entries: { path: string; mode: string; type: string; sha: string | null }[]): Promise<string> {
      const r = await api(`/git/trees`, { method: "POST", body: JSON.stringify({ base_tree: baseTreeSha, tree: entries }) });
      if (!r.ok) throw new Error(`createTree: ${r.status} ${await r.text()}`);
      return (await r.json()).sha;
    },
    async createCommit(message: string, treeSha: string, parentSha: string): Promise<string> {
      const r = await api(`/git/commits`, { method: "POST", body: JSON.stringify({ message, tree: treeSha, parents: [parentSha], author: { name: "AdLab-Bot", email: "bot@adlab.ai", date: new Date().toISOString() } }) });
      if (!r.ok) throw new Error(`createCommit: ${r.status} ${await r.text()}`);
      return (await r.json()).sha;
    },
    async updateRef(commitSha: string, force = false): Promise<boolean> {
      const r = await api(`/git/refs/heads/main`, { method: "PATCH", body: JSON.stringify({ sha: commitSha, force }) });
      if (r.status === 422) return false; // non-fast-forward
      if (!r.ok) throw new Error(`updateRef: ${r.status} ${await r.text()}`);
      return true;
    },
  };
}

// Static validation: reject hallucinated imports.
function validateImports(content: string, depSet: Set<string>, internalExports: Map<string, Set<string>>): string[] {
  const errs: string[] = [];
  const importRe = /^\s*import\s+(?:[\s\S]*?\s+from\s+)?["']([^"']+)["']/gm;
  let m: RegExpExecArray | null;
  while ((m = importRe.exec(content))) {
    const spec = m[1];
    if (spec.startsWith(".") || spec.startsWith("/")) continue;
    if (spec.startsWith("@/")) {
      // Internal alias — check named exports if we know them
      const path = spec.replace(/^@\//, "") + ".ts";
      const known = internalExports.get(path);
      if (!known) continue;
      const namedMatch = m[0].match(/import\s*\{([^}]+)\}/);
      if (namedMatch) {
        const names = namedMatch[1].split(",").map((s) => s.trim().split(/\s+as\s+/)[0].trim()).filter(Boolean);
        for (const n of names) if (!known.has(n)) errs.push(`unknown export "${n}" from "${spec}"`);
      }
      continue;
    }
    // External package — must be in package.json
    const pkg = spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0];
    if (!depSet.has(pkg) && !["next", "react", "react-dom", "node:fs", "node:path", "node:crypto", "fs", "path", "crypto", "stream", "buffer"].includes(pkg) && !pkg.startsWith("node:")) {
      errs.push(`unknown package "${pkg}" not in package.json deps`);
    }
  }
  return errs;
}

async function loadInternalExports(api: ReturnType<typeof gh>): Promise<Map<string, Set<string>>> {
  const map = new Map<string, Set<string>>();
  const libFiles = ["lib/meta.ts", "lib/shopify.ts", "lib/anthropic.ts", "lib/video.ts", "lib/db.ts"];
  await Promise.all(libFiles.map(async (p) => {
    const f = await api.getFile(p);
    if (!f) return;
    const names = new Set<string>();
    const re = /^\s*export\s+(?:async\s+)?(?:function|const|let|var|class|interface|type|enum)\s+(\w+)/gm;
    let m: RegExpExecArray | null;
    while ((m = re.exec(f.content))) names.add(m[1]);
    map.set(p, names);
  }));
  return map;
}

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization") || "";
    if (auth !== `Bearer ${secret}`) return NextResponse.json({ error: "unauth" }, { status: 401 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  const ghToken = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPO || "itayadler99/adlab";
  if (!apiKey) return NextResponse.json({ skipped: "ANTHROPIC_API_KEY not set" });
  if (!ghToken) return NextResponse.json({ skipped: "GITHUB_TOKEN not set" });

  const api = gh(ghToken, repo);
  const runId = Math.random().toString(36).slice(2, 8);

  // 1. Lease lock — atomically claim top item by rewriting "- [ ]" → "- [~]"
  const backlog = await api.getFile("BACKLOG.md");
  if (!backlog) return NextResponse.json({ error: "BACKLOG.md missing" }, { status: 500 });
  const lines = backlog.content.split("\n");
  const idx = lines.findIndex((l) => l.trim().startsWith("- [ ]"));
  if (idx === -1) return NextResponse.json({ done: "backlog empty" });
  const item = lines[idx].replace(/^\s*- \[ \]\s*/, "").trim();
  const leased = [...lines];
  leased[idx] = leased[idx].replace("- [ ]", `- [~]`) + ` <!-- lease:${runId} -->`;
  const leaseResult = await api.putFile("BACKLOG.md", leased.join("\n"), `auto: lease "${item.slice(0, 60)}" by ${runId}`, backlog.sha);
  if (!leaseResult.ok) return NextResponse.json({ skipped: "lease_conflict", item });

  try {
    // 2. Load deps + internal exports for validation
    const pkg = await api.getFile("package.json");
    const depSet = new Set<string>();
    if (pkg) {
      const j = JSON.parse(pkg.content);
      Object.keys(j.dependencies || {}).forEach((k) => depSet.add(k));
      Object.keys(j.devDependencies || {}).forEach((k) => depSet.add(k));
    }
    const internalExports = await loadInternalExports(api);

    // 3. Snapshot tree
    const tree = (await api.listTree()).slice(0, 120).map((n) => n.path).join("\n");

    // 4. Ask Claude
    const client = new Anthropic({ apiKey });
    const depList = [...depSet].join(", ");
    const exportSummary = [...internalExports.entries()].map(([p, s]) => `  * ${p}: ${[...s].join(", ")}`).join("\n");
    const sys = `You are AdLab's autonomous code-builder. Output STRICT JSON ONLY:
{
  "summary": "one-line commit message",
  "files": [{ "path": "relative/path.ts", "action": "write|delete", "content": "..." }]
}

Rules:
- Project: Next.js 16 App Router + Tailwind v4 (dark) + TypeScript, deployed on Vercel
- Existing lib exports (use ONLY these from each):
${exportSummary}
- Pages: app/page.tsx, app/generate, app/launch, app/spy, app/library
- API: app/api/{generate,poll,launch,spy,transcribe,products,health,cron/auto-build}
- proxy.ts is middleware — never import it. Auth is automatic via matcher.
- Imports: "@/lib/..." or "@/components/..." only. Never import from "@/proxy".
- ALLOWED npm packages (do NOT use any other): ${depList}
- Output COMPLETE file content per changed file. No partial diffs.
- Prefer ADD-only changes (new files). Modify existing files only if essential.
- No comments in JSON. No code fences. No prose outside the JSON.`;

    const user = `Implement this backlog item:
"${item}"

Current file tree (top 120):
${tree}

Return JSON.`;

    let resp;
    try {
      resp = await client.messages.create({ model: MODEL, max_tokens: 16000, system: sys, messages: [{ role: "user", content: user }] });
    } catch (e: any) {
      throw new Error(`claude_failed: ${e.message}`);
    }
    if (resp.stop_reason === "max_tokens") throw new Error(`truncated_response (raise max_tokens or split item)`);

    const text = (resp.content.find((b: any) => b.type === "text") as any)?.text || "";
    const jsonStr = extractJSON(text);
    if (!jsonStr) throw new Error(`no_json: ${text.slice(0, 200)}`);

    let plan: Plan;
    try { plan = JSON.parse(jsonStr); }
    catch (e: any) { throw new Error(`bad_json: ${e.message}`); }

    const summary = plan.summary || item;

    // 5. Validate imports in all write ops
    const validationErrs: string[] = [];
    for (const f of plan.files || []) {
      if (f.action !== "write" || !f.content) continue;
      if (!/\.(ts|tsx|mts|cts|js|jsx)$/.test(f.path)) continue;
      const errs = validateImports(f.content, depSet, internalExports);
      if (errs.length) validationErrs.push(`${f.path}: ${errs.join("; ")}`);
    }
    if (validationErrs.length) throw new Error(`validation_failed: ${validationErrs.join(" | ")}`);

    // 6. Build a single commit via Git Data API (all file ops + tick + changelog)
    const { commitSha: parentCommitSha, treeSha: parentTreeSha } = await api.getBranchSha();
    const treeEntries: { path: string; mode: string; type: string; sha: string | null }[] = [];
    const applied: string[] = [];

    for (const f of plan.files || []) {
      if (f.action === "delete") {
        treeEntries.push({ path: f.path, mode: "100644", type: "blob", sha: null });
        applied.push(`-${f.path}`);
      } else {
        const blobSha = await api.createBlob(f.content || "");
        treeEntries.push({ path: f.path, mode: "100644", type: "blob", sha: blobSha });
        applied.push(`+${f.path}`);
      }
    }

    // Tick the backlog item (replace "[~]" back to "[x]", strip lease comment)
    const ticked = leased.map((l, i) => i === idx ? l.replace("- [~]", "- [x]").replace(/\s*<!-- lease:[^>]+-->$/, "") : l).join("\n");
    const backlogBlob = await api.createBlob(ticked);
    treeEntries.push({ path: "BACKLOG.md", mode: "100644", type: "blob", sha: backlogBlob });

    // Update CHANGELOG.md
    const stamp = new Date().toISOString().slice(0, 10);
    const cl = await api.getFile("CHANGELOG.md");
    const prev = cl?.content || "# Changelog\n\n";
    const newCl = `# Changelog\n\n- ${stamp} — ${summary}\n${prev.replace(/^# Changelog\n+/, "")}`;
    const clBlob = await api.createBlob(newCl);
    treeEntries.push({ path: "CHANGELOG.md", mode: "100644", type: "blob", sha: clBlob });

    const newTreeSha = await api.createTree(parentTreeSha, treeEntries);
    const newCommitSha = await api.createCommit(`auto: ${summary}\n\nItem: ${item}\nRun: ${runId}`, newTreeSha, parentCommitSha);
    const refOk = await api.updateRef(newCommitSha, false);
    if (!refOk) throw new Error("ref_update_failed (concurrent push)");

    // 7. Self-chain
    const remainingAfter = ticked.split("\n").filter((l) => l.trim().startsWith("- [ ]")).length;
    if (remainingAfter > 0) {
      const host = req.headers.get("host") || "adlab-amber.vercel.app";
      const proto = host.includes("localhost") ? "http" : "https";
      const selfUrl = `${proto}://${host}/api/cron/auto-build`;
      const headers: Record<string, string> = { "User-Agent": "adlab-self-chain" };
      if (secret) headers.Authorization = `Bearer ${secret}`;
      after(async () => { try { await fetch(selfUrl, { headers }); } catch {} });
    }

    return NextResponse.json({ ok: true, runId, item, summary, applied, commit: newCommitSha, remaining: remainingAfter });
  } catch (e: any) {
    // Release the lease on failure so next run retries this item
    try {
      const cur = await api.getFile("BACKLOG.md");
      if (cur) {
        const released = cur.content.split("\n").map((l) => l.includes(`lease:${runId}`) ? l.replace("- [~]", "- [ ]").replace(/\s*<!-- lease:[^>]+-->$/, "") : l).join("\n");
        if (released !== cur.content) await api.putFile("BACKLOG.md", released, `auto: release lease ${runId} (failed: ${e.message.slice(0, 60)})`, cur.sha);
      }
    } catch {}
    return NextResponse.json({ error: e.message, item, runId }, { status: 500 });
  }
}
