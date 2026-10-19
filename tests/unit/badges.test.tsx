import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DemoBadge, InactiveBadge, StatusBadge } from "../../src/components/badges";

describe("badges", () => {
  it.each([
    ["pending", "Pending"],
    ["approved", "Approved"],
    ["declined", "Declined"],
  ] as const)("StatusBadge %s shows its label and an icon", (status, label) => {
    const html = renderToStaticMarkup(<StatusBadge status={status} />);
    expect(html).toContain(label);
    expect(html).toContain("<svg");
  });

  it("DemoBadge shows its label and an icon", () => {
    const html = renderToStaticMarkup(<DemoBadge />);
    expect(html).toContain("Demo");
    expect(html).toContain("<svg");
  });

  it("InactiveBadge shows its label and an icon", () => {
    const html = renderToStaticMarkup(<InactiveBadge />);
    expect(html).toContain("Inactive");
    expect(html).toContain("<svg");
  });
});
