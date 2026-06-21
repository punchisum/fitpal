import Link from "next/link";
import { getProfile, getActiveGoal } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { signout } from "@/lib/actions/auth";
import { DeleteAccount } from "@/components/DeleteAccount";
import { TelegramLink } from "@/components/TelegramLink";

export default async function SettingsPage() {
  const [profile, goal] = await Promise.all([getProfile(), getActiveGoal()]);
  const age = profile?.birth_year ? new Date().getFullYear() - profile.birth_year : null;

  const supabase = await createClient();
  const { data: tg } = await supabase.from("telegram_identities").select("linked_at").not("linked_at", "is", null).maybeSingle();
  const telegramLinked = !!tg?.linked_at;

  return (
    <div className="mx-auto max-w-2xl px-5 py-8">
      <h1 className="text-2xl font-bold">Settings</h1>

      <div className="mt-6 space-y-4">
        <div className="card">
          <h2 className="text-sm font-semibold">Profile</h2>
          <dl className="mt-2 space-y-1 text-sm text-neutral-700">
            <Row k="Name" v={profile?.nickname ?? "—"} />
            <Row k="Age" v={age ? `${age}` : "—"} />
            <Row k="Height" v={profile?.height_cm ? `${profile.height_cm} cm` : "—"} />
            <Row k="Goal" v={goal?.primary_goal?.replace("_", " ") ?? "—"} />
          </dl>
          <Link href="/onboarding" className="btn-ghost mt-3">Redo onboarding / rebuild plan</Link>
        </div>

        <div className="card">
          <h2 className="text-sm font-semibold">Telegram</h2>
          <TelegramLink linked={telegramLinked} />
        </div>

        <div className="card">
          <h2 className="text-sm font-semibold">Your data</h2>
          <p className="hint mt-1">Fitpal only ever shows you your own data. Export or delete anytime.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <a href="/api/export" className="btn-ghost">Export my data (JSON)</a>
            <form action={signout}><button className="btn-ghost">Log out</button></form>
          </div>
        </div>

        <div className="card border-red-100">
          <h2 className="text-sm font-semibold text-red-700">Danger zone</h2>
          <p className="hint mb-3 mt-1">Permanently delete your account and everything in it.</p>
          <DeleteAccount />
        </div>

        <p className="hint text-center">Fitpal gives general fitness guidance, not medical advice.</p>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return <div className="flex justify-between"><dt className="text-neutral-500">{k}</dt><dd className="font-medium">{v}</dd></div>;
}
