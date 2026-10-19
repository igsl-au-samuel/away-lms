"use server";

import { redirect } from "next/navigation";
import { createClient } from "../lib/supabase/server";
import { ERROR_COPY, type ActionResult } from "../lib/errors";
import { authorizationDecisionSchema } from "../lib/schemas";
import { getViewer } from "../server/auth";

const refuse = (code: keyof typeof ERROR_COPY): ActionResult<never> => ({ ok: false, code, message: ERROR_COPY[code] });

/**
 * Approve or deny an OAuth authorization (the /oauth/consent page). Needs a session; only an active
 * profile may approve, but anyone signed in may deny. On success it redirects to the client's
 * redirect URL, so it only ever returns a failure.
 */
export async function decideAuthorization(input: unknown): Promise<ActionResult<never>> {
  const parsed = authorizationDecisionSchema.safeParse(input);
  if (!parsed.success) return refuse("authorization_invalid");
  const { authorizationId, decision } = parsed.data;

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return refuse("not_allowed");
  if (decision === "approve" && !(await getViewer(supabase))) return refuse("account_not_active");

  const options = { skipBrowserRedirect: true };
  const { data, error } =
    decision === "approve"
      ? await supabase.auth.oauth.approveAuthorization(authorizationId, options)
      : await supabase.auth.oauth.denyAuthorization(authorizationId, options);
  if (error || !data?.redirect_url) return refuse("authorization_invalid");
  redirect(data.redirect_url);
}
