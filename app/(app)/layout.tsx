import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { NavBar } from "@/components/NavBar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data } = await supabase.from("profiles").select("onboarding_complete").eq("user_id", user.id).maybeSingle();
  if (!data?.onboarding_complete) redirect("/onboarding");

  return (
    <div className="flex min-h-screen">
      <NavBar />
      <main className="flex-1 pb-20 sm:pb-0">{children}</main>
    </div>
  );
}
