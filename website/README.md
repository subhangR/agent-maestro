# TM8 launch candidate

This folder is a complete static site.

## Entry points

- `index.html`: public product narrative and interactive proof
- `guide/index.html`: crawlable inventory of all 55 Help plates
- `guide/guide-index.json`: machine-readable product/evidence inventory
- `assets/demos/`: six silent Help-derived recordings, posters, and provenance
- `sitemap.xml`: home, guide index, and all 55 guide pages

## Run

Serve the parent directory and open `/final/`:

    cd /home/tm8/prod-workspace/deliverables/tm8-website
    python3 -m http.server 4173

## Deployment

Upload this folder’s contents to the production web root. The build has no package install, runtime API, tracking script, cookie, remote font, or JavaScript dependency. Video controls and the interactive replays are native/browser-local.

Production metadata assumes `https://tm8.sh/`. If the launch domain changes, update canonical links, Open Graph URLs, JSON-LD URLs, `robots.txt`, and `sitemap.xml` as one atomic edit.

## Accessibility and performance

- Semantic landmarks, skip links, visible focus, modal focus containment, Escape focus restoration, and live step announcements
- Reduced-motion support
- Keyboard and range-input replay controls with dynamic `aria-valuetext`
- Text transcripts for every recorded state sequence
- Mobile progressive disclosure for the six captures
- 78 KB visible WebP with 1200×630 social fallback
- 4.2 MB total site including all six short MP4 recordings, posters, 56 guide pages, and the social image

See `../README.md` for source provenance and verification.
