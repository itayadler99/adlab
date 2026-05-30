"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navLinks = [
  { href: "/app/generate", label: "יצירה" },
  { href: "/app/brand", label: "מיתוג" },
  { href: "/app/spy", label: "ריגול" },
  { href: "/app/launch", label: "השקה" },
  { href: "/app/library", label: "ספרייה" },
  { href: "/app/drafts", label: "טיוטות" },
  { href: "/app/costs", label: "עלויות" },
];

export function AppNav() {
  const pathname = usePathname();
  return (
    <nav className="flex items-center gap-1 overflow-x-auto" aria-label="ניווט ראשי">
      {navLinks.map((l) => {
        const active = pathname === l.href || pathname.startsWith(l.href + "/");
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={`text-sm transition-colors px-3 py-1.5 rounded-lg whitespace-nowrap ${
              active
                ? "text-white bg-white/10 font-medium"
                : "text-white/60 hover:text-white hover:bg-white/10"
            }`}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
