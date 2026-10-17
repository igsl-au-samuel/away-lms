"use client";

import { useState, useTransition } from "react";
import { updateProfile } from "../../../actions/profile";

type Props = {
  regions: { code: string; name: string }[];
  timezones: string[];
  region: string;
  timezone: string;
};

export function ProfileForm({ regions, timezones, region, timezone }: Props) {
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, start] = useTransition();

  return (
    <form
      className="stack"
      action={(data) =>
        start(async () => {
          setResult(null);
          const res = await updateProfile({ region_code: data.get("region_code"), timezone: data.get("timezone") });
          setResult(res.ok ? { ok: true, message: "Saved." } : { ok: false, message: res.message });
        })
      }
    >
      <label className="field">
        Region
        <select className="input" name="region_code" defaultValue={region}>
          {regions.map((r) => (
            <option key={r.code} value={r.code}>
              {r.name}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        Timezone
        <select className="input" name="timezone" defaultValue={timezone}>
          {timezones.map((tz) => (
            <option key={tz} value={tz}>
              {tz}
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
          Save
        </button>
      </div>
    </form>
  );
}
