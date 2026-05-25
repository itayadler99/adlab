import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AdLab — AI-powered ad creation & launch",
  description:
    "Generate video ads, spy on competitors, and launch to Meta — all in one place.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="bg-black text-white antialiased">{children}</body>
    </html>
  );
}
