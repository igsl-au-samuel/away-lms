"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/admin/users", label: "Users" },
  { href: "/admin/leave-types", label: "Leave types" },
  { href: "/admin/holidays", label: "Holidays" },
  // Audit sits with the things an admin reviews, not with the thing that rewrites the database: Demo
  // data stays last so the destructive tab is never the one adjacent to a link anyone can click by
  // aiming loosely at the bar (FR-028 says the current tab has to be identifiable without colour, and
  // the order is the other half of finding it by feel).
  { href: "/admin/audit", label: "Audit" },
  { href: "/admin/demo", label: "Demo data" },
];

export function AdminTabs() {
  const pathname = usePathname();
  return (
    <nav aria-label="Admin" className="tabs">
      {TABS.map((t) => (
        <Link key={t.href} href={t.href} className="tab" aria-current={pathname.startsWith(t.href) ? "page" : undefined}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
