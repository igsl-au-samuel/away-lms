"use client";

import { CheckSquare, LayoutDashboard, Settings } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { signOut } from "../actions/auth";

type Role = "employee" | "manager" | "admin";

const icon = { size: 18, strokeWidth: 1.5, "aria-hidden": true } as const;

const LINKS: { href: string; label: string; icon: ReactNode; roles: Role[] }[] = [
  { href: "/", label: "Dashboard", icon: <LayoutDashboard {...icon} />, roles: ["employee", "manager", "admin"] },
  { href: "/approvals", label: "Approvals", icon: <CheckSquare {...icon} />, roles: ["manager", "admin"] },
  { href: "/admin/users", label: "Admin", icon: <Settings {...icon} />, roles: ["admin"] },
];

function NavLinks({ role }: { role: Role }) {
  const pathname = usePathname();
  return LINKS.filter((l) => l.roles.includes(role)).map((l) => {
    const current = l.href === "/" ? pathname === "/" : pathname.startsWith(l.href.split("/").slice(0, 2).join("/"));
    return (
      <Link key={l.href} href={l.href} className="navlink" aria-current={current ? "page" : undefined}>
        {l.icon}
        {l.label}
      </Link>
    );
  });
}

function SignOutButton({ className }: { className: string }) {
  return (
    <form action={signOut}>
      <button type="submit" className={className}>
        Sign out
      </button>
    </form>
  );
}

export function Nav({ name, role }: { name: string; role: Role }) {
  return (
    <>
      <aside className="sidebar">
        <span className="brand">Away</span>
        <nav aria-label="Main" className="navlist">
          <NavLinks role={role} />
        </nav>
        <div className="sidebar-foot">
          <span>{name}</span>
          <span style={{ opacity: 0.8, textTransform: "capitalize" }}>{role}</span>
          <SignOutButton className="btn btn-secondary on-brand" />
        </div>
      </aside>
      <header className="topbar">
        <span className="brand">Away</span>
        <SignOutButton className="btn btn-secondary on-brand" />
      </header>
      <nav aria-label="Main" className="bottombar">
        <NavLinks role={role} />
      </nav>
    </>
  );
}
