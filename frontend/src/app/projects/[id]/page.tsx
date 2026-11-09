"use client";

import { useEffect } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";

/**
 * Legacy deep-link `/projects/:id` → canonical `/projects?project=:id`.
 */
export default function ProjectIdRedirectPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = typeof params.id === "string" ? params.id : Array.isArray(params.id) ? params.id[0] : "";

  useEffect(() => {
    if (!id) {
      router.replace("/projects");
      return;
    }
    const qs = new URLSearchParams(searchParams.toString());
    qs.set("project", id);
    router.replace(`/projects?${qs.toString()}`);
  }, [id, router, searchParams]);

  return (
    <div className="flex items-center justify-center py-20">
      <div className="w-6 h-6 border-2 border-slate-300 border-t-slate-700 rounded-full animate-spin" />
    </div>
  );
}
