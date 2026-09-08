const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const extensionRoot = path.resolve(__dirname, "..");
const manifest = JSON.parse(fs.readFileSync(path.join(extensionRoot, "manifest.json"), "utf8"));
const contentFiles = manifest.content_scripts[0];
const pageErrors = [];
const screenshotDirectory = process.argv.includes("--screenshots")
  ? path.join(extensionRoot, "dist", "qa")
  : null;

async function captureScreenshot(page, name) {
  if (screenshotDirectory) {
    fs.mkdirSync(screenshotDirectory, { recursive: true });
    await page.screenshot({ path: path.join(screenshotDirectory, name) });
  }
}

const settingToCard = {
  sidebarPremium: "premium",
  sidebarLive: "live",
  sidebarRecommendations: "recommendations",
  sidebarTrends: "trends",
  sidebarNews: "news",
};

const visibleSettings = {
  engagementCounts: false,
  promotedPosts: false,
  sidebarPremium: false,
  sidebarLive: false,
  sidebarRecommendations: false,
  sidebarTrends: false,
  sidebarNews: false,
  leftNavIconOnly: false,
};

const fixture = `<!doctype html>
<html lang="ja">
  <body>
    <main data-testid="primaryColumn">
      <article data-testid="tweet" id="videoTweet">
        <div data-testid="tweetText">Normal video post</div>
        <div id="videoMount"></div>
      </article>
      <article data-testid="tweet" id="explicitAd">
        <div data-testid="promotedIndicator">Promoted</div>
      </article>
      <article data-testid="tweet" id="textAd">
        <span>広告</span>
      </article>
      <article data-testid="tweet" id="namedAd">
        <div data-testid="User-Name"><span>Ad</span></div>
        <div data-testid="tweetText">An ordinary post</div>
      </article>
      <article data-testid="tweet" id="linkedAd">
        <a href="/example"><span>Sponsored</span></a>
      </article>
      <article data-testid="tweet" id="countTweet">
        <button data-testid="like"><svg width="24" height="24"></svg><span id="dynamicCount">Like</span></button>
      </article>
    </main>
    <div data-testid="sidebarColumn" id="sidebar" style="width: 350px">
      <form role="search"><input aria-label="Search"></form>
      <hr id="divider">
      <aside id="premium" aria-label="プレミアムにサブスクライブ">
        <p>Premium content</p>
      </aside>
      <section id="live" role="region">
        <h2>Xでライブ放送する</h2>
        <p>Live content</p>
      </section>
      <aside id="recommendations" aria-label="おすすめユーザー">
        <p>Recommendations content</p>
      </aside>
      <section id="trends" role="region">
        <h2>「いま」を見つけよう</h2>
        <p>Trends content</p>
      </section>
      <section id="news" role="region">
        <h2>本日のニュース <button aria-label="Close"></button></h2>
        <p>News content</p>
      </section>
      <footer id="legal">利用規約 · プライバシー · © X Corp.</footer>
    </div>
  </body>
</html>`;

async function createFixturePage(browser, url, initialSettings, deferRead = false) {
  const page = await browser.newPage();
  page.setDefaultTimeout(5000);
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.addInitScript(({ settings, deferRead }) => {
    const listeners = [];
    let storedSettings = settings;

    const chromeApi = window.chrome || {};
    window.chrome = chromeApi;
    chromeApi.runtime = {};
    chromeApi.storage = {
      local: {
        get(_defaults, callback) {
          const snapshot = structuredClone(storedSettings);
          window.finishZenRead = () => callback({
            hideEngagementCounts: null,
            xhecSettings: snapshot,
          });
          if (!deferRead) window.finishZenRead();
        },
        set(items, callback) {
          window.finishZenWrite = () => {
            if (window.failNextZenWrite) {
              window.failNextZenWrite = false;
              chromeApi.runtime.lastError = { message: "Write failed" };
              callback?.();
              chromeApi.runtime.lastError = undefined;
              return;
            }
            const oldValue = storedSettings;
            storedSettings = items.xhecSettings;
            listeners.forEach((listener) => {
              listener(
                {
                  xhecSettings: {
                    newValue: storedSettings,
                    oldValue,
                  },
                },
                "local",
              );
            });
            callback?.();
          };
          if (!window.deferZenWrite) window.finishZenWrite();
        },
      },
      onChanged: {
        addListener(listener) {
          listeners.push(listener);
        },
      },
    };

    window.setZenViewSettings = (nextSettings) => {
      const oldValue = storedSettings;
      storedSettings = nextSettings;
      listeners.forEach((listener) => {
        listener(
          {
            xhecSettings: {
              newValue: storedSettings,
              oldValue,
            },
          },
          "local",
        );
      });
    };
    window.getZenViewListenerCount = () => listeners.length;
  }, { settings: initialSettings, deferRead });

  await page.route("https://x.com/**", (route) => {
    route.fulfill({
      body: fixture,
      headers: {
        "content-type": "text/html; charset=utf-8",
      },
      status: 200,
    });
  });
  await page.goto(url);
  for (const file of contentFiles.css) {
    await page.addStyleTag({ path: path.join(extensionRoot, file) });
  }
  for (const file of contentFiles.js) {
    await page.addScriptTag({ path: path.join(extensionRoot, file) });
  }
  await page.waitForTimeout(150);

  return page;
}

async function hiddenCardIds(page) {
  return page.locator(".xhec-hidden-sidebar-box").evaluateAll((elements) =>
    elements.map((element) => element.id).filter(Boolean).sort(),
  );
}

async function hiddenPromotedIds(page) {
  return page.locator(".xhec-hidden-promoted").evaluateAll((elements) =>
    elements.map((element) => element.id).filter(Boolean).sort(),
  );
}

async function setSettings(page, nextSettings) {
  await page.evaluate((settings) => {
    window.setZenViewSettings(settings);
  }, nextSettings);
  await page.waitForTimeout(150);
}

async function main() {
  const browser = await chromium.launch({ headless: true });

  try {
    const homePage = await createFixturePage(
      browser,
      "https://x.com/home",
      visibleSettings,
    );

    assert.equal(await homePage.evaluate(() => window.getZenViewListenerCount()), 1);
    assert.deepEqual(await hiddenCardIds(homePage), []);

    await homePage.setViewportSize({ width: 800, height: 600 });
    await setSettings(homePage, { ...visibleSettings, leftNavIconOnly: true });
    await homePage.evaluate(() => {
      const header = document.createElement("header");
      header.setAttribute("role", "banner");
      header.innerHTML = '<div id="postAnchor" style="position:fixed;left:calc(100vw - 60px);bottom:82px"><a data-testid="SideNav_NewTweet_Button" href="/compose/post">Post</a></div>';
      document.body.append(header);
    });
    await homePage.waitForFunction(() => {
      const rect = document.querySelector(".xhec-page-button").getBoundingClientRect();
      return rect.top === 532;
    });
    await homePage.locator(".xhec-page-button").click();

    const largeViewportPanel = await homePage.evaluate(() => {
      const buttonRect = document.querySelector(".xhec-page-button")
        .getBoundingClientRect();
      const panel = document.getElementById("zen-view-page-panel");
      const panelRect = panel.getBoundingClientRect();

      return {
        buttonTop: buttonRect.top,
        panelBottom: panelRect.bottom,
        panelLeft: panelRect.left,
        panelRight: panelRect.right,
        panelTop: panelRect.top,
        viewportHeight: window.innerHeight,
        viewportWidth: window.innerWidth,
      };
    });

    assert.ok(largeViewportPanel.panelTop >= 8, "panel must stay on-screen at top");
    assert.ok(largeViewportPanel.panelLeft >= 8, "panel must stay on-screen at left");
    assert.ok(
      largeViewportPanel.panelRight <= largeViewportPanel.viewportWidth - 8,
      "panel must stay on-screen at right",
    );
    assert.ok(
      largeViewportPanel.panelBottom <= largeViewportPanel.viewportHeight - 8,
      "panel must stay on-screen at bottom",
    );
    assert.ok(
      largeViewportPanel.panelBottom <= largeViewportPanel.buttonTop - 8,
      "panel must open above a trigger near the viewport bottom",
    );
    await captureScreenshot(homePage, "panel-800x600.png");

    await homePage.setViewportSize({ width: 500, height: 300 });
    await homePage.waitForTimeout(150);
    const shortViewportPanel = await homePage.evaluate(() => {
      const panel = document.getElementById("zen-view-page-panel");
      const panelRect = panel.getBoundingClientRect();

      return {
        bottom: panelRect.bottom,
        clientHeight: panel.clientHeight,
        overflowY: getComputedStyle(panel).overflowY,
        scrollHeight: panel.scrollHeight,
        top: panelRect.top,
        viewportHeight: window.innerHeight,
      };
    });

    assert.ok(shortViewportPanel.top >= 8, "short panel must stay on-screen at top");
    assert.ok(
      shortViewportPanel.bottom <= shortViewportPanel.viewportHeight - 8,
      "short panel must stay on-screen at bottom",
    );
    assert.equal(shortViewportPanel.overflowY, "auto");
    assert.ok(
      shortViewportPanel.scrollHeight > shortViewportPanel.clientHeight,
      "short panel must scroll internally",
    );
    await captureScreenshot(homePage, "panel-500x300.png");

    const countToggle = homePage.locator('[data-xhec-setting-key="engagementCounts"]');
    assert.equal(await countToggle.isChecked(), true);
    await countToggle.uncheck();
    assert.equal(await homePage.evaluate(() => document.documentElement.classList.contains(
      "xhec-hide-engagement-counts")), true, "turning display off must hide counts");
    await countToggle.check();
    assert.equal(await homePage.evaluate(() => document.documentElement.classList.contains(
      "xhec-hide-engagement-counts")), false, "turning display on must restore counts");

    await homePage.evaluate(() => {
      const post = document.getElementById("postAnchor");
      post.style.bottom = "-50px";
      post.style.left = "1200px";
      window.dispatchEvent(new Event("resize"));
    });
    await homePage.waitForTimeout(150);
    const triggerWithinViewport = await homePage.locator(".xhec-page-button").evaluate((button) => {
      const rect = button.getBoundingClientRect();
      return rect.top >= 8 && rect.left >= 8 &&
        rect.bottom <= innerHeight - 8 && rect.right <= innerWidth - 8;
    });
    assert.ok(triggerWithinViewport, "settings trigger must remain reachable when its anchor is offscreen");

    await homePage.evaluate(() => {
      const panel = document.getElementById("zen-view-page-panel");
      const button = document.querySelector(".xhec-page-button");
      panel.hidden = true;
      button.setAttribute("aria-expanded", "false");
    });
    await homePage.setViewportSize({ width: 1280, height: 720 });
    await setSettings(homePage, visibleSettings);

    const sidebarWidth = await homePage.locator("#sidebar").evaluate(
      (element) => element.getBoundingClientRect().width,
    );

    for (const [settingKey, cardId] of Object.entries(settingToCard)) {
      await setSettings(homePage, {
        ...visibleSettings,
        [settingKey]: true,
      });
      assert.deepEqual(
        await hiddenCardIds(homePage),
        [cardId],
        `${settingKey} must hide only ${cardId}`,
      );
      assert.equal(
        await homePage.locator("#sidebar").evaluate((element) =>
          element.classList.contains("xhec-hidden-sidebar-box"),
        ),
        false,
        `${settingKey} must not hide the shared sidebar ancestor`,
      );
      assert.equal(
        await homePage.evaluate(() =>
          document.documentElement.classList.contains("xhec-hide-sidebar-shell"),
        ),
        false,
        `${settingKey} alone must not hide the whole sidebar shell`,
      );
      assert.equal(
        await homePage.locator("#legal").evaluate((element) =>
          getComputedStyle(element).visibility,
        ),
        "visible",
        `${settingKey} alone must keep residual sidebar content visible`,
      );
    }

    await setSettings(homePage, {
      ...visibleSettings,
      sidebarPremium: true,
      sidebarLive: true,
      sidebarRecommendations: true,
      sidebarTrends: true,
      sidebarNews: true,
    });
    assert.deepEqual(
      await hiddenCardIds(homePage),
      Object.values(settingToCard).sort(),
    );
    assert.equal(
      await homePage.evaluate(() =>
        document.documentElement.classList.contains("xhec-hide-sidebar-shell"),
      ),
      true,
    );
    assert.equal(
      await homePage.locator("#sidebar").evaluate((element) =>
        getComputedStyle(element).visibility,
      ),
      "hidden",
    );
    assert.equal(
      await homePage.locator("#legal").evaluate((element) =>
        getComputedStyle(element).visibility,
      ),
      "hidden",
    );
    assert.equal(
      await homePage.locator("#divider").evaluate((element) =>
        getComputedStyle(element).visibility,
      ),
      "hidden",
    );
    assert.equal(
      await homePage.locator("#sidebar").evaluate(
        (element) => element.getBoundingClientRect().width,
      ),
      sidebarWidth,
      "hiding the shell must preserve the sidebar width",
    );

    const videoPage = await createFixturePage(
      browser,
      "https://x.com/home",
      {
        ...visibleSettings,
        promotedPosts: true,
      },
    );
    assert.deepEqual(
      await hiddenPromotedIds(videoPage),
      ["explicitAd", "textAd"],
    );

    await videoPage.locator("#videoMount").evaluate((element) => {
      element.innerHTML = [
        '<div data-testid="placementTracking">',
        '  <div data-testid="videoPlayer">',
        '    <span data-testid="promotedLabel">Ad</span>',
        "  </div>",
        "</div>",
      ].join("");
    });
    await videoPage.waitForTimeout(150);
    assert.deepEqual(
      await hiddenPromotedIds(videoPage),
      ["explicitAd", "textAd"],
      "starting a normal video must not classify its tweet as promoted",
    );
    assert.equal(
      await videoPage.locator("#videoTweet").evaluate((element) =>
        element.classList.contains("xhec-hidden-promoted"),
      ),
      false,
    );

    await setSettings(videoPage, { ...visibleSettings, engagementCounts: true });
    await videoPage.locator("#dynamicCount").evaluate((element) => {
      element.firstChild.data = "12";
    });
    await videoPage.waitForTimeout(150);
    assert.equal(await videoPage.locator("#dynamicCount").isVisible(), false,
      "counts updated in an existing text node must be hidden");
    await videoPage.locator("#dynamicCount").evaluate((element) => {
      element.firstChild.data = "Like";
    });
    await videoPage.waitForTimeout(150);
    assert.equal(await videoPage.locator("#dynamicCount").isVisible(), true,
      "a reused count node must not hide a non-numeric action label");
    await videoPage.locator("#dynamicCount").evaluate((element) => {
      element.setAttribute("data-testid", "app-text-transition-container");
    });
    await videoPage.waitForTimeout(150);
    assert.equal(await videoPage.locator("#dynamicCount").isVisible(), true,
      "a transition container must not hide a non-numeric action label");
    await videoPage.locator("#dynamicCount").evaluate((element) => { element.firstChild.data = "12"; });
    await videoPage.waitForTimeout(150);
    assert.equal(await videoPage.locator("#dynamicCount").isVisible(), false,
      "numeric transition containers must still be hidden");
    await videoPage.locator("#dynamicCount").evaluate((element) => { element.firstChild.data = "Like"; });
    await videoPage.waitForTimeout(150);
    assert.equal(await videoPage.locator("#dynamicCount").isVisible(), true,
      "transition containers reused for action labels must become visible again");

    const chatPage = await createFixturePage(
      browser,
      "https://x.com/i/chat",
      {
        ...visibleSettings,
        sidebarPremium: true,
        sidebarLive: true,
        sidebarRecommendations: true,
        sidebarTrends: true,
        sidebarNews: true,
      },
    );
    assert.deepEqual(
      await hiddenCardIds(chatPage),
      [],
      "chat must never inherit right-column hiding",
    );
    assert.equal(
      await chatPage.evaluate(() =>
        document.documentElement.classList.contains("xhec-hide-sidebar-shell"),
      ),
      false,
      "chat must never hide the whole sidebar shell",
    );

    const loadingPage = await createFixturePage(browser, "https://x.com/home", visibleSettings, true);
    await loadingPage.locator(".xhec-page-button").click();
    const loadingToggle = loadingPage.locator('[data-xhec-setting-key="engagementCounts"]');
    assert.equal(await loadingToggle.isDisabled(), true, "in-page settings must wait for storage hydration");
    await loadingToggle.dispatchEvent("change");
    await loadingPage.evaluate(() => window.finishZenRead());
    assert.equal(await loadingToggle.isChecked(), true, "early events must preserve the stored preferences");
    await loadingPage.evaluate(() => { window.failNextZenWrite = true; });
    await loadingToggle.click();
    assert.equal(await loadingToggle.isChecked(), true, "failed in-page saves must restore the previous setting");
    assert.equal(await loadingPage.evaluate(() => document.documentElement.classList.contains(
      "xhec-hide-engagement-counts")), false, "failed saves must also restore the page display");

    const alignmentPage = await createFixturePage(browser, "https://x.com/home", visibleSettings);
    await alignmentPage.evaluate(() => {
      const header = document.createElement("header");
      header.setAttribute("role", "banner");
      header.innerHTML = `
        <a aria-label="X" href="/home" style="position:absolute;left:20px;top:10px;transform:translateY(3px);z-index:7">X</a>
        <nav role="navigation" style="position:absolute;left:150px;top:80px"><a role="link" href="/home">Home</a></nav>
        <a data-testid="SideNav_NewTweet_Button" href="/compose/post" style="position:fixed;left:20px;top:150px;transform:translateY(5px);z-index:9">Post</a>`;
      document.body.append(header);
    });
    const readAlignmentStyles = () => alignmentPage.locator('header > a').evaluateAll((elements) =>
      elements.map((element) => [element.style.position, element.style.transform, element.style.zIndex]));
    const originalAlignment = [["absolute", "translateY(3px)", "7"], ["fixed", "translateY(5px)", "9"]];
    await alignmentPage.waitForTimeout(150);
    assert.deepEqual(await readAlignmentStyles(), originalAlignment,
      "normal navigation must leave the page's own inline positioning untouched");
    await setSettings(alignmentPage, { ...visibleSettings, leftNavIconOnly: true });
    await alignmentPage.waitForTimeout(150);
    const navCenter = await alignmentPage.locator('nav a').evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return rect.left + rect.width / 2;
    });
    for (const center of await alignmentPage.locator('header > a').evaluateAll((elements) =>
      elements.map((element) => { const rect = element.getBoundingClientRect(); return rect.left + rect.width / 2; }))) {
      assert.ok(Math.abs(center - navCenter) <= 1, "compact icons must remain centered");
    }
    assert.equal(await alignmentPage.locator('[data-testid="SideNav_NewTweet_Button"]').evaluate((element) =>
      element.getBoundingClientRect().top), 155, "compact alignment must preserve the page's vertical transform");
    await setSettings(alignmentPage, visibleSettings);
    await alignmentPage.waitForTimeout(150);
    assert.deepEqual(await readAlignmentStyles(), originalAlignment,
      "leaving compact navigation must restore the page's original positioning");
    await setSettings(alignmentPage, { ...visibleSettings, leftNavIconOnly: true });
    await alignmentPage.waitForTimeout(150);
    await alignmentPage.locator('a[aria-label="X"]').evaluate((element) => {
      element.style.setProperty("transform", "translateY(11px)", "important");
    });
    await setSettings(alignmentPage, visibleSettings);
    await alignmentPage.waitForTimeout(150);
    assert.deepEqual(await readAlignmentStyles(), [
      ["absolute", "translateY(11px)", "7"], originalAlignment[1],
    ], "a newer page-authored style must not be replaced by our saved snapshot");
    assert.equal(await alignmentPage.locator('a[aria-label="X"]').evaluate((element) =>
      element.style.getPropertyPriority("transform")), "important");

    const newerSettings = { ...visibleSettings, sidebarNews: true };
    const lateReadPage = await createFixturePage(browser, "https://x.com/home", visibleSettings, true);
    await setSettings(lateReadPage, newerSettings);
    await lateReadPage.evaluate(() => window.finishZenRead());
    assert.deepEqual(await hiddenCardIds(lateReadPage), ["news"],
      "a late initial read must not overwrite newer in-page storage events");

    await loadingPage.evaluate(() => { window.deferZenWrite = true; });
    await loadingToggle.uncheck();
    await setSettings(loadingPage, newerSettings);
    await loadingPage.evaluate(() => {
      window.failNextZenWrite = true;
      window.finishZenWrite();
    });
    assert.deepEqual(await hiddenCardIds(loadingPage), ["news"],
      "a failed in-page save must preserve newer external settings");

    await chatPage.evaluate(() => history.pushState({}, "", "/home"));
    await chatPage.waitForTimeout(150);
    assert.equal(await chatPage.locator("#sidebar").evaluate((element) => getComputedStyle(element).visibility),
      "hidden", "same-document navigation to home must refresh sidebar visibility without a DOM mutation");
    await chatPage.evaluate(() => history.pushState({}, "", "/i/chat"));
    await chatPage.waitForTimeout(150);
    assert.equal(await chatPage.locator("#sidebar").evaluate((element) => getComputedStyle(element).visibility),
      "visible", "same-document navigation to chat must restore its content");

    const scrollPage = await createFixturePage(browser, "https://x.com/home", {
      ...visibleSettings, leftNavIconOnly: true,
    });
    await scrollPage.evaluate(() => {
      document.body.style.minHeight = "2000px";
      const header = document.createElement("header");
      header.setAttribute("role", "banner");
      header.innerHTML = '<div style="position:absolute;top:250px;left:60px"><a data-testid="SideNav_NewTweet_Button" href="/compose/post">Post</a></div>';
      document.body.append(header);
    });
    await scrollPage.waitForFunction(() => document.querySelector(".xhec-page-button").getBoundingClientRect().top === 316);
    await scrollPage.evaluate(() => window.scrollTo(0, 200));
    await scrollPage.waitForTimeout(150);
    assert.equal(await scrollPage.locator(".xhec-page-button").evaluate((element) => element.getBoundingClientRect().top),
      116, "scrolling must keep the settings trigger attached to its navigation anchor");

    const reusePage = await createFixturePage(browser, "https://x.com/home", {
      ...visibleSettings, promotedPosts: true, sidebarPremium: true, engagementCounts: true,
    });
    await reusePage.locator("#videoMount").evaluate((element) => {
      element.setAttribute("data-testid", "promotedIndicator");
    });
    await reusePage.waitForTimeout(150);
    assert.equal(await reusePage.locator("#videoTweet").isVisible(), false,
      "attribute-only promoted markers must hide a reused tweet");
    await reusePage.locator("#recommendations").evaluate((element) => {
      element.setAttribute("aria-label", "Premium");
    });
    await reusePage.waitForTimeout(150);
    assert.equal(await reusePage.locator("#recommendations").isVisible(), false,
      "attribute-only sidebar label changes must be reclassified");
    await reusePage.evaluate(() => {
      document.getElementById("videoMount").removeAttribute("data-testid");
      document.getElementById("recommendations").setAttribute("aria-label", "Who to follow");
    });
    await reusePage.waitForTimeout(150);
    assert.equal(await reusePage.locator("#videoTweet").isVisible(), true);
    assert.equal(await reusePage.locator("#recommendations").isVisible(), true);

    await reusePage.evaluate(() => {
      const ticker = document.createElement("span");
      document.body.append(ticker);
      let tick = 0;
      window.mutationTimer = setInterval(() => { ticker.textContent = String(++tick); }, 10);
      document.getElementById("dynamicCount").firstChild.data = "42";
    });
    await reusePage.waitForTimeout(300);
    const countDuringUpdates = await reusePage.locator("#dynamicCount").isVisible();
    await reusePage.evaluate(() => clearInterval(window.mutationTimer));
    assert.equal(countDuringUpdates, false,
      "continuous DOM updates must not indefinitely postpone filtering");

    assert.deepEqual(pageErrors, [], "fixtures must not emit uncaught page errors");
    console.log("sidebar smoke test passed");
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
