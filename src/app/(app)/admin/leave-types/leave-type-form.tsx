"use client";

import { useState } from "react";
import { saveLeaveType } from "../../../../actions/leave-types";
import { ResultMessage, useAction } from "../../../../components/action-result";

export type LeaveTypeRow = {
  id: string;
  name: string;
  is_capped: boolean;
  default_allowance: number | null;
  is_active: boolean;
  sort_order: number;
};

/** Creates a type when `type` is absent, otherwise edits it. Types are retired, never deleted. */
export function LeaveTypeForm({ type, nextSortOrder }: { type?: LeaveTypeRow; nextSortOrder?: number }) {
  const { result, pending, run } = useAction();
  const [capped, setCapped] = useState(type?.is_capped ?? true);

  return (
    <form
      className="stack"
      action={(data) =>
        run(
          () =>
            saveLeaveType({
              id: type?.id,
              name: data.get("name"),
              is_capped: capped,
              default_allowance: capped ? Number(data.get("default_allowance")) : null,
              is_active: type ? data.get("is_active") === "on" : true,
              sort_order: Number(data.get("sort_order")),
            }),
          type ? "Saved." : "Leave type added.",
        )
      }
    >
      <div className="inline-form">
        <label className="field">
          Name
          <input className="input" name="name" required maxLength={50} defaultValue={type?.name} />
        </label>
        <label className="field">
          Allowance
          <select
            className="input"
            value={capped ? "capped" : "uncapped"}
            onChange={(e) => setCapped(e.target.value === "capped")}
          >
            <option value="capped">Capped</option>
            <option value="uncapped">Uncapped</option>
          </select>
        </label>
        {capped && (
          <label className="field">
            Default days a year
            <input
              className="input"
              name="default_allowance"
              type="number"
              required
              min={0}
              max={366}
              step={0.5}
              inputMode="decimal"
              defaultValue={type?.default_allowance ?? ""}
            />
          </label>
        )}
        <label className="field">
          Order
          <input
            className="input"
            name="sort_order"
            type="number"
            required
            min={0}
            max={999}
            step={1}
            defaultValue={type?.sort_order ?? nextSortOrder ?? 0}
            style={{ width: 96 }}
          />
        </label>
        {type && (
          <label style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", minHeight: 40 }}>
            <input type="checkbox" name="is_active" defaultChecked={type.is_active} />
            Available for new requests
          </label>
        )}
        <button className="btn" type="submit" disabled={pending}>
          {type ? "Save" : "Add leave type"}
        </button>
      </div>
      <ResultMessage result={result} />
    </form>
  );
}
