const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const repositoryRoot = path.resolve(__dirname, "..");
const fixtureParent = path.join(repositoryRoot, "dist");
fs.mkdirSync(fixtureParent, { recursive: true });
const fixtureRoot = fs.mkdtempSync(path.join(fixtureParent, "package-smoke-"));

function writeJson(relativePath, value) {
  const filePath = path.join(fixtureRoot, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function writeFile(relativePath, contents) {
  const filePath = path.join(fixtureRoot, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, contents);
}

function writeMockZip(contents) {
  const zipPath = path.join(fixtureRoot, "bin", "zip");
  writeFile("bin/zip", contents);
  fs.chmodSync(zipPath, 0o755);
  return zipPath;
}

function runPackage() {
  return spawnSync(
    process.execPath,
    [path.join(fixtureRoot, "scripts", "package-extension.mjs")],
    {
      cwd: fixtureRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${path.join(fixtureRoot, "bin")}${path.delimiter}${process.env.PATH}`,
      },
    },
  );
}

function runVerifier() {
  return spawnSync(
    process.execPath,
    [path.join(fixtureRoot, "scripts", "verify-extension.mjs")],
    {
      cwd: fixtureRoot,
      encoding: "utf8",
    },
  );
}

try {
  fs.cpSync(
    path.join(repositoryRoot, "scripts", "package-extension.mjs"),
    path.join(fixtureRoot, "scripts", "package-extension.mjs"),
  );
  fs.cpSync(
    path.join(repositoryRoot, "scripts", "verify-extension.mjs"),
    path.join(fixtureRoot, "scripts", "verify-extension.mjs"),
  );

  writeJson("package.json", {
    name: "zen-view-for-x",
    version: "1.2.3",
  });
  writeJson("package-lock.json", {
    name: "zen-view-for-x",
    version: "1.2.3",
    lockfileVersion: 3,
    packages: {
      "": {
        name: "zen-view-for-x",
        version: "1.2.3",
      },
    },
  });
  writeJson("manifest.json", {
    manifest_version: 3,
    name: "Zen View for X",
    version: "1.2.3",
    icons: {
      "16": "assets/icons/icon-16.png",
    },
    action: {
      default_popup: "src/popup.html",
      default_icon: {
        "16": "assets/icons/icon-16.png",
      },
    },
    content_scripts: [
      {
        css: ["src/content.css"],
        js: ["src/content.js"],
      },
    ],
  });
  writeFile("assets/icons/icon-16.png", "fixture icon");
  writeFile("src/popup.html", "<!doctype html>");
  writeFile("src/content.css", "body {}");
  writeFile("src/content.js", "void 0;");
  writeFile("dist/zen-view-for-x-1.2.3.zip", "known-good archive");
  writeFile("dist/qa-notes.txt", "keep this QA artifact");

  writeMockZip("#!/bin/sh\nprintf '%s\\n' 'intentional zip failure' >&2\nexit 73\n");
  const failedPackage = runPackage();
  assert.notEqual(failedPackage.status, 0, "a zip failure must fail packaging");
  assert.match(failedPackage.stderr, /intentional zip failure/u);
  assert.equal(
    fs.readFileSync(path.join(fixtureRoot, "dist", "zen-view-for-x-1.2.3.zip"), "utf8"),
    "known-good archive",
  );
  assert.equal(
    fs.readFileSync(path.join(fixtureRoot, "dist", "qa-notes.txt"), "utf8"),
    "keep this QA artifact",
  );
  assert.deepEqual(fs.readdirSync(path.join(fixtureRoot, "dist")).sort(), [
    "qa-notes.txt",
    "zen-view-for-x-1.2.3.zip",
  ]);

  writeMockZip("#!/bin/sh\nprintf '%s' 'new archive' > \"$4\"\n");
  const successfulPackage = runPackage();
  assert.equal(successfulPackage.status, 0, successfulPackage.stderr);
  assert.equal(
    fs.readFileSync(path.join(fixtureRoot, "dist", "zen-view-for-x-1.2.3.zip"), "utf8"),
    "new archive",
  );
  assert.equal(
    fs.readFileSync(path.join(fixtureRoot, "dist", "qa-notes.txt"), "utf8"),
    "keep this QA artifact",
  );
  assert.deepEqual(fs.readdirSync(path.join(fixtureRoot, "dist")).sort(), [
    "qa-notes.txt",
    "zen-view-for-x-1.2.3.zip",
  ]);

  writeJson("package.json", {
    name: "zen-view-for-x",
    version: "1.2.4",
  });
  const manifestMismatch = runVerifier();
  assert.notEqual(manifestMismatch.status, 0, "a manifest/package version mismatch must fail");
  assert.match(manifestMismatch.stderr, /Manifest version does not match package\.json/u);

  writeJson("package.json", {
    name: "zen-view-for-x",
    version: "1.2.3",
  });
  writeJson("package-lock.json", {
    name: "zen-view-for-x",
    version: "1.2.3",
    lockfileVersion: 3,
    packages: {
      "": {
        name: "zen-view-for-x",
        version: "1.2.4",
      },
    },
  });
  const lockMismatch = runVerifier();
  assert.notEqual(lockMismatch.status, 0, "a lock root version mismatch must fail");
  assert.match(lockMismatch.stderr, /root package version does not match package\.json/u);

  console.log("package smoke test passed");
} finally {
  fs.rmSync(fixtureRoot, { force: true, recursive: true });
}
