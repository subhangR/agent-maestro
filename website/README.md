# Maestro marketing website

This directory is the static marketing site published by Firebase Hosting.

## Structure

- `index.html` — semantic page structure, content, metadata, real product screenshots, and the animated brand mark
- `styles.css` — design tokens, responsive layouts, components, and reduced-motion behavior
- `app.js` — navigation, reveal behavior, copy control, footer year, product-tour tab switching, and contact-form submission
- `assets/brand/` — brand marks (animated loop layers, favicons, social card)
- `assets/shots/` — optimized product screenshots used in the hero and tour

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

The marketing website is independent from `maestro-server` and `maestro-ui`. It makes two runtime requests, both same-origin: `content/site.json` (public configuration; the HTML is a complete fallback if it fails) and, on contact-form submission, `POST /api/contact`.

`/api/contact` is rewritten in `firebase.json` to the `submitWebsiteInquiry` Cloud Function (`functions/src/websiteInquiry.ts`), which validates and rate-limits the enquiry, stores it in Firestore, and emails a notification (gated on the `CONTACT_MAIL_PASS` env param). If that endpoint is not deployed, `app.js` degrades gracefully to a prefilled `mailto:` draft, so the form is never a dead end.

Contact form data classification: name, email, and message are user-submitted for the sole purpose of responding to the enquiry, gated behind an explicit consent checkbox and a honeypot, and stored privately in Firestore. Do not add analytics, tracking, third-party embeds, authentication, or additional browser storage without an explicit data classification, consent model, retention policy, deletion path, and backend ownership decision.

## Deployment

Firebase Hosting is explicitly pinned to site `maestro-web-fleet` in `firebase.json`, under Firebase project `maestro-5f3fc`. Pull requests receive temporary preview channels; pushes to `main` deploy live after validation and production-environment approval.

Configure the GitHub repository secret `FIREBASE_SERVICE_ACCOUNT_MAESTRO_5F3FC` using a least-privilege Firebase service account before enabling the workflow. `FIREBASE_SERVICE_ACCOUNT_MAESTRO_WEB_FLEET` is accepted as a compatibility alias. If neither secret exists, validation still runs and deployment is explicitly skipped instead of failing the workflow. Never commit the service-account JSON.
