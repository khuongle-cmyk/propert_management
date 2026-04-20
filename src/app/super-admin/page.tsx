import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import SuperAdminClient from "./SuperAdminClient";

export default async function SuperAdminPage() {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: memberships, error: membershipsError } = await supabase
    .from("memberships")
    .select("role")
    .eq("user_id", user.id);

  if (membershipsError) {
    redirect("/login?error=no_access");
  }

  const isSuperAdmin = (memberships ?? []).some(
    (m) => String(m.role ?? "").toLowerCase() === "super_admin"
  );

  if (!isSuperAdmin) {
    redirect("/login?error=no_access");
  }

  return <SuperAdminClient />;
}
