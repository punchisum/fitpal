"use client";

import { useState } from "react";
import { deleteAccount } from "@/lib/actions/account";

export function DeleteAccount() {
  const [confirm, setConfirm] = useState(false);
  return (
    <div>
      {!confirm ? (
        <button onClick={() => setConfirm(true)} className="btn-ghost border-red-200 text-red-600 hover:bg-red-50">
          Delete my account
        </button>
      ) : (
        <form action={deleteAccount} className="flex flex-col gap-2">
          <p className="text-sm font-medium text-red-700">This permanently deletes your account and all your data. This can&apos;t be undone.</p>
          <div className="flex gap-2">
            <button className="btn bg-red-600 text-white hover:bg-red-700" type="submit">Yes, delete everything</button>
            <button type="button" onClick={() => setConfirm(false)} className="btn-ghost">Cancel</button>
          </div>
        </form>
      )}
    </div>
  );
}
