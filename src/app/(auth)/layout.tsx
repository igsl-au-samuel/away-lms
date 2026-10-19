import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main style={{ display: "grid", placeItems: "center", minHeight: "100vh", padding: "var(--space-4)" }}>
      <div className="card" style={{ width: "100%", maxWidth: 400, boxSizing: "border-box" }}>
        <p className="brand" style={{ margin: "0 0 var(--space-4)", color: "var(--text)" }}>
          Away
        </p>
        {children}
      </div>
    </main>
  );
}
