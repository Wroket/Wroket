import type { MetadataRoute } from "next";

import { SITE_DESCRIPTION_FR } from "@/lib/seo";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Wroket",
    short_name: "Wroket",
    description: SITE_DESCRIPTION_FR,
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#ffffff",
    theme_color: "#0f172a",
    lang: "fr",
    dir: "ltr",
    categories: ["productivity", "business"],
    icons: [
      {
        src: "/wroket-icon-v4.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/wroket-icon-v4.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/wroket-icon-v4.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      {
        name: "Mes tâches",
        short_name: "Tâches",
        url: "/todos",
        icons: [{ src: "/wroket-icon-v4.png", sizes: "192x192", type: "image/png" }],
      },
      {
        name: "Agenda",
        short_name: "Agenda",
        url: "/agenda",
        icons: [{ src: "/wroket-icon-v4.png", sizes: "192x192", type: "image/png" }],
      },
      {
        name: "Dashboard",
        short_name: "Accueil",
        url: "/dashboard",
        icons: [{ src: "/wroket-icon-v4.png", sizes: "192x192", type: "image/png" }],
      },
    ],
  };
}
