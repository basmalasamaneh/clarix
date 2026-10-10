#!/bin/bash
set -e
pnpm install --frozen-lockfile
pnpm --filter @workspace/api-server exec tsx src/scripts/setup-schema.ts
pnpm --filter @workspace/api-server run setup:rls
if [ "${SEED_TEST_USERS:-}" = "true" ]; then
  pnpm --filter @workspace/api-server run seed:test
fi
