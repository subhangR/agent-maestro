#!/usr/bin/env bash
# Validate and deploy the marketing website to Firebase Hosting.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
node scripts/validate-website.mjs 2>/dev/null || bun scripts/validate-website.mjs
firebase deploy --only hosting --project maestro-web-fleet
echo "✓ Live at https://maestro-web-fleet.web.app"
