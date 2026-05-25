// Vercel Cron: every 12h at :07. Picks top unchecked BACKLOG.md item,
// asks Claude for a JSON patch, commits files via GitHub API.
// Vercel redeploys automatically on the resulting commit.
//
// Required env: ANTHROPIC_API_KEY, GITHUB_TOKEN (repo scope), GITHUB_REPO ("owner/name").
// Optional env: CRON_SECRET (Vercel auto-sends as Bearer header).

import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export const runtime = "nodejs";
export const maxDuration = 300;

const MODEL = "claude-sonnet-4-6";

type FileOp = { path: string; action: "write" | "delete"; content?: string };
type Plan = { summary: string; files: FileOp[] };

// Brace-balanced extractor: finds first complete top-level {...} ignoring braces inside strings.
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
  const h = {
    Authorization: `token ${token}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "adlab-auto-build",
  };
  return {
    async getFile(path: string): Promise<{ content: string; sha: string } | null> {
      const r = await fetch(`${base}/contents/${encodeURIComponent(path)}`, { headers: h });
      if (r.status === 404) return null;
      if (!r.ok) throw new Error(`GET ${path}: ${r.status} ${await r.text()}`);
      const j: any = await r.json();
      return { content: Buffer.from(j.content, "base64").toString("utf-8"), sha: j.sha };
    },
    async putFile(path: string, content: string, message: string, sha?: string) {
      const body: any = {
        message,
        content: Buffer.from(content, "utf-8").toString("base64"),
        branch: "main",
      };
      if (sha) body.sha = sha;
      const r = await fetch(`${base}/contents/${encodeURIComponent(path)}`, {
        method: "PUT", headers: { ...h, "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error(`PUT ${path}: ${r.status} ${await r.text()}`);
    },
    async deleteFile(path: string, message: string, sha: string) {
      const r = await fetch(`${base}/contents/${encodeURIComponent(path)}`, {
        method: "DELETE", headers: { ...h, "Content-Type": "application/json" },
        body: JSON.stringify({ message, sha, branch: "main" }),
      });
      if (!r.ok && r.status !== 404) throw new Error(`DELETE ${path}: ${r.status} ${await r.text()}`);
    },
    async listTree(): Promise<string[]> {
      const r = await fetch(`${base}/git/trees/main?recursive=1`, { headers: h });
      if (!r.ok) return [];
      const j: any = await r.json();
      return (j.tree || []).filter((n: any) => n.type === "blob").map((n: any) => n.path);
    },
  };
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

  // 1. Read BACKLOG.md
  const backlog = await api.getFile("BACKLOG.md");
  if (!backlog) return NextResponse.json({ error: "BACKLOG.md missing" }, { status: 500 });
  const lines = backlog.content.split("\n");
  const idx = lines.findIndex((l) => l.trim().startsWith("- [ ]"));
  if (idx === -1) return NextResponse.json({ done: "backlog empty" });
  const item = lines[idx].replace(/^\s*- \[ \]\s*/, "").trim();

  // 2. File tree snapshot
  const tree = (await api.listTree()).slice(0, 120).join("\n");

  // 3. Ask Claude
  const client = new Anthropic({ apiKey });
  const sys = `You are AdLab's autonomous code-builder. Output STRICT JSON ONLY:
{
  "summary": "one-line commit message",
  "files": [{ "path": "relative/path.ts", "action": "write|delete", "content": "..." }]
}

Rules:
- Project: Next.js 16 App Router + Tailwind v4 (dark) + TypeScript, deployed on Vercel
- Existing lib: lib/meta.ts, lib/shopify.ts, lib/anthropic.ts, lib/video.ts, lib/db.ts
- Pages: app/page.tsx, app/generate, app/launch, app/spy, app/library
- API: app/api/{generate,poll,launch,spy,transcribe,products,health}
- Auth: proxy.ts (Basic Auth, ADLAB_PASSWORD env). In Next 16 file is proxy.ts and export is named proxy.
- Imports: "@/lib/..." and "@/components/..."
- Output COMPLETE file content per changed file. No partial diffs.
- Minimize new deps. Mention any new dep in summary.
- No comments in JSON. No code fences. No prose.`;

  const user = `Implement this backlog item:
"${item}"

Current file tree (top 120):
${tree}

Return JSON.`;

  let resp;
  try {
    resp = await client.messages.create({
      model: MODEL, max_tokens: 8000, system: sys,
      messages: [{ role: "user", content: user }],
    });
  } catch (e: any) {
    return NextResponse.json({ error: "claude_failed", detail: e.message }, { status: 500 });
  }

  const text = (resp.content.find((b: any) => b.type === "text") as any)?.text || "";
  const jsonStr = extractJSON(text);
  if (!jsonStr) return NextResponse.json({ error: "no_json", preview: text.slice(0, 400) }, { status: 500 });

  let plan: Plan;
  try { plan = JSON.parse(jsonStr); }
  catch (e: any) { return NextResponse.json({ error: "bad_json", detail: e.message, preview: jsonStr.slice(0, 400) }, { status: 500 }); }

  const summary = plan.summary || item;
  const commitMsg = `auto: ${summary}`;

  // 4. Apply file ops
  const applied: string[] = [];
  for (const f of plan.files || []) {
    const existing = await api.getFile(f.path);
    if (f.action === "delete") {
      if (existing) { await api.deleteFile(f.path, commitMsg, existing.sha); applied.push(`-${f.path}`); }
    } else {
      await api.putFile(f.path, f.content || "", commitMsg, existing?.sha);
      applied.push(`+${f.path}`);
    }
  }

  // 5. Tick the backlog item
  lines[idx] = lines[idx].replace("- [ ]", "- [x]");
  await api.putFile("BACKLOG.md", lines.join("\n"), `auto: tick "${item}"`, backlog.sha);

  // 6. Append CHANGELOG.md
  const stamp = new Date().toISOString().slice(0, 10);
  const cl = await api.getFile("CHANGELOG.md");
  const prev = cl?.content || "# Changelog\n\n";
  const newCl = `# Changelog\n\n- ${stamp} — ${summary}\n${prev.replace(/^# Changelog\n+/, "")}`;
  await api.putFile("CHANGELOG.md", newCl, `auto: changelog ${summary}`, cl?.sha);

  return NextResponse.json({ ok: true, item, summary, applied });
}
