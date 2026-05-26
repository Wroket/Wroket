import type { Metadata } from "next";

import { buildPageMetadata } from "@/lib/seo";

import TermsPageClient from "./TermsPageClient";

export const metadata: Metadata = buildPageMetadata({
  title: "Conditions d'utilisation",
  description:
    "Conditions générales d'utilisation de Wroket : acceptation, accès au service, propriété intellectuelle, responsabilités, données utilisateurs et résiliation.",
  path: "/terms",
});

const BREADCRUMB_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Accueil", item: "https://wroket.com" },
    {
      "@type": "ListItem",
      position: 2,
      name: "Conditions d'utilisation",
      item: "https://wroket.com/terms",
    },
  ],
} as const;

export default function TermsPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(BREADCRUMB_JSON_LD) }}
      />
      <TermsPageClient />
    </>
  );
}
