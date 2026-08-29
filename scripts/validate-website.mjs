import { readFile, access } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const website = path.join(root, "website");
const requiredFiles = [
  "index.html",
  "404.html",
  "styles.css",
  "script.js",
  "robots.txt",
  "sitemap.xml",
  "site.webmanifest",
  "guide/index.html",
  "guide/guide.css",
  "guide/guide.js",
  "guide/guide-index.json",
  "assets/demos/capture-provenance.json",
];
const failures = [];

for (const file of requiredFiles) {
  try { await access(path.join(website, file)); }
  catch { failures.push(`Missing website file: ${file}`); }
}

const html = await readFile(path.join(website, "index.html"), "utf8");
const css = await readFile(path.join(website, "styles.css"), "utf8");
const guide = JSON.parse(await readFile(path.join(website, "guide/guide-index.json"), "utf8"));
const provenance = JSON.parse(await readFile(path.join(website, "assets/demos/capture-provenance.json"), "utf8"));
const manifest = JSON.parse(await readFile(path.join(website, "site.webmanifest"), "utf8"));
const sitemap = await readFile(path.join(website, "sitemap.xml"), "utf8");
const firebase = JSON.parse(await readFile(path.join(root, "firebase.json"), "utf8"));

for (const marker of ["<!doctype html>", "<html lang=", "<title>", "name=\"description\"", "name=\"viewport\"", "<main", "<nav", "<footer"]) {
  if (!html.toLowerCase().includes(marker.toLowerCase())) failures.push(`index.html is missing ${marker}`);
}
if (/href=["']#["']/.test(html)) failures.push("index.html contains placeholder # links");
if (css.split("{").length !== css.split("}").length) failures.push("styles.css has unbalanced rule blocks");
if (guide.plateCount !== 55 || guide.plates?.length !== 55) failures.push("Field guide must contain all 55 Help plates");
if (guide.chapterCount !== 10 || guide.chapters?.length !== 10) failures.push("Field guide must contain all 10 Help chapters");
if (provenance.captures?.length !== 6) failures.push("Capture provenance must contain six Help-derived recordings");
if ((html.match(/<video\b/g) || []).length !== 6) failures.push("Homepage must embed all six Help-derived recordings");
if ((sitemap.match(/<loc>/g) || []).length !== 57) failures.push("Sitemap must contain home, guide, and 55 plate URLs");
if (manifest.short_name !== "tm8") failures.push("Web manifest short_name must be tm8");
if (/Gemini CLI|Your own agents|tm8\.example|maestro-web-fleet\.web\.app/.test(html)) failures.push("Homepage contains a placeholder origin or unevidenced provider claim");
if (firebase.hosting?.public !== "website") failures.push("Firebase Hosting public directory must be website");
if (firebase.hosting?.site !== "maestro-web-fleet") failures.push("Firebase Hosting site must be maestro-web-fleet");
if (firebase.hosting?.trailingSlash !== true) failures.push("Firebase Hosting must preserve canonical trailing slashes");

if (failures.length) {
  console.error(failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}
console.log(`Website validation passed (${requiredFiles.length} required files, ${guide.plateCount} plates, ${provenance.captures.length} recordings, site ${firebase.hosting.site}).`);
