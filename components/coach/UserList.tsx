"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import type { CoachUserSummary } from "@/lib/coach/data";

function activeAgo(date: string | null): string {
  if (!date) return "never";
  const d = Math.floor((Date.now() - new Date(date + "T00:00:00Z").getTime()) / 86400000);
  if (d <= 0) return "today";
  if (d === 1) return "yesterday";
  return `${d}d ago`;
}

export function UserList({ users }: { users: CoachUserSummary[] }) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return users;
    return users.filter((u) => (u.nickname ?? "").toLowerCase().includes(s) || (u.goal ?? "").toLowerCase().includes(s));
  }, [q, users]);

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name or goal…"
          className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-emerald-500"
        />
        <span className="whitespace-nowrap text-xs text-neutral-500">{filtered.length} / {users.length}</span>
      </div>

      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="px-4 py-2 font-medium">User</th>
              <th className="px-4 py-2 font-medium">Goal</th>
              <th className="px-4 py-2 font-medium">Today</th>
              <th className="px-4 py-2 font-medium">🔥</th>
              <th className="px-4 py-2 font-medium">Active</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((u) => (
              <tr key={u.user_id} className="border-t border-neutral-100 hover:bg-emerald-50/40">
                <td className="px-4 py-2.5">
                  <Link href={`/coach/${u.user_id}`} className="font-medium text-emerald-700 hover:underline">
                    {u.nickname ?? "Unnamed"}
                  </Link>
                  <div className="flex gap-1 text-[10px] text-neutral-400">
                    {!u.onboarded && <span>onboarding</span>}
                    {u.linked && <span>· telegram</span>}
                  </div>
                </td>
                <td className="px-4 py-2.5 capitalize text-neutral-600">{u.goal?.replace(/_/g, " ") ?? "—"}</td>
                <td className="px-4 py-2.5 text-neutral-600">
                  {u.calorieTarget
                    ? `${u.todayCalories} / ${u.calorieTarget} kcal · ${u.todayProtein}g P`
                    : `${u.todayCalories} kcal`}
                </td>
                <td className="px-4 py-2.5">{u.streak > 0 ? u.streak : "—"}</td>
                <td className="px-4 py-2.5 text-neutral-500">{activeAgo(u.lastActive)}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-neutral-400">No users match “{q}”.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
