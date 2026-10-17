"use client";

import { deleteHoliday, saveHoliday, saveRegion } from "../../../../actions/holidays";
import { ResultMessage, useAction } from "../../../../components/action-result";

export function RegionForm({ timezones }: { timezones: string[] }) {
  const { result, pending, run } = useAction();
  return (
    <form
      className="stack"
      action={(data) =>
        run(
          () =>
            saveRegion({
              code: String(data.get("code") ?? "").trim().toUpperCase(),
              name: data.get("name"),
              default_timezone: data.get("default_timezone"),
            }),
          "Region added.",
        )
      }
    >
      <div className="inline-form">
        <label className="field">
          Code
          <input
            className="input"
            name="code"
            required
            minLength={2}
            maxLength={5}
            pattern="[A-Za-z]{2,5}"
            style={{ width: 96, textTransform: "uppercase" }}
          />
        </label>
        <label className="field">
          Name
          <input className="input" name="name" required maxLength={100} placeholder="Victoria (Melbourne)" />
        </label>
        <label className="field">
          Default timezone
          <select className="input" name="default_timezone" required defaultValue="">
            <option value="" disabled>
              Choose a timezone
            </option>
            {timezones.map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </select>
        </label>
        <button className="btn" type="submit" disabled={pending}>
          Add region
        </button>
      </div>
      <ResultMessage result={result} />
    </form>
  );
}

type Holiday = { id: string; holiday_date: string; name: string };

/** Adds a holiday to `region`, or edits `holiday` when given. */
export function HolidayForm({ region, year, holiday }: { region: string; year: number; holiday?: Holiday }) {
  const { result, pending, run } = useAction();
  return (
    <form
      className="stack"
      action={(data) =>
        run(
          () =>
            saveHoliday({
              id: holiday?.id,
              region_code: region,
              holiday_date: data.get("holiday_date"),
              name: data.get("name"),
            }),
          holiday ? "Saved." : "Holiday added.",
        )
      }
    >
      <div className="inline-form">
        <label className="field">
          Date
          <input
            className="input"
            name="holiday_date"
            type="date"
            required
            min={`${year}-01-01`}
            max={`${year}-12-31`}
            defaultValue={holiday?.holiday_date}
          />
        </label>
        <label className="field">
          Name
          <input className="input" name="name" required maxLength={80} defaultValue={holiday?.name} />
        </label>
        <button className="btn" type="submit" disabled={pending}>
          {holiday ? "Save" : "Add holiday"}
        </button>
      </div>
      <ResultMessage result={result} />
    </form>
  );
}

export function RemoveHolidayButton({ id, label }: { id: string; label: string }) {
  const { result, pending, run } = useAction();
  return (
    <>
      <button
        type="button"
        className="btn btn-secondary"
        disabled={pending}
        aria-label={`Remove ${label}`}
        onClick={() => {
          if (window.confirm(`Remove ${label}? Existing requests keep their day counts.`)) {
            run(() => deleteHoliday({ id }), "Removed.");
          }
        }}
      >
        Remove
      </button>
      {result && !result.ok && <ResultMessage result={result} />}
    </>
  );
}
