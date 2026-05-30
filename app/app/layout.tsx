import Link from "next/link";
import { ReactNode } from "react";
import { AppNav } from "@/components/AppNav";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      <header className="border-b border-white/10 px-6 py-4 flex items-center gap-8">
        <Link href="/app" className="text-lg font-bold tracking-tight shrink-0">
          Ad<span className="text-violet-400">Lab</span>
        </Link>
        <AppNav />
        <div className="ms-auto shrink-0">
          <Link
            href="/"
            className="text-xs text-white/30 hover:text-white/60 transition-colors"
          >
            לדף הבית
          </Link>
        </div>
      </header>
      <div className="flex-1">{children}</div>
    </div>
  );
}
