"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/admin/users", label: "Users" },
  { href: "/admin/leave-types", label: "Leave types" },
  { href: "/admin/holidays", label: "Holidays" },
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
