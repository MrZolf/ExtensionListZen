/*
 * Extensions List for Zen Browser / Sine
 * Fallback only: makes sure every item has a non-empty native
 * .unified-extensions-item-name (filled from AddonManager if needed).
 * Layout is done entirely in userChrome.css.
 */
(() => {
  "use strict";

  const MOD_ID = "extensions-list-sine";
  const ITEM_SELECTOR = ".unified-extensions-item";

  if (window.__extensionsListSine?.installed) return;
  const state = { installed: true, observer: null, scheduled: false, addonManager: null };
  window.__extensionsListSine = state;

  function getAddonManager() {
    if (state.addonManager) return state.addonManager;
    try {
      state.addonManager = ChromeUtils.importESModule(
        "resource://gre/modules/AddonManager.sys.mjs"
      ).AddonManager;
    } catch (e) {
      console.error(`[${MOD_ID}] Could not load AddonManager`, e);
    }
    return state.addonManager;
  }

  function getExtensionId(item) {
    return item.getAttribute("extension-id")
      || item.querySelector("[data-extensionid]")?.getAttribute("data-extensionid")
      || "";
  }

  function getOrCreateName(item) {
    let name = item.querySelector(".unified-extensions-item-name");
    if (name) return name;

    const button = item.querySelector(".unified-extensions-item-action-button");
    if (!button) return null;

    let contents = item.querySelector(".unified-extensions-item-contents");
    if (!contents) {
      contents = document.createXULElement("vbox");
      contents.className = "unified-extensions-item-contents";
      button.appendChild(contents);
    }
    name = document.createXULElement("label");
    name.className = "unified-extensions-item-name";
    contents.prepend(name);
    return name;
  }

  async function decorate(item) {
    const nameEl = getOrCreateName(item);
    if (!nameEl || nameEl.textContent.trim()) return; // native name present

    const id = getExtensionId(item);
    if (!id) return;
    try {
      const addon = await getAddonManager()?.getAddonByID(id);
      if (addon?.name && item.isConnected) nameEl.textContent = addon.name;
    } catch (e) {
      console.warn(`[${MOD_ID}] Could not resolve ${id}`, e);
    }
  }

  function refresh() {
    state.scheduled = false;
    document.querySelectorAll(ITEM_SELECTOR).forEach(decorate);
  }

  function schedule() {
    if (state.scheduled) return;
    state.scheduled = true;
    requestAnimationFrame(refresh);
  }

  function init() {
    refresh();
    state.observer = new MutationObserver(schedule);
    state.observer.observe(document.documentElement, { childList: true, subtree: true });
    document.addEventListener("popupshown", schedule, true);
    document.addEventListener("ViewShown", schedule, true);
    console.info(`[${MOD_ID}] initialized`);
  }

  if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
