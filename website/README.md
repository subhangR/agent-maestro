# tm8 public website

The static marketing site for tm8. It is live at https://tm8-site.web.app, Firebase Hosting site `tm8-site` in project `lvlup-ff6fa`, deployed with the repository-root `firebase.tm8-site.json` (the root `firebase.json` belongs to the Maestro project and its validator). tm8.sh is the platform app and is not this site.

- `index.html`, `404.html`, `styles.css`, `app.js` — the page. No framework, no tracking, no third-party scripts; the Geist fonts come from Google Fonts. Scripts and stylesheets carry a content hash in their URL (`?v=`) so a deploy is never served stale.
- `assets/vendor/` — the Firebase app and auth SDK builds, served from the site so the CSP keeps `script-src 'self'`.
- `assets/real/*.webp` — cropped screenshots of the real product; `assets/video/rec-*.mp4` — replays of real command output, loaded only on click.
- `content/site.json` + `site.schema.json` — the fields the deploy validator checks, plus `contactEmail` for the mail fallback.
- `robots.txt`, `sitemap.xml`, `site.webmanifest`, `llms.txt` — search and answer-engine files. Every absolute URL is https://tm8-site.web.app/.

The page source, build script, evidence and the plan live in the tm8 workspace under `deliverables/tm8-website-v2/`; `index.html` here is the built output.

## Runtime requests

On load: the Geist stylesheet from fonts.googleapis.com and its two woff2 files from fonts.gstatic.com (allowed by the CSP). Nothing else until the visitor acts.

Accounts use Firebase Auth in project lvlup-ff6fa (web app `tm8-site`): create with email and password, verify from the email Firebase sends, sign in, resend, password reset, sign out. The SDK talks to identitytoolkit.googleapis.com and securetoken.googleapis.com, both allowed in `connect-src`.

A verified account reserves its seat with one PUT to the site's own Realtime Database instance, `tm8-site-inquiries` (`/signups/$uid`, write-once, readable only by that user), and files demo requests with a POST to `/inquiries` (write-once, push-id keys only, email must equal the account's verified email). The rules are `database.tm8-site-inquiries.rules.json` at the repository root and deploy with `firebase deploy --only database --project lvlup-ff6fa --config firebase.tm8-site.json`. Nothing on the site can read either path.

Who reads the requests: the site owner, in the Firebase console (Realtime Database → tm8-site-inquiries → `/inquiries` and `/signups`), or with `tools/inbox.cjs` from the tm8 workspace using the project's service-account key. The page tells the visitor that requests are read every working day; keep that true. There is no email notification per request yet: the `submitWebsiteInquiry` function in `functions/` (which validates, rate-limits, stores in Firestore and emails) cannot be deployed to lvlup-ff6fa until the deploying service account holds *Service Account User* on `lvlup-ff6fa@appspot.gserviceaccount.com`. Without JavaScript the account forms hide their buttons and show a mail address instead.

## Preview and deploy

```bash
python3 -m http.server 4173 --directory website          # then open http://localhost:4173
node scripts/validate-website.mjs                        # the deploy validator, from the repository root
GOOGLE_APPLICATION_CREDENTIALS=/path/to/lvlup-ff6fa-key.json \
npx firebase-tools deploy --only hosting,database --project lvlup-ff6fa --config firebase.tm8-site.json
```

`docs/website/deploy-tm8-site.workflow.yml` holds the two workflow jobs (preview per pull request, live on merge to `main`) to append to `.github/workflows/deploy-website.yml`; they need the repository secret `FIREBASE_SERVICE_ACCOUNT_LVLUP_FF6FA`.
