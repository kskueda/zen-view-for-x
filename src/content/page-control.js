(() => {
  const PAGE_CONTROL_ID = "zen-view-page-control";

  const PAGE_PANEL_ID = "zen-view-page-panel";

  const PAGE_PANEL_GAP = 8;

  const PAGE_PANEL_VIEWPORT_MARGIN = 8;

  const { SETTING_ITEMS } = globalThis.ZenView.settings;
  const navigation = globalThis.ZenView.navigation;
  const { findXLogoLink, findPostButton } = navigation;

  function create({ getState, saveSettings }) {
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
      const compactNav = getState().settings.leftNavIconOnly;
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
      const { settings, loaded: settingsLoaded, saving: settingsSaving } = getState();

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
            ...getState().settings,
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

      navigation.align(getState().settings.leftNavIconOnly);
      positionPageControl(control);
      positionPagePanel(control);
      renderPageControlSettings();
    }

    function handleDocumentClick(event) {
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
    }

    function setButtonTitle(title) {
      const button = document.querySelector(`#${PAGE_CONTROL_ID} .xhec-page-button`);
      if (button) button.title = title;
    }

    return { ensure: ensurePageControl, render: renderPageControlSettings, handleDocumentClick, setButtonTitle };
  }

  globalThis.ZenView.pageControl = { PAGE_CONTROL_ID, create };
})();
