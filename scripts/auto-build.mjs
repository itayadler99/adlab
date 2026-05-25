#!/usr/bin/env node
// AdLab autonomous builder — runs in GitHub Actions on schedule.
// 1. Reads BACKLOG.md → picks top unchecked item
// 2. Asks Claude to write the patch as a structured JSON of file ops
// 3. Applies file ops, builds, commits, pushes
// Fails loud if build breaks — never push broken.

import Anthropic from "@anthropic-ai/sdk";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { execSync } from "child_process";
import { dirname } from "path";

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) { console.error("ANTHROPIC_API_KEY not set"); process.exit(1); }

const client = new Anthropic({ apiKey });
const MODEL = "claude-sonnet-4-6";

// 1. Read backlog
const backlog = readFileSync("BACKLOG.md", "utf-8");
const lines = backlog.split("\n");
const idx = lines.findIndex(l => l.trim().startsWith("- [ ]"));
if (idx === -1) {
  console.log("All backlog items done. Nothing to build.");
  process.exit(0);
}
const item = lines[idx].replace(/^\s*- \[ \]\s*/, "").trim();
console.log(`▶ Building: ${item}`);

// 2. Snapshot project tree (top-level only — keep prompt small)
const tree = execSync("git ls-files | head -120", { encoding: "utf-8" });

// 3. Ask Claude for the patch
const sys = `You are AdLab's autonomous code-builder. Output STRICT JSON ONLY:
{
  "summary": "one-line commit message",
  "files": [
    { "path": "relative/path.ts", "action": "write|delete", "content": "..." }
  ]
}

Rules:
- Project: Next.js 16 App Router + Tailwind v4 (dark) + TypeScript, deployed on Vercel
- Existing lib helpers: lib/meta.ts, lib/shopify.ts, lib/anthropic.ts, lib/video.ts, lib/db.ts
- Existing pages: app/page.tsx (dashboard), app/generate, app/launch, app/spy, app/library
- API routes under app/api/{generate,poll,launch,spy,transcribe,products,health}
- Auth via proxy.ts (Basic Auth, ADLAB_PASSWORD env)
- Imports use "@/lib/..." and "@/components/..."
- Output complete file content for every changed file. Do NOT use partial diffs.
- Keep new dependencies to minimum. If you add one, mention it in summary.
- No comments in JSON. No markdown code fences. No trailing prose.`;

const user = `Implement this backlog item:
"${item}"

Current file tree (top 120):
${tree}

Return JSON with the file ops. Be concise but complete.`;

let resp;
try {
  resp = await client.messages.create({
    model: MODEL,
    max_tokens: 8000,
    system: sys,
    messages: [{ role: "user", content: user }],
  });
} catch (e) {
  console.error("Claude API failed:", e.message);
  process.exit(1);
}

const text = resp.content.find(b => b.type === "text").text;
const jsonMatch = text.match(/\{[\s\S]*\}/);
if (!jsonMatch) { console.error("No JSON in response:", text.slice(0, 500)); process.exit(1); }

let plan;
try { plan = JSON.parse(jsonMatch[0]); }
catch (e) { console.error("Bad JSON:", e.message, "\n\n", jsonMatch[0].slice(0, 500)); process.exit(1); }

// 4. Apply
for (const f of plan.files || []) {
  if (f.action === "delete") {
    try { execSync(`rm -f ${JSON.stringify(f.path)}`); console.log("  ✗", f.path); }
    catch (e) {}
  } else {
    const dir = dirname(f.path);
    if (dir && !existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(f.path, f.content);
    console.log("  ✓", f.path);
  }
}

// 5. Update BACKLOG.md (check off the item)
lines[idx] = lines[idx].replace("- [ ]", "- [x]");
writeFileSync("BACKLOG.md", lines.join("\n"));

// 6. Append CHANGELOG.md
const stamp = new Date().toISOString().slice(0, 10);
const changelog = existsSync("CHANGELOG.md") ? readFileSync("CHANGELOG.md", "utf-8") : "# Changelog\n\n";
writeFileSync("CHANGELOG.md", `# Changelog\n\n- ${stamp} — ${plan.summary || item}\n${changelog.replace(/^# Changelog\n+/, "")}`);

// 7. Build
console.log("▶ Building…");
try {
  execSync("npm install --no-audit --no-fund --silent", { stdio: "inherit" });
  execSync("npm run build", { stdio: "inherit" });
} catch (e) {
  console.error("✗ Build failed — rolling back. Push aborted.");
  execSync("git checkout -- .");
  process.exit(1);
}
console.log("✓ Build passed. Commit + push handled by workflow.");
console.log(`__SUMMARY__:${plan.summary || item}`);
