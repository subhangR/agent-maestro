#!/usr/bin/env bash
# Phase-gate runner — Sentinel (QA).
#
# Runs the SAFE, concurrency-friendly gates: per-package `tsc --noEmit`, the drift
# guard in isolation, suppression-directive grep, and expo-doctor. It deliberately
# does NOT run a Metro bundle (`expo export`) as part of the default gate.
#
# PROJECT MEMORY (load-bearing): many workers running full bundles concurrently
# SIGTERM-kill each other's builds. The verified mitigation is per-package tsc.
# The bundle sanity check (`expo export`) is SERIALIZED and run ALONE via
# `--with-export`, only when no worker is bundling. Never background it.
#
# Usage:
#   __qa__/gates/run-gate.sh                # safe gates only (default)
#   __qa__/gates/run-gate.sh --with-export  # also run the serialized Metro export (run ALONE)
#
# Run from the maestro-mobile package root.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT" || exit 2

PASS=0; FAIL=0
green() { printf '  \033[32m✓\033[0m %s\n' "$1"; PASS=$((PASS+1)); }
red()   { printf '  \033[31m✗\033[0m %s\n' "$1"; FAIL=$((FAIL+1)); }
hdr()   { printf '\n\033[1m%s\033[0m\n' "$1"; }

WITH_EXPORT=0
[ "${1:-}" = "--with-export" ] && WITH_EXPORT=1

# 1. App typecheck — strict, no emit, no bundler. Safe under concurrency.
hdr "1. App typecheck (tsc --noEmit)"
if npx tsc --noEmit -p tsconfig.json; then green "app tsconfig clean"; else red "app tsconfig FAILED"; fi

# 2. Drift guard in ISOLATION — its own tsconfig that resolves server types.
#    Must NOT leak server errors into the app gate (separate invocation).
hdr "2. Drift guard (tsc -p tsconfig.drift.json)"
if [ -f tsconfig.drift.json ]; then
  if npx tsc -p tsconfig.drift.json; then green "drift guard clean (isolated)"; else red "drift guard FAILED"; fi
else
  red "tsconfig.drift.json MISSING (Lexicon owns it)"
fi

# 3. Isolation invariants — assert the app gate and bundle can't see __sync__ / server.
hdr "3. Isolation invariants"
if grep -q "src/domain/__sync__" tsconfig.json; then green "app tsconfig excludes src/domain/__sync__"; else red "app tsconfig does NOT exclude src/domain/__sync__"; fi
if grep -q "__sync__" metro.config.js && grep -q "maestro-server" metro.config.js; then
  green "metro blockList excludes __sync__ + ../maestro-server"
else
  red "metro blockList missing __sync__ or ../maestro-server"
fi

# 4. No suppression directives sneaked in to pass the gate.
hdr "4. Suppression-directive scan (src/ app/ navigation/)"
SUPPRESS=$(grep -rn "@ts-nocheck\|@ts-expect-error\|@ts-ignore" src app navigation 2>/dev/null | grep -v "__sync__" || true)
if [ -z "$SUPPRESS" ]; then green "no @ts-nocheck/@ts-ignore/@ts-expect-error"; else red "suppression directives found:"; echo "$SUPPRESS"; fi

# 5. expo-doctor — SDK/RN/native-module version drift. Cheap, concurrency-safe.
hdr "5. expo-doctor"
if npx --yes expo-doctor 2>/dev/null; then green "expo-doctor clean"; else red "expo-doctor reported issues (review above)"; fi

# 6. Serialized Metro export — ONLY when explicitly requested and run ALONE.
if [ "$WITH_EXPORT" = "1" ]; then
  hdr "6. Metro export (SERIALIZED — must run alone)"
  if npx expo export --platform android --output-dir "/tmp/__qa_export_$$" >/dev/null 2>&1; then
    green "expo export (android) bundled"
    rm -rf "/tmp/__qa_export_$$"
  else
    red "expo export FAILED"
  fi
else
  hdr "6. Metro export — SKIPPED (run with --with-export, alone)"
fi

hdr "GATE SUMMARY: $PASS pass / $FAIL fail"
[ "$FAIL" -eq 0 ] || exit 1
