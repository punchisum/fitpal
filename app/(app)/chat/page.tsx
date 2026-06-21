import { createClient } from "@/lib/supabase/server";
import { ChatBox } from "@/components/ChatBox";

export default async function ChatPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: messages } = await supabase
    .from("agent_messages")
    .select("id, role, content, created_at")
    .eq("channel", "web")
    .order("created_at", { ascending: true })
    .limit(100);

  const list = messages ?? [];

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col px-5 py-8">
      <h1 className="text-2xl font-bold">Coach</h1>
      <p className="hint mt-1">Grounded in your plan and recent logs. General guidance only — not medical advice.</p>

      <div className="mt-6 flex-1 space-y-3">
        {list.length === 0 ? (
          <div className="card">
            <p className="text-sm text-neutral-700">👋 I&apos;m your coach. I can see your plan, targets, and recent logs. Try asking:</p>
            <ul className="mt-2 space-y-1 text-sm text-brand-dark">
              <li>• &ldquo;Am I eating enough protein?&rdquo;</li>
              <li>• &ldquo;I missed two workouts this week — what should I do?&rdquo;</li>
              <li>• &ldquo;Explain why my plan has a rest day.&rdquo;</li>
            </ul>
          </div>
        ) : (
          list.map((m) => (
            <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm ${m.role === "user" ? "bg-brand text-white" : "border border-neutral-200 bg-white text-neutral-800"}`}>
                {m.content}
              </div>
            </div>
          ))
        )}
      </div>

      <div className="mt-4">
        <ChatBox />
      </div>
    </div>
  );
}
