import type { Metadata } from "next";

import { buildPageMetadata } from "@/lib/seo";

import AgendaTachesPageClient from "./AgendaTachesPageClient";

export const metadata: Metadata = buildPageMetadata({
  title: "Tâches et agenda",
  description:
    "Planifiez vos tâches dans Google Calendar avec Wroket. Wroket priorise pour vous, puis vous bloquez le créneau — plusieurs agendas, créneaux intelligents.",
  path: "/agenda-taches",
});

const BREADCRUMB_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Accueil", item: "https://wroket.com" },
    { "@type": "ListItem", position: 2, name: "Tâches et agenda", item: "https://wroket.com/agenda-taches" },
  ],
} as const;

export default function AgendaTachesPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(BREADCRUMB_JSON_LD) }}
      />
      <AgendaTachesPageClient />
    </>
  );
}
