"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { isDeepStrictEqual } = require("node:util");
const { chromium } = require("playwright");

const extensionRoot = path.resolve(__dirname, "..");
const parityOrigin = "https://zen-view-parity.test";
const diagnosticDirectory = path.join(
  extensionRoot,
  "dist",
  "qa",
  "refactor-parity",
);
const settingKeys = [
  "engagementCounts",
  "promotedPosts",
  "sidebarPremium",
  "sidebarLive",
  "sidebarRecommendations",
  "sidebarTrends",
  "sidebarNews",
  "leftNavIconOnly",
];
const allShownSettings = Object.fromEntries(settingKeys.map((key) => [key, false]));
const allHiddenSettings = Object.fromEntries(settingKeys.map((key) => [key, true]));
const persistedSettings = {
  engagementCounts: false,
  promotedPosts: true,
  sidebarPremium: false,
  sidebarLive: true,
  sidebarRecommendations: false,
  sidebarTrends: true,
  sidebarNews: false,
  leftNavIconOnly: true,
};

const fixture = `<!doctype html>
<html lang="ja">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
      * { box-sizing: border-box; }
      html, body { margin: 0; min-height: 100%; background: #f7f9f9; color: #0f1419; }
      body { font: 14px/1.35 system-ui, sans-serif; }
      header[role="banner"] { position: fixed; inset: 0 auto 0 0; width: 180px; padding: 12px; background: #fff; }
      header a { color: #0f1419; text-decoration: none; }
      #x-logo { display: block; width: 40px; height: 40px; padding: 10px; }
      nav[role="navigation"] { margin-top: 20px; }
      nav[role="navigation"] a { display: flex; align-items: center; gap: 10px; width: 140px; height: 44px; padding: 8px; }
      #post-button { position: fixed; left: calc(100vw - 60px); bottom: 82px; display: flex; width: 40px; height: 40px; align-items: center; justify-content: center; border-radius: 999px; background: #1d9bf0; color: #fff; }
      [data-testid="primaryColumn"] { width: 560px; min-height: 850px; margin-left: 220px; padding: 18px; background: #fff; }
      article[data-testid="tweet"] { margin-bottom: 16px; padding: 14px; border: 1px solid #cfd9de; }
      [data-testid="sidebarColumn"] { position: fixed; top: 0; right: 0; width: 310px; min-height: 100vh; padding: 16px; background: #eef5f7; }
      [data-testid="sidebarColumn"] > :not(form):not(hr) { display: block; margin: 12px 0; padding: 10px; background: #fff; border: 1px solid #cfd9de; }
      #ordinary-video { min-height: 72px; background: #d9ecfb; }
      #dynamic-count { display: inline-block; min-width: 20px; }
      svg { width: 16px; height: 16px; }
    </style>
  </head>
  <body>
    <header role="banner">
      <a id="x-logo" aria-label="X" href="/home"><svg aria-hidden="true"><circle cx="8" cy="8" r="7"></circle></svg></a>
      <nav role="navigation">
        <a role="link" href="/home"><svg aria-hidden="true"><path d="M0 0h16v16H0z"></path></svg><span id="nav-home-text" dir="ltr">Home</span></a>
      </nav>
      <a id="post-button" data-testid="SideNav_NewTweet_Button" href="/compose/post"><span>Post</span></a>
    </header>

    <main data-testid="primaryColumn">
      <article data-testid="tweet" id="promoted-tweet"><div data-testid="promotedIndicator">Promoted</div></article>
      <article data-testid="tweet" id="ordinary-video-tweet">
        <div data-testid="tweetText">Ordinary video post</div>
        <div id="ordinary-video">Video stays visible</div>
        <div id="video-mount"></div>
      </article>
      <article data-testid="tweet" id="count-tweet">
        <button data-testid="like" id="count-action"><svg aria-hidden="true"><circle cx="8" cy="8" r="7"></circle></svg><span id="dynamic-count">Like</span></button>
      </article>
    </main>

    <aside data-testid="sidebarColumn" id="sidebar">
      <form role="search"><input aria-label="Search"></form>
      <hr id="sidebar-divider">
      <aside id="premium" aria-label="プレミアムにサブスクライブ">Premium</aside>
      <section id="live" role="region"><h2>Xでライブ放送する</h2>Live</section>
      <aside id="recommendations" aria-label="おすすめユーザー">Recommendations</aside>
      <section id="trends" role="region"><h2>「いま」を見つけよう</h2>Trends</section>
      <section id="news" role="region"><h2>本日のニュース</h2>News</section>
      <footer id="legal">Terms and privacy</footer>
    </aside>
  </body>
</html>`;

const stabilityStyle = `
  *, *::before, *::after {
    animation: none !important;
    caret-color: transparent !important;
    transition: none !important;
  }
`;

function readBaselineRef() {
  const argument = process.argv.find((value) => value.startsWith("--baseline-ref="));
  if (!argument || argument.length === "--baseline-ref=".length) {
    throw new Error("Usage: node tests/behavior-parity.cjs --baseline-ref=<git-ref>");
  }
  return argument.slice("--baseline-ref=".length);
}

function resolveBaselineRef(ref) {
  try {
    return execFileSync("git", ["rev-parse", "--verify", `${ref}^{commit}`], {
      cwd: extensionRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch (error) {
    const detail = error.stderr?.toString().trim() || error.message;
    throw new Error(`Could not resolve baseline ref ${ref} to a commit: ${detail}`);
  }
}

function normalizeRelativePath(filePath) {
  if (typeof filePath !== "string" || filePath.length === 0) {
    throw new Error("Manifest asset path must be a non-empty string.");
  }

  const normalized = path.posix.normalize(filePath.replaceAll("\\", "/"));
  if (normalized === "." || normalized.startsWith("../") || path.posix.isAbsolute(normalized)) {
    throw new Error(`Refusing an unsafe manifest asset path: ${filePath}`);
  }
  return normalized;
}

function readGitFile(ref, relativePath) {
  try {
    return execFileSync("git", ["show", `${ref}:${relativePath}`], {
      cwd: extensionRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    const detail = error.stderr?.toString().trim() || error.message;
    throw new Error(`Could not read ${relativePath} from baseline ${ref}: ${detail}`);
  }
}

function loadVersion(name, baselineRef) {
  const cache = new Map();
  const read = (requestedPath) => {
    const relativePath = normalizeRelativePath(requestedPath);
    if (cache.has(relativePath)) return cache.get(relativePath);

    let contents;
    if (baselineRef) {
      contents = readGitFile(baselineRef, relativePath);
    } else {
      const absolutePath = path.resolve(extensionRoot, relativePath);
      if (!absolutePath.startsWith(`${extensionRoot}${path.sep}`)) {
        throw new Error(`Refusing an unsafe current asset path: ${requestedPath}`);
      }
      contents = fs.readFileSync(absolutePath, "utf8");
    }

    cache.set(relativePath, contents);
    return contents;
  };

  const manifest = JSON.parse(read("manifest.json"));
  return { manifest, name, read };
}

function mimeType(filePath) {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".js") || filePath.endsWith(".mjs")) {
    return "text/javascript; charset=utf-8";
  }
  if (filePath.endsWith(".json")) return "application/json; charset=utf-8";
  return "application/octet-stream";
}

function extensionUrl(version, relativePath) {
  return `${parityOrigin}/${version.name}/${normalizeRelativePath(relativePath)}`;
}

function contentScriptsForX(manifest) {
  const scripts = manifest.content_scripts || [];
  const matchesX = (pattern) => {
    if (pattern === "<all_urls>") return true;
    return /^https:\/\/(?:\*\.)?x\.com\/.*$/u.test(pattern);
  };
  const matching = scripts.filter((entry) => (entry.matches || []).some(matchesX));
  if (matching.length === 0) {
    throw new Error("The manifest has no content script that matches https://x.com/.");
  }
  return matching;
}

async function routeVersionFiles(page, version) {
  const prefix = `/${version.name}/`;
  await page.route(`${parityOrigin}/${version.name}/**`, async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    const requestedPath = pathname.startsWith(prefix) ? pathname.slice(prefix.length) : "";
    try {
      const relativePath = normalizeRelativePath(decodeURIComponent(requestedPath));
      await route.fulfill({
        body: version.read(relativePath),
        contentType: mimeType(relativePath),
        status: 200,
      });
    } catch {
      await route.fulfill({
        body: "Not found",
        contentType: "text/plain; charset=utf-8",
        status: 404,
      });
    }
  });
}

async function routeXFixture(page) {
  await page.route("https://x.com/**", (route) => route.fulfill({
    body: fixture,
    contentType: "text/html; charset=utf-8",
    status: 200,
  }));
}

async function installStorageMock(page, initialSettings) {
  await page.addInitScript((storedSettings) => {
    const clone = (value) => value === undefined ? undefined : structuredClone(value);
    const values = storedSettings === null ? {} : { xhecSettings: clone(storedSettings) };
    const listeners = [];
    const chromeApi = window.chrome || {};

    function valuesFor(keys) {
      if (keys === null || keys === undefined) return clone(values);
      if (typeof keys === "string") {
        return Object.prototype.hasOwnProperty.call(values, keys) ? { [keys]: clone(values[keys]) } : {};
      }
      if (Array.isArray(keys)) {
        return Object.fromEntries(keys
          .filter((key) => Object.prototype.hasOwnProperty.call(values, key))
          .map((key) => [key, clone(values[key])]));
      }
      return Object.fromEntries(Object.entries(keys).map(([key, defaultValue]) => [
        key,
        Object.prototype.hasOwnProperty.call(values, key) ? clone(values[key]) : clone(defaultValue),
      ]));
    }

    function notify(changes) {
      listeners.slice().forEach((listener) => listener(clone(changes), "local"));
    }

    chromeApi.runtime = {};
    chromeApi.storage = {
      local: {
        get(keys, callback) {
          queueMicrotask(() => callback(valuesFor(keys)));
        },
        set(nextValues, callback) {
          queueMicrotask(() => {
            const changes = {};
            Object.entries(nextValues).forEach(([key, value]) => {
              const oldValue = clone(values[key]);
              values[key] = clone(value);
              changes[key] = { newValue: clone(value), oldValue };
            });
            notify(changes);
            callback?.();
          });
        },
      },
      onChanged: {
        addListener(listener) {
          listeners.push(listener);
        },
      },
    };
    window.chrome = chromeApi;
    window.__zenParityStorage = {
      setSettings(nextSettings) {
        const oldValue = clone(values.xhecSettings);
        values.xhecSettings = clone(nextSettings);
        notify({ xhecSettings: { newValue: clone(nextSettings), oldValue } });
      },
      snapshot() {
        return clone(values);
      },
    };
  }, initialSettings === undefined ? null : initialSettings);
}

function capturePageErrors(page, pageErrors, pageName) {
  page.on("pageerror", (error) => {
    pageErrors.push({ message: error.message, page: pageName });
  });
}

async function settlePage(page, quietFor = 120) {
  await page.evaluate((quietMilliseconds) => new Promise((resolve) => {
    let lastMutation = performance.now();
    let finished = false;
    const observer = new MutationObserver(() => {
      lastMutation = performance.now();
    });
    observer.observe(document.documentElement, {
      attributes: true,
      characterData: true,
      childList: true,
      subtree: true,
    });

    const finish = () => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      observer.disconnect();
      resolve();
    };
    const timeout = setTimeout(finish, Math.max(quietMilliseconds * 4, 750));

    const poll = () => {
      if (performance.now() - lastMutation >= quietMilliseconds) {
        finish();
        return;
      }
      requestAnimationFrame(poll);
    };
    requestAnimationFrame(poll);
  }), quietFor);
}

async function injectContentScripts(page, version) {
  for (const entry of contentScriptsForX(version.manifest)) {
    for (const cssPath of entry.css || []) {
      await page.addStyleTag({ content: version.read(cssPath) });
    }
    for (const jsPath of entry.js || []) {
      await page.addScriptTag({ content: version.read(jsPath), type: "text/javascript" });
    }
  }
  await page.addStyleTag({ content: stabilityStyle });
}

async function createContentPage(context, version, route, initialSettings, pageErrors, pageName) {
  const page = await context.newPage();
  page.setDefaultTimeout(5000);
  capturePageErrors(page, pageErrors, pageName);
  await installStorageMock(page, initialSettings);
  await routeXFixture(page);
  await page.goto(`https://x.com${route}`, { waitUntil: "domcontentloaded" });
  await injectContentScripts(page, version);
  await page.waitForFunction(() =>
    document.querySelector('[aria-label="Zen View settings"]') &&
    document.querySelectorAll("[data-xhec-setting-key]").length > 0,
  );
  await page.waitForFunction(() => {
    const inputs = [...document.querySelectorAll("[data-xhec-setting-key]")];
    return inputs.length > 0 && inputs.every((input) => !input.disabled);
  });
  await settlePage(page);
  return page;
}

async function createPopupPage(context, version, initialSettings, pageErrors, pageName) {
  const popupPath = version.manifest.action?.default_popup;
  if (!popupPath) throw new Error("The manifest action.default_popup is required for popup parity.");

  const page = await context.newPage();
  page.setDefaultTimeout(5000);
  capturePageErrors(page, pageErrors, pageName);
  await installStorageMock(page, initialSettings);
  await routeVersionFiles(page, version);
  await page.goto(extensionUrl(version, popupPath), { waitUntil: "load" });
  await page.addStyleTag({ content: stabilityStyle });
  await page.waitForFunction(() => {
    const inputs = [...document.querySelectorAll("[data-setting-key]")];
    return inputs.length > 0 && inputs.every((input) => !input.disabled);
  });
  await settlePage(page);
  return page;
}

async function setStoredSettings(page, settings) {
  await page.evaluate((nextSettings) => {
    window.__zenParityStorage.setSettings(nextSettings);
  }, settings);
  await settlePage(page);
}

function makeSettingsMatrix() {
  return Array.from({ length: 2 ** settingKeys.length }, (_, mask) =>
    Object.fromEntries(settingKeys.map((key, index) => [key, Boolean(mask & (1 << index))])));
}

async function collectPopupState(page) {
  return page.evaluate(() => {
    const text = (element) => (element?.textContent || "").replace(/\s+/gu, " ").trim();
    const labelText = (input) => {
      const copy = input.closest("label")?.querySelector(".toggle-copy");
      return copy ? [...copy.children].map(text) : [text(input.closest("label"))];
    };
    return {
      heading: text(document.querySelector("h1")),
      items: [...document.querySelectorAll("[data-setting-key]")].map((input) => ({
        checked: input.checked,
        disabled: input.disabled,
        key: input.dataset.settingKey || null,
        role: input.getAttribute("role"),
        text: labelText(input),
        label: text(input.closest("label")),
        type: input.type,
      })),
      status: text(document.getElementById("statusText")),
      title: document.title,
    };
  });
}

async function collectInPageState(page) {
  return page.evaluate(() => {
    const text = (element) => (element?.textContent || "").replace(/\s+/gu, " ").trim();
    const labelText = (input) => {
      const copy = input.closest("label")?.querySelector(".xhec-page-toggle-copy");
      return copy ? [...copy.children].map(text) : [text(input.closest("label"))];
    };
    const rect = (element) => {
      if (!element) return null;
      const value = element.getBoundingClientRect();
      return Object.fromEntries(["bottom", "height", "left", "right", "top", "width"]
        .map((key) => [key, Math.round(value[key] * 100) / 100]));
    };
    const button = document.querySelector('[aria-label="Zen View settings"]');
    const panel = document.getElementById("zen-view-page-panel");
    return {
      button: button ? {
        expanded: button.getAttribute("aria-expanded"),
        rect: rect(button),
        title: button.getAttribute("title"),
      } : null,
      items: [...document.querySelectorAll("[data-xhec-setting-key]")].map((input) => ({
        checked: input.checked,
        disabled: input.disabled,
        key: input.dataset.xhecSettingKey || null,
        role: input.getAttribute("role"),
        text: labelText(input),
        type: input.type,
      })),
      panel: panel ? {
        hidden: panel.hidden,
        overflowY: getComputedStyle(panel).overflowY,
        rect: rect(panel),
        scrollHeight: panel.scrollHeight,
      } : null,
      title: text(panel?.querySelector("h2")),
    };
  });
}

async function collectCompactNavState(page) {
  return page.evaluate(() => {
    const rect = (selector) => {
      const element = document.querySelector(selector);
      if (!element) return null;
      const value = element.getBoundingClientRect();
      return Object.fromEntries(["bottom", "left", "right", "top"]
        .map((key) => [key, Math.round(value[key] * 100) / 100]));
    };
    const rendered = (selector) => {
      const element = document.querySelector(selector);
      if (!element) return null;
      for (let current = element; current; current = current.parentElement) {
        const style = getComputedStyle(current);
        if (style.display === "none" || style.visibility === "hidden") return false;
      }
      return true;
    };
    return {
      control: rect('[aria-label="Zen View settings"]'),
      logo: rect("#x-logo"),
      navTextRendered: rendered("#nav-home-text"),
      post: rect("#post-button"),
      postTextRendered: rendered("#post-button span"),
    };
  });
}

async function collectToggleMatrix(page, settingsMatrix) {
  return page.evaluate((matrix) => {
    const rendered = (selector) => {
      const element = document.querySelector(selector);
      if (!element) return null;
      for (let current = element; current; current = current.parentElement) {
        const style = getComputedStyle(current);
        if (style.display === "none" || style.visibility === "hidden") return false;
      }
      return true;
    };
    const inputs = () => [...document.querySelectorAll("[data-xhec-setting-key]")]
      .map((input) => [input.dataset.xhecSettingKey, input.checked]);
    const targets = {
      count: "#dynamic-count",
      navText: "#nav-home-text",
      news: "#news",
      ordinaryVideo: "#ordinary-video-tweet",
      premium: "#premium",
      promoted: "#promoted-tweet",
      recommendations: "#recommendations",
      sidebar: "#sidebar",
      trends: "#trends",
      live: "#live",
    };

    return matrix.map((settings) => {
      window.__zenParityStorage.setSettings(settings);
      return {
        rendered: Object.fromEntries(Object.entries(targets)
          .map(([key, selector]) => [key, rendered(selector)])),
        settings,
        switches: inputs(),
      };
    });
  }, settingsMatrix);
}

async function runPanelScenario(page) {
  await page.setViewportSize({ width: 800, height: 600 });
  await page.evaluate(() => {
    const post = document.getElementById("post-button");
    post.style.left = "calc(100vw - 60px)";
    post.style.bottom = "82px";
    window.dispatchEvent(new Event("resize"));
  });
  await settlePage(page);
  await page.locator('[aria-label="Zen View settings"]').click();
  await page.evaluate(() => document.activeElement?.blur());
  await settlePage(page);
  const desktop = await collectInPageState(page);
  const desktopPng = await page.screenshot();

  await page.evaluate(() => {
    const post = document.getElementById("post-button");
    post.style.left = "1200px";
    post.style.bottom = "-50px";
    window.dispatchEvent(new Event("resize"));
  });
  await settlePage(page);
  const offscreenAnchor = await collectInPageState(page);

  await page.setViewportSize({ width: 500, height: 300 });
  await page.evaluate(() => window.dispatchEvent(new Event("resize")));
  await settlePage(page);
  const shortViewport = await collectInPageState(page);
  const shortViewportPng = await page.screenshot();

  return {
    screenshots: {
      "in-page-panel-desktop": desktopPng,
      "in-page-panel-short": shortViewportPng,
    },
    state: { desktop, offscreenAnchor, shortViewport },
  };
}

async function runCompactNavScenario(page) {
  await setStoredSettings(page, allShownSettings);
  const expanded = await collectCompactNavState(page);
  await setStoredSettings(page, { ...allShownSettings, leftNavIconOnly: true });
  const compact = await collectCompactNavState(page);
  await setStoredSettings(page, allShownSettings);
  const restored = await collectCompactNavState(page);
  return { compact, expanded, restored };
}

async function runMediaScenario(page) {
  await setStoredSettings(page, { ...allShownSettings, promotedPosts: true });
  await page.evaluate(() => {
    document.getElementById("video-mount").innerHTML = [
      '<div data-testid="videoPlayer"><span data-testid="promotedLabel">Ad</span></div>',
    ].join("");
    const latePromoted = document.createElement("article");
    latePromoted.id = "late-promoted-tweet";
    latePromoted.setAttribute("data-testid", "tweet");
    latePromoted.innerHTML = '<div data-testid="promotedIndicator">Promoted</div>';
    document.querySelector('[data-testid="primaryColumn"]').append(latePromoted);
  });
  await settlePage(page);
  return page.evaluate(() => {
    const rendered = (selector) => {
      const element = document.querySelector(selector);
      if (!element) return null;
      for (let current = element; current; current = current.parentElement) {
        const style = getComputedStyle(current);
        if (style.display === "none" || style.visibility === "hidden") return false;
      }
      return true;
    };
    return {
      latePromoted: rendered("#late-promoted-tweet"),
      ordinaryTweet: rendered("#ordinary-video-tweet"),
      ordinaryVideo: rendered("#ordinary-video"),
    };
  });
}

async function runCountScenario(page) {
  await setStoredSettings(page, { ...allShownSettings, engagementCounts: true });
  const capture = () => page.evaluate(() => {
    const count = document.getElementById("dynamic-count");
    const action = document.getElementById("count-action");
    const rendered = (() => {
      for (let current = count; current; current = current.parentElement) {
        const style = getComputedStyle(current);
        if (style.display === "none" || style.visibility === "hidden") return false;
      }
      return true;
    })();
    return {
      actionTestId: action.getAttribute("data-testid"),
      countText: count.textContent,
      rendered,
    };
  });

  const actionLabel = await capture();
  await page.evaluate(() => {
    document.getElementById("count-action").setAttribute("data-testid", "unlike");
    document.getElementById("dynamic-count").textContent = "12";
  });
  await settlePage(page);
  const numericUnlike = await capture();
  await page.evaluate(() => {
    document.getElementById("count-action").setAttribute("data-testid", "like");
    document.getElementById("dynamic-count").textContent = "Like";
  });
  await settlePage(page);
  const restoredLike = await capture();
  return { actionLabel, numericUnlike, restoredLike };
}

async function runChatScenario(context, version, pageErrors) {
  const states = {};
  for (const route of ["/i/chat", "/messages/123"]) {
    const page = await createContentPage(
      context,
      version,
      route,
      allHiddenSettings,
      pageErrors,
      `chat:${route}`,
    );
    states[route] = await page.evaluate(() => {
      const rendered = (selector) => {
        const element = document.querySelector(selector);
        if (!element) return null;
        for (let current = element; current; current = current.parentElement) {
          const style = getComputedStyle(current);
          if (style.display === "none" || style.visibility === "hidden") return false;
        }
        return true;
      };
      return Object.fromEntries([
        "#sidebar",
        "#premium",
        "#live",
        "#recommendations",
        "#trends",
        "#news",
        "#legal",
      ].map((selector) => [selector, rendered(selector)]));
    });
  }
  return states;
}

async function runVersion(browser, version) {
  const context = await browser.newContext({
    colorScheme: "light",
    deviceScaleFactor: 1,
    locale: "ja-JP",
    reducedMotion: "reduce",
    viewport: { height: 720, width: 1280 },
  });
  const pageErrors = [];
  try {
    const defaultPage = await createContentPage(
      context,
      version,
      "/home",
      undefined,
      pageErrors,
      "in-page:default",
    );
    const defaultInPage = await collectInPageState(defaultPage);

    const persistedPage = await createContentPage(
      context,
      version,
      "/home",
      persistedSettings,
      pageErrors,
      "in-page:persisted",
    );
    const persistedInPage = await collectInPageState(persistedPage);
    const panel = await runPanelScenario(persistedPage);
    const compactNav = await runCompactNavScenario(persistedPage);
    const settingsMatrix = await collectToggleMatrix(persistedPage, makeSettingsMatrix());
    await settlePage(persistedPage);
    const media = await runMediaScenario(persistedPage);
    const counts = await runCountScenario(persistedPage);

    const defaultPopup = await createPopupPage(
      context,
      version,
      undefined,
      pageErrors,
      "popup:default",
    );
    const persistedPopup = await createPopupPage(
      context,
      version,
      persistedSettings,
      pageErrors,
      "popup:persisted",
    );
    const popupScreenshot = await persistedPopup.locator(".popup").screenshot();
    const popup = {
      default: await collectPopupState(defaultPopup),
      persisted: await collectPopupState(persistedPopup),
    };

    const chat = await runChatScenario(context, version, pageErrors);
    return {
      pageErrors,
      screenshots: {
        ...panel.screenshots,
        "popup-persisted": popupScreenshot,
      },
      state: {
        chat,
        compactNav,
        counts,
        inPage: {
          default: defaultInPage,
          persisted: persistedInPage,
        },
        media,
        panel: panel.state,
        popup,
        settingsMatrix,
      },
    };
  } finally {
    await context.close();
  }
}

function firstDifference(expected, actual, currentPath = "state") {
  if (isDeepStrictEqual(expected, actual)) return null;
  if (typeof expected !== "object" || expected === null ||
      typeof actual !== "object" || actual === null) {
    return { actual, expected, path: currentPath };
  }
  if (Array.isArray(expected) !== Array.isArray(actual)) {
    return { actual, expected, path: currentPath };
  }
  if (Array.isArray(expected)) {
    if (expected.length !== actual.length) {
      return { actual: actual.length, expected: expected.length, path: `${currentPath}.length` };
    }
    for (let index = 0; index < expected.length; index += 1) {
      const difference = firstDifference(expected[index], actual[index], `${currentPath}[${index}]`);
      if (difference) return difference;
    }
    return { actual, expected, path: currentPath };
  }

  const keys = [...new Set([...Object.keys(expected), ...Object.keys(actual)])].sort();
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(expected, key) ||
        !Object.prototype.hasOwnProperty.call(actual, key)) {
      return { actual, expected, path: `${currentPath}.${key}` };
    }
    const difference = firstDifference(expected[key], actual[key], `${currentPath}.${key}`);
    if (difference) return difference;
  }
  return { actual, expected, path: currentPath };
}

function describeValue(value) {
  const serialized = JSON.stringify(value);
  return serialized === undefined ? String(value) : serialized;
}

async function screenshotsMatch(page, baselineImage, currentImage) {
  if (baselineImage.equals(currentImage)) return true;
  return page.evaluate(async (images) => {
    const decoded = await Promise.all(images.map(async (base64) => {
      const image = new Image();
      image.src = `data:image/png;base64,${base64}`;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext("2d");
      context.drawImage(image, 0, 0);
      return {
        width: image.width,
        height: image.height,
        pixels: context.getImageData(0, 0, image.width, image.height).data,
      };
    }));
    const [baseline, current] = decoded;
    return baseline.width === current.width && baseline.height === current.height &&
      baseline.pixels.every((value, index) => value === current.pixels[index]);
  }, [baselineImage.toString("base64"), currentImage.toString("base64")]);
}

function writeDiagnostics(name, baselineImage, currentImage) {
  fs.mkdirSync(diagnosticDirectory, { recursive: true });
  fs.writeFileSync(path.join(diagnosticDirectory, `baseline-${name}.png`), baselineImage);
  fs.writeFileSync(path.join(diagnosticDirectory, `current-${name}.png`), currentImage);
}

async function compareResults(page, baseline, current) {
  const failures = [];
  if (baseline.pageErrors.length > 0) {
    failures.push(`baseline emitted page errors: ${describeValue(baseline.pageErrors)}`);
  }
  if (current.pageErrors.length > 0) {
    failures.push(`current emitted page errors: ${describeValue(current.pageErrors)}`);
  }
  const stateDifference = firstDifference(baseline.state, current.state);
  if (stateDifference) {
    failures.push(
      `structured state differs at ${stateDifference.path}\n` +
      `baseline: ${describeValue(stateDifference.expected)}\n` +
      `current: ${describeValue(stateDifference.actual)}`,
    );
  }

  const baselineImageNames = Object.keys(baseline.screenshots).sort();
  const currentImageNames = Object.keys(current.screenshots).sort();
  if (!isDeepStrictEqual(baselineImageNames, currentImageNames)) {
    failures.push("the two versions captured a different set of screenshots");
  } else {
    for (const name of baselineImageNames) {
      if (!await screenshotsMatch(page, baseline.screenshots[name], current.screenshots[name])) {
        writeDiagnostics(name, baseline.screenshots[name], current.screenshots[name]);
        failures.push(
          `screenshot differs: ${name} (diagnostics: ${path.relative(extensionRoot, diagnosticDirectory)})`,
        );
      }
    }
  }

  if (failures.length > 0) {
    throw new Error(`Behavior parity failed:\n${failures.join("\n\n")}`);
  }
}

async function main() {
  const baselineRef = resolveBaselineRef(readBaselineRef());
  const baseline = loadVersion("baseline", baselineRef);
  const current = loadVersion("current", null);
  const browser = await chromium.launch({ headless: true });

  try {
    const baselineResult = await runVersion(browser, baseline);
    const currentResult = await runVersion(browser, current);
    const comparisonPage = await browser.newPage();
    await compareResults(comparisonPage, baselineResult, currentResult);
    console.log(
      `behavior parity passed: ${baselineRef} vs current ` +
      `(${settingKeys.length} settings, ${2 ** settingKeys.length} storage combinations, 3 screenshots)`,
    );
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
