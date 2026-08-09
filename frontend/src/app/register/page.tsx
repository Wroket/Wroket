import { redirect } from "next/navigation";

/** Legacy / docs links used `/register` — funnel into login register mode. */
export default function RegisterRedirectPage() {
  redirect("/login?mode=register");
}
