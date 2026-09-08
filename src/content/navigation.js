(() => {
  const alignmentStyles = new WeakMap();

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
    const savedStyles = alignmentStyles.get(element);
    if (!savedStyles) {
      return;
    }

    // Restore only our overrides; keep any newer styles written by the page.
    savedStyles.forEach(({ property, value, priority, appliedValue, appliedPriority }) => {
      if (
        element.style.getPropertyValue(property) === appliedValue &&
        element.style.getPropertyPriority(property) === appliedPriority
      ) {
        if (value) {
          element.style.setProperty(property, value, priority);
        } else {
          element.style.removeProperty(property);
        }
      }
    });
    alignmentStyles.delete(element);
  }

  function alignElementToNavigationCenter(element, compactNav) {
    resetElementAlignment(element);

    if (!compactNav) {
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

    const computedStyle = getComputedStyle(element);
    const originalTransform = computedStyle.transform === "none" ? "" : computedStyle.transform;
    const overrides = {
      position: computedStyle.position === "static" ? "relative" : computedStyle.position,
      transform: `translateX(${offset}px) ${originalTransform}`.trim(),
      "z-index": computedStyle.zIndex === "auto" ? "1" : computedStyle.zIndex,
    };
    alignmentStyles.set(element, Object.entries(overrides).map(([property, override]) => {
      const value = element.style.getPropertyValue(property);
      const priority = element.style.getPropertyPriority(property);
      element.style.setProperty(property, override, priority);
      return {
        property,
        value,
        priority,
        appliedValue: element.style.getPropertyValue(property),
        appliedPriority: element.style.getPropertyPriority(property),
      };
    }));
  }

  function alignCompactXLogo(compactNav) {
    const logoLink = findXLogoLink();

    if (!logoLink) {
      return;
    }

    alignElementToNavigationCenter(logoLink, compactNav);
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

  function alignCompactPostButton(compactNav) {
    const postButton = findPostButton();

    if (!postButton) {
      return;
    }

    alignElementToNavigationCenter(postButton, compactNav);
  }

  function align(compactNav) {
    alignCompactXLogo(compactNav);
    alignCompactPostButton(compactNav);
  }

  globalThis.ZenView.navigation = { findXLogoLink, findPostButton, align };
})();
