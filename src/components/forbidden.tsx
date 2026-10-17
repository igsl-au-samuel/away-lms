import Link from "next/link";

export function Forbidden() {
  return (
    <div className="stack" role="alert">
      <h1 style={{ margin: 0, fontSize: 24 }}>You don&apos;t have access to this page</h1>
      <p className="muted" style={{ margin: 0 }}>
        Ask an admin if you think you should.
      </p>
      <Link href="/">Back to the dashboard</Link>
    </div>
  );
}
