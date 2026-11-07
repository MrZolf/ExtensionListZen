/*
 * Extensions List for Zen Browser / Sine  (v1.1.0)
 *  - fallback names from AddonManager
 *  - action bar: moved "+" button + "extension settings" button
 *  - "Pin to top of list" entry in the extension 3-dots menu
 */
(() => {
  "use strict";

  const MOD_ID = "extensions-list-sine";
  const PREF = "extensions.list.sine.pinned";
  const ITEM_SELECTOR = ".unified-extensions-item";
  const LIST_ID = "zen-site-data-addons";
  const SECTION_ID = "zen-site-data-section-addons";
  const ACTIONS_ID = "extensions-list-actions";
  const MENU_ID = "unified-extensions-context-menu";
  const PIN_ITEM_ID = "extensions-list-pin-menuitem";

  if (window.__extensionsListSine?.installed) return;
  const state = { installed: true, scheduled: false, addonManager: null };
  window.__extensionsListSine = state;

  const log = (...a) => console.info(`[${MOD_ID}]`, ...a);

  /* ---------- pinned storage ---------- */
  function getPinned() {
    try {
      const v = JSON.parse(Services.prefs.getStringPref(PREF, "[]"));
      return Array.isArray(v) ? v : [];
    } catch (_) {
      return [];
    }
  }
  function setPinned(list) {
    Services.prefs.setStringPref(PREF, JSON.stringify(list));
  }
  function togglePinned(id) {
    const list = getPinned();
    const i = list.indexOf(id);
    if (i >= 0) list.splice(i, 1);
    else list.unshift(id); // newest pin goes first
    setPinned(list);
    refresh();
  }

  /* ---------- helpers ---------- */
  function getExtensionId(item) {
    return item.getAttribute("extension-id")
      || item.querySelector("[data-extensionid]")?.getAttribute("data-extensionid")
      || "";
  }

  function getAddonManager() {
    if (!state.addonManager) {
      try {
        state.addonManager = ChromeUtils.importESModule(
          "resource://gre/modules/AddonManager.sys.mjs"
        ).AddonManager;
      } catch (e) {
        console.error(`[${MOD_ID}] AddonManager unavailable`, e);
      }
    }
    return state.addonManager;
  }

  async function ensureName(item) {
    let nameEl = item.querySelector(".unified-extensions-item-name");
    if (nameEl?.textContent.trim()) return;
    const id = getExtensionId(item);
    if (!id) return;

    if (!nameEl) {
      const button = item.querySelector(".unified-extensions-item-action-button");
      if (!button) return;
      let contents = item.querySelector(".unified-extensions-item-contents");
      if (!contents) {
        contents = document.createXULElement("vbox");
        contents.className = "unified-extensions-item-contents";
        button.appendChild(contents);
      }
      nameEl = document.createXULElement("label");
      nameEl.className = "unified-extensions-item-name";
      contents.prepend(nameEl);
    }
    try {
      const addon = await getAddonManager()?.getAddonByID(id);
      if (addon?.name && item.isConnected) nameEl.textContent = addon.name;
    } catch (_) {}
  }

  /* ---------- pinning in the list ---------- */
  function applyPins(list) {
    const pinned = getPinned();
    for (const item of document.querySelectorAll(ITEM_SELECTOR)) {
      const id = getExtensionId(item);
      const idx = pinned.indexOf(id);

      // Flatten every wrapper between the item and the list so `order` works.
      for (let p = item.parentElement; p && p !== list; p = p.parentElement) {
        if (!p.hasAttribute("data-ext-flatten")) p.setAttribute("data-ext-flatten", "");
      }

      if (idx >= 0) {
        if (!item.hasAttribute("data-ext-pinned")) item.setAttribute("data-ext-pinned", "");
        const order = String(idx - 1000);
        if (item.style.order !== order) item.style.order = order;
      } else {
        if (item.hasAttribute("data-ext-pinned")) item.removeAttribute("data-ext-pinned");
        if (item.style.order) item.style.removeProperty("order");
      }
    }
  }

  /* ---------- action bar ---------- */
  function makeButton(id, label, icon, onCommand) {
    const btn = document.createXULElement("toolbarbutton");
    btn.id = id;
    btn.className = "subviewbutton subviewbutton-iconic";
    btn.setAttribute("image", icon);
    btn.setAttribute("data-ext-label", label);
    btn.setAttribute("tooltiptext", label);
    btn.setAttribute("aria-label", label);
    btn.addEventListener("command", onCommand);
    return btn;
  }

  function closePanel() {
    document.getElementById("zen-unified-site-data-panel")?.hidePopup?.();
  }

  function findAddButton(section) {
    const candidates = [...section.querySelectorAll(
      "toolbarbutton, button, .subviewbutton, [role='button']"
    )].filter(el =>
      !el.closest(ITEM_SELECTOR)
      && !el.closest(`#${ACTIONS_ID}`)
      && el.id !== "zen-site-data-manage-addons"
      && !el.closest(".zen-site-data-section-header")
    );
    return candidates.at(-1) || null;
  }

  function ensureActions() {
    const section = document.getElementById(SECTION_ID);
    const list = document.getElementById(LIST_ID);
    if (!section || !list || document.getElementById(ACTIONS_ID)) return;

    const bar = document.createElement("hbox");
    bar.id = ACTIONS_ID;

    let add = findAddButton(section);
    if (add) {
      log("moving existing add button", add);
      add.setAttribute("data-ext-label", "Dodaj");
      add.setAttribute("tooltiptext", "Dodaj rozszerzenie");
      if (!add.getAttribute("image") && !add.querySelector(".toolbarbutton-icon")) {
        add.setAttribute("image", "chrome://global/skin/icons/plus.svg");
      }
    } else {
      log("add button not found - using fallback");
      add = makeButton(
        "extensions-list-add-fallback", "Dodaj", "chrome://global/skin/icons/plus.svg",
        () => { BrowserAddonUI.openAddonsMgr("addons://discover/"); closePanel(); }
      );
      add.setAttribute("tooltiptext", "Dodaj rozszerzenie");
    }

    const manage = makeButton(
      "extensions-list-manage", "Ustawienia", "chrome://global/skin/icons/settings.svg",
      () => { BrowserAddonUI.openAddonsMgr("addons://list/extension"); closePanel(); }
    );
    manage.setAttribute("tooltiptext", "Ustawienia rozszerzeń");

    bar.append(add, manage);
    list.before(bar);
  }

  /* ---------- context menu: pin entry ---------- */
  function onPopupShowing(event) {
    const menu = event.target;
    if (menu?.id !== MENU_ID) return;

    let entry = document.getElementById(PIN_ITEM_ID);
    if (!entry) {
      entry = document.createXULElement("menuitem");
      entry.id = PIN_ITEM_ID;
      entry.addEventListener("command", () => {
        const id = entry.getAttribute("data-ext-id");
        if (id) togglePinned(id);
      });
      menu.prepend(entry);
    }

    const item = menu.triggerNode?.closest?.(ITEM_SELECTOR);
    const id = menu.dataset?.extensionId || (item ? getExtensionId(item) : "");

    if (!id) {
      entry.hidden = true;
      return;
    }
    entry.hidden = false;
    entry.setAttribute("data-ext-id", id);
    entry.setAttribute(
      "label",
      getPinned().includes(id) ? "Odepnij z początku listy" : "Przypnij na początek listy"
    );
  }

  /* ---------- refresh loop ---------- */
  function refresh() {
    state.scheduled = false;
    const list = document.getElementById(LIST_ID);
    document.querySelectorAll(ITEM_SELECTOR).forEach(ensureName);
    if (list) {
      ensureActions();
      applyPins(list);
    }
  }
  function schedule() {
    if (state.scheduled) return;
    state.scheduled = true;
    requestAnimationFrame(refresh);
  }

  function init() {
    refresh();
    // childList only: our own attribute/style changes must not retrigger us.
    new MutationObserver(schedule).observe(document.documentElement, {
      childList: true,
      subtree: true
    });
    document.addEventListener("popupshowing", onPopupShowing, true);
    document.addEventListener("popupshown", schedule, true);
    document.addEventListener("ViewShown", schedule, true);
    log("initialized");
  }

  if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
