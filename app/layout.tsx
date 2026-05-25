import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "AdLab — AI Ad Creative + Meta Launcher",
  description: "Generate UGC ads, score competitors, launch campaigns in one place.",
};

const NAV = [
  { href: "/", label: "Dashboard" },
  { href: "/generate", label: "Generate" },
  { href: "/launch", label: "Launch" },
  { href: "/spy", label: "Spy" },
  { href: "/library", label: "Library" },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased dark">
      <body className="min-h-full bg-neutral-950 text-neutral-100 flex">
        <aside className="w-56 border-r border-neutral-800 p-6 flex flex-col gap-1">
          <div className="text-xl font-bold mb-6 tracking-tight">
            Ad<span className="text-fuchsia-400">Lab</span>
          </div>
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className="px-3 py-2 rounded-md text-sm text-neutral-300 hover:bg-neutral-800 hover:text-white transition"
            >
              {n.label}
            </Link>
          ))}
          <div className="mt-auto text-xs text-neutral-500">
            v0.1 · Montier US
          </div>
        </aside>
        <main className="flex-1 min-h-screen">{children}</main>
      </body>
    </html>
  );
}
