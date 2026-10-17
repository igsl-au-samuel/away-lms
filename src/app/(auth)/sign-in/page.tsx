import Link from "next/link";
import { SignInForm } from "./sign-in-form";

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <div className="stack">
      <h1 style={{ margin: 0, fontSize: 24 }}>Sign in</h1>
      {error === "link" && <p className="alert">That link has expired or was already used. Request a new one.</p>}
      <SignInForm />
      <Link href="/forgot-password">Forgot password?</Link>
    </div>
  );
}
