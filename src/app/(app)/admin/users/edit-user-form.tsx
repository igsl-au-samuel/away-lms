"use client";

import { updateUser } from "../../../../actions/admin-users";
import { ResultMessage, useAction } from "../../../../components/action-result";

type Props = {
  user: { id: string; full_name: string; role: string; region_code: string; is_demo: boolean };
  regions: { code: string; name: string }[];
  isSelf: boolean;
};

/** Name, role and region. Demo users stay employees and nobody changes their own role. */
export function EditUserForm({ user, regions, isSelf }: Props) {
  const { result, pending, run } = useAction();
  const roleLocked = user.is_demo || isSelf;

  return (
    <form
      className="stack"
      style={{ padding: "var(--space-3) 0" }}
      action={(data) =>
        run(
          () =>
            updateUser({
              id: user.id,
              full_name: data.get("full_name"),
              role: roleLocked ? user.role : data.get("role"),
              region_code: data.get("region_code"),
            }),
          "Saved.",
        )
      }
    >
      <div className="inline-form">
        <label className="field">
          Full name
          <input className="input" name="full_name" required maxLength={100} defaultValue={user.full_name} />
        </label>
        <label className="field">
          Role
          <select className="input" name="role" defaultValue={user.role} disabled={roleLocked}>
            <option value="employee">Employee</option>
            <option value="manager">Manager</option>
            <option value="admin">Admin</option>
          </select>
        </label>
        <label className="field">
          Region
          <select className="input" name="region_code" defaultValue={user.region_code}>
            {regions.map((r) => (
              <option key={r.code} value={r.code}>
                {r.name}
              </option>
            ))}
          </select>
        </label>
        <button className="btn" type="submit" disabled={pending}>
          Save
        </button>
      </div>
      {roleLocked && (
        <p className="muted" style={{ margin: 0 }}>
          {user.is_demo ? "Demo users are always employees." : "You can't change your own role. Ask another admin."}
        </p>
      )}
      <ResultMessage result={result} />
    </form>
  );
}
