import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(
  fs.readFileSync(path.join(root, "manifest.json"), "utf8"),
);
const dist = path.join(root, "dist");
const stage = fs.mkdtempSync(path.join(os.tmpdir(), "zen-view-for-x-"));
const output = path.join(dist, `zen-view-for-x-${manifest.version}.zip`);

fs.rmSync(dist, { force: true, recursive: true });
fs.mkdirSync(path.join(stage, "assets", "icons"), { recursive: true });
fs.cpSync(path.join(root, "manifest.json"), path.join(stage, "manifest.json"));
fs.cpSync(path.join(root, "src"), path.join(stage, "src"), { recursive: true });

for (const size of [16, 32, 48, 128]) {
  fs.cpSync(
    path.join(root, "assets", "icons", `icon-${size}.png`),
    path.join(stage, "assets", "icons", `icon-${size}.png`),
  );
}

fs.mkdirSync(dist, { recursive: true });
const result = spawnSync("zip", ["-X", "-q", "-r", output, "."], {
  cwd: stage,
  encoding: "utf8",
});
fs.rmSync(stage, { force: true, recursive: true });

if (result.status !== 0) {
  throw new Error(result.stderr || "zip failed");
}

console.log(output);
