# tm8 public website

The static marketing site for tm8. It is live at https://tm8-site.web.app, Firebase Hosting site `tm8-site` in project `lvlup-ff6fa`, deployed with the repository-root `firebase.tm8-site.json` (the root `firebase.json` belongs to the Maestro project and its validator).

- `index.html`, `404.html`, `styles.css`, `app.js` — the page. No framework, no tracking, no third-party scripts; the Geist fonts come from Google Fonts.
- `content/site.json` + `site.schema.json` — the fields the deploy validator checks, plus `contactEmail` for the form's mail fallback.
- `assets/real/*.webp` — cropped screenshots of the real product (a cross-model spawn: a coordinator with a Haiku 4.5 worker on claude-code and a GPT 5.6 worker on codex).
- `assets/video/rec-*.mp4` + `.jpg` — replays of real command output captured on a tm8 node; they load only on click.
- `robots.txt`, `sitemap.xml`, `site.webmanifest`, `llms.txt` — search and answer-engine files. Everything assumes the canonical https://tm8.sh/.

The page source, build script, evidence and the plan live in the tm8 workspace under `deliverables/tm8-website-v2/`; `index.html` here is the built output.

## Runtime requests

Three cross-origin requests on load (the Geist stylesheet from fonts.googleapis.com and two woff2 files from fonts.gstatic.com, allowed by the CSP in firebase.json). On demo-form submission, one same-origin request: `POST /api/contact`, which `firebase.json` rewrites to the `submitWebsiteInquiry` Cloud Function (`functions/src/websiteInquiry.ts`). The function validates, rate-limits, stores the enquiry in Firestore and emails a notification when `CONTACT_MAIL_PASS` is set. If the function is not deployed, `app.js` falls back to a prefilled `mailto:` draft, so the form is never a dead end.

The form sends name, email, company (optional), message, `type: "demo"`, a consent flag and a honeypot field. No analytics, no cookies, no browser storage.

## Preview

```bash
python3 -m http.server 4173 --directory website
```

Then open http://localhost:4173. `node scripts/validate-website.mjs` from the repository root runs the deploy validator.

## Deploy

The `deploy-tm8-site` jobs in `.github/workflows/deploy-website.yml` publish a preview channel on every pull request that touches `website/` and deploy live on every merge to `main`, using the repository secret `FIREBASE_SERVICE_ACCOUNT_LVLUP_FF6FA` (the JSON key of a service account with the Firebase Hosting Admin role on lvlup-ff6fa). By hand, from a machine with that key:

```bash
GOOGLE_APPLICATION_CREDENTIALS=/path/to/lvlup-ff6fa-key.json \
npx firebase-tools deploy --only hosting --project lvlup-ff6fa --config firebase.tm8-site.json
```

`/api/contact` falls back to a mail draft until `submitWebsiteInquiry` is deployed to lvlup-ff6fa and a `rewrites` entry is added to `firebase.tm8-site.json`.
