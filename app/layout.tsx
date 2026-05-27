import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export const metadata: Metadata = {
  title: "AdLab — AI-powered ad creation & launch",
  description:
    "Generate video ads, spy on competitors, and launch to Meta — all in one place.",
};

// Default to Hebrew RTL — the primary audience. Admin pages can override per
// request via the `x-lang` header (English admin tools, etc.). Cookie-based
// switching can be layered later without changing this file.
async function resolveLang(): Promise<{ lang: "he" | "en"; dir: "rtl" | "ltr" }> {
  try {
    const h = await headers();
    const override = h.get("x-lang");
    if (override === "en") return { lang: "en", dir: "ltr" };
  } catch {
    /* SSR fallback */
  }
  return { lang: "he", dir: "rtl" };
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { lang, dir } = await resolveLang();
  return (
    <html lang={lang} dir={dir} className="dark">
      <head>
        <link
          rel="preconnect"
          href="https://fonts.googleapis.com"
        />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Heebo:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-black text-white antialiased font-sans">
        {children}
      </body>
    </html>
  );
}
