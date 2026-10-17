"use client";

import { setAllowance } from "../../../../../actions/allowances";
import { ResultMessage, useAction } from "../../../../../components/action-result";

type Props = {
  userId: string;
  year: number;
  types: { id: string; name: string; default_allowance: number | null }[];
};

/** Sets an override for one capped type and year. An empty days field removes it. */
export function AllowanceForm({ userId, year, types }: Props) {
  const { result, pending, run } = useAction();

  return (
    <form
      className="stack"
      action={(data) =>
        run(() => {
          const raw = String(data.get("days") ?? "").trim();
          return setAllowance({
            user_id: userId,
            leave_type_id: data.get("leave_type_id"),
            year,
            days: raw === "" ? null : Number(raw),
            reason: String(data.get("reason") ?? "") || undefined,
          });
        }, "Allowance saved.")
      }
    >
      <div className="inline-form">
        <label className="field">
          Leave type
          <select className="input" name="leave_type_id" required>
            {types.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} (default {t.default_allowance})
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Days in {year}
          <input className="input" name="days" type="number" min={0} max={366} step={0.5} inputMode="decimal" />
        </label>
      </div>
      <label className="field">
        Reason (optional)
        <input className="input" name="reason" maxLength={500} />
      </label>
      <p className="muted" style={{ margin: 0 }}>
        Leave the days empty to go back to the default. Every change is logged.
      </p>
      <ResultMessage result={result} />
      <div>
        <button className="btn" type="submit" disabled={pending || types.length === 0}>
          Save allowance
        </button>
      </div>
    </form>
  );
}
