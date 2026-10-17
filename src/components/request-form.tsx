"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { previewLeaveRequest, submitLeaveRequest, type RequestPreview } from "../actions/requests";
import { formatDays } from "./balances";

type LeaveTypeOption = { id: string; name: string };

export function RequestForm({ leaveTypes }: { leaveTypes: LeaveTypeOption[] }) {
  const router = useRouter();
  const [leaveTypeId, setLeaveTypeId] = useState(leaveTypes[0]?.id ?? "");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [note, setNote] = useState("");
  const [preview, setPreview] = useState<RequestPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Debounced live preview: working days, balance and blocking problems.
  useEffect(() => {
    if (!leaveTypeId || !start || !end) return;
    let stale = false;
    const timer = setTimeout(async () => {
      const res = await previewLeaveRequest({ leave_type_id: leaveTypeId, start_date: start, end_date: end });
      if (stale) return;
      if (res.ok) {
        setPreview(res.data);
        setPreviewError(null);
      } else {
        setPreview(null);
        setPreviewError(res.message);
      }
    }, 300);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [leaveTypeId, start, end]);

  const ready = Boolean(leaveTypeId && start && end);
  const current = ready ? preview : null;
  const errors = current?.errors ?? [];
  const canSubmit = ready && current !== null && errors.length === 0 && !pending;

  function onSubmit() {
    startTransition(async () => {
      setSubmitError(null);
      const res = await submitLeaveRequest({
        leave_type_id: leaveTypeId,
        start_date: start,
        end_date: end,
        note,
      });
      if (res.ok) router.push("/requests");
      else setSubmitError(res.message);
    });
  }

  return (
    <form
      className="stack"
      onSubmit={(e) => {
        e.preventDefault();
        if (canSubmit) onSubmit();
      }}
    >
      <label className="field">
        Leave type
        <select className="input" value={leaveTypeId} onChange={(e) => setLeaveTypeId(e.target.value)} required>
          {leaveTypes.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        Start date
        <input
          className="input"
          type="date"
          value={start}
          onChange={(e) => {
            setStart(e.target.value);
            if (!end || end < e.target.value) setEnd(e.target.value);
          }}
          required
        />
      </label>
      <label className="field">
        End date
        <input className="input" type="date" value={end} min={start || undefined} onChange={(e) => setEnd(e.target.value)} required />
      </label>
      <label className="field">
        Note
        <textarea
          className="input"
          rows={3}
          maxLength={500}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          style={{ padding: "var(--space-2) var(--space-3)", resize: "vertical" }}
        />
      </label>

      {current && current.working_days !== null && errors.length === 0 && (
        <div role="status" className="notice stack" style={{ gap: "var(--space-1)" }}>
          <span>
            {current.working_days} working {current.working_days === 1 ? "day" : "days"}
          </span>
          {current.available_before !== null && <span>Available balance: {formatDays(current.available_before)}</span>}
          {current.over_balance_days ? (
            <span>
              This is over balance by {formatDays(current.over_balance_days)}. You can still submit it for approval.
            </span>
          ) : null}
        </div>
      )}
      {errors.map((e) => (
        <p key={e.code} role="alert" className="alert">
          {e.message}
        </p>
      ))}
      {previewError && (
        <p role="alert" className="alert">
          {previewError}
        </p>
      )}
      {submitError && (
        <p role="alert" className="alert">
          {submitError}
        </p>
      )}

      <div>
        <button className="btn" type="submit" disabled={!canSubmit}>
          Submit request
        </button>
      </div>
    </form>
  );
}
