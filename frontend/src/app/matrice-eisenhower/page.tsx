import type { Metadata } from "next";

import { buildPageMetadata } from "@/lib/seo";

import MatriceEisenhowerPageClient from "./MatriceEisenhowerPageClient";

export const metadata: Metadata = buildPageMetadata({
  title: "Matrice d'Eisenhower automatique",
  description:
    "La matrice d'Eisenhower calculée pour vous : Vue Radar Wroket, quadrants automatiques, quatre lentilles. Wroket priorise pour vous — puis bloquez le créneau dans votre agenda.",
  path: "/matrice-eisenhower",
});

const BREADCRUMB_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Accueil", item: "https://wroket.com" },
    {
      "@type": "ListItem",
      position: 2,
      name: "Matrice d'Eisenhower",
      item: "https://wroket.com/matrice-eisenhower",
    },
  ],
} as const;

export default function MatriceEisenhowerPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(BREADCRUMB_JSON_LD) }}
      />
      <MatriceEisenhowerPageClient />
    </>
  );
}
