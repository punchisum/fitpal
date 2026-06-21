"use client";

import { useActionState } from "react";
import Link from "next/link";
import type { AuthState } from "@/lib/actions/auth";

type Props = {
  mode: "login" | "signup";
  action: (prev: AuthState, formData: FormData) => Promise<AuthState>;
};

export function AuthForm({ mode, action }: Props) {
  const [state, formAction, pending] = useActionState<AuthState, FormData>(action, {});
  const isLogin = mode === "login";

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-6">
      <div className="text-center">
        <Link href="/" className="text-2xl font-bold">🏋️ Fitpal</Link>
        <h1 className="mt-4 text-xl font-semibold">{isLogin ? "Welcome back" : "Create your account"}</h1>
        <p className="hint mt-1">{isLogin ? "Log in to your fitness agent." : "Start building your plan in 2 minutes."}</p>
      </div>

      <form action={formAction} className="card flex flex-col gap-4">
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input className="input" id="email" name="email" type="email" autoComplete="email" required />
        </div>
        <div>
          <label className="label" htmlFor="password">Password</label>
          <input className="input" id="password" name="password" type="password" autoComplete={isLogin ? "current-password" : "new-password"} required minLength={8} />
          {!isLogin && <p className="hint mt-1">At least 8 characters.</p>}
        </div>

        {state.error && <p className="text-sm font-medium text-red-600">{state.error}</p>}
        {state.message && <p className="text-sm font-medium text-brand-dark">{state.message}</p>}

        <button className="btn-primary" type="submit" disabled={pending}>
          {pending ? "Please wait…" : isLogin ? "Log in" : "Sign up"}
        </button>
      </form>

      <p className="text-center text-sm text-neutral-600">
        {isLogin ? (
          <>No account? <Link className="font-semibold text-brand-dark" href="/signup">Sign up</Link></>
        ) : (
          <>Already have one? <Link className="font-semibold text-brand-dark" href="/login">Log in</Link></>
        )}
      </p>
    </main>
  );
}
