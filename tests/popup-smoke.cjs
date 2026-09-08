const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const sourceRoot = fs.realpathSync(path.join(root, "src"));
const sourceTypes = new Map([
  [".html", "text/html"],
  [".css", "text/css"],
  [".js", "text/javascript"],
]);

const defaultSettings = {
  engagementCounts: true,
  promotedPosts: true,
  sidebarPremium: true,
  sidebarLive: true,
  sidebarRecommendations: true,
  sidebarTrends: true,
  sidebarNews: true,
  leftNavIconOnly: true,
};
const savedSettings = Object.fromEntries(
  Object.keys(defaultSettings).map((key) => [key, false]),
);
const popupControls = [
  {
    id: "engagementCountsToggle",
    key: "engagementCounts",
    copy: ["数値を表示する", "返信・リポスト・いいね・表示数"],
  },
  {
    id: "promotedPostsToggle",
    key: "promotedPosts",
    copy: ["広告ポストを表示する", "Ad / Ads / 広告 / Promoted"],
  },
  {
    id: "sidebarPremiumToggle",
    key: "sidebarPremium",
    copy: ["右欄: プレミアムを表示する", "プレミアムにサブスクライブ"],
  },
  {
    id: "sidebarLiveToggle",
    key: "sidebarLive",
    copy: ["右欄: ライブを表示する", "Xでライブ放送する"],
  },
  {
    id: "sidebarRecommendationsToggle",
    key: "sidebarRecommendations",
    copy: ["右欄: おすすめユーザーを表示する", "おすすめユーザー・おすすめアカウント"],
  },
  {
    id: "sidebarTrendsToggle",
    key: "sidebarTrends",
    copy: ["右欄: トレンドを表示する", "いまを見つけよう・話題"],
  },
  {
    id: "sidebarNewsToggle",
    key: "sidebarNews",
    copy: ["右欄: ニュースを表示する", "本日のニュース・今日のニュース"],
  },
  {
    id: "leftNavIconOnlyToggle",
    key: "leftNavIconOnly",
    copy: ["左ナビの文字を表示する", "ホーム・検索・通知・ブックマークなど"],
  },
];

function sourceResource(url) {
  let relativePath;
  try {
    relativePath = decodeURIComponent(new URL(url).pathname).replace(/^\/+/, "");
  } catch {
    return null;
  }

  const extension = path.extname(relativePath);
  if (!sourceTypes.has(extension)) {
    return null;
  }

  const candidate = path.resolve(sourceRoot, relativePath);
  if (!candidate.startsWith(`${sourceRoot}${path.sep}`)) {
    return null;
  }

  try {
    const realPath = fs.realpathSync(candidate);
    if (!realPath.startsWith(`${sourceRoot}${path.sep}`) || !fs.statSync(realPath).isFile()) {
      return null;
    }
    return { path: realPath, type: sourceTypes.get(extension) };
  } catch {
    return null;
  }
}

async function createPopup(browser) {
  const page = await browser.newPage();
  page.setDefaultTimeout(5000);
  await page.addInitScript(() => {
    const api = window.chrome || {};
    const listeners = [];
    window.chrome = api;
    api.runtime = {};
    window.readRequests = [];
    window.writes = [];
    window.emitStorageChange = (changes, areaName = "local") => {
      listeners.forEach((listener) => listener(structuredClone(changes), areaName));
    };
    window.changeStoredSettings = (settings) => {
      window.emitStorageChange({ xhecSettings: { newValue: settings } });
    };
    api.storage = { local: {
      get(keys, callback) {
        window.readRequests.push(structuredClone(keys));
        window.resolveRead = (items = {}, fail = false) => {
          api.runtime.lastError = fail ? { message: "Read failed" } : undefined;
          callback(items);
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
    }, onChanged: { addListener(listener) { listeners.push(listener); } } };
  });
  await page.route("https://zen-view.test/**", (route) => {
    const resource = sourceResource(route.request().url());
    if (!resource) {
      return route.abort();
    }
    return route.fulfill({ body: fs.readFileSync(resource.path), contentType: resource.type });
  });
  await page.goto("https://zen-view.test/popup.html");
  return page;
}

async function popupSettings(page) {
  return page.locator("[data-setting-key]").evaluateAll((items) => Object.fromEntries(
    items.map((item) => [item.dataset.settingKey, !item.checked]),
  ));
}

async function assertRenderedSettings(page, expectedSettings, expectedStatus) {
  assert.deepEqual(await popupSettings(page), expectedSettings);
  assert.equal(await page.locator("#statusText").textContent(), expectedStatus);
}

async function resolveInitialRead(page, items, fail = false) {
  await page.evaluate(({ items: resolvedItems, fail: shouldFail }) => {
    window.resolveRead(resolvedItems, shouldFail);
  }, { items, fail });
}

async function emitStorageChange(page, changes, areaName = "local") {
  await page.evaluate(({ changes: nextChanges, areaName: nextAreaName }) => {
    window.emitStorageChange(nextChanges, nextAreaName);
  }, { changes, areaName });
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await createPopup(browser);
    const toggles = page.locator("[data-setting-key]");
    assert.equal(await page.locator("h1").textContent(), "Zen View");
    assert.deepEqual(await page.locator(".toggle-row").evaluateAll((rows) => rows.map((row) => {
      const toggle = row.querySelector("[data-setting-key]");
      return {
        id: toggle.id,
        key: toggle.dataset.settingKey,
        labelFor: row.htmlFor,
        type: toggle.type,
        role: toggle.getAttribute("role"),
        copy: Array.from(row.querySelectorAll(".toggle-copy > span"), (item) => item.textContent.trim()),
      };
    })), popupControls.map((control) => ({
      ...control,
      labelFor: control.id,
      type: "checkbox",
      role: "switch",
    })));
    assert.equal(await page.locator("#statusText").textContent(), "読み込み中");
    assert.equal(await toggles.evaluateAll((items) => items.every((item) => item.disabled)), true,
      "settings must not be editable before the asynchronous read completes");
    await toggles.first().dispatchEvent("change");
    assert.deepEqual(await page.evaluate(() => window.writes), [], "early events must not overwrite stored settings");
    assert.deepEqual(await page.evaluate(() => window.readRequests), [{
      xhecSettings: null,
      hideEngagementCounts: null,
    }]);

    await resolveInitialRead(page, {});
    await assertRenderedSettings(page, defaultSettings, "すべてミニマル");
    assert.equal(await toggles.evaluateAll((items) => items.every((item) => !item.disabled && !item.checked)), true,
      "default settings keep every option minimal");

    const partialSettings = {
      engagementCounts: false,
      sidebarBoxes: false,
      sidebarTrends: true,
      leftNavIconOnly: false,
    };
    const normalizedPartialSettings = {
      engagementCounts: false,
      promotedPosts: true,
      sidebarPremium: false,
      sidebarLive: false,
      sidebarRecommendations: false,
      sidebarTrends: true,
      sidebarNews: false,
      leftNavIconOnly: false,
    };
    const partialStored = await createPopup(browser);
    await resolveInitialRead(partialStored, {
      xhecSettings: partialSettings,
      hideEngagementCounts: true,
    });
    await assertRenderedSettings(partialStored, normalizedPartialSettings, "6項目表示");
    assert.equal(await partialStored.locator("#sidebarTrendsToggle").isChecked(), false,
      "an explicit sidebar setting overrides the legacy sidebarBoxes value");
    await partialStored.locator("#sidebarPremiumToggle").uncheck();
    assert.deepEqual(await partialStored.evaluate(() => window.writes.at(-1)), {
      xhecSettings: { ...normalizedPartialSettings, sidebarPremium: true },
    }, "migrated values save back only as the canonical eight settings");
    assert.equal(await partialStored.evaluate(() => "sidebarBoxes" in window.writes.at(-1).xhecSettings), false);
    await partialStored.evaluate(() => window.resolveWrite());

    const legacyStored = await createPopup(browser);
    await resolveInitialRead(legacyStored, {
      xhecSettings: null,
      hideEngagementCounts: false,
    });
    await assertRenderedSettings(legacyStored, savedSettings, "すべて表示");

    const eventPopup = await createPopup(browser);
    await resolveInitialRead(eventPopup, { xhecSettings: savedSettings });
    await emitStorageChange(eventPopup, { unrelatedSetting: { newValue: defaultSettings } });
    await emitStorageChange(eventPopup, { xhecSettings: { newValue: defaultSettings } }, "sync");
    await emitStorageChange(eventPopup, { hideEngagementCounts: { newValue: true } });
    await assertRenderedSettings(eventPopup, savedSettings, "すべて表示");

    const externalSettings = { ...savedSettings, sidebarNews: true };
    await emitStorageChange(eventPopup, { xhecSettings: { newValue: externalSettings } });
    await assertRenderedSettings(eventPopup, externalSettings, "7項目表示");
    await emitStorageChange(eventPopup, { xhecSettings: { oldValue: externalSettings } });
    await assertRenderedSettings(eventPopup, defaultSettings, "すべてミニマル");

    const editablePopup = await createPopup(browser);
    const editableToggles = editablePopup.locator("[data-setting-key]");
    await resolveInitialRead(editablePopup, { xhecSettings: savedSettings });
    await editableToggles.first().uncheck();
    assert.equal(await editableToggles.evaluateAll((items) => items.every((item) => item.disabled)), true,
      "another edit must wait for the pending write");
    assert.deepEqual(await editablePopup.evaluate(() => window.writes), [{
      xhecSettings: { ...savedSettings, engagementCounts: true },
    }], "a toggle must preserve unrelated saved settings");
    await editablePopup.evaluate(() => window.resolveWrite(true));
    assert.equal(await editableToggles.first().isChecked(), true, "failed saves must restore the confirmed setting");
    assert.equal(await editablePopup.locator("#statusText").textContent(), "保存できませんでした。もう一度お試しください。");
    await editableToggles.first().uncheck();
    await editablePopup.evaluate(() => window.resolveWrite());
    await assertRenderedSettings(editablePopup, { ...savedSettings, engagementCounts: true }, "7項目表示");
    assert.equal(await editableToggles.first().isEnabled(), true);

    const failedRead = await createPopup(browser);
    await resolveInitialRead(failedRead, {}, true);
    assert.equal(await failedRead.locator("#statusText").textContent(), "設定を読み込めませんでした。開き直してください。");
    assert.equal(await failedRead.locator("[data-setting-key]").first().isDisabled(), true);

    const rollbackPopup = await createPopup(browser);
    const rollbackToggles = rollbackPopup.locator("[data-setting-key]");
    await resolveInitialRead(rollbackPopup, { xhecSettings: savedSettings });
    await rollbackToggles.first().uncheck();
    await emitStorageChange(rollbackPopup, { xhecSettings: { newValue: externalSettings } });
    await rollbackPopup.evaluate(() => window.resolveWrite(true));
    await assertRenderedSettings(rollbackPopup, externalSettings, "保存できませんでした。もう一度お試しください。");
    await rollbackToggles.first().uncheck();
    assert.deepEqual(await rollbackPopup.evaluate(() => window.writes.at(-1)), {
      xhecSettings: { ...externalSettings, engagementCounts: true },
    }, "subsequent edits must preserve externally updated preferences");
    await rollbackPopup.evaluate(() => window.resolveWrite());

    const lateRead = await createPopup(browser);
    await emitStorageChange(lateRead, { xhecSettings: { newValue: externalSettings } });
    await resolveInitialRead(lateRead, { xhecSettings: savedSettings });
    await assertRenderedSettings(lateRead, externalSettings, "7項目表示");
    console.log("popup smoke test passed");
  } finally {
    await browser.close();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
