"use client";

import { useState, useTransition } from "react";
import { decideAuthorization } from "../../../actions/oauth";

export function ConsentForm({ authorizationId, canApprove }: { authorizationId: string; canApprove: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const decide = (decision: "approve" | "deny") =>
    start(async () => {
      setError(null);
      const res = await decideAuthorization({ authorizationId, decision });
      if (res && !res.ok) setError(res.message);
    });

  return (
    <div className="stack">
      {error && (
        <p role="alert" className="alert">
          {error}
        </p>
      )}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-3)" }}>
        {canApprove && (
          <button className="btn" type="button" disabled={pending} onClick={() => decide("approve")}>
            Approve
          </button>
        )}
        <button className="btn btn-secondary" type="button" disabled={pending} onClick={() => decide("deny")}>
          Deny
        </button>
      </div>
    </div>
  );
}
