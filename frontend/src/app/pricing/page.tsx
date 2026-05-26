import type { Metadata } from "next";

import { buildPageMetadata } from "@/lib/seo";

import PricingPageClient from "./PricingPageClient";

export const metadata: Metadata = buildPageMetadata({
  title: "Tarifs",
  description:
    "Découvrez les paliers Wroket : Free pour démarrer, First pour la puissance produit, Small teams et Large orgs pour la collaboration et le reporting.",
  path: "/pricing",
});

const BREADCRUMB_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Accueil", item: "https://wroket.com" },
    { "@type": "ListItem", position: 2, name: "Tarifs", item: "https://wroket.com/pricing" },
  ],
} as const;

export default function PricingPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(BREADCRUMB_JSON_LD) }}
      />
      <PricingPageClient />
    </>
  );
}
