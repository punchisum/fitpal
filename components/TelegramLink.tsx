"use client";

import { useState, useTransition } from "react";
import { generateLinkCode } from "@/lib/actions/telegram";

const BOT = "Fitpal_beta_bot";

export function TelegramLink({ linked }: { linked: boolean }) {
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (linked) {
    return <p className="hint mt-1">✅ Your Telegram is linked. Message <a className="font-semibold text-brand-dark" href={`https://t.me/${BOT}`} target="_blank" rel="noreferrer">@{BOT}</a> for check-ins, logging, and coaching.</p>;
  }

  return (
    <div className="mt-1">
      <p className="hint">Link Telegram to check in, log, and chat with your coach from your phone. No Telegram message can touch your data until you link.</p>
      {!code ? (
        <button
          className="btn-ghost mt-3"
          disabled={pending}
          onClick={() => start(async () => {
            setError(null);
            const r = await generateLinkCode();
            if (r.error) setError(r.error); else setCode(r.code ?? null);
          })}
        >
          {pending ? "Generating…" : "Generate link code"}
        </button>
      ) : (
        <div className="mt-3 rounded-xl border border-brand/30 bg-brand/5 p-3 text-sm">
          <p>1. Open <a className="font-semibold text-brand-dark" href={`https://t.me/${BOT}`} target="_blank" rel="noreferrer">@{BOT}</a> on Telegram.</p>
          <p className="mt-1">2. Send this (valid 30 min):</p>
          <code className="mt-2 block rounded-lg bg-white px-3 py-2 text-base font-bold tracking-wider">/link {code}</code>
        </div>
      )}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
