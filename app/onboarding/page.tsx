import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { OnboardingForm } from "@/components/OnboardingForm";

export default async function OnboardingPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data } = await supabase.from("profiles").select("onboarding_complete").eq("user_id", user.id).maybeSingle();
  if (data?.onboarding_complete) redirect("/dashboard");

  return <OnboardingForm />;
}
