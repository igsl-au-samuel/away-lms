import { Check, Clock, Ban, FlaskConical, X } from "lucide-react";
import type { ReactNode } from "react";

type Tone = "pending" | "approved" | "declined" | "cancelled";

function Badge({ tone, icon, children }: { tone: Tone; icon: ReactNode; children: ReactNode }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "var(--space-1)",
        padding: "2px var(--space-2)",
        borderRadius: "var(--radius-control)",
        fontSize: 12,
        fontWeight: 500,
        background: `var(--${tone}-bg)`,
        color: `var(--${tone}-text)`,
      }}
    >
      {icon}
      {children}
    </span>
  );
}

const icon = { size: 14, strokeWidth: 1.5, "aria-hidden": true } as const;

const STATUS = {
  pending: { label: "Pending", icon: <Clock {...icon} /> },
  approved: { label: "Approved", icon: <Check {...icon} /> },
  declined: { label: "Declined", icon: <X {...icon} /> },
} as const;

export function StatusBadge({ status }: { status: keyof typeof STATUS }) {
  const s = STATUS[status];
  return (
    <Badge tone={status} icon={s.icon}>
      {s.label}
    </Badge>
  );
}

export function DemoBadge() {
  return (
    <Badge tone="cancelled" icon={<FlaskConical {...icon} />}>
      Demo
    </Badge>
  );
}

export function InactiveBadge() {
  return (
    <Badge tone="cancelled" icon={<Ban {...icon} />}>
      Inactive
    </Badge>
  );
}
