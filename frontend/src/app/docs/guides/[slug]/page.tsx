import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { buildPageMetadata } from "@/lib/seo";

import { IntegrationGuideClient } from "../../_components/IntegrationGuideClient";
import { DOC_PRODUCT_GUIDE_SLUGS, getDocGuide } from "../../_components/guideConfigs";

type PageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ section?: string }>;
};

const PRODUCT_META: Record<string, { title: string; description: string }> = {
  "premiers-pas": {
    title: "Premiers pas sur Wroket",
    description: "Créer une tâche, réserver un créneau, planifier une réunion et lier une note.",
  },
  projects: {
    title: "Guide Projets Wroket",
    description: "Structurer un projet, utiliser Board, Kanban et Gantt, importer et partager.",
  },
  donnees: {
    title: "Notes, Bases et Données",
    description: "Comprendre les Bases, le bloc-notes, les dossiers et le partage dans Wroket.",
  },
  settings: {
    title: "Guide Paramètres Wroket",
    description: "Profil, sécurité, tâches, intégrations, notifications, abonnement et historique du compte.",
  },
};

export function generateStaticParams() {
  return DOC_PRODUCT_GUIDE_SLUGS.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const guide = getDocGuide(slug);
  if (!guide || guide.category !== "product") return {};
  const meta = PRODUCT_META[slug];
  return buildPageMetadata({
    title: meta?.title ?? `Guide ${slug}`,
    description: meta?.description ?? `Guide produit Wroket : ${slug}.`,
    path: `/docs/guides/${slug}`,
  });
}

export default async function ProductGuidePage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const { section } = await searchParams;
  const guide = getDocGuide(slug);
  if (!guide || guide.category !== "product") notFound();
  return <IntegrationGuideClient guide={guide} focusSectionId={section} />;
}
