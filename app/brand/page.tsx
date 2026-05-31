"use client";

import { useEffect, useState } from "react";
import {
  BRAND_FONTS,
  fetchBrandKit,
  isHex,
  saveBrandKit,
  type BrandKit,
} from "@/lib/brand";

interface Store {
  id: string;
  name: string;
  configured: boolean;
}

const EMPTY: BrandKit = {
  storeId: "",
  logoUrl: "",
  primaryHex: "#0a0a0a",
  secondaryHex: "#d4af37",
  fontFamily: "Heebo",
  voiceId: "",
};

export default function BrandPage() {
  const [stores, setStores] = useState<Store[]>([]);
  const [storeId, setStoreId] = useState("");
  const [kit, setKit] = useState<BrandKit>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ kind: "ok" | "warn" | "err"; msg: string } | null>(null);

  useEffect(() => {
    fetch("/api/stores")
      .then((r) => r.json())
      .then((j) => setStores(j.stores ?? []))
      .catch(() => {});
  }, []);

  async function loadStore(id: string) {
    setStoreId(id);
    setNotice(null);
    if (!id) {
      setKit(EMPTY);
      return;
    }
    setLoading(true);
    try {
      const loaded = await fetchBrandKit(id);
      setKit({ ...EMPTY, ...loaded, storeId: id });
    } catch (e) {
      setNotice({ kind: "err", msg: e instanceof Error ? e.message : "שגיאה" });
      setKit({ ...EMPTY, storeId: id });
    } finally {
      setLoading(false);
    }
  }

  function update<K extends keyof BrandKit>(key: K, value: BrandKit[K]) {
    setKit((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    if (!storeId) return;
    if (kit.primaryHex && !isHex(kit.primaryHex)) {
      setNotice({ kind: "err", msg: "צבע ראשי חייב להיות בפורמט ‎#rrggbb" });
      return;
    }
    if (kit.secondaryHex && !isHex(kit.secondaryHex)) {
      setNotice({ kind: "err", msg: "צבע משני חייב להיות בפורמט ‎#rrggbb" });
      return;
    }
    setSaving(true);
    setNotice(null);
    try {
      const saved = await saveBrandKit({ ...kit, storeId });
      setKit({ ...EMPTY, ...saved, storeId });
      setNotice({ kind: "ok", msg: "ערכת המותג נשמרה" });
    } catch (e) {
      setNotice({ kind: "warn", msg: e instanceof Error ? e.message : "השמירה נכשלה" });
    } finally {
      setSaving(false);
    }
  }

  const noticeColor =
    notice?.kind === "ok"
      ? "border-green-700 bg-green-950/40 text-green-300"
      : notice?.kind === "warn"
      ? "border-amber-700 bg-amber-950/40 text-amber-300"
      : "border-red-700 bg-red-950/40 text-red-300";

  return (
    <main className="min-h-screen bg-black text-white p-6 md:p-10">
      <div className="max-w-3xl mx-auto space-y-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">ערכת מותג</h1>
          <p className="mt-1 text-white/50 text-sm">
            לוגו, צבעים, גופן וקול המותג נשזרים בכל פרסומת שמופקת לחנות.
          </p>
        </div>

        {/* Store picker */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-white/70">חנות</label>
          <select
            value={storeId}
            onChange={(e) => loadStore(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
          >
            <option value="">בחרו חנות</option>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        {notice && (
          <div className={`rounded-lg border p-3 text-sm ${noticeColor}`}>
            {notice.msg}
          </div>
        )}

        {storeId && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Form */}
            <div className={`space-y-6 ${loading ? "opacity-50 pointer-events-none" : ""}`}>
              {/* Logo */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-white/70">קישור ללוגו</label>
                <input
                  type="url"
                  value={kit.logoUrl ?? ""}
                  onChange={(e) => update("logoUrl", e.target.value)}
                  placeholder="https://cdn.shopify.com/.../logo.png"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-violet-500 ltr-island"
                />
                <p className="text-xs text-white/30">לוגו בהיר על רקע שקוף עובד הכי טוב.</p>
              </div>

              {/* Colors */}
              <div className="grid grid-cols-2 gap-4">
                <ColorField
                  label="צבע ראשי"
                  value={kit.primaryHex ?? "#0a0a0a"}
                  onChange={(v) => update("primaryHex", v)}
                />
                <ColorField
                  label="צבע משני"
                  value={kit.secondaryHex ?? "#d4af37"}
                  onChange={(v) => update("secondaryHex", v)}
                />
              </div>

              {/* Font */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-white/70">גופן</label>
                <select
                  value={kit.fontFamily ?? "Heebo"}
                  onChange={(e) => update("fontFamily", e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                >
                  {BRAND_FONTS.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              </div>

              {/* Voice */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-white/70">
                  מזהה קול <span className="text-white/30 font-normal">(אופציונלי)</span>
                </label>
                <input
                  type="text"
                  value={kit.voiceId ?? ""}
                  onChange={(e) => update("voiceId", e.target.value)}
                  placeholder="21m00Tcm4TlvDq8ikWAM"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-violet-500 ltr-island"
                />
                <p className="text-xs text-white/30">מזהה קול מ‑ElevenLabs לדיבוב הפרסומות.</p>
              </div>

              <button
                onClick={handleSave}
                disabled={saving}
                className="w-full bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed px-6 py-3 rounded-lg font-semibold transition-colors"
              >
                {saving ? "שומר" : "שמירת ערכת המותג"}
              </button>
            </div>

            {/* Live preview */}
            <div className="space-y-3">
              <label className="block text-sm font-medium text-white/70">תצוגה מקדימה</label>
              <div
                className="rounded-2xl border border-white/10 p-6 flex flex-col gap-5 min-h-64"
                style={{ backgroundColor: kit.primaryHex || "#0a0a0a" }}
              >
                <div className="flex items-center justify-between">
                  {kit.logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={kit.logoUrl} alt="לוגו" className="h-8 object-contain" />
                  ) : (
                    <span className="text-sm text-white/40">הלוגו יופיע כאן</span>
                  )}
                  <span
                    className="text-xs font-semibold px-2.5 py-1 rounded-full"
                    style={{
                      color: kit.primaryHex || "#0a0a0a",
                      backgroundColor: kit.secondaryHex || "#d4af37",
                    }}
                  >
                    חדש
                  </span>
                </div>
                <div
                  className="mt-auto"
                  style={{ fontFamily: `${kit.fontFamily || "Heebo"}, sans-serif` }}
                >
                  <p className="text-2xl font-bold text-white leading-snug">
                    הקולקציה שכולם מדברים עליה.
                  </p>
                  <p
                    className="mt-2 font-semibold"
                    style={{ color: kit.secondaryHex || "#d4af37" }}
                  >
                    לרכישה עכשיו
                  </p>
                </div>
              </div>
              <p className="text-xs text-white/30">
                כך ייראו הצבעים, הגופן והלוגו על גבי הפרסומת.
              </p>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const safe = /^#[0-9a-f]{6}$/i.test(value) ? value : "#000000";
  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-white/70">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={safe}
          onChange={(e) => onChange(e.target.value)}
          className="h-10 w-12 shrink-0 rounded-lg border border-white/10 bg-transparent cursor-pointer"
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-violet-500 ltr-island"
        />
      </div>
    </div>
  );
}
