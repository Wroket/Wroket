import type { Metadata } from "next";

import { buildPageMetadata } from "@/lib/seo";

import { DocsHubClient } from "./DocsHubClient";

export const metadata: Metadata = buildPageMetadata({
  title: "Documentation intégrations",
  description:
    "Guides Wroket pour migrer depuis Notion ou Monday, connecter Google Calendar et Outlook, et configurer Slack, Teams et Discord.",
  path: "/docs",
});

export default function DocsPage() {
  return <DocsHubClient />;
}
