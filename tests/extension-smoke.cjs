const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const qaDirectory = path.join(root, "dist", "qa");
const fixture = `<!doctype html><html><body>
  <main data-testid="primaryColumn">
    <article data-testid="tweet">
      <div data-testid="tweetText">Synthetic extension smoke test</div>
      <button data-testid="like"><span id="count">42</span></button>
    </article>
  </main>
</body></html>`;

async function main() {
  fs.mkdirSync(qaDirectory, { recursive: true });
  const profile = fs.mkdtempSync(path.join(qaDirectory, "extension-profile-"));
  let context;
  try {
    context = await chromium.launchPersistentContext(profile, {
      headless: true,
      channel: "chromium",
      args: [`--disable-extensions-except=${root}`, `--load-extension=${root}`],
    });
    context.setDefaultTimeout(5000);
    const errors = [];
    context.on("page", (page) => page.on("pageerror", (error) => errors.push(error.message)));
    await context.route("https://x.com/**", (route) => route.fulfill({
      body: fixture,
      contentType: "text/html",
    }));

    const page = await context.newPage();
    await page.goto("https://x.com/home");
    await page.locator(".xhec-page-button").waitFor();
    await page.waitForFunction(() => document.querySelector("#count").offsetParent === null);
    assert.equal(await page.evaluate(() => typeof globalThis.ZenView), "undefined",
      "the module namespace must stay in Chrome's isolated content-script world");

    await page.locator(".xhec-page-button").click();
    const inPageToggle = page.locator('[data-xhec-setting-key="engagementCounts"]');
    await inPageToggle.check();
    await page.waitForFunction(() => document.querySelector("#count").offsetParent !== null);
    await page.reload();
    await page.locator(".xhec-page-button").click();
    assert.equal(await inPageToggle.isChecked(), true, "in-page changes must survive a real reload");

    const manager = await context.newPage();
    await manager.goto("chrome://extensions/");
    const item = manager.locator("extensions-item").filter({ hasText: "Zen View for X" });
    const extensionId = await item.getAttribute("id");
    assert.match(extensionId, /^[a-p]{32}$/u);

    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/src/popup.html`);
    const popupToggle = popup.locator('[data-setting-key="engagementCounts"]');
    await popup.waitForFunction(() => !document.querySelector('[data-setting-key="engagementCounts"]').disabled);
    assert.equal(await popup.locator('[data-setting-key]').count(), 8);
    assert.equal(await popupToggle.isChecked(), true, "the native popup must share persisted settings");
    await popupToggle.uncheck();
    await page.waitForFunction(() => document.querySelector("#count").offsetParent === null);
    assert.equal(await inPageToggle.isChecked(), false, "popup changes must synchronize to an open page");
    await inPageToggle.check();
    await popup.waitForFunction(() => document.querySelector('[data-setting-key="engagementCounts"]').checked);
    assert.equal(await popup.locator("#statusText").textContent(), "1項目表示");
    assert.deepEqual(errors, [], "native extension pages must not emit uncaught errors");
    console.log("native extension smoke test passed");
  } finally {
    if (context) await context.close();
    fs.rmSync(profile, { recursive: true, force: true });
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
