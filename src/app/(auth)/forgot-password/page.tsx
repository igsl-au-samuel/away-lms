import Link from "next/link";
import { ForgotPasswordForm } from "./forgot-password-form";

export default function ForgotPasswordPage() {
  return (
    <div className="stack">
      <h1 style={{ margin: 0, fontSize: 24 }}>Reset your password</h1>
      <ForgotPasswordForm />
      <Link href="/sign-in">Back to sign in</Link>
    </div>
  );
}
