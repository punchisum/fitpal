"use client";

import { useActionState, useEffect, useRef } from "react";
import { sendMessage, type ChatState } from "@/lib/actions/chat";

export function ChatBox() {
  const [state, action, pending] = useActionState<ChatState, FormData>(sendMessage, {});
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state.ok]);

  return (
    <form ref={ref} action={action} className="sticky bottom-16 sm:bottom-4">
      <div className="card flex items-end gap-2 p-2">
        <textarea
          name="message"
          rows={1}
          maxLength={1000}
          placeholder="Ask your coach… (e.g. 'I missed two workouts, what now?')"
          className="max-h-32 flex-1 resize-none bg-transparent px-2 py-2 text-sm outline-none"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              ref.current?.requestSubmit();
            }
          }}
        />
        <button className="btn-primary" disabled={pending}>{pending ? "…" : "Send"}</button>
      </div>
      {state.error && <p className="mt-1 px-2 text-sm text-red-600">{state.error}</p>}
    </form>
  );
}
