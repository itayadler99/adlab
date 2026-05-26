import Link from "next/link";

const navItems = [
  { href: "/autopilot", label: "Autopilot", icon: "🤖", desc: "Paste competitor URL → live Meta campaign in one click" },
  { href: "/app/generate", label: "Generate", icon: "🎬", desc: "Create video ads from your products" },
  { href: "/app/spy", label: "Spy", icon: "🕵️", desc: "Analyse competitor Facebook ads" },
  { href: "/app/launch", label: "Launch", icon: "🚀", desc: "Push campaigns to Meta" },
  { href: "/app/library", label: "Library", icon: "📚", desc: "Browse your saved creatives" },
  { href: "/app/drafts", label: "Drafts", icon: "📝", desc: "Review auto-built ad drafts" },
  { href: "/app/costs", label: "Costs", icon: "💰", desc: "Track AI & ad spend" },
];

export default function AppDashboard() {
  return (
    <main className="min-h-screen bg-black text-white">
      <div className="max-w-5xl mx-auto px-6 py-12">
        <div className="mb-10">
          <h1 className="text-3xl font-bold mb-1">
            Welcome to <span className="text-violet-400">AdLab</span>
          </h1>
          <p className="text-white/50">Choose a tool to get started.</p>
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
