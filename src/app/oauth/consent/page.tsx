import { redirect } from "next/navigation";
import { copyFor } from "../../../lib/errors";
import { createClient } from "../../../lib/supabase/server";
import { getViewer } from "../../../server/auth";
import { ConsentForm } from "./consent-form";

export const metadata = { title: "Connect an app · Away" };

function Problem({ code }: { code: "authorization_invalid" }) {
  return (
    <div className="stack">
      <h1 style={{ margin: 0, fontSize: 24 }}>Can&apos;t connect</h1>
      <p role="alert" className="alert">
        {copyFor(code)}
      </p>
    </div>
  );
}

/** The host only: the part a person can check against the app they started from. */
function hostOf(uri: string): string {
  try {
    return new URL(uri).host;
  } catch {
    return uri;
  }
}

export default async function ConsentPage({ searchParams }: { searchParams: Promise<{ authorization_id?: string }> }) {
  const { authorization_id: authorizationId } = await searchParams;
  if (!authorizationId) return <Problem code="authorization_invalid" />;

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    const here = `/oauth/consent?authorization_id=${encodeURIComponent(authorizationId)}`;
    redirect(`/sign-in?next=${encodeURIComponent(here)}`);
  }

  const { data, error } = await supabase.auth.oauth.getAuthorizationDetails(authorizationId);
  if (error || !data) return <Problem code="authorization_invalid" />;
  // Already consented to these scopes: straight back to the app.
  if (!("authorization_id" in data)) redirect(data.redirect_url);

  const viewer = await getViewer(supabase);
  const canApprove = viewer !== null;

  return (
    <div className="stack">
      <h1 style={{ margin: 0, fontSize: 24 }}>Connect {data.client.name} to Away?</h1>
      <dl className="stack" style={{ margin: 0, gap: "var(--space-3)" }}>
        <div>
          <dt style={{ color: "var(--text-muted)", fontSize: 12 }}>App</dt>
          <dd style={{ margin: 0 }}>{data.client.name}</dd>
        </div>
        <div>
          <dt style={{ color: "var(--text-muted)", fontSize: 12 }}>It will send you back to</dt>
          <dd style={{ margin: 0, fontFamily: "var(--font-mono)" }}>
            {hostOf(data.redirect_uri)}
          </dd>
        </div>
        <div>
          <dt style={{ color: "var(--text-muted)", fontSize: 12 }}>Signed in as</dt>
          <dd style={{ margin: 0 }}>{viewer ? `${viewer.full_name} (${viewer.email})` : data.user.email}</dd>
        </div>
      </dl>
      {canApprove ? (
        <p style={{ margin: 0 }}>
          If you approve, this app can act as you in Away: read your leave and the team calendar, submit leave, and
          decide requests if you are a manager.
        </p>
      ) : (
        <p role="alert" className="alert">
          {copyFor("account_not_active")}
        </p>
      )}
      <ConsentForm authorizationId={authorizationId} canApprove={canApprove} />
    </div>
  );
}
