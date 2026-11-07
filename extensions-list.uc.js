/*
 * Extensions List for Zen Browser / Sine
 * Adds actual AddonManager names to unified extension items.
 *
 * The script deliberately does not rebuild or move Firefox/Zen toolbaritems.
 * It decorates the existing items so their built-in click/menu behavior remains intact.
 */
(() => {
  "use strict";

  const MOD_ID = "extensions-list-sine";
  const ITEM_SELECTOR = "toolbaritem.unified-extensions-item";
  const LABEL_CLASS = "extensions-list-native-name";
  const STYLE_MARKER = "extensions-list-runtime-style";

  if (window.__extensionsListSine?.installed) {
    return;
  }

  const state = {
    installed: true,
    observer: null,
    addonManager: null,
    pending: new WeakMap(),
    scheduled: false,
    started: false
  };
  window.__extensionsListSine = state;

  function log(...args) {
    console.info(`[${MOD_ID}]`, ...args);
  }

  function getAddonManager() {
    if (state.addonManager) return state.addonManager;

    try {
      state.addonManager = ChromeUtils.importESModule(
        "resource://gre/modules/AddonManager.sys.mjs"
      ).AddonManager;
    } catch (error) {
      console.error(`[${MOD_ID}] Could not load AddonManager`, error);
    }

    return state.addonManager;
  }

  function getExtensionId(item) {
    return item.getAttribute("extension-id")
      || item.getAttribute("data-extensionid")
      || item.querySelector("[data-extension-id]")?.getAttribute("data-extension-id")
      || "";
  }

  function getFallbackName(item) {
    const action = item.querySelector(".unified-extensions-item-action-button");
    const menu = item.querySelector(".unified-extensions-item-menu-button");

    const direct = [
      item.getAttribute("label"),
      item.getAttribute("tooltiptext"),
      action?.getAttribute("label"),
      action?.getAttribute("tooltiptext")
    ].find(value => value && value.trim());

    if (direct) return direct.trim();

    // Zen/Firefox sometimes stores the localized extension name in data-l10n-args.
    for (const node of [action, menu, item]) {
      const raw = node?.getAttribute("data-l10n-args");
      if (!raw) continue;

      try {
        const args = JSON.parse(raw);
        if (typeof args.extensionName === "string" && args.extensionName.trim()) {
          return args.extensionName.trim();
        }
      } catch (_) {}
    }

    // Last-resort fallback. Avoid showing the generic "Open menu for..." string.
    const aria = menu?.getAttribute("aria-label") || "";
    const match = aria.match(/^open menu for\s+(.+)$/i);
    if (match) return match[1].trim();

    return "";
  }

  function getOrCreateNameLabel(item) {
    let label = item.querySelector(`:scope > .${LABEL_CLASS}`);
    if (label) return label;

    label = document.createXULElement("label");
    label.classList.add(LABEL_CLASS);
    label.setAttribute("crop", "end");
    label.setAttribute(" flex", "1");

    const menuButton = item.querySelector(":scope > .unified-extensions-item-menu-button");
    if (menuButton) {
      item.insertBefore(label, menuButton);
    } else {
      item.appendChild(label);
    }

    return label;
  }

  function setName(item, name) {
    if (!name) return;
    const label = getOrCreateNameLabel(item);

    if (label.value !== name) {
      label.value = name;
      label.setAttribute("value", name);
      label.setAttribute("tooltiptext", name);
    }

    item.setAttribute("data-extensions-list-named", "true");
  }

  async function resolveName(item) {
    const id = getExtensionId(item);

    if (!id) {
      setName(item, getFallbackName(item));
      return;
    }

    const fallback = getFallbackName(item);
    if (fallback) setName(item, fallback);

    if (state.pending.has(item)) return;

    const manager = getAddonManager();
    if (!manager?.getAddonByID) return;

    const request = manager.getAddonByID(id)
      .then(addon => {
        if (!item.isConnected) return;
        const name = addon?.name || fallback;
        if (name) setName(item, name);
      })
      .catch(error => {
        if (fallback && item.isConnected) setName(item, fallback);
        console.warn(`[${MOD_ID}] Could not resolve extension ${id}`, error);
      });

    state.pending.set(item, request);
    await request;
  }

  function decorateItems(root = document) {
    const items = [];

    if (root.matches?.(ITEM_SELECTOR)) items.push(root);
    root.querySelectorAll?.(ITEM_SELECTOR).forEach(item => items.push(item));

    for (const item of items) {
      // Preserve a real, native name label if this item already has one.
      resolveName(item);
    }
  }

  function scheduleRefresh() {
    if (state.scheduled) return;
    state.scheduled = true;

    requestAnimationFrame(() => {
      state.scheduled = false;
      decorateItems();
    });
  }

  function installRuntimeStyle() {
    if (document.getElementById(STYLE_MARKER)) return;

    const style = document.createElement("style");
    style.id = STYLE_MARKER;
    style.textContent = `
      #zen-site-data-addons toolbaritem.unified-extensions-item > .${LABEL_CLASS} {
        display: -moz-box !important;
        -moz-box-flex: 1 !important;
        flex: 1 1 auto !important;
        min-width: 0 !important;
        margin-inline: 8px !important;
        padding: 0 !important;
        overflow: hidden !important;
        color: var(--panel-color, inherit) !important;
        font-size: 12px !important;
        line-height: 1.3 !important;
        white-space: nowrap !important;
        text-overflow: ellipsis !important;
        pointer-events: none !important;
      }
    `;
    (document.documentElement || document.head).appendChild(style);
  }

  function startObserver() {
    if (state.observer || !document.documentElement) return;

    state.observer = new MutationObserver(mutations => {
      // Ignore mutations made only to our own labels to avoid observer churn.
      let relevant = false;

      for (const mutation of mutations) {
        const target = mutation.target;
        if (target?.nodeType === Node.ELEMENT_NODE
            && (target.classList?.contains(LABEL_CLASS)
                || target.closest?.(`.${LABEL_CLASS}`))) {
          continue;
        }

        if (mutation.type === "childList" || mutation.type === "attributes") {
          relevant = true;
          break;
        }
      }

      if (relevant) scheduleRefresh();
    });

    state.observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["extension-id", "label", "tooltiptext", "data-l10n-args"]
    });
  }

  function initialize() {
    if (state.started) return;
    state.started = true;

    installRuntimeStyle();
    decorateItems();
    startObserver();

    // Zen creates the panel lazily and may repopulate it after opening.
    document.addEventListener("popupshown", scheduleRefresh, true);
    document.addEventListener("ViewShown", scheduleRefresh, true);
    window.addEventListener("pageshow", scheduleRefresh, true);

    log("initialized");
  }

  if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", initialize, { once: true });
  } else {
    initialize();
  }
})();
