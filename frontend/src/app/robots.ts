import type { MetadataRoute } from "next";

/**
 * `/` and `/pricing` are the only public marketing routes today; everything else is user/auth-only
 * and intentionally excluded so search engines don't crawl private content (cf. pages in
 * `frontend/src/app/`).
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/pricing", "/privacy", "/terms", "/agenda-taches", "/gestion-taches-equipe", "/matrice-eisenhower"],
        disallow: [
          "/api/",
          "/dashboard",
          "/todos",
          "/projects",
          "/agenda",
          "/notes",
          "/teams",
          "/archive",
          "/settings",
          "/admin",
          "/notifications",
          "/login",
          "/forgot-password",
          "/reset-password",
          "/verify-email",
        ],
      },
    ],
    sitemap: "https://wroket.com/sitemap.xml",
    host: "https://wroket.com",
  };
}
