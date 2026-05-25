import Link from "next/link";

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-black text-white flex flex-col">
      {/* Nav */}
      <nav className="flex items-center justify-between px-8 py-5 border-b border-white/10">
        <span className="text-xl font-bold tracking-tight">
          Ad<span className="text-violet-400">Lab</span>
        </span>
        <div className="flex items-center gap-4">
          <Link
            href="/app"
            className="text-sm text-white/60 hover:text-white transition-colors"
          >
            Sign in
          </Link>
          <Link
            href="/app"
            className="text-sm bg-violet-600 hover:bg-violet-500 transition-colors px-4 py-2 rounded-lg font-medium"
          >
            Get started
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="flex-1 flex flex-col items-center justify-center text-center px-6 py-24 gap-8">
        <div className="inline-flex items-center gap-2 bg-violet-950/60 border border-violet-500/30 rounded-full px-4 py-1.5 text-sm text-violet-300 mb-2">
          <span className="w-2 h-2 rounded-full bg-violet-400 animate-pulse" />
          AI-powered ad creation & launch
        </div>

        <h1 className="text-5xl sm:text-7xl font-extrabold leading-tight max-w-4xl">
          Ship winning ads{" "}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-400 to-fuchsia-400">
            10× faster
          </span>
        </h1>

        <p className="text-lg sm:text-xl text-white/50 max-w-2xl">
          AdLab generates video scripts, produces creatives, spies on
          competitors, and launches directly to Meta — all from one dashboard.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 mt-2">
          <Link
            href="/app"
            className="bg-violet-600 hover:bg-violet-500 transition-colors text-white font-semibold px-8 py-3.5 rounded-xl text-base"
          >
            Open dashboard →
          </Link>
          <a
            href="#features"
            className="border border-white/15 hover:border-white/30 transition-colors text-white/70 hover:text-white font-medium px-8 py-3.5 rounded-xl text-base"
          >
            See how it works
          </a>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-24 px-6 border-t border-white/10">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl sm:text-4xl font-bold text-center mb-16">
            Everything you need to scale paid ads
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((f) => (
              <div
                key={f.title}
                className="bg-white/5 hover:bg-white/8 transition-colors border border-white/10 rounded-2xl p-6 flex flex-col gap-3"
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
          Ready to launch your first AI ad?
        </h2>
        <p className="text-white/50 mb-8 text-lg">
          Connect your Shopify store and Meta account — be live in minutes.
        </p>
        <Link
          href="/app"
          className="inline-block bg-violet-600 hover:bg-violet-500 transition-colors text-white font-semibold px-10 py-4 rounded-xl text-base"
        >
          Start for free →
        </Link>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/10 px-8 py-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-white/30 text-sm">
        <span>
          © {new Date().getFullYear()} AdLab. All rights reserved.
        </span>
        <div className="flex gap-6">
          <a href="#" className="hover:text-white/60 transition-colors">Privacy</a>
          <a href="#" className="hover:text-white/60 transition-colors">Terms</a>
          <a href="#" className="hover:text-white/60 transition-colors">Contact</a>
        </div>
      </footer>
    </main>
  );
}

const features = [
  {
    icon: "🎬",
    title: "AI Video Generation",
    desc: "Turn any Shopify product into a polished video ad with a single click using Claude + Replicate.",
  },
  {
    icon: "🕵️",
    title: "Competitor Spy Tool",
    desc: "Scrape and analyse any competitor's running Facebook ads to understand what's working in your niche.",
  },
  {
    icon: "🚀",
    title: "One-Click Meta Launch",
    desc: "Push campaigns directly to Facebook & Instagram with pre-filled targeting, budgets, and creatives.",
  },
  {
    icon: "📝",
    title: "AI Ad Scripts",
    desc: "Claude writes high-converting scripts tailored to your product, audience, and tone of voice.",
  },
  {
    icon: "📚",
    title: "Creative Library",
    desc: "Every generated video is saved and searchable so you can remix winners without starting over.",
  },
  {
    icon: "⚙️",
    title: "Auto-Build Cron",
    desc: "Schedule nightly ad drafts that are automatically created and queued for your review each morning.",
  },
];
