import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Balances, type BalanceRow } from "../../src/components/balances";

/** `available` is the server's number, not this file's, so the fixtures below keep it honest. */
function row(over: Partial<BalanceRow> = {}): BalanceRow {
  const base: BalanceRow = {
    leave_type_id: "lt-annual",
    name: "Annual",
    is_capped: true,
    allowance: 20,
    taken: 3,
    pending: 2,
    available: 15,
  };
  return { ...base, ...over };
}

function html(...rows: BalanceRow[]) {
  return renderToStaticMarkup(<Balances rows={rows} year={2026} />);
}

function segment(markup: string, kind: "usage-taken" | "usage-pending"): string | undefined {
  return markup.match(new RegExp(`class="${kind}"[^>]*`))?.[0];
}

describe("Balances usage bar", () => {
  it("fills taken then pending against the allowance", () => {
    const markup = html(row());
    expect(markup).toContain('role="img" aria-label="3 of 20 days used, 2 pending"');
    expect(segment(markup, "usage-taken")).toContain("width:15%");
    expect(segment(markup, "usage-pending")).toContain("width:10%");
  });

  it("saturates at 100% when taken passes the allowance, and says so in the label", () => {
    const markup = html(row({ allowance: 10, taken: 11, pending: 2, available: -3 }));
    expect(markup).toContain('aria-label="11 of 10 days used, 2 pending, over by 3 days"');
    expect(segment(markup, "usage-taken")).toContain("width:100%");
    expect(markup).not.toContain("usage-pending");
  });

  it("clips pending to the room the allowance has left rather than overflowing the track", () => {
    const markup = html(row({ allowance: 10, taken: 8, pending: 5, available: -3 }));
    expect(segment(markup, "usage-taken")).toContain("width:80%");
    expect(segment(markup, "usage-pending")).toContain("width:20%");
  });

  it("draws an empty track when the allowance is 0, instead of dividing by it", () => {
    const markup = html(row({ allowance: 0, taken: 0, pending: 0, available: 0 }));
    expect(markup).toContain('aria-label="0 of 0 days used"');
    expect(markup).toContain('class="usage"');
    expect(markup).not.toContain("usage-taken");
    expect(markup.match(/width:/g)).toBeNull();
  });

  it("draws no bar at all for an uncapped type", () => {
    const markup = html(row({ leave_type_id: "lt-unpaid", name: "Unpaid", is_capped: false, allowance: 0, taken: 4, pending: 1.5, available: 0 }));
    expect(markup).not.toContain('class="usage"');
    expect(markup).toContain("No cap");
  });

  it("counts a fractional allowance in the label without a stray .0", () => {
    const markup = html(row({ allowance: 7.5, taken: 1.5, pending: 0, available: 6 }));
    expect(markup).toContain('aria-label="1.5 of 7.5 days used"');
    expect(segment(markup, "usage-taken")).toContain("width:20%");
  });
});
