"use client";

import { useState, useTransition } from "react";
import { importHolidays, previewHolidayImport } from "../../../../actions/holidays";
import { ResultMessage } from "../../../../components/action-result";
import { formatPlainDate } from "../../../../lib/dates";
import type { HolidayPreview, HolidaySource } from "../../../../server/holiday-import";

type Note = { ok: boolean; message: string } | null;

/**
 * Preview, then add (#181).
 *
 * The two buttons are two actions on purpose: the admin reads the list the source gives for this
 * region and year before anything is written, and the write itself re-runs the same read so the
 * dates that land are the source's rather than whatever the browser was shown. A preview that
 * found nothing to add offers no button, because "Import 0 holidays" invites a click that proves
 * nothing.
 */
export function HolidayImport({ region, year, source }: { region: string; year: number; source: HolidaySource }) {
  const [preview, setPreview] = useState<HolidayPreview | null>(null);
  const [note, setNote] = useState<Note>(null);
  const [pending, start] = useTransition();

  const showPreview = () =>
    start(async () => {
      setNote(null);
      const res = await previewHolidayImport({ region, year });
      if (!res.ok) {
        setPreview(null);
        setNote({ ok: false, message: res.message });
        return;
      }
      setPreview(res.data);
      setNote({
        ok: true,
        message:
          res.data.adding.length === 0
            ? `${source.name} has ${res.data.kept.length} holidays for ${region} in ${year}, and every one is already stored.`
            : `${res.data.adding.length} to add for ${region} in ${year}.`,
      });
    });

  const write = () =>
    start(async () => {
      setNote(null);
      const res = await importHolidays({ region, year });
      if (!res.ok) {
        setNote({ ok: false, message: res.message });
        return;
      }
      setPreview(null);
      setNote({
        ok: true,
        message:
          res.data.added === 0
            ? "Nothing was added — those dates were already stored."
            : `Added ${res.data.added} holiday${res.data.added === 1 ? "" : "s"} for ${region} in ${year}.`,
      });
    });

  const added = preview?.adding.length ?? 0;
  const untouched = (preview?.kept.length ?? 0) + (preview?.extra ?? 0);

  return (
    <section className="card stack" aria-labelledby="holiday-import-heading">
      <h2 id="holiday-import-heading" style={{ margin: 0, fontSize: 20 }}>
        Import holidays
      </h2>
      <p className="muted" style={{ margin: 0 }}>
        From {source.name} ({source.licence}, {source.site}) for {region}, {year}. Dates already in the list keep
        their names and are never removed, so anything this source doesn’t cover stays exactly as you typed it.
      </p>

      <div className="inline-form">
        <button className="btn btn-secondary" type="button" onClick={showPreview} disabled={pending}>
          Preview {region} {year}
        </button>
      </div>

      <ResultMessage result={note} />

      {preview && added > 0 && (
        <>
          <h3 style={{ margin: 0, fontSize: 16 }}>To add</h3>
          <ul className="stack" style={{ margin: 0, padding: 0, listStyle: "none" }}>
            {preview.adding.map((h) => (
              <li key={h.date}>
                <span style={{ fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums" }}>
                  {formatPlainDate(h.date)}
                </span>{" "}
                {h.name}
              </li>
            ))}
          </ul>
          {untouched > 0 && (
            <p className="muted" style={{ margin: 0 }}>
              {untouched} date{untouched === 1 ? "" : "s"} in {year} stay as they are.
            </p>
          )}
          <div className="inline-form">
            <button className="btn" type="button" onClick={write} disabled={pending}>
              Add {added} holiday{added === 1 ? "" : "s"}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
