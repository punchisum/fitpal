"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signout } from "@/lib/actions/auth";

const LINKS = [
  { href: "/dashboard", label: "Home", icon: "🏠" },
  { href: "/today", label: "Today", icon: "📅" },
  { href: "/workout", label: "Workout", icon: "🏋️" },
  { href: "/progress", label: "Progress", icon: "📈" },
  { href: "/chat", label: "Coach", icon: "💬" },
  { href: "/settings", label: "Settings", icon: "⚙️" },
];

export function NavBar() {
  const path = usePathname();
  return (
    <>
      {/* Desktop sidebar */}
      <nav className="hidden w-52 shrink-0 flex-col gap-1 border-r border-neutral-200 bg-white p-4 sm:flex">
        <Link href="/dashboard" className="mb-4 px-2 text-xl font-bold">🏋️ Fitpal</Link>
        {LINKS.map((l) => {
          const active = path === l.href;
          return (
            <Link key={l.href} href={l.href}
              className={`rounded-xl px-3 py-2 text-sm font-medium ${active ? "bg-brand/10 text-brand-dark" : "text-neutral-700 hover:bg-neutral-100"}`}>
              <span className="mr-2">{l.icon}</span>{l.label}
            </Link>
          );
        })}
        <form action={signout} className="mt-auto">
          <button className="w-full rounded-xl px-3 py-2 text-left text-sm font-medium text-neutral-500 hover:bg-neutral-100">↩︎ Log out</button>
        </form>
      </nav>

      {/* Mobile bottom bar */}
      <nav className="fixed inset-x-0 bottom-0 z-10 flex justify-around border-t border-neutral-200 bg-white py-1.5 sm:hidden">
        {LINKS.map((l) => {
          const active = path === l.href;
          return (
            <Link key={l.href} href={l.href} className={`flex flex-col items-center px-2 py-1 text-[11px] ${active ? "text-brand-dark" : "text-neutral-500"}`}>
              <span className="text-lg">{l.icon}</span>{l.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
