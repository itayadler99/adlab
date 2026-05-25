import Link from "next/link";
import { ReactNode } from "react";

const navLinks = [
  { href: "/app/generate", label: "Generate" },
  { href: "/app/spy", label: "Spy" },
  { href: "/app/launch", label: "Launch" },
  { href: "/app/library", label: "Library" },
  { href: "/app/drafts", label: "Drafts" },
  { href: "/app/costs", label: "Costs" },
];

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      <header className="border-b border-white/10 px-6 py-4 flex items-center gap-8">
        <Link href="/app" className="text-lg font-bold tracking-tight shrink-0">
          Ad<span className="text-violet-400">Lab</span>
        </Link>
        <nav className="flex items-center gap-1 overflow-x-auto">
          {navLinks.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="text-sm text-white/60 hover:text-white hover:bg-white/10 transition-colors px-3 py-1.5 rounded-lg whitespace-nowrap"
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto shrink-0">
          <Link
            href="/"
            className="text-xs text-white/30 hover:text-white/60 transition-colors"
          >
            ← Home
          </Link>
        </div>
      </header>
      <div className="flex-1">{children}</div>
    </div>
  );
}
