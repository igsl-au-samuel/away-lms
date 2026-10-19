"use client";

import { useState, useTransition } from "react";
import { signIn } from "../../../actions/auth";

export function SignInForm({ next }: { next: string | null }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <form
      className="stack"
      action={(data) =>
        start(async () => {
          setError(null);
          const res = await signIn({ email: data.get("email"), password: data.get("password") }, next);
          if (res && !res.ok) setError(res.message);
        })
      }
    >
      <label className="field">
        Email
        <input className="input" name="email" type="email" autoComplete="email" required />
      </label>
      <label className="field">
        Password
        <input className="input" name="password" type="password" autoComplete="current-password" required />
      </label>
      {error && (
        <p role="alert" className="alert">
          {error}
        </p>
      )}
      <button className="btn" type="submit" disabled={pending}>
        Sign in
      </button>
    </form>
  );
}
