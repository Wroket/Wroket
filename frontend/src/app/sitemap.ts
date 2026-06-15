import fs from "fs";
import path from "path";

import type { MetadataRoute } from "next";

/** Stable lastModified from the page source file (avoids new Date() on every build). */
function lastModifiedFor(relativePath: string): Date {
  try {
    return fs.statSync(path.join(process.cwd(), relativePath)).mtime;
  } catch {
    return new Date();
  }
}

const PUBLIC_ROUTES: Array<{
  path: string;
  sourceFile: string;
  changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"];
  priority: number;
}> = [
  { path: "/", sourceFile: "src/app/page.tsx", changeFrequency: "weekly", priority: 1 },
  { path: "/pricing", sourceFile: "src/app/pricing/page.tsx", changeFrequency: "monthly", priority: 0.8 },
  { path: "/docs", sourceFile: "src/app/docs/page.tsx", changeFrequency: "monthly", priority: 0.75 },
  { path: "/docs/integrations/notion", sourceFile: "src/app/docs/integrations/[slug]/page.tsx", changeFrequency: "monthly", priority: 0.7 },
  { path: "/docs/integrations/monday", sourceFile: "src/app/docs/integrations/[slug]/page.tsx", changeFrequency: "monthly", priority: 0.7 },
  { path: "/agenda-taches", sourceFile: "src/app/agenda-taches/page.tsx", changeFrequency: "monthly", priority: 0.7 },
  { path: "/gestion-taches-equipe", sourceFile: "src/app/gestion-taches-equipe/page.tsx", changeFrequency: "monthly", priority: 0.7 },
  { path: "/matrice-eisenhower", sourceFile: "src/app/matrice-eisenhower/page.tsx", changeFrequency: "monthly", priority: 0.6 },
  { path: "/privacy", sourceFile: "src/app/privacy/page.tsx", changeFrequency: "yearly", priority: 0.3 },
  { path: "/terms", sourceFile: "src/app/terms/page.tsx", changeFrequency: "yearly", priority: 0.3 },
];

/**
 * Only marketing/public routes are listed; user-area pages stay out of the sitemap to match
 * `robots.ts` and avoid exposing private surface area.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://wroket.com";
  return PUBLIC_ROUTES.map(({ path: routePath, sourceFile, changeFrequency, priority }) => ({
    url: `${base}${routePath === "/" ? "/" : routePath}`,
    lastModified: lastModifiedFor(sourceFile),
    changeFrequency,
    priority,
  }));
}
