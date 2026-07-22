const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const extensionRoot = path.resolve(__dirname, "..");
const contentScript = fs.readFileSync(
  path.join(extensionRoot, "src", "content.js"),
  "utf8",
);
const contentStyle = fs.readFileSync(
  path.join(extensionRoot, "src", "content.css"),
  "utf8",
);

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

async function createFixturePage(browser, url, initialSettings) {
  const page = await browser.newPage();

  await page.addInitScript((settings) => {
    const listeners = [];
    let storedSettings = settings;

    const chromeApi = window.chrome || {};
    window.chrome = chromeApi;
    chromeApi.storage = {
      local: {
        get(_defaults, callback) {
          callback({
            hideEngagementCounts: null,
            xhecSettings: storedSettings,
          });
        },
        set(items, callback) {
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
  }, initialSettings);

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
  await page.addStyleTag({ content: contentStyle });
  await page.addScriptTag({ content: contentScript });
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

    console.log("sidebar smoke test passed");
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
