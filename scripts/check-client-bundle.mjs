// Fails if secrets or server-only code leak into the built client output.
// Run after `next build`. Usage: node scripts/check-client-bundle.mjs
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const dir = join(".next", "static");
const forbidden = ["sb_secret_", "SUPABASE_SECRET_KEY", "server-only"];

function* walk(d) {
  for (const name of readdirSync(d)) {
    const p = join(d, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (/\.(js|css|html|json|map)$/.test(name)) yield p;
  }
}

let files;
try {
  files = [...walk(dir)];
} catch {
  console.error(`No client output at ${dir}. Run the build first.`);
  process.exit(2);
}

const hits = [];
for (const file of files) {
  const text = readFileSync(file, "utf8");
  for (const needle of forbidden) if (text.includes(needle)) hits.push(`${file}: ${needle}`);
}

if (hits.length) {
  console.error("Forbidden strings found in the client bundle:\n" + hits.join("\n"));
  process.exit(1);
}
console.log(`Client bundle clean (${files.length} files checked).`);
