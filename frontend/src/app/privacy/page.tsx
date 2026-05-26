import type { Metadata } from "next";

import PrivacyPageClient from "./PrivacyPageClient";

const TITLE = "Politique de confidentialité";
const FULL_TITLE = "Politique de confidentialité — Wroket";
const DESCRIPTION =
  "Politique de confidentialité Wroket : données collectées, finalités, durée de conservation, droits RGPD et coordonnées du DPO. Conforme aux exigences Google API Services.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/privacy" },
  openGraph: {
    title: FULL_TITLE,
    description: DESCRIPTION,
    url: "/privacy",
  },
  twitter: {
    title: FULL_TITLE,
    description: DESCRIPTION,
  },
};

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
