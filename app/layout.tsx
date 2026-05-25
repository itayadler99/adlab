import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Link from "next/link";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AdLab",
  description: "AI-powered ad generation",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${
          geistSans.variable
        } ${geistMono.variable} antialiased bg-gray-950 text-white`}
      >
        <nav className="border-b border-gray-800 bg-gray-950 sticky top-0 z-50">
          <div className="max-w-6xl mx-auto px-4 h-14 flex items-center gap-6">
            <Link href="/" className="font-bold text-lg tracking-tight text-white">
              AdLab
            </Link>
            <Link href="/generate" className="text-sm text-gray-400 hover:text-white transition-colors">
              Generate
            </Link>
            <Link href="/launch" className="text-sm text-gray-400 hover:text-white transition-colors">
              Launch
            </Link>
            <Link href="/spy" className="text-sm text-gray-400 hover:text-white transition-colors">
              Spy
            </Link>
            <Link href="/library" className="text-sm text-gray-400 hover:text-white transition-colors">
              Library
            </Link>
            <Link href="/costs" className="text-sm text-gray-400 hover:text-white transition-colors">
              Costs
            </Link>
          </div>
        </nav>
        {children}
      </body>
    </html>
  );
}
