import type { Metadata } from "next";

/**
 * Centralised builder for per-page Next.js metadata so every public page
 * ships a complete `openGraph` and `twitter` block.
 *
 * Why this exists: Next.js merges scalar metadata fields with their parent
 * (layout) but REPLACES object fields like `openGraph` and `twitter` wholesale
 * (see the App Router docs — "Fields are not deeply merged; they are
 * replaced"). The first SEO ship hit exactly that footgun: pages re-declared
 * `openGraph: { title, description, url }` and silently lost the `images`,
 * `locale`, `siteName`, `type` declared once in `layout.tsx`. Same for the
 * Twitter card (which fell back to `summary` instead of `summary_large_image`).
 *
 * Using this helper instead of an inline object literal guarantees every page
 * carries the full OG / Twitter payload required by social previews and SEO.
 */

const SITE_URL = "https://wroket.com";
const SITE_NAME = "Wroket";
const OG_IMAGE = "/og.png";
const OG_IMAGE_ALT = "Wroket — Travaillez efficacement. Ensemble.";

export interface PageMetadataInput {
  /**
   * Page-specific title fragment. Combined with the layout `title.template` to
   * produce e.g. "Tarifs — Wroket". Pass `{ absolute }` to skip the template
   * (used on the homepage to keep the brand promise as the only title).
   */
  title: string | { absolute: string };
  /** Description for `<meta name="description">` and social cards. */
  description: string;
  /** Canonical path on the marketing site (leading slash). */
  path: `/${string}`;
  /**
   * Optional override for the OG/Twitter title when it differs from the
   * navigator title (e.g. homepage uses the absolute brand line everywhere).
   */
  shareTitle?: string;
  /**
   * Optional override for the OG/Twitter description when the meta description
   * is too long or too "SEO" for social audiences.
   */
  shareDescription?: string;
}

export function buildPageMetadata({
  title,
  description,
  path,
  shareTitle,
  shareDescription,
}: PageMetadataInput): Metadata {
  const resolvedShareTitle =
    shareTitle ??
    (typeof title === "string" ? `${title} — Wroket` : title.absolute);
  const resolvedShareDescription = shareDescription ?? description;
  const absoluteUrl = `${SITE_URL}${path === "/" ? "" : path}`;

  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      type: "website",
      locale: "fr_FR",
      url: absoluteUrl,
      siteName: SITE_NAME,
      title: resolvedShareTitle,
      description: resolvedShareDescription,
      images: [
        {
          url: OG_IMAGE,
          width: 1200,
          height: 630,
          alt: OG_IMAGE_ALT,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: resolvedShareTitle,
      description: resolvedShareDescription,
      images: [OG_IMAGE],
    },
  };
}
