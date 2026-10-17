import type { ReactNode } from "react";
import { Forbidden } from "../../../components/forbidden";
import { getRequestViewer } from "../../../server/auth";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const viewer = await getRequestViewer();
  if (viewer?.role !== "admin") return <Forbidden />;
  return children;
}
