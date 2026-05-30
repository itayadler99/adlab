import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { Heebo } from "next/font/google";
import "./globals.css";

const heebo = Heebo({
  subsets: ["hebrew", "latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-heebo",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://adlab-amber.vercel.app"),
  title: {
    default: "AdLab — יצירה והשקה של פרסומות בבינה",
    template: "%s · AdLab",
  },
  description:
    "AdLab כותב תסריטים, מפיק סרטוני פרסומת, מנתח מתחרים ומשיק קמפיינים ישירות למטא. הכל ממקום אחד.",
  openGraph: {
    title: "AdLab — יצירה והשקה של פרסומות בבינה",
    description:
      "כותב תסריטים, מפיק סרטונים, מנתח מתחרים ומשיק קמפיינים למטא. הכל ממקום אחד.",
    type: "website",
    locale: "he_IL",
  },
};

export const viewport: Viewport = {
  themeColor: "#0a0a0a",
  colorScheme: "dark",
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
    <html lang={lang} dir={dir} className={`dark ${heebo.variable}`}>
      <body className="bg-black text-white antialiased font-sans">
        {children}
      </body>
    </html>
  );
}
