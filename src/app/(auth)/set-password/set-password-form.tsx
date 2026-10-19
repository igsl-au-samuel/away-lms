"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setPassword } from "../../../actions/auth";

export function SetPasswordForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <form
      className="stack"
      action={(data) =>
        start(async () => {
          setError(null);
          const res = await setPassword({ password: data.get("password") });
          if (res.ok) router.replace("/");
          else setError(res.message);
        })
      }
    >
      <label className="field">
        New password
        <input className="input" name="password" type="password" autoComplete="new-password" minLength={10} required />
      </label>
      {error && (
        <p role="alert" className="alert">
          {error}
        </p>
      )}
      <button className="btn" type="submit" disabled={pending}>
        Save password
      </button>
    </form>
  );
}
