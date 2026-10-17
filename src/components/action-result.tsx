"use client";

import { useState, useTransition } from "react";
import type { ActionResult } from "../lib/errors";

type Result = { ok: boolean; message: string } | null;

/** Runs a Server Action in a transition and keeps its outcome as a message. */
export function useAction() {
  const [result, setResult] = useState<Result>(null);
  const [pending, start] = useTransition();
  const run = (action: () => Promise<ActionResult<unknown>>, success: string, onOk?: () => void) =>
    start(async () => {
      setResult(null);
      const res = await action();
      setResult(res.ok ? { ok: true, message: success } : { ok: false, message: res.message });
      if (res.ok) onOk?.();
    });
  return { result, pending, run };
}

export function ResultMessage({ result }: { result: Result }) {
  if (!result) return null;
  return (
    <p role={result.ok ? "status" : "alert"} className={result.ok ? "notice" : "alert"}>
      {result.message}
    </p>
  );
}
