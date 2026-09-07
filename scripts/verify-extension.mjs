import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(scriptPath), "..");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function assertOptionalMetadataMatchesPackage(metadata, label, packageMetadata) {
  if (typeof metadata?.name === "string" && metadata.name !== packageMetadata.name) {
    throw new Error(`${label} name does not match package.json.`);
  }

  if (typeof metadata?.version === "string" && metadata.version !== packageMetadata.version) {
    throw new Error(`${label} version does not match package.json.`);
  }
}

export function verifyExtension(projectRoot = root) {
  const manifest = readJson(path.join(projectRoot, "manifest.json"));
  const packageMetadata = readJson(path.join(projectRoot, "package.json"));

  if (manifest.manifest_version !== 3) {
    throw new Error("The extension must use Manifest V3.");
  }

  if (manifest.name !== "Zen View for X") {
    throw new Error("Manifest branding does not match the release.");
  }

  if (manifest.version !== packageMetadata.version) {
    throw new Error("Manifest version does not match package.json.");
  }

  const lockPath = path.join(projectRoot, "package-lock.json");
  if (fs.existsSync(lockPath)) {
    const lockMetadata = readJson(lockPath);
    assertOptionalMetadataMatchesPackage(lockMetadata, "package-lock.json", packageMetadata);
    assertOptionalMetadataMatchesPackage(
      lockMetadata.packages?.[""],
      "package-lock.json root package",
      packageMetadata,
    );
  }

  for (const relativePath of [
    ...Object.values(manifest.icons),
    ...Object.values(manifest.action.default_icon),
    manifest.action.default_popup,
    ...manifest.content_scripts.flatMap((entry) => [...entry.css, ...entry.js]),
  ]) {
    if (!fs.existsSync(path.join(projectRoot, relativePath))) {
      throw new Error(`Missing manifest asset: ${relativePath}`);
    }
  }

  return { manifest, packageMetadata };
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(scriptPath)) {
  const { manifest } = verifyExtension();
  console.log(`Verified ${manifest.name} ${manifest.version}.`);
}
