# Website update pipelines

Two one-command flows for the two things that push the site from ~8 to a genuine 9.5+:
real product screenshots, and a working contact form. Plus how to redeploy.

---

## 1. Swap in real product screenshots

The tour + hero currently use design-concept screenshots. To replace them with the
real shipped app:

1. Capture the app and name the files after the views you're replacing:
   ```
   home  feed  tasks  graph  team  docs  tracking  leaderboard  feed-panel  task-detail
   ```
   `home` is also the hero shot. `.png`, `.jpg`, or `.jpeg` all work. Crop to the app
   window (no OS chrome); ~1600px wide or larger is ideal.

2. Drop them in a folder and run the processor:
   ```bash
   mkdir -p ~/Downloads/maestro-shots      # put your captures here
   python3 scripts/process-shots.py         # or: python3 scripts/process-shots.py /path/to/dir
   ```
   For each file it writes an optimized **light** JPG and a smart-inverted **dark** JPG
   into `website/assets/shots/`. You only need to provide the views you want to change;
   the rest keep their current assets. The site swaps light/dark automatically.

3. Preview, then ship:
   ```bash
   (cd website && python3 -m http.server 8791)   # open http://localhost:8791
   ./scripts/deploy-website.sh                    # or the deploy steps in section 3
   ```

> Requires Python with Pillow (`python3 -c "import PIL"`). If missing: `pip3 install Pillow`.

---

## 2. Turn on the contact form (email delivery)

The function code is written and committed (`functions/src/websiteInquiry.ts`) — it
validates, rate-limits, stores the enquiry in Firestore, and emails you. It just isn't
deployed yet because that needs a project-owner action. Pick one:

- **Recommended — enable Blaze on the hosting project** (so `/api/contact` is same-origin):
  https://console.firebase.google.com/project/maestro-web-fleet/usage/details
  then deploy to `maestro-web-fleet`.
- **Or** have an owner grant your account **Cloud Functions Admin** on `maestro-5f3fc`,
  then deploy there (cross-origin; already coded for CORS).

Then:
```bash
# one-time: store your Gmail App Password (git-ignored, never committed)
echo 'CONTACT_MAIL_PASS=your16charapppass' > functions/.env.maestro-web-fleet

# deploy
./scripts/deploy-contact.sh maestro-web-fleet      # or: ./scripts/deploy-contact.sh maestro-5f3fc
```
Get the App Password at https://myaccount.google.com/apppasswords (account:
manzilshaik95@gmail.com). Until this runs, the form gracefully falls back to a
prefilled `mailto:` — it's never a dead end.

---

## 3. Deploy the website

```bash
firebase deploy --only hosting --project maestro-web-fleet
```
Live at https://maestro-web-fleet.web.app. Commit changes to `staging`, then fast-forward
`main` per the repo's normal flow.
