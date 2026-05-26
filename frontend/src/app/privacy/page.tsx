import type { Metadata } from "next";

import { buildPageMetadata } from "@/lib/seo";

import PrivacyPageClient from "./PrivacyPageClient";

export const metadata: Metadata = buildPageMetadata({
  title: "Politique de confidentialité",
  description:
    "Politique de confidentialité Wroket : données collectées, finalités, durée de conservation, droits RGPD et coordonnées du DPO. Conforme aux exigences Google API Services.",
  path: "/privacy",
});

const BREADCRUMB_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Accueil", item: "https://wroket.com" },
    {
      "@type": "ListItem",
      position: 2,
      name: "Politique de confidentialité",
      item: "https://wroket.com/privacy",
    },
  ],
} as const;

export default function PrivacyPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(BREADCRUMB_JSON_LD) }}
      />
      <PrivacyPageClient />
    </>
  );
}
