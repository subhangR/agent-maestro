import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const manifest = JSON.parse(await readFile(path.join(root, "architecture.json"), "utf8"));
const groups = ["frontends", "backends", "interfaces", "shared", "operations"];
const allPaths = groups.flatMap((group) => manifest[group] ?? []);
const failures = [];

for (const relativePath of allPaths) {
  try {
    await access(path.join(root, relativePath), constants.F_OK);
  } catch {
    failures.push(`Architecture entry does not exist: ${relativePath}`);
  }
}

const duplicates = allPaths.filter((item, index) => allPaths.indexOf(item) !== index);
for (const duplicate of new Set(duplicates)) failures.push(`Architecture entry is grouped more than once: ${duplicate}`);

const packageNames = new Map();
for (const relativePath of allPaths) {
  try {
    const packageJson = JSON.parse(await readFile(path.join(root, relativePath, "package.json"), "utf8"));
    if (packageJson.name) packageNames.set(packageJson.name, relativePath);
  } catch {
    // Static sites and operations directories do not require a package.json.
  }
}

const frontendNames = new Set((manifest.frontends ?? []).flatMap((entry) => [...packageNames].filter(([, value]) => value === entry).map(([name]) => name)));
const backendNames = new Set((manifest.backends ?? []).flatMap((entry) => [...packageNames].filter(([, value]) => value === entry).map(([name]) => name)));
const sharedNames = new Set((manifest.shared ?? []).flatMap((entry) => [...packageNames].filter(([, value]) => value === entry).map(([name]) => name)));

for (const [packageName, relativePath] of packageNames) {
  const packageJson = JSON.parse(await readFile(path.join(root, relativePath, "package.json"), "utf8"));
  const dependencies = { ...packageJson.dependencies, ...packageJson.optionalDependencies };
  const dependencyNames = Object.keys(dependencies);
  if (frontendNames.has(packageName)) {
    for (const dependency of dependencyNames.filter((name) => backendNames.has(name))) failures.push(`${packageName} must not depend on backend package ${dependency}`);
  }
  if (backendNames.has(packageName)) {
    for (const dependency of dependencyNames.filter((name) => frontendNames.has(name))) failures.push(`${packageName} must not depend on frontend package ${dependency}`);
  }
  if (sharedNames.has(packageName)) {
    for (const dependency of dependencyNames.filter((name) => packageNames.has(name))) failures.push(`Shared package ${packageName} must not depend on application package ${dependency}`);
  }
}

if (failures.length) {
  console.error(`Architecture check failed:\n${failures.map((failure) => `- ${failure}`).join("\n")}`);
  process.exit(1);
}

console.log(`Architecture check passed for ${allPaths.length} grouped paths and ${packageNames.size} packages.`);
