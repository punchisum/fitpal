import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function LandingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/dashboard");

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-8 px-6 text-center">
      <div>
        <div className="mb-3 text-5xl">🏋️</div>
        <h1 className="text-4xl font-bold tracking-tight">Fitpal</h1>
        <p className="mt-3 text-lg text-neutral-600">
          Your personal fitness agent. It builds your plan, tracks your training, and adapts with you —
          grounded in real sports-science math, with an AI coach that explains the why.
        </p>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row">
        <Link href="/signup" className="btn-primary px-6 py-3 text-base">
          Create your plan
        </Link>
        <Link href="/login" className="btn-ghost px-6 py-3 text-base">
          Log in
        </Link>
      </div>
      <ul className="grid gap-3 text-left text-sm text-neutral-600 sm:grid-cols-3">
        <li className="card">📋 A deterministic, safe training & nutrition plan from day one.</li>
        <li className="card">📈 Daily check-ins, workout & food logs, progress trends.</li>
        <li className="card">💬 An AI coach that proposes adjustments — you stay in control.</li>
      </ul>
      <p className="hint max-w-md">
        Fitpal gives general fitness guidance, not medical advice. For injuries, illness, or eating
        concerns, please talk to a qualified professional.
      </p>
    </main>
  );
}
