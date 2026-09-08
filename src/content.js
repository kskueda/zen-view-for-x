(() => {
  const {
    SETTINGS_STORAGE_KEY,
    LEGACY_STORAGE_KEY,
    DEFAULT_SETTINGS,
    normalizeSettings,
    settingsFromStorage,
    hasEnabledFeatures,
  } = globalThis.ZenView.settings;
  const filters = globalThis.ZenView.filters;
  const OBSERVER_DEBOUNCE_MS = 80;

  let settings = { ...DEFAULT_SETTINGS };
  let settingsLoaded = false;
  let settingsSaving = false;
  let storageRevision = 0;
  let scanTimer = 0;
  let uiTimer = 0;

  const pageControl = globalThis.ZenView.pageControl.create({
    getState: () => ({ settings, loaded: settingsLoaded, saving: settingsSaving }),
    saveSettings,
  });

  function applySettings(nextSettings) {
    settingsLoaded = true;
    settings = normalizeSettings(nextSettings);

    filters.applySettings(settings);

    schedulePageControlRefresh();
    pageControl.render();

    if (hasEnabledFeatures(settings)) {
      filters.scanTimeline(settings);
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
        pageControl.render();
      }
      pageControl.setButtonTitle(failed ? "Settings could not be saved. Please try again." : "Zen View for X");
    });
  }

  function schedulePageControlRefresh() {
    if (uiTimer) {
      return;
    }
    uiTimer = window.setTimeout(() => {
      uiTimer = 0;
      pageControl.ensure();
    }, OBSERVER_DEBOUNCE_MS);
  }

  function scheduleScan() {
    if (!hasEnabledFeatures(settings)) {
      return;
    }

    // Keep a bounded delay even while live content is continuously changing.
    if (scanTimer) {
      return;
    }
    scanTimer = window.setTimeout(() => {
      scanTimer = 0;
      filters.scanTimeline(settings);
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
          pageControl.setButtonTitle("Settings could not be loaded. Please reload the page.");
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

  pageControl.ensure();
  loadSettings();

  document.addEventListener("click", pageControl.handleDocumentClick);

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
