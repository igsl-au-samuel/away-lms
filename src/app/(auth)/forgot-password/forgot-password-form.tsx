"use client";

import { useState, useTransition } from "react";
import { requestPasswordReset } from "../../../actions/auth";

export function ForgotPasswordForm() {
  const [sent, setSent] = useState(false);
  const [pending, start] = useTransition();

  if (sent) {
    return <p className="notice">If that email has an account, we&apos;ve sent a link to reset the password.</p>;
  }
  return (
    <form
      className="stack"
      action={(data) =>
        start(async () => {
          await requestPasswordReset({ email: data.get("email") });
          setSent(true);
        })
      }
    >
      <label className="field">
        Email
        <input className="input" name="email" type="email" autoComplete="email" required />
      </label>
      <button className="btn" type="submit" disabled={pending}>
        Send reset link
      </button>
    </form>
  );
}
