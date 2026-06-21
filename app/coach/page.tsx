import { listUsers } from "@/lib/coach/data";
import { UserList } from "@/components/coach/UserList";

export const dynamic = "force-dynamic";

export default async function CoachHome() {
  const users = await listUsers();
  const active = users.filter((u) => u.lastActive).length;
  const loggedToday = users.filter((u) => u.todayCalories > 0).length;

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-xl font-bold">Users</h1>
        <p className="mt-1 text-sm text-neutral-500">
          {users.length} total · {active} ever active · {loggedToday} logged today
        </p>
      </div>
      <UserList users={users} />
    </div>
  );
}
