import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "FlipAI — תמכרו חכם עם AI",
    short_name: "FlipAI",
    description: "בינה מלאכותית להערכת שווי ויצירת מודעות למכירה ביד שנייה.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#fbfbfe",
    theme_color: "#5b5bef",
    lang: "he",
    dir: "rtl",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
