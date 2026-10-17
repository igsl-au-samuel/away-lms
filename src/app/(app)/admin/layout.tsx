import type { ReactNode } from "react";
import { Forbidden } from "../../../components/forbidden";
import { getRequestViewer } from "../../../server/auth";
import { AdminTabs } from "./admin-tabs";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const viewer = await getRequestViewer();
  if (viewer?.role !== "admin") return <Forbidden />;
  return (
    <div className="stack">
      <AdminTabs />
      {children}
    </div>
  );
}
