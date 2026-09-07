import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { verifyExtension } from "./verify-extension.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { manifest } = verifyExtension();
const dist = path.join(root, "dist");
const output = path.join(dist, `zen-view-for-x-${manifest.version}.zip`);
const archiveName = path.basename(output);

fs.mkdirSync(dist, { recursive: true });
const stage = fs.mkdtempSync(path.join(dist, ".zen-view-for-x-stage-"));

try {
  const payload = path.join(stage, "extension");
  const stagedArchive = path.join(stage, archiveName);
  fs.mkdirSync(payload, { recursive: true });
  fs.cpSync(path.join(root, "manifest.json"), path.join(payload, "manifest.json"));
  fs.cpSync(path.join(root, "src"), path.join(payload, "src"), { recursive: true });

  const iconPaths = new Set([
    ...Object.values(manifest.icons),
    ...Object.values(manifest.action.default_icon),
  ]);
  for (const relativePath of iconPaths) {
    const destination = path.join(payload, relativePath);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.cpSync(path.join(root, relativePath), destination);
  }

  const result = spawnSync("zip", ["-X", "-q", "-r", stagedArchive, "."], {
    cwd: payload,
    encoding: "utf8",
  });

  if (result.error || result.status !== 0) {
    throw new Error(result.error?.message || result.stderr.trim() || "zip failed");
  }

  fs.renameSync(stagedArchive, output);
} finally {
  fs.rmSync(stage, { force: true, recursive: true });
}

console.log(output);
