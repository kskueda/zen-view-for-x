(() => {
  const { hasEnabledFeatures } = globalThis.ZenView.settings;
  const { PAGE_CONTROL_ID } = globalThis.ZenView.pageControl;

  const HTML_CLASS_BY_SETTING = {
    engagementCounts: "xhec-hide-engagement-counts",
    promotedPosts: "xhec-hide-promoted-posts",
    leftNavIconOnly: "xhec-left-nav-icon-only",
  };

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

  function hasEnabledSidebarBoxes(settings) {
    return SIDEBAR_BOX_RULES.some((rule) => settings[rule.settingKey]);
  }

  function shouldHideSidebarShell(settings) {
    return (
      !isChatPage() &&
      SIDEBAR_BOX_RULES.every((rule) => settings[rule.settingKey])
    );
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

  function hideSidebarBoxes(settings) {
    document.documentElement.classList.toggle(
      HIDE_SIDEBAR_SHELL_CLASS,
      shouldHideSidebarShell(settings),
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

  function scanTimeline(settings) {
    if (!hasEnabledFeatures(settings)) {
      return;
    }

    if (settings.promotedPosts) {
      hidePromotedTweets();
    }

    if (hasEnabledSidebarBoxes(settings)) {
      hideSidebarBoxes(settings);
    }

    if (settings.engagementCounts) {
      document.querySelectorAll(`.${HIDDEN_COUNT_CLASS}`).forEach((element) => {
        element.classList.remove(HIDDEN_COUNT_CLASS);
      });
      document.querySelectorAll(ACTION_SELECTOR).forEach(hideVisibleCounts);
    }
  }

  function applySettings(settings) {
    Object.entries(HTML_CLASS_BY_SETTING).forEach(([key, className]) => {
      document.documentElement.classList.toggle(className, settings[key]);
    });
    document.documentElement.classList.toggle(
      HIDE_SIDEBAR_BOXES_CLASS,
      hasEnabledSidebarBoxes(settings),
    );
    hideSidebarBoxes(settings);
  }

  globalThis.ZenView.filters = { applySettings, scanTimeline };
})();
