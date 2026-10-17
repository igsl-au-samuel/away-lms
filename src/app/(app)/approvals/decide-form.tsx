"use client";

import { useState, useTransition } from "react";
import { decideLeaveRequest } from "../../../actions/requests";

export function DecideForm({ id, name }: { id: string; name: string }) {
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const decide = (outcome: "approved" | "declined") =>
    start(async () => {
      setError(null);
      const res = await decideLeaveRequest({ id, outcome, comment });
      if (!res.ok) setError(res.message);
    });

  return (
    <div className="stack" style={{ gap: "var(--space-2)", minWidth: 220 }}>
      <input
        className="input"
        aria-label="Comment (optional)"
        placeholder="Comment (optional)"
        maxLength={500}
        value={comment}
        disabled={pending}
        onChange={(e) => setComment(e.target.value)}
      />
      <div style={{ display: "flex", gap: "var(--space-2)" }}>
        <button
          type="button"
          className="btn"
          disabled={pending}
          aria-label={`Approve ${name}’s request`}
          onClick={() => decide("approved")}
        >
          Approve
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={pending}
          aria-label={`Decline ${name}’s request`}
          onClick={() => decide("declined")}
        >
          Decline
        </button>
      </div>
      {error && (
        <p role="alert" className="alert">
          {error}
        </p>
      )}
    </div>
  );
}
