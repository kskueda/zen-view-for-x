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

  function hasEnabledFeatures(settings) {
    return Object.values(settings).some(Boolean);
  }

  // Classic scripts share this namespace within each extension context.
  globalThis.ZenView = {
    settings: {
      SETTINGS_STORAGE_KEY,
      LEGACY_STORAGE_KEY,
      DEFAULT_SETTINGS,
      SETTING_ITEMS,
      normalizeSettings,
      settingsFromStorage,
      hasEnabledFeatures,
    },
  };
})();
