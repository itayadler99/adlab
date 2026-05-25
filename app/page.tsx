import Link from "next/link";
import { headers } from "next/headers";

const TILES = [
  { href: "/generate", title: "Generate", blurb: "AI scripts + video creative for your Shopify products.", color: "bg-fuchsia-500/10 border-fuchsia-500/30" },
  { href: "/launch", title: "Launch", blurb: "Push creative straight to Meta as a paused campaign.", color: "bg-emerald-500/10 border-emerald-500/30" },
  { href: "/spy", title: "Spy", blurb: "Paste any ad URL — get hook, transcript and steal-this notes.", color: "bg-amber-500/10 border-amber-500/30" },
  { href: "/library", title: "Library", blurb: "Every generated asset and analyzed competitor.", color: "bg-sky-500/10 border-sky-500/30" },
];

type HealthStatus = { key: string; feature: string; set: boolean; optional?: boolean };

async function getHealth(): Promise<{ ready: boolean; status: HealthStatus[] } | null> {
  try {
    const h = await headers();
    const host = h.get("host") || "localhost:3000";
    const proto = host.includes("localhost") ? "http" : "https";
    const res = await fetch(`${proto}://${host}/api/health`, { cache: "no-store" });
    return res.json();
  } catch {
    return null;
  }
}

export default async function Home() {
  const health = await getHealth();
  return (
    <div className="p-10 max-w-5xl">
      <h1 className="text-3xl font-bold tracking-tight">AdLab</h1>
      <p className="text-neutral-400 mt-2">
        One workflow: spy on what wins → generate your own → launch on Meta.
      </p>

      {health && (
        <div className="mt-6 rounded-lg border border-neutral-800 bg-neutral-900/50 p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className={`h-2 w-2 rounded-full ${health.ready ? "bg-emerald-400" : "bg-amber-400"}`} />
            <span className="text-sm font-medium">{health.ready ? "All systems ready" : "Setup incomplete"}</span>
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
            {health.status.map((s) => (
              <div key={s.key} className="flex items-center gap-2">
                <span className={s.set ? "text-emerald-400" : s.optional ? "text-neutral-500" : "text-rose-400"}>
                  {s.set ? "✓" : s.optional ? "○" : "✗"}
                </span>
                <span className="text-neutral-400">{s.key}</span>
                <span className="text-neutral-600">— {s.feature}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 mt-8">
        {TILES.map((t) => (
          <Link key={t.href} href={t.href}
            className={`rounded-xl border ${t.color} p-6 hover:-translate-y-0.5 transition`}>
            <div className="text-xl font-semibold">{t.title}</div>
            <div className="text-sm text-neutral-300 mt-1">{t.blurb}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
