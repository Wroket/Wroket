import type { Metadata } from "next";

import { buildPageMetadata } from "@/lib/seo";

import GestionTachesEquipePageClient from "./GestionTachesEquipePageClient";

export const metadata: Metadata = buildPageMetadata({
  title: "Gestion de tâches en équipe",
  description:
    "Collaborez sur vos tâches avec Wroket : équipes, assignation, @mentions, webhooks Slack et Teams. Wroket priorise pour vous — travaillez efficacement. Ensemble.",
  path: "/gestion-taches-equipe",
});

const BREADCRUMB_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Accueil", item: "https://wroket.com" },
    {
      "@type": "ListItem",
      position: 2,
      name: "Gestion de tâches en équipe",
      item: "https://wroket.com/gestion-taches-equipe",
    },
  ],
} as const;

export default function GestionTachesEquipePage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(BREADCRUMB_JSON_LD) }}
      />
      <GestionTachesEquipePageClient />
    </>
  );
}
