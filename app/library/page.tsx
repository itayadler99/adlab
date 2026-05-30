import { listAll } from "@/lib/db";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "ספרייה" };

export const dynamic = "force-dynamic";

export default async function LibraryPage() {
  const data = await listAll();
  if (!data) {
    return (
      <div className="p-10 max-w-3xl">
        <h1 className="text-2xl font-bold">ספרייה</h1>
        <div className="mt-10 border border-dashed border-amber-500/40 bg-amber-500/5 rounded-xl p-6 text-amber-300 text-sm">
          Supabase לא מוגדר. יש להוסיף את משתני הסביבה{" "}
          <code className="ltr-island">SUPABASE_URL</code> ו
          <code className="ltr-island">SUPABASE_SERVICE_KEY</code>, ולהריץ את{" "}
          <code className="ltr-island">supabase/schema.sql</code> בפרויקט.
        </div>
      </div>
    );
  }
  return (
    <div className="p-10 max-w-5xl">
      <h1 className="text-2xl font-bold">ספרייה</h1>
      <p className="text-neutral-400 text-sm mt-1">
        {data.videos.length} סרטונים · {data.ads.length} פרסומות שנותחו · {data.campaigns.length} קמפיינים שהושקו
      </p>

      <Section title={`סרטונים שנוצרו (${data.videos.length})`}>
        <div className="grid grid-cols-3 gap-3">
          {data.videos.map((v: any) => (
            <div key={v.id} className="rounded-lg border border-neutral-800 p-3">
              <div className="aspect-[9/16] bg-neutral-900 rounded overflow-hidden mb-2">
                {v.video_url ? <video src={v.video_url} controls className="w-full h-full object-cover" /> : <div className="flex h-full items-center justify-center text-xs text-neutral-500">{v.status === "pending" || !v.status ? "בהמתנה" : v.status}</div>}
              </div>
              <div className="text-xs text-neutral-300 truncate">{v.product_title}</div>
              <div className="text-[10px] text-neutral-500 ltr-island">{v.model} · {v.style}</div>
            </div>
          ))}
        </div>
      </Section>

      <Section title={`פרסומות שנותחו (${data.ads.length})`}>
        <div className="space-y-2">
          {data.ads.map((a: any) => (
            <div key={a.id} className="rounded-lg border border-neutral-800 p-3 text-sm">
              <div className="flex justify-between gap-3">
                <div className="truncate flex-1 text-neutral-400 ltr-island">{a.source_url || "(ללא קישור)"}</div>
                <div className="text-amber-300 font-bold">{a.overall}/10</div>
              </div>
              <div className="text-xs text-neutral-500 mt-1">וו {a.hook_score} · שימור {a.retention_score} · קריאה לפעולה {a.cta_score}</div>
            </div>
          ))}
        </div>
      </Section>

      <Section title={`קמפיינים שהושקו (${data.campaigns.length})`}>
        <div className="space-y-2">
          {data.campaigns.map((c: any) => (
            <div key={c.id} className="rounded-lg border border-neutral-800 p-3 text-sm">
              <div className="font-medium">{c.name}</div>
              <div className="text-xs text-neutral-500">${c.daily_budget} ליום · {(c.countries || []).join(", ")} · <span className="ltr-island">{c.meta_campaign_id}</span></div>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-sm font-semibold text-neutral-400 uppercase tracking-wide mb-3">{title}</h2>
      {children}
    </section>
  );
}
