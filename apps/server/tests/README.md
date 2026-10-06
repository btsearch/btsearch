# Sora's unit tests

Run from the repository root:

```sh
pnpm --filter @openbts/sora test
pnpm --filter @openbts/sora test:watch
pnpm --filter @openbts/sora test:coverage
pnpm --filter @openbts/sora check-types:tests
pnpm --filter @openbts/sora check-types
```

Pass a test path to `test` to run a focused suite, for example:

```sh
pnpm --filter @openbts/sora test "test/routes/v2/(post)/cells/apply.test.ts"
```
