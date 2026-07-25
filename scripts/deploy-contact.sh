#!/usr/bin/env bash
# Deploy the website contact function once billing/permissions are in place.
#
# Usage:
#   scripts/deploy-contact.sh [PROJECT]
#     PROJECT defaults to maestro-web-fleet (needs the Blaze plan).
#     Use maestro-5f3fc if you were granted Cloud Functions Admin there instead.
set -euo pipefail
PROJECT="${1:-maestro-web-fleet}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
ENVFILE="functions/.env.$PROJECT"

echo "→ Target project: $PROJECT"
if [ ! -f "$ENVFILE" ] || ! grep -qE '^CONTACT_MAIL_PASS=[^ ]' "$ENVFILE" || grep -qE '^CONTACT_MAIL_PASS=PENDING' "$ENVFILE"; then
  cat <<EOF

✗ Missing the Gmail App Password. Create it (16 chars, no spaces) at
  https://myaccount.google.com/apppasswords for manzilshaik95@gmail.com, then:

    echo 'CONTACT_MAIL_PASS=your16charapppass' > $ENVFILE

  ($ENVFILE is git-ignored, so the secret never gets committed.)
EOF
  exit 1
fi

echo "→ Building functions…"
bun run --cwd functions build
echo "→ Deploying submitWebsiteInquiry…"
firebase deploy --only functions:notifications:submitWebsiteInquiry --project "$PROJECT"
echo "✓ Done. Submit the site's contact form to test — you should get an email."
