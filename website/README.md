# Maestro marketing website

This directory is the static marketing site published by Firebase Hosting.

## Structure

- `index.html` — semantic page structure, content, metadata, and product preview markup
- `styles.css` — design tokens, responsive layouts, components, and reduced-motion behavior
- `app.js` — navigation, reveal behavior, copy control, and footer year

No build step is required. Preview locally from the repository root:

```bash
python3 -m http.server 4173 --directory website
```

Then open `http://localhost:4173`.

## Validation

Before deployment:

1. Check desktop, tablet, and mobile widths.
2. Navigate the page using only the keyboard.
3. Test with reduced motion enabled.
4. Verify every external GitHub/documentation link.
5. Confirm the Firebase target before running `firebase deploy --only hosting`.

Run the repeatable package check with `bun run check:website`.

## Production boundary

The marketing website is intentionally independent from `maestro-server`, `maestro-ui`, and notification Functions. Its only runtime request is the same-origin `content/site.json` public configuration. The HTML contains a complete fallback, so a content request failure does not blank or break the page.

The website collects and stores no personal data. Do not add forms, analytics, tracking, authentication, or browser storage without an explicit data classification, consent model, retention policy, deletion path, abuse protection, and backend ownership decision.

## Deployment

Firebase Hosting is explicitly pinned to site `maestro-web-fleet` in `firebase.json`, under Firebase project `maestro-5f3fc`. Pull requests receive temporary preview channels; pushes to `main` deploy live after validation and production-environment approval.

Configure the GitHub repository secret `FIREBASE_SERVICE_ACCOUNT_MAESTRO_5F3FC` using a least-privilege Firebase service account before enabling the workflow. Never commit the service-account JSON.
