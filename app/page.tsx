import Link from "next/link";

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-black text-white flex flex-col">
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 sm:px-8 py-5 border-b border-white/10">
        <span className="text-xl font-bold tracking-tight">
          Ad<span className="text-violet-400">Lab</span>
        </span>
        <div className="flex items-center gap-4">
          <Link
            href="/app"
            className="text-sm text-white/60 hover:text-white transition-colors"
          >
            כניסה
          </Link>
          <Link
            href="/app"
            className="text-sm bg-violet-600 hover:bg-violet-500 transition-colors px-4 py-2 rounded-lg font-medium"
          >
            התחילו עכשיו
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="flex-1 flex flex-col items-center justify-center text-center px-6 py-24 gap-8">
        <div className="inline-flex items-center gap-2 bg-white/5 border border-white/10 rounded-full px-4 py-1.5 text-sm text-white/70">
          <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
          פלטפורמת פרסום מבוססת בינה
        </div>

        <h1 className="text-5xl sm:text-7xl font-extrabold leading-tight max-w-4xl">
          פרסומות מנצחות,{" "}
          <span className="text-transparent bg-clip-text bg-gradient-to-l from-violet-400 to-fuchsia-400">
            מהר יותר
          </span>
        </h1>

        <p className="text-lg sm:text-xl text-white/50 max-w-2xl leading-relaxed">
          AdLab כותב תסריטים, מפיק סרטוני פרסומת, מנתח את המתחרים ומשיק
          קמפיינים ישירות למטא. הכל ממקום אחד.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 mt-2">
          <Link
            href="/app"
            className="bg-violet-600 hover:bg-violet-500 transition-colors text-white font-semibold px-8 py-3.5 rounded-xl text-base"
          >
            פתחו את הדשבורד
          </Link>
          <a
            href="#features"
            className="border border-white/15 hover:border-white/30 transition-colors text-white/70 hover:text-white font-medium px-8 py-3.5 rounded-xl text-base"
          >
            איך זה עובד
          </a>
        </div>

        <p className="text-sm text-white/30 mt-2">
          מצטרפים חדשים נכנסים בכל שבוע. שריינו את המקום שלכם לפני המתחרים.
        </p>
      </section>

      {/* Trust strip */}
      <section className="border-t border-white/10 px-6 py-8">
        <div className="max-w-4xl mx-auto grid grid-cols-1 sm:grid-cols-3 gap-6 text-center">
          {trust.map((t) => (
            <div key={t.label} className="flex flex-col gap-1">
              <span className="text-2xl font-bold text-violet-400">{t.value}</span>
              <span className="text-sm text-white/50">{t.label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="py-24 px-6 border-t border-white/10">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl sm:text-4xl font-bold text-center mb-16">
            שלושה צעדים לפרסומת שמוכרת
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {steps.map((s, i) => (
              <div
                key={s.title}
                className="bg-white/5 border border-white/10 rounded-2xl p-6 flex flex-col gap-3"
              >
                <span className="w-8 h-8 rounded-full bg-violet-600/20 border border-violet-500/40 text-violet-300 text-sm font-bold flex items-center justify-center">
                  {i + 1}
                </span>
                <h3 className="font-semibold text-lg">{s.title}</h3>
                <p className="text-white/50 text-sm leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-24 px-6 border-t border-white/10">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl sm:text-4xl font-bold text-center mb-16">
            כל מה שצריך כדי להגדיל פרסום בתשלום
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((f) => (
              <div
                key={f.title}
                className="bg-white/5 hover:bg-white/[0.08] transition-colors border border-white/10 rounded-2xl p-6 flex flex-col gap-3"
              >
                <div className="text-3xl">{f.icon}</div>
                <h3 className="font-semibold text-lg">{f.title}</h3>
                <p className="text-white/50 text-sm leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 px-6 border-t border-white/10 text-center">
        <h2 className="text-3xl sm:text-4xl font-bold mb-6">
          מוכנים להשיק את הפרסומת הראשונה שלכם?
        </h2>
        <p className="text-white/50 mb-8 text-lg">
          חברו את חנות השופיפיי ואת חשבון המטא, ותהיו באוויר תוך דקות.
        </p>
        <Link
          href="/app"
          className="inline-block bg-violet-600 hover:bg-violet-500 transition-colors text-white font-semibold px-10 py-4 rounded-xl text-base"
        >
          התחילו עכשיו
        </Link>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/10 px-8 py-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-white/30 text-sm">
        <span>© {new Date().getFullYear()} AdLab. כל הזכויות שמורות.</span>
        <div className="flex gap-6">
          <a href="#" className="hover:text-white/60 transition-colors">פרטיות</a>
          <a href="#" className="hover:text-white/60 transition-colors">תנאי שימוש</a>
          <a href="#" className="hover:text-white/60 transition-colors">צרו קשר</a>
        </div>
      </footer>
    </main>
  );
}

const trust = [
  { value: "דקות", label: "מרעיון לפרסומת מוכנה" },
  { value: "ישירות", label: "השקה לפייסבוק ולאינסטגרם" },
  { value: "ללא צוות", label: "בלי הפקה וצילומים" },
];

const steps = [
  {
    title: "חיבור החנות",
    desc: "מחברים את חנות השופיפיי ואת חשבון המטא פעם אחת, והמערכת מושכת מוצרים ויעדים אוטומטית.",
  },
  {
    title: "הפקת הפרסומת",
    desc: "בוחרים מוצר, והבינה כותבת תסריט, מפיקה סרטון ומלבישה עליו את ערכת המותג שלכם.",
  },
  {
    title: "השקה למטא",
    desc: "מאשרים את הטיוטה ומשיקים קמפיין עם קהל ותקציב מוכנים, הכל בלחיצה אחת.",
  },
];

const features = [
  {
    icon: "🎬",
    title: "יצירת סרטונים בבינה",
    desc: "הפכו כל מוצר מהשופיפיי לסרטון פרסומת מלוטש בלחיצה אחת.",
  },
  {
    icon: "🕵️",
    title: "ריגול אחר מתחרים",
    desc: "משכו ונתחו את הפרסומות הפעילות של כל מתחרה כדי להבין מה עובד בנישה שלכם.",
  },
  {
    icon: "🚀",
    title: "השקה למטא בלחיצה",
    desc: "העלו קמפיינים ישירות לפייסבוק ולאינסטגרם עם קהל, תקציב וקריאייטיב מוכנים מראש.",
  },
  {
    icon: "📝",
    title: "תסריטים שמוכרים",
    desc: "הבינה כותבת תסריטים ממירים שמותאמים למוצר, לקהל ולשפת המותג שלכם.",
  },
  {
    icon: "📚",
    title: "ספריית קריאייטיב",
    desc: "כל סרטון נשמר וניתן לחיפוש, כך שאפשר לשכפל מנצחים בלי להתחיל מאפס.",
  },
  {
    icon: "🎨",
    title: "ערכת מותג",
    desc: "לוגו, צבעים, גופן וקול המותג נשזרים אוטומטית בכל פרסומת שמופקת.",
  },
];
