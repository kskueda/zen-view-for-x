const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const savedSettings = {
  engagementCounts: false,
  promotedPosts: false,
  sidebarPremium: false,
  sidebarLive: false,
  sidebarRecommendations: false,
  sidebarTrends: false,
  sidebarNews: false,
  leftNavIconOnly: false,
};

async function createPopup(browser) {
  const page = await browser.newPage();
  page.setDefaultTimeout(5000);
  await page.addInitScript(() => {
    const api = window.chrome || {};
    window.chrome = api;
    api.runtime = {};
    window.writes = [];
    api.storage = { local: {
      get(_keys, callback) {
        window.resolveRead = (settings, fail = false) => {
          api.runtime.lastError = fail ? { message: "Read failed" } : undefined;
          callback({ xhecSettings: settings });
          api.runtime.lastError = undefined;
        };
      },
      set(items, callback) {
        window.writes.push(structuredClone(items));
        window.resolveWrite = (fail = false) => {
          api.runtime.lastError = fail ? { message: "Write failed" } : undefined;
          callback();
          api.runtime.lastError = undefined;
        };
      },
    } };
  });
  await page.route("https://zen-view.test/**", (route) => {
    const name = new URL(route.request().url()).pathname.slice(1);
    const types = { "popup.html": "text/html", "popup.css": "text/css", "popup.js": "text/javascript" };
    if (!types[name]) return route.abort();
    return route.fulfill({ body: fs.readFileSync(path.join(root, "src", name)), contentType: types[name] });
  });
  await page.goto("https://zen-view.test/popup.html");
  return page;
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await createPopup(browser);
    const toggles = page.locator("[data-setting-key]");
    assert.equal(await toggles.evaluateAll((items) => items.every((item) => item.disabled)), true,
      "settings must not be editable before the asynchronous read completes");
    await toggles.first().dispatchEvent("change");
    assert.deepEqual(await page.evaluate(() => window.writes), [], "early events must not overwrite stored settings");
    await page.evaluate((settings) => window.resolveRead(settings), savedSettings);
    assert.equal(await toggles.evaluateAll((items) => items.every((item) => !item.disabled && item.checked)), true);

    await toggles.first().uncheck();
    assert.equal(await toggles.evaluateAll((items) => items.every((item) => item.disabled)), true,
      "another edit must wait for the pending write");
    assert.deepEqual(await page.evaluate(() => window.writes), [{
      xhecSettings: { ...savedSettings, engagementCounts: true },
    }], "a toggle must preserve unrelated saved settings");
    await page.evaluate(() => window.resolveWrite(true));
    assert.equal(await toggles.first().isChecked(), true, "failed saves must restore the confirmed setting");
    assert.match(await page.locator("#statusText").textContent(), /保存できません/);
    await toggles.first().uncheck();
    await page.evaluate(() => window.resolveWrite());
    assert.equal(await toggles.first().isChecked(), false);
    assert.equal(await toggles.first().isEnabled(), true);
    assert.equal(await page.locator("#statusText").textContent(), "7項目表示");

    const failedRead = await createPopup(browser);
    await failedRead.evaluate(() => window.resolveRead(null, true));
    assert.match(await failedRead.locator("#statusText").textContent(), /読み込めません/);
    assert.equal(await failedRead.locator("[data-setting-key]").first().isDisabled(), true);
    console.log("popup smoke test passed");
  } finally {
    await browser.close();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
