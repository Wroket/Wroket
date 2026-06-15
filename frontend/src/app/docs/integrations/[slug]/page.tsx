import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { buildPageMetadata } from "@/lib/seo";

import { IntegrationGuideClient } from "../../_components/IntegrationGuideClient";
import { DOC_GUIDE_SLUGS, getDocGuide } from "../../_components/guideConfigs";

type PageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ section?: string }>;
};

export function generateStaticParams() {
  return DOC_GUIDE_SLUGS.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const guide = getDocGuide(slug);
  if (!guide) return {};
  return buildPageMetadata({
    title: slug === "notion" ? "Guide Notion" : slug === "monday" ? "Guide Monday" : `Guide ${slug}`,
    description:
      slug === "notion"
        ? "Connecter Notion, préparer une base projet, importer contacts ou données vers Wroket."
        : slug === "monday"
          ? "Importer boards Monday en projets, bases ou notes Wroket."
          : slug === "calendar"
            ? "Connecter Google Calendar et Microsoft Outlook à Wroket."
            : `Guide d'intégration ${slug} pour Wroket.`,
    path: `/docs/integrations/${slug}`,
  });
}

export default async function IntegrationGuidePage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const { section } = await searchParams;
  const guide = getDocGuide(slug);
  if (!guide) notFound();
  return <IntegrationGuideClient guide={guide} focusSectionId={section} />;
}
