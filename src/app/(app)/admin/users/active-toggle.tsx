"use client";

import { useState, useTransition } from "react";
import { setUserActive } from "../../../../actions/admin-users";

export function ActiveToggle({ id, name, active }: { id: string; name: string; active: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <>
      <button
        type="button"
        className="btn btn-secondary"
        disabled={pending}
        aria-label={`${active ? "Deactivate" : "Reactivate"} ${name}`}
        onClick={() =>
          start(async () => {
            setError(null);
            const res = await setUserActive({ id, active: !active });
            if (!res.ok) setError(res.message);
          })
        }
      >
        {active ? "Deactivate" : "Reactivate"}
      </button>
      {error && (
        <span role="alert" className="muted">
          {" "}
          {error}
        </span>
      )}
    </>
  );
}
