"use client";

import { useRef } from "react";
import { loadDemo, setDemoActive } from "../../../../actions/demo";
import { ResultMessage, useAction } from "../../../../components/action-result";

export function LoadDemoForm({ hasDemo }: { hasDemo: boolean }) {
  const { result, pending, run } = useAction();
  const form = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={form}
      className="stack"
      action={(data) =>
        // The password goes straight to the action and the field is cleared afterwards.
        run(() => loadDemo({ password: data.get("password") }), hasDemo ? "Demo data reset." : "Demo data loaded.", () =>
          form.current?.reset(),
        )
      }
    >
      <label className="field">
        Password for every demo login
        <input
          className="input"
          name="password"
          type="password"
          required
          minLength={10}
          autoComplete="new-password"
          aria-describedby="demo-password-help"
        />
      </label>
      <p id="demo-password-help" className="muted" style={{ margin: 0 }}>
        At least 10 characters. It isn&apos;t stored anywhere in the app; keep it somewhere safe to sign in as a demo
        user.
      </p>
      <ResultMessage result={result} />
      <div>
        <button className="btn" type="submit" disabled={pending}>
          {pending ? "Loading…" : hasDemo ? "Reset demo data" : "Load demo data"}
        </button>
      </div>
    </form>
  );
}

export function DemoActiveButton({ active }: { active: boolean }) {
  const { result, pending, run } = useAction();
  return (
    <div className="stack">
      <div>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={pending}
          onClick={() =>
            run(() => setDemoActive({ active: !active }), active ? "Demo logins disabled." : "Demo logins enabled.")
          }
        >
          {active ? "Disable all demo logins" : "Enable all demo logins"}
        </button>
      </div>
      <ResultMessage result={result} />
    </div>
  );
}
