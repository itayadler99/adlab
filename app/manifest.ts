import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "AdLab",
    short_name: "AdLab",
    description:
      "יצירה והשקה של פרסומות בבינה. תסריטים, סרטונים, ניתוח מתחרים והשקה למטא.",
    start_url: "/app",
    display: "standalone",
    background_color: "#0a0a0a",
    theme_color: "#0a0a0a",
    lang: "he",
    dir: "rtl",
    icons: [{ src: "/favicon.ico", sizes: "any", type: "image/x-icon" }],
  };
}
