import Link from "next/link";
import { requireCoach } from "@/lib/coach/auth";
import { signout } from "@/lib/actions/auth";

export const dynamic = "force-dynamic";

export default async function CoachLayout({ children }: { children: React.ReactNode }) {
  await requireCoach();
  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="sticky top-0 z-10 border-b border-neutral-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-3">
          <Link href="/coach" className="text-sm font-bold tracking-tight">
            🧭 CoachOS
          </Link>
          <form action={signout}>
            <button className="text-xs text-neutral-500 hover:text-neutral-800">Sign out</button>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-5 py-6">{children}</main>
    </div>
  );
}
