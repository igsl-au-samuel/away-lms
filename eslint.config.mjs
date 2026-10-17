import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: [".next/", "node_modules/", "next-env.d.ts", "coverage/", "out/", ".open-next/", ".wrangler/", "playwright-report/", "test-results/", "supabase/functions/**/index.ts"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Node scripts (e.g. scripts/backlog/sync.mjs)
    files: ["scripts/**/*.mjs"],
    languageOptions: {
      globals: { console: "readonly", process: "readonly" },
    },
  },
);
