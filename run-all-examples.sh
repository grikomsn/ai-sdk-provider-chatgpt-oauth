#!/usr/bin/env bash

set -euo pipefail

npm run build
npm run typecheck:examples

examples=(
  "check-auth"
  "basic-usage"
  "streaming"
  "reasoning-effort"
  "basic-usage-gpt-5-4"
  "streaming-gpt-5-4"
  "instructions-gpt-5-4"
  "generate-json-basic"
  "generate-json-basic-gpt-5-4"
)

for example in "${examples[@]}"; do
  printf '\nRunning %s.ts\n' "$example"
  npx tsx "examples/$example.ts"
done

printf '\nAll supported examples completed successfully.\n'
