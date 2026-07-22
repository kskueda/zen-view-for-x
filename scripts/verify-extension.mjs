import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(
  fs.readFileSync(path.join(root, "manifest.json"), "utf8"),
);

if (manifest.manifest_version !== 3) {
  throw new Error("The extension must use Manifest V3.");
}

if (manifest.name !== "Zen View for X" || manifest.version !== "1.0.0") {
  throw new Error("Manifest branding or version does not match the release.");
}

for (const relativePath of [
  ...Object.values(manifest.icons),
  ...Object.values(manifest.action.default_icon),
  manifest.action.default_popup,
  ...manifest.content_scripts.flatMap((entry) => [...entry.css, ...entry.js]),
]) {
  if (!fs.existsSync(path.join(root, relativePath))) {
    throw new Error(`Missing manifest asset: ${relativePath}`);
  }
}

console.log(`Verified ${manifest.name} ${manifest.version}.`);
