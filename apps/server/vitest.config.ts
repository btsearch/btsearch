import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const workspace = fileURLToPath(new URL("../../", import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@openbts\/shared\/contract$/, replacement: `${workspace}packages/shared/src/contract/index.ts` },
      { find: /^@openbts\/shared\/(.+)$/, replacement: `${workspace}packages/shared/src/$1.ts` },
      { find: "@openbts/country-packs/sources", replacement: `${workspace}packages/country-packs/sources.ts` },
      { find: "@openbts/country-packs", replacement: `${workspace}packages/country-packs/index.ts` },
      { find: "@openbts/drizzle/db", replacement: `${workspace}packages/drizzle/db.ts` },
      { find: "@openbts/drizzle", replacement: `${workspace}packages/drizzle/schemas/index.ts` },
    ],
    dedupe: ["drizzle-orm", "zod"],
  },
  test: {
    globals: false,
    environment: "node",
    include: ["tests/**/*.test.ts"],
    setupFiles: ["tests/helpers/setup.ts"],
    maxWorkers: 4,
    env: {
      NODE_ENV: "test",
      DOTENV_CONFIG_PATH: ".env.test.nonexistent",
      BASE_URL: "http://localhost:3030",
      CLIENT_ORIGIN: "http://localhost:5173",
      DATABASE_URL: "postgres://unit:unit@127.0.0.1:1/unit",
      AXIOM_TOKEN: "",
      RESEND_API_KEY: "re_test_unit_tests",
      VAPID_PUBLIC_KEY: "",
      VAPID_PRIVATE_KEY: "",
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "html"],
      include: [
        "src/routes/v2/**/*.ts",
        "src/features/submissions/**/*.ts",
        "src/middlewares/{auth,idempotency}.middleware.ts",
        "src/features/access/{access,scope}.ts",
        "src/plugins/auth/oauthToken.ts",
        "src/errors.ts",
        "src/controllers/routeLoader.ts",
      ],
      exclude: ["tests/**"],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
});
