import type { Metadata } from "next";

import TermsPageClient from "./TermsPageClient";

const TITLE = "Conditions d'utilisation";
const FULL_TITLE = "Conditions d'utilisation — Wroket";
const DESCRIPTION =
  "Conditions générales d'utilisation de Wroket : acceptation, accès au service, propriété intellectuelle, responsabilités, données utilisateurs et résiliation.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/terms" },
  openGraph: {
    title: FULL_TITLE,
    description: DESCRIPTION,
    url: "/terms",
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
