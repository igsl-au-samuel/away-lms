"use client";

import { useState, useTransition } from "react";
import { inviteUser } from "../../../../actions/admin-users";

export function InviteForm({ regions }: { regions: { code: string; name: string }[] }) {
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, start] = useTransition();

  return (
    <form
      className="stack"
      action={(data) =>
        start(async () => {
          setResult(null);
          const res = await inviteUser({
            email: data.get("email"),
            full_name: data.get("full_name"),
            role: data.get("role"),
            region_code: data.get("region_code"),
          });
          setResult(res.ok ? { ok: true, message: "Invite sent." } : { ok: false, message: res.message });
        })
      }
    >
      <label className="field">
        Full name
        <input className="input" name="full_name" required maxLength={100} />
      </label>
      <label className="field">
        Email
        <input className="input" name="email" type="email" required />
      </label>
      <label className="field">
        Role
        <select className="input" name="role" defaultValue="employee">
          <option value="employee">Employee</option>
          <option value="manager">Manager</option>
          <option value="admin">Admin</option>
        </select>
      </label>
      <label className="field">
        Region
        <select className="input" name="region_code" required defaultValue="">
          <option value="" disabled>
            Choose a region
          </option>
          {regions.map((r) => (
            <option key={r.code} value={r.code}>
              {r.name}
            </option>
          ))}
        </select>
      </label>
      {result && (
        <p role={result.ok ? "status" : "alert"} className={result.ok ? "notice" : "alert"}>
          {result.message}
        </p>
      )}
      <div>
        <button className="btn" type="submit" disabled={pending}>
          Send invite
        </button>
      </div>
    </form>
  );
}
