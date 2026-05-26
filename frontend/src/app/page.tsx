import type { Metadata } from "next";

import { buildPageMetadata } from "@/lib/seo";

import HomePageClient from "./HomePageClient";

const TITLE = "Wroket — Travaillez efficacement. Ensemble.";
const DESCRIPTION =
  "Wroket réunit tâches, agenda et notes pour les équipes performantes. Priorisez avec la matrice d'Eisenhower, planifiez avec Google Calendar et Microsoft 365, collaborez en temps réel.";

export const metadata: Metadata = buildPageMetadata({
  title: { absolute: TITLE },
  description: DESCRIPTION,
  path: "/",
  shareDescription: "Tâches, agenda et notes pour les équipes performantes.",
});

// SoftwareApplication JSON-LD — surfaces Wroket as an installable web app in
// Google's rich results. Pricing is summarized as a free tier (the only fixed
// price today); the other plans are quote-on-request and intentionally omitted
// to avoid declaring a price we don't honour.
const SOFTWARE_APP_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Wroket",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  url: "https://wroket.com",
  description: DESCRIPTION,
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "EUR",
    availability: "https://schema.org/InStock",
  },
} as const;

export default function HomePage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(SOFTWARE_APP_JSON_LD) }}
      />
      <HomePageClient />
    </>
  );
}
