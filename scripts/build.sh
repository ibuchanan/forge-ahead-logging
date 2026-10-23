#!/usr/bin/env sh
set -eu

tsdown --no-dts
tsc -p tsconfig.declarations.json

# Preserve the existing conditional exports while using TypeScript for declarations.
find dist -type f -name '*.d.ts' -exec sh -c '
  for file do
    cp "$file" "${file%.d.ts}.d.cts"
    cp "$file" "${file%.d.ts}.d.mts"
  done
' sh {} +
