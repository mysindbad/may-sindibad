import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Mirrors the "@/*" -> "src/*" path alias from tsconfig.json so unit tests can
// import modules that use it, and stubs the "server-only" marker package.
// Test tooling only; the app build is unaffected.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "server-only": fileURLToPath(new URL("./test/stubs/server-only.ts", import.meta.url)),
    },
  },
});
