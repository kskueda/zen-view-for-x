(() => {
  const SETTINGS_STORAGE_KEY = "xhecSettings";
  const LEGACY_STORAGE_KEY = "hideEngagementCounts";
  const DEFAULT_SETTINGS = {
    engagementCounts: true,
    promotedPosts: true,
    sidebarPremium: true,
    sidebarLive: true,
    sidebarRecommendations: true,
    sidebarTrends: true,
    sidebarNews: true,
    leftNavIconOnly: true,
  };
  const HTML_CLASS_BY_SETTING = {
    engagementCounts: "xhec-hide-engagement-counts",
    promotedPosts: "xhec-hide-promoted-posts",
    leftNavIconOnly: "xhec-left-nav-icon-only",
  };
  const LEGACY_SIDEBAR_SETTING_KEY = "sidebarBoxes";
  const SETTING_ITEMS = [
    {
      key: "engagementCounts",
      label: "数値を表示する",
      detail: "返信・リポスト・いいね・表示数",
    },
    {
      key: "promotedPosts",
      label: "広告ポストを表示する",
      detail: "Ad / Ads / 広告 / Promoted",
    },
    {
      key: "sidebarPremium",
      label: "右欄: プレミアムを表示する",
      detail: "プレミアムにサブスクライブ",
    },
    {
      key: "sidebarLive",
      label: "右欄: ライブを表示する",
      detail: "Xでライブ放送する",
    },
    {
      key: "sidebarRecommendations",
      label: "右欄: おすすめユーザーを表示する",
      detail: "おすすめユーザー・おすすめアカウント",
    },
    {
      key: "sidebarTrends",
      label: "右欄: トレンドを表示する",
      detail: "いまを見つけよう・話題",
    },
    {
      key: "sidebarNews",
      label: "右欄: ニュースを表示する",
      detail: "本日のニュース・今日のニュース",
    },
    {
      key: "leftNavIconOnly",
      label: "左ナビの文字を表示する",
      detail: "ホーム・検索・通知・ブックマークなど",
    },
  ];
  const ACTION_TEST_IDS = [
    "reply",
    "like",
    "unlike",
    "retweet",
    "unretweet",
    "analytics",
  ];
  const ACTION_SELECTOR = [
    ...ACTION_TEST_IDS.map(
      (testId) => `article[data-testid="tweet"] [data-testid="${testId}"]`,
    ),
    'article[data-testid="tweet"] a[href$="/analytics"]',
    'article[data-testid="tweet"] a[href*="/analytics?"]',
  ].join(",");
  const COUNT_CONTAINER_SELECTOR = '[data-testid="app-text-transition-container"]';
  const HIDDEN_COUNT_CLASS = "xhec-hidden-engagement-count";
  const HIDDEN_PROMOTED_CLASS = "xhec-hidden-promoted";
  const HIDDEN_SIDEBAR_BOX_CLASS = "xhec-hidden-sidebar-box";
  const HIDE_SIDEBAR_BOXES_CLASS = "xhec-hide-sidebar-boxes";
  const HIDE_SIDEBAR_SHELL_CLASS = "xhec-hide-sidebar-shell";
  const PAGE_CONTROL_ID = "zen-view-page-control";
  const PAGE_PANEL_ID = "zen-view-page-panel";
  const PAGE_PANEL_GAP = 8;
  const PAGE_PANEL_VIEWPORT_MARGIN = 8;
  const SIDEBAR_ROOT_SELECTOR = '[data-testid="sidebarColumn"]';
  const SIDEBAR_LABEL_SELECTOR = [
    'aside[aria-label]',
    '[role="complementary"][aria-label]',
    "h1",
    "h2",
    "h3",
    '[role="heading"]',
  ].join(",");
  const SIDEBAR_SEMANTIC_BOX_SELECTOR = [
    "aside",
    '[role="complementary"]',
    "section",
    '[role="region"]',
  ].join(",");
  const PROMOTED_MARKER_SELECTOR = [
    '[data-testid="promotedIndicator"]',
    '[data-testid="promotedLabel"]',
  ].join(",");
  const PROMOTED_MEDIA_SELECTOR = [
    '[data-testid="videoPlayer"]',
    '[data-testid="videoComponent"]',
    '[data-testid="mediaViewer"]',
  ].join(",");
  const PROMOTED_LABEL_EXCLUSION_SELECTOR = [
    '[data-testid="tweetText"]',
    '[data-testid="User-Name"]',
    '[data-testid="card.wrapper"]',
    "a",
    '[role="link"]',
    PROMOTED_MEDIA_SELECTOR,
  ].join(",");
  const OBSERVER_DEBOUNCE_MS = 80;

  const COUNT_TEXT_RE =
    /^[\s\u00a0]*[0-9０-９][0-9０-９.,，]*\s*(?:K|M|B|万|億)?[\s\u00a0]*$/iu;
  const COUNT_WITH_UNIT_RE =
    /^[\s\u00a0]*[0-9０-９][0-9０-９.,，]*\s*(?:K|M|B|万|億)?\s*(?:件|件の返信|件のいいね|件のリポスト|件の表示|返信|リポスト|いいね|表示|reply|replies|repost|reposts|like|likes|view|views|impression|impressions)[\s\u00a0]*$/iu;
  const PROMOTED_LABEL_RE =
    /^(?:ad|ads|advertisement|promoted|sponsored|広告|プロモーション|プロモーション広告|スポンサー)$/iu;
  const SIDEBAR_BOX_RULES = [
    {
      settingKey: "sidebarPremium",
      labelRe: /^(?:プレミアムにサブスクライブ|プレミアム|Subscribe to Premium|Premium)$/iu,
    },
    {
      settingKey: "sidebarLive",
      labelRe: /^(?:Xでライブ放送する|ライブ放送|ライブ|Live on X|Go live)$/iu,
    },
    {
      settingKey: "sidebarRecommendations",
      labelRe:
        /^(?:おすすめユーザー|おすすめアカウント|Who to follow|You might like)$/iu,
    },
    {
      settingKey: "sidebarTrends",
      labelRe:
        /^(?:「?いま」?を見つけよう|いまを見つけよう|トレンド|話題|話題を検索|What['’]s happening|Trends for you|Trending)$/iu,
    },
    {
      settingKey: "sidebarNews",
      labelRe: /^(?:本日のニュース|今日のニュース|ニュース|Today['’]s news|News)$/iu,
    },
  ];
  const SIDEBAR_LABEL_MAX_LENGTH = 100;
  const CHAT_PATH_RE = /^\/(?:i\/chat|messages)(?:\/|$)/u;

  let settings = { ...DEFAULT_SETTINGS };
  let settingsLoaded = false;
  let settingsSaving = false;
  let storageRevision = 0;
  let scanTimer = 0;
  let uiTimer = 0;

  function normalizeSettings(value) {
    return Object.fromEntries(
      Object.entries(DEFAULT_SETTINGS).map(([key, defaultValue]) => {
        if (typeof value?.[key] === "boolean") {
          return [key, value[key]];
        }

        if (key.startsWith("sidebar") && typeof value?.[LEGACY_SIDEBAR_SETTING_KEY] === "boolean") {
          return [key, value[LEGACY_SIDEBAR_SETTING_KEY]];
        }

        return [key, defaultValue];
      }),
    );
  }

  function settingsFromStorage(items) {
    if (items[SETTINGS_STORAGE_KEY]) {
      return normalizeSettings(items[SETTINGS_STORAGE_KEY]);
    }

    if (typeof items[LEGACY_STORAGE_KEY] === "boolean") {
      return Object.fromEntries(
        Object.keys(DEFAULT_SETTINGS).map((key) => [key, items[LEGACY_STORAGE_KEY]]),
      );
    }

    return { ...DEFAULT_SETTINGS };
  }

  function hasEnabledFeatures() {
    return Object.values(settings).some(Boolean);
  }

  function hasEnabledSidebarBoxes() {
    return SIDEBAR_BOX_RULES.some((rule) => settings[rule.settingKey]);
  }

  function shouldHideSidebarShell() {
    return (
      !isChatPage() &&
      SIDEBAR_BOX_RULES.every((rule) => settings[rule.settingKey])
    );
  }

  function applySettings(nextSettings) {
    settingsLoaded = true;
    settings = normalizeSettings(nextSettings);

    Object.entries(HTML_CLASS_BY_SETTING).forEach(([key, className]) => {
      document.documentElement.classList.toggle(className, settings[key]);
    });
    document.documentElement.classList.toggle(
      HIDE_SIDEBAR_BOXES_CLASS,
      hasEnabledSidebarBoxes(),
    );
    hideSidebarBoxes();

    schedulePageControlRefresh();
    renderPageControlSettings();

    if (hasEnabledFeatures()) {
      scanTimeline();
    }
  }

  function saveSettings(nextSettings) {
    if (!settingsLoaded || settingsSaving) {
      return;
    }
    const normalizedSettings = normalizeSettings(nextSettings);

    if (typeof chrome === "undefined" || !chrome.storage?.local) {
      applySettings(normalizedSettings);
      return;
    }

    const previousSettings = settings;
    const revisionBeforeSave = storageRevision;
    settingsSaving = true;
    applySettings(normalizedSettings);
    chrome.storage.local.set({ [SETTINGS_STORAGE_KEY]: normalizedSettings }, () => {
      const failed = Boolean(chrome.runtime?.lastError);
      settingsSaving = false;
      if (failed && storageRevision === revisionBeforeSave) {
        applySettings(previousSettings);
      } else {
        renderPageControlSettings();
      }
      const button = document.querySelector(`#${PAGE_CONTROL_ID} .xhec-page-button`);
      if (button) {
        button.title = failed ? "Settings could not be saved. Please try again." : "Zen View for X";
      }
    });
  }

  function isCountText(value) {
    const text = value.replace(/\u00a0/g, " ").trim();
    return COUNT_TEXT_RE.test(text) || COUNT_WITH_UNIT_RE.test(text);
  }

  function normalizeText(value) {
    return value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
  }

  function isPromotedLabelElement(element) {
    if (
      element.children.length > 0 ||
      element.closest(PROMOTED_LABEL_EXCLUSION_SELECTOR)
    ) {
      return false;
    }

    return PROMOTED_LABEL_RE.test(normalizeText(element.textContent || ""));
  }

  function hasPromotedMarker(tweet) {
    const ancestorMarker = tweet.closest(PROMOTED_MARKER_SELECTOR);

    if (ancestorMarker && !ancestorMarker.closest(PROMOTED_MEDIA_SELECTOR)) {
      return true;
    }

    return Array.from(tweet.querySelectorAll(PROMOTED_MARKER_SELECTOR)).some(
      (marker) => !marker.closest(PROMOTED_MEDIA_SELECTOR),
    );
  }

  function isPromotedTweet(tweet) {
    return (
      hasPromotedMarker(tweet) ||
      Array.from(tweet.querySelectorAll("span, div")).some(isPromotedLabelElement)
    );
  }

  function isChatPage() {
    return CHAT_PATH_RE.test(window.location.pathname);
  }

  function isRightOfPrimaryColumn(element) {
    const primaryColumn = document.querySelector('[data-testid="primaryColumn"]');
    const primaryRect = primaryColumn?.getBoundingClientRect();
    const elementRect = element.getBoundingClientRect();

    if (
      !primaryRect ||
      primaryRect.width === 0 ||
      elementRect.width === 0 ||
      elementRect.height === 0
    ) {
      return false;
    }

    return elementRect.left >= primaryRect.right - 8;
  }

  function getSidebarBoxSettingKey(element, requireRightColumn = false) {
    if (!element.matches(SIDEBAR_LABEL_SELECTOR)) {
      return null;
    }

    if (
      element.closest("article") ||
      element.closest("header") ||
      element.closest("nav") ||
      element.closest('[data-testid="primaryColumn"]') ||
      element.closest('[aria-label="Home timeline"]') ||
      element.closest('[aria-label="ホームタイムライン"]') ||
      element.closest('form[role="search"]') ||
      element.closest('[data-testid="SearchBox_Search_Input"]') ||
      element.closest(`#${PAGE_CONTROL_ID}`)
    ) {
      return null;
    }

    if (requireRightColumn && !isRightOfPrimaryColumn(element)) {
      return null;
    }

    const label = normalizeText(
      element.getAttribute("aria-label") || element.textContent || "",
    );

    if (label.length === 0 || label.length > SIDEBAR_LABEL_MAX_LENGTH) {
      return null;
    }

    return SIDEBAR_BOX_RULES.find((rule) => rule.labelRe.test(label))?.settingKey || null;
  }

  function getContainedSidebarSettingKeys(element, requireRightColumn = false) {
    const labels = [
      ...(element.matches(SIDEBAR_LABEL_SELECTOR) ? [element] : []),
      ...element.querySelectorAll(SIDEBAR_LABEL_SELECTOR),
    ];

    return new Set(
      labels
        .map((label) => getSidebarBoxSettingKey(label, requireRightColumn))
        .filter(Boolean),
    );
  }

  function isSafeSidebarBox(
    element,
    sidebar,
    settingKey,
    requireRightColumn = false,
  ) {
    if (
      !element ||
      element === sidebar ||
      element === document.body ||
      element === document.documentElement ||
      !sidebar.contains(element)
    ) {
      return false;
    }

    if (
      element.closest("article") ||
      element.closest("header") ||
      element.closest("nav") ||
      element.closest('[data-testid="primaryColumn"]') ||
      element.querySelector('form[role="search"]') ||
      element.querySelector('[data-testid="SearchBox_Search_Input"]') ||
      element.closest(`#${PAGE_CONTROL_ID}`)
    ) {
      return false;
    }

    if (requireRightColumn && !isRightOfPrimaryColumn(element)) {
      return false;
    }

    const containedKeys = getContainedSidebarSettingKeys(
      element,
      requireRightColumn,
    );

    return containedKeys.size === 1 && containedKeys.has(settingKey);
  }

  function findSidebarBox(
    labelElement,
    sidebar,
    settingKey,
    requireRightColumn = false,
  ) {
    const semanticBox = labelElement.matches(SIDEBAR_SEMANTIC_BOX_SELECTOR)
      ? labelElement
      : labelElement.closest(SIDEBAR_SEMANTIC_BOX_SELECTOR);

    if (
      isSafeSidebarBox(
        semanticBox,
        sidebar,
        settingKey,
        requireRightColumn,
      )
    ) {
      return semanticBox;
    }

    const labelText = normalizeText(
      labelElement.getAttribute("aria-label") || labelElement.textContent || "",
    );
    let current = labelElement.parentElement;

    while (current && current !== sidebar) {
      if (
        isSafeSidebarBox(
          current,
          sidebar,
          settingKey,
          requireRightColumn,
        )
      ) {
        const currentText = normalizeText(current.textContent || "");

        if (
          current.children.length > 1 &&
          currentText.length > labelText.length
        ) {
          return current;
        }
      } else if (
        getContainedSidebarSettingKeys(current, requireRightColumn).size > 1
      ) {
        return null;
      }

      current = current.parentElement;
    }

    return null;
  }

  function getSidebarSearchRoots() {
    const sidebar = document.querySelector(SIDEBAR_ROOT_SELECTOR);

    if (
      sidebar &&
      !sidebar.closest("article") &&
      !sidebar.closest("header") &&
      !sidebar.closest("nav") &&
      !sidebar.closest('[data-testid="primaryColumn"]') &&
      !sidebar.closest(`#${PAGE_CONTROL_ID}`)
    ) {
      return [{ requireRightColumn: false, root: sidebar }];
    }

    const body = document.body || document.documentElement;

    if (
      body &&
      !isChatPage() &&
      document.querySelector('[data-testid="primaryColumn"]')
    ) {
      return [{
        requireRightColumn: true,
        root: body,
      }];
    }

    return [];
  }

  function hidePromotedTweets() {
    document.querySelectorAll('article[data-testid="tweet"]').forEach((tweet) => {
      tweet.classList.toggle(HIDDEN_PROMOTED_CLASS, isPromotedTweet(tweet));
    });
  }

  function hideSidebarBoxes() {
    document.documentElement.classList.toggle(
      HIDE_SIDEBAR_SHELL_CLASS,
      shouldHideSidebarShell(),
    );

    document.querySelectorAll(`.${HIDDEN_SIDEBAR_BOX_CLASS}`).forEach((box) => {
      box.classList.remove(HIDDEN_SIDEBAR_BOX_CLASS);
    });

    if (isChatPage()) {
      return;
    }

    getSidebarSearchRoots().forEach(({ root: sidebar, requireRightColumn }) => {
      [
        ...(sidebar.matches(SIDEBAR_LABEL_SELECTOR) ? [sidebar] : []),
        ...sidebar.querySelectorAll(SIDEBAR_LABEL_SELECTOR),
      ].forEach((element) => {
        const settingKey = getSidebarBoxSettingKey(element, requireRightColumn);

        if (!settingKey || !settings[settingKey]) {
          return;
        }

        const box = findSidebarBox(
          element,
          sidebar,
          settingKey,
          requireRightColumn,
        );

        if (box) {
          box.classList.add(HIDDEN_SIDEBAR_BOX_CLASS);
        }
      });
    });
  }

  function findXLogoLink() {
    const header = document.querySelector('header[role="banner"]') ||
      document.querySelector("header");
    const logoByLabel = header?.querySelector('a[aria-label="X"]') ||
      document.querySelector('header a[aria-label="X"]');

    if (logoByLabel) {
      return logoByLabel;
    }

    const homeLinks = Array.from(header?.querySelectorAll('a[href="/home"]') || []);
    const logoByHomeLink = homeLinks.find(
      (link) => !link.closest('nav[role="navigation"]'),
    );

    return logoByHomeLink || null;
  }

  function findFirstNavigationLink() {
    const header = document.querySelector('header[role="banner"]') ||
      document.querySelector("header");
    const nav = header?.querySelector('nav[role="navigation"]');

    return (
      nav?.querySelector('a[href="/home"]') ||
      nav?.querySelector('a[role="link"]') ||
      nav?.querySelector('[role="link"]') ||
      null
    );
  }

  function resetElementAlignment(element) {
    element.style.position = "";
    element.style.transform = "";
    element.style.zIndex = "";
  }

  function alignElementToNavigationCenter(element) {
    resetElementAlignment(element);

    if (!settings.leftNavIconOnly) {
      return;
    }

    const firstNavLink = findFirstNavigationLink();
    const navRect = firstNavLink?.getBoundingClientRect();
    const elementRect = element.getBoundingClientRect();

    if (
      !navRect ||
      navRect.width === 0 ||
      navRect.height === 0 ||
      elementRect.width === 0 ||
      elementRect.height === 0
    ) {
      return;
    }

    const navCenter = navRect.left + navRect.width / 2;
    const elementCenter = elementRect.left + elementRect.width / 2;
    const offset = Math.round(navCenter - elementCenter);

    element.style.position = "relative";
    element.style.transform = `translateX(${offset}px)`;
    element.style.zIndex = "1";
  }

  function alignCompactXLogo() {
    const logoLink = findXLogoLink();

    if (!logoLink) {
      return;
    }

    alignElementToNavigationCenter(logoLink);
  }

  function findPostButton() {
    const header = document.querySelector('header[role="banner"]') ||
      document.querySelector("header");

    return (
      header?.querySelector('a[data-testid="SideNav_NewTweet_Button"]') ||
      header?.querySelector('a[href="/compose/post"]') ||
      document.querySelector('a[data-testid="SideNav_NewTweet_Button"]') ||
      document.querySelector('a[href="/compose/post"]')
    );
  }

  function alignCompactPostButton() {
    const postButton = findPostButton();

    if (!postButton) {
      return;
    }

    alignElementToNavigationCenter(postButton);
  }

  function clampToRange(value, minimum, maximum) {
    return Math.min(Math.max(value, minimum), Math.max(minimum, maximum));
  }

  function positionPagePanel(control) {
    const button = control.querySelector(".xhec-page-button");
    const panel = control.querySelector(".xhec-page-panel");

    if (!button || !panel || panel.hidden) {
      return;
    }

    const buttonRect = button.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
    const viewportHeight = document.documentElement.clientHeight || window.innerHeight;
    const spaceAbove = buttonRect.top - PAGE_PANEL_GAP - PAGE_PANEL_VIEWPORT_MARGIN;
    const spaceBelow = viewportHeight - buttonRect.bottom - PAGE_PANEL_GAP -
      PAGE_PANEL_VIEWPORT_MARGIN;
    const openAbove = panelRect.height > spaceBelow && spaceAbove > spaceBelow;
    const desiredTop = openAbove
      ? buttonRect.top - PAGE_PANEL_GAP - panelRect.height
      : buttonRect.bottom + PAGE_PANEL_GAP;
    const maximumTop = viewportHeight - panelRect.height -
      PAGE_PANEL_VIEWPORT_MARGIN;
    const maximumLeft = viewportWidth - panelRect.width -
      PAGE_PANEL_VIEWPORT_MARGIN;
    const top = clampToRange(
      desiredTop,
      PAGE_PANEL_VIEWPORT_MARGIN,
      maximumTop,
    );
    const left = clampToRange(
      buttonRect.left,
      PAGE_PANEL_VIEWPORT_MARGIN,
      maximumLeft,
    );

    panel.style.setProperty("--xhec-panel-top", `${Math.round(top)}px`);
    panel.style.setProperty("--xhec-panel-left", `${Math.round(left)}px`);
  }

  function positionPageControl(control) {
    const postButton = findPostButton();
    const postRect = postButton?.getBoundingClientRect();
    const hasPostRect = postRect && postRect.width > 0 && postRect.height > 0;
    const logoLink = findXLogoLink();
    const logoRect = logoLink?.getBoundingClientRect();
    const hasLogoRect = logoRect && logoRect.width > 0 && logoRect.height > 0;
    const compactNav = settings.leftNavIconOnly;
    const top = compactNav && hasPostRect
      ? postRect.bottom + 14
      : hasLogoRect
        ? logoRect.top + logoRect.height + 8
        : 12;
    const rawLeft = compactNav && hasPostRect
      ? postRect.left + (postRect.width - 32) / 2
      : hasLogoRect
      ? compactNav
        ? logoRect.left + (logoRect.width - 32) / 2
        : logoRect.right + 8
      : compactNav
        ? 20
        : 76;
    const buttonRect = control.querySelector(".xhec-page-button").getBoundingClientRect();
    const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
    const viewportHeight = document.documentElement.clientHeight || window.innerHeight;
    const clampedTop = clampToRange(
      Math.round(top),
      PAGE_PANEL_VIEWPORT_MARGIN,
      viewportHeight - buttonRect.height - PAGE_PANEL_VIEWPORT_MARGIN,
    );
    const clampedLeft = clampToRange(
      Math.round(rawLeft),
      PAGE_PANEL_VIEWPORT_MARGIN,
      viewportWidth - buttonRect.width - PAGE_PANEL_VIEWPORT_MARGIN,
    );
    control.style.setProperty(
      "--xhec-control-top",
      `${clampedTop}px`,
    );
    control.style.setProperty(
      "--xhec-control-left",
      `${clampedLeft}px`,
    );
  }

  function renderPageControlSettings() {
    const control = document.getElementById(PAGE_CONTROL_ID);

    if (!control) {
      return;
    }

    control
      .querySelectorAll("[data-xhec-setting-key]")
      .forEach((input) => {
        input.checked = !settings[input.dataset.xhecSettingKey];
        input.disabled = !settingsLoaded || settingsSaving;
      });
  }

  function createPageControl() {
    const control = document.createElement("div");
    control.id = PAGE_CONTROL_ID;
    control.className = "xhec-page-control";

    const button = document.createElement("button");
    button.type = "button";
    button.className = "xhec-page-button";
    button.setAttribute("aria-controls", PAGE_PANEL_ID);
    button.setAttribute("aria-expanded", "false");
    button.setAttribute("aria-label", "Zen View settings");
    button.title = "Zen View for X";
    button.innerHTML = [
      '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">',
      '<path d="M4 7h10" />',
      '<path d="M18 7h2" />',
      '<path d="M4 17h2" />',
      '<path d="M10 17h10" />',
      '<circle cx="16" cy="7" r="2" />',
      '<circle cx="8" cy="17" r="2" />',
      "</svg>",
    ].join("");

    const panel = document.createElement("section");
    panel.id = PAGE_PANEL_ID;
    panel.className = "xhec-page-panel";
    panel.hidden = true;

    const title = document.createElement("h2");
    title.textContent = "Zen View";

    const list = document.createElement("div");
    list.className = "xhec-page-toggle-list";

    SETTING_ITEMS.forEach((item) => {
      const label = document.createElement("label");
      label.className = "xhec-page-toggle-row";

      const copy = document.createElement("span");
      copy.className = "xhec-page-toggle-copy";

      const name = document.createElement("span");
      name.textContent = item.label;

      const detail = document.createElement("span");
      detail.textContent = item.detail;

      const input = document.createElement("input");
      input.type = "checkbox";
      input.setAttribute("role", "switch");
      input.dataset.xhecSettingKey = item.key;
      input.addEventListener("change", () => {
        saveSettings({
          ...settings,
          [item.key]: !input.checked,
        });
      });

      copy.append(name, detail);
      label.append(copy, input);
      list.append(label);
    });

    button.addEventListener("click", (event) => {
      event.stopPropagation();
      panel.hidden = !panel.hidden;
      button.setAttribute("aria-expanded", String(!panel.hidden));
      positionPagePanel(control);
    });

    panel.append(title, list);
    control.append(button, panel);
    renderPageControlSettings();

    return control;
  }

  function ensurePageControl() {
    let control = document.getElementById(PAGE_CONTROL_ID);

    if (!control) {
      control = createPageControl();
      (document.body || document.documentElement).append(control);
    }

    alignCompactXLogo();
    alignCompactPostButton();
    positionPageControl(control);
    positionPagePanel(control);
    renderPageControlSettings();
  }

  function schedulePageControlRefresh() {
    if (uiTimer) {
      return;
    }
    uiTimer = window.setTimeout(() => {
      uiTimer = 0;
      ensurePageControl();
    }, OBSERVER_DEBOUNCE_MS);
  }

  function shouldSkipElement(element) {
    return (
      element.classList.contains(HIDDEN_COUNT_CLASS) ||
      element.closest("svg") ||
      element.querySelector("svg") ||
      element.matches("svg, path")
    );
  }

  function markVisibleCountElement(element) {
    const countContainer = element.closest(COUNT_CONTAINER_SELECTOR);
    const target = countContainer || element;
    target.classList.add(HIDDEN_COUNT_CLASS);
  }

  function hideVisibleCounts(action) {
    action.querySelectorAll(COUNT_CONTAINER_SELECTOR).forEach((element) => {
      if (isCountText(element.textContent || "")) {
        element.classList.add(HIDDEN_COUNT_CLASS);
      }
    });

    action.querySelectorAll("span, div").forEach((element) => {
      if (shouldSkipElement(element)) {
        return;
      }

      if (isCountText(element.textContent || "")) {
        markVisibleCountElement(element);
      }
    });
  }

  function scanTimeline() {
    if (!hasEnabledFeatures()) {
      return;
    }

    if (settings.promotedPosts) {
      hidePromotedTweets();
    }

    if (hasEnabledSidebarBoxes()) {
      hideSidebarBoxes();
    }

    if (settings.engagementCounts) {
      document.querySelectorAll(`.${HIDDEN_COUNT_CLASS}`).forEach((element) => {
        element.classList.remove(HIDDEN_COUNT_CLASS);
      });
      document.querySelectorAll(ACTION_SELECTOR).forEach(hideVisibleCounts);
    }
  }

  function scheduleScan() {
    if (!hasEnabledFeatures()) {
      return;
    }

    // Keep a bounded delay even while live content is continuously changing.
    if (scanTimer) {
      return;
    }
    scanTimer = window.setTimeout(() => {
      scanTimer = 0;
      scanTimeline();
    }, OBSERVER_DEBOUNCE_MS);
  }

  function scheduleDomRefresh() {
    schedulePageControlRefresh();
    scheduleScan();
  }

  function loadSettings() {
    if (typeof chrome === "undefined" || !chrome.storage?.local) {
      applySettings(DEFAULT_SETTINGS);
      return;
    }

    chrome.storage.local.get(
      { [SETTINGS_STORAGE_KEY]: null, [LEGACY_STORAGE_KEY]: null },
      (items) => {
        const failed = Boolean(chrome.runtime?.lastError);
        if (storageRevision > 0) {
          return;
        }
        if (failed) {
          const button = document.querySelector(`#${PAGE_CONTROL_ID} .xhec-page-button`);
          if (button) button.title = "Settings could not be loaded. Please reload the page.";
          return;
        }
        applySettings(settingsFromStorage(items));
      },
    );

    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "local") {
        return;
      }

      if (changes[SETTINGS_STORAGE_KEY]) {
        storageRevision += 1;
        applySettings(changes[SETTINGS_STORAGE_KEY].newValue);
        return;
      }

      if (changes[LEGACY_STORAGE_KEY] && !changes[SETTINGS_STORAGE_KEY]) {
        storageRevision += 1;
        applySettings(
          settingsFromStorage({
            [SETTINGS_STORAGE_KEY]: null,
            [LEGACY_STORAGE_KEY]: changes[LEGACY_STORAGE_KEY].newValue,
          }),
        );
      }
    });
  }

  ensurePageControl();
  loadSettings();

  document.addEventListener("click", (event) => {
    const control = document.getElementById(PAGE_CONTROL_ID);

    if (!control || control.contains(event.target)) {
      return;
    }

    const panel = document.getElementById(PAGE_PANEL_ID);
    const button = control.querySelector(".xhec-page-button");

    if (panel && button) {
      panel.hidden = true;
      button.setAttribute("aria-expanded", "false");
    }
  });

  window.addEventListener("resize", schedulePageControlRefresh);
  window.addEventListener("scroll", schedulePageControlRefresh, { capture: true, passive: true });
  window.addEventListener("popstate", scheduleDomRefresh);
  window.navigation?.addEventListener("navigatesuccess", scheduleDomRefresh);

  const observer = new MutationObserver(scheduleDomRefresh);
  observer.observe(document.documentElement, {
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ["data-testid", "aria-label", "role", "href"],
    subtree: true,
  });
})();
