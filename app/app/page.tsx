import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "דשבורד" };

const navItems = [
  { href: "/autopilot", label: "טייס אוטומטי", icon: "🤖", desc: "מהדבקת קישור מתחרה ועד קמפיין חי במטא בלחיצה אחת" },
  { href: "/app/generate", label: "יצירה", icon: "🎬", desc: "הפקת סרטוני פרסומת מהמוצרים שלך" },
  { href: "/app/brand", label: "מיתוג", icon: "🎨", desc: "לוגו, צבעים, גופן וקול המותג" },
  { href: "/app/spy", label: "ריגול", icon: "🕵️", desc: "ניתוח פרסומות של מתחרים בפייסבוק" },
  { href: "/app/launch", label: "השקה", icon: "🚀", desc: "העלאת קמפיינים למטא" },
  { href: "/app/library", label: "ספרייה", icon: "📚", desc: "הקריאייטיבים השמורים שלך" },
  { href: "/app/drafts", label: "טיוטות", icon: "📝", desc: "אישור טיוטות שנבנו אוטומטית" },
  { href: "/app/costs", label: "עלויות", icon: "💰", desc: "מעקב אחר הוצאות בינה ופרסום" },
];

export default function AppDashboard() {
  return (
    <main className="min-h-screen bg-black text-white">
      <div className="max-w-5xl mx-auto px-6 py-12">
        <div className="mb-10">
          <h1 className="text-3xl font-bold mb-1">
            ברוכים הבאים ל<span className="text-violet-400">AdLab</span>
          </h1>
          <p className="text-white/50">בחרו כלי כדי להתחיל.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="group bg-white/5 hover:bg-violet-600/20 border border-white/10 hover:border-violet-500/40 transition-all rounded-2xl p-6 flex flex-col gap-3"
            >
              <span className="text-3xl">{item.icon}</span>
              <div>
                <div className="font-semibold text-lg group-hover:text-violet-300 transition-colors">
                  {item.label}
                </div>
                <div className="text-white/50 text-sm mt-0.5">{item.desc}</div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
