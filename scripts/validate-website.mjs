import { readFile, access } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const website = path.join(root, "website");
const requiredFiles = ["index.html", "404.html", "styles.css", "app.js", "content/site.json", "content/site.schema.json"];
const failures = [];

for (const file of requiredFiles) {
  try { await access(path.join(website, file)); }
  catch { failures.push(`Missing website file: ${file}`); }
}

const html = await readFile(path.join(website, "index.html"), "utf8");
const css = await readFile(path.join(website, "styles.css"), "utf8");
const content = JSON.parse(await readFile(path.join(website, "content/site.json"), "utf8"));
const firebase = JSON.parse(await readFile(path.join(root, "firebase.json"), "utf8"));

for (const marker of ["<!doctype html>", "<html lang=", "<title>", "name=\"description\"", "name=\"viewport\"", "<main", "<nav", "<footer"]) {
  if (!html.toLowerCase().includes(marker.toLowerCase())) failures.push(`index.html is missing ${marker}`);
}
if (/href=["']#["']/.test(html)) failures.push("index.html contains placeholder # links");
if (css.split("{").length !== css.split("}").length) failures.push("styles.css has unbalanced rule blocks");
if (content.schemaVersion !== 1) failures.push("site content schemaVersion must equal 1");
for (const key of ["productName", "eyebrow", "heroDescription", "installCommand"]) {
  if (typeof content[key] !== "string" || !content[key].trim()) failures.push(`site content field is missing: ${key}`);
}
if (firebase.hosting?.public !== "website") failures.push("Firebase Hosting public directory must be website");
if (firebase.hosting?.site !== "maestro-web-fleet") failures.push("Firebase Hosting site must be maestro-web-fleet");

if (failures.length) {
  console.error(failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}
console.log(`Website validation passed (${requiredFiles.length} files, schema v${content.schemaVersion}, site ${firebase.hosting.site}).`);
