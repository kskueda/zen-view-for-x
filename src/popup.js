(() => {
  const {
    SETTINGS_STORAGE_KEY,
    LEGACY_STORAGE_KEY,
    DEFAULT_SETTINGS,
    SETTING_ITEMS,
    normalizeSettings,
    settingsFromStorage,
  } = globalThis.ZenView.settings;

  function renderSettingRows() {
    const list = document.querySelector(".toggle-list");
    SETTING_ITEMS.forEach(({ key, label: name, detail }) => {
      const label = document.createElement("label");
      label.className = "toggle-row";
      label.htmlFor = `${key}Toggle`;

      const copy = document.createElement("span");
      copy.className = "toggle-copy";
      const title = document.createElement("span");
      title.textContent = name;
      const description = document.createElement("span");
      description.textContent = detail;
      copy.append(title, document.createTextNode("\n"), description);

      const input = document.createElement("input");
      input.id = `${key}Toggle`;
      input.type = "checkbox";
      input.setAttribute("role", "switch");
      input.dataset.settingKey = key;
      label.append(copy, document.createTextNode("\n"), input);
      list.append(label);
    });
  }

  renderSettingRows();

  const toggles = Array.from(document.querySelectorAll("[data-setting-key]"));
  const statusText = document.getElementById("statusText");
  let settings = { ...DEFAULT_SETTINGS };
  let loaded = false;
  let saving = false;
  let storageRevision = 0;

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
