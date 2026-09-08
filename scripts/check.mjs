import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { verifyExtension } from "./verify-extension.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function javascriptFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) return javascriptFiles(file);
    return /\.(?:c|m)?js$/u.test(entry.name) ? [file] : [];
  });
}

const files = ["src", "tests", "scripts"].flatMap((directory) =>
  javascriptFiles(path.join(root, directory)),
);
for (const file of files) {
  const result = spawnSync(process.execPath, ["--check", file], { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const { manifest } = verifyExtension();
console.log(`Checked ${files.length} JavaScript files and verified ${manifest.name} ${manifest.version}.`);
