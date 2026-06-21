"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Permanently deletes the CURRENT user and (via on-delete-cascade FKs) all their data.
 * Scoped to auth.uid() — a user can only ever delete themselves.
 */
export async function deleteAccount(): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  await supabase.rpc("append_audit_log", { p_action: "account_delete_requested", p_meta: {} });

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.deleteUser(user.id); // cascade removes all owned rows
  if (error) throw new Error("Account deletion failed. Please try again.");

  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/?deleted=1");
}
