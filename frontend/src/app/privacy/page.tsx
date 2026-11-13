import type { Metadata } from "next";
import Link from "next/link";

import { MarketingHeader } from "@/components/marketing/MarketingHeader";
import { PrivacyPolicyEnglish, PrivacyPolicyFrench } from "@/lib/privacyPolicyBody";
import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "Privacy Policy",
  description:
    "Wroket Privacy Policy: Google user data we access (Calendar scopes), how we use/store/share it, Limited Use, retention and deletion. GDPR contact team@wroket.com.",
  path: "/privacy",
});

const BREADCRUMB_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Home", item: "https://wroket.com" },
    {
      "@type": "ListItem",
      position: 2,
      name: "Privacy Policy",
      item: "https://wroket.com/privacy",
    },
  ],
} as const;

/**
 * Privacy page is server-rendered (no client-only body) so Google's OAuth
 * branding crawler always sees the English Limited Use checklist in HTML.
 */
export default function PrivacyPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(BREADCRUMB_JSON_LD) }}
      />
      <div className="min-h-screen bg-white dark:bg-slate-950 text-zinc-900 dark:text-slate-100">
        <MarketingHeader />

        <main className="max-w-3xl mx-auto px-6 py-12 prose prose-zinc dark:prose-invert">
          <p className="not-prose mb-6 text-sm text-zinc-500 dark:text-slate-400">
            <Link href="/terms" className="hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors">
              Terms of service
            </Link>
            {" · "}
            <span>Privacy Policy</span>
          </p>

          <PrivacyPolicyEnglish />

          <hr className="my-12 border-zinc-200 dark:border-slate-700" />

          <PrivacyPolicyFrench />
        </main>

        <footer className="border-t border-zinc-100 dark:border-slate-800 py-8 mt-8">
          <div className="max-w-3xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-zinc-500 dark:text-slate-400">
            <span>
              <span className="font-semibold text-zinc-700 dark:text-slate-300">Wroket</span>{" "}
              <span>&copy; {new Date().getFullYear()}</span>
            </span>
            <div className="flex items-center gap-6">
              <Link href="/pricing" className="hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors">
                Pricing
              </Link>
              <Link href="/privacy" className="hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors">
                Privacy Policy
              </Link>
              <Link href="/terms" className="hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors">
                Terms
              </Link>
              <a
                href="mailto:team@wroket.com"
                className="hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
              >
                team@wroket.com
              </a>
            </div>
          </div>
        </footer>
      </div>
    </>
  );
}
