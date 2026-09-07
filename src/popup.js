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

  const toggles = Array.from(document.querySelectorAll("[data-setting-key]"));
  const statusText = document.getElementById("statusText");
  let settings = { ...DEFAULT_SETTINGS };
  let loaded = false;
  let saving = false;
  let storageRevision = 0;

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

  function updateStatusText() {
    const shownCount = Object.values(settings).filter((isHidden) => !isHidden).length;
    const totalCount = Object.keys(DEFAULT_SETTINGS).length;
    statusText.textContent =
      shownCount === 0
        ? "すべてミニマル"
        : shownCount === totalCount
          ? "すべて表示"
          : `${shownCount}項目表示`;
  }

  function renderSettings() {
    toggles.forEach((toggle) => {
      toggle.checked = !settings[toggle.dataset.settingKey];
      toggle.disabled = !loaded || saving;
    });

    updateStatusText();
  }

  function saveSettings(previousSettings) {
    const revisionBeforeSave = storageRevision;
    saving = true;
    renderSettings();
    chrome.storage.local.set({ [SETTINGS_STORAGE_KEY]: settings }, () => {
      const failed = Boolean(chrome.runtime?.lastError);
      saving = false;
      if (failed && storageRevision === revisionBeforeSave) {
        settings = previousSettings;
      }
      renderSettings();
      if (failed) {
        statusText.textContent = "保存できませんでした。もう一度お試しください。";
      }
    });
  }

  toggles.forEach((toggle) => { toggle.disabled = true; });
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local" || !changes[SETTINGS_STORAGE_KEY]) {
      return;
    }
    storageRevision += 1;
    settings = normalizeSettings(changes[SETTINGS_STORAGE_KEY].newValue);
    loaded = true;
    renderSettings();
  });
  chrome.storage.local.get(
    { [SETTINGS_STORAGE_KEY]: null, [LEGACY_STORAGE_KEY]: null },
    (items) => {
      const failed = Boolean(chrome.runtime?.lastError);
      if (storageRevision > 0) {
        return;
      }
      if (failed) {
        statusText.textContent = "設定を読み込めませんでした。開き直してください。";
        return;
      }
      settings = settingsFromStorage(items);
      loaded = true;
      renderSettings();
    },
  );

  toggles.forEach((toggle) => {
    toggle.addEventListener("change", () => {
      if (!loaded || saving) {
        return;
      }
      const previousSettings = settings;
      settings = {
        ...settings,
        [toggle.dataset.settingKey]: !toggle.checked,
      };
      saveSettings(previousSettings);
    });
  });
})();
