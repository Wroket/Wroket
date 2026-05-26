import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { LocaleProvider } from "@/lib/LocaleContext";
import { ToastProvider } from "@/components/Toast";
import { AuthProvider } from "@/components/AuthContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const SITE_URL = "https://wroket.com";
const SITE_NAME = "Wroket";
const DEFAULT_TITLE = "Wroket — Travaillez efficacement. Ensemble.";
const DEFAULT_DESCRIPTION =
  "Wroket réunit tâches, agenda et notes pour les équipes performantes. Priorisez avec la matrice d'Eisenhower, planifiez avec Google Calendar et Microsoft 365, collaborez en temps réel.";
const OG_DESCRIPTION = "Tâches, agenda et notes pour les équipes performantes.";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0f172a" },
  ],
};

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: DEFAULT_TITLE,
    template: "%s — Wroket",
  },
  description: DEFAULT_DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: [
    "gestion de tâches",
    "agenda",
    "notes",
    "collaboration",
    "équipe",
    "productivité",
    "matrice Eisenhower",
    "Google Calendar",
    "Microsoft 365",
  ],
  authors: [{ name: SITE_NAME }],
  creator: SITE_NAME,
  publisher: SITE_NAME,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "fr_FR",
    url: SITE_URL,
    siteName: SITE_NAME,
    title: DEFAULT_TITLE,
    description: OG_DESCRIPTION,
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "Wroket — Travaillez efficacement. Ensemble.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: DEFAULT_TITLE,
    description: OG_DESCRIPTION,
    images: ["/og.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-snippet": -1,
      "max-image-preview": "large",
      "max-video-preview": -1,
    },
  },
};

// Organization JSON-LD — global on every page so Google can associate the brand
// with the site (knowledge panel / sitelinks). Per-page schemas (SoftwareApplication,
// BreadcrumbList) are injected in their respective Server Component wrappers.
const ORG_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: SITE_NAME,
  url: SITE_URL,
  logo: `${SITE_URL}/wroket-logo.png`,
  sameAs: [] as string[],
} as const;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="fr"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(ORG_JSON_LD) }}
        />
        <LocaleProvider>
          <ToastProvider>
            <AuthProvider>
              <ErrorBoundary>
                {children}
              </ErrorBoundary>
            </AuthProvider>
          </ToastProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
