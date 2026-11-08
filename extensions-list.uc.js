/*
 * Extensions List for Zen Browser / Sine  (v1.3.0)
 *  - icon action bar (AMO + extension settings) + search field
 *  - pin to top of list / hide to the end (collapsible "show all")
 *  - forces the popup width with panel.sizeTo (CSS alone was not enough)
 */
(() => {
  "use strict";

  const MOD_ID = "extensions-list-sine";
  const PREF_PINNED = "extensions.list.sine.pinned";
  const PREF_HIDDEN = "extensions.list.sine.hidden";
  const ITEM_SELECTOR = ".unified-extensions-item";
  const LIST_ID = "zen-site-data-addons";
  const SECTION_ID = "zen-site-data-section-addons";
  const PANEL_ID = "zen-unified-site-data-panel";
  const ACTIONS_ID = "extensions-list-actions";
  const SEARCH_ID = "extensions-list-search";
  const TOGGLE_ID = "extensions-list-hidden-toggle";
  const MENU_ID = "unified-extensions-context-menu";
  const PIN_ITEM_ID = "extensions-list-pin-menuitem";
  const HIDE_ITEM_ID = "extensions-list-hide-menuitem";
  const AMO_URL = "https://addons.mozilla.org/en-GB/firefox/";
  const XHTML = "http://www.w3.org/1999/xhtml";
  const PANEL_WIDTH = 332;

  if (window.__extensionsListSine?.installed) return;
  const state = { installed: true, scheduled: false, addonManager: null, query: "", showHidden: false };
  window.__extensionsListSine = state;

  const log = (...a) => console.info(`[${MOD_ID}]`, ...a);

  /* ---------- i18n (browser language: pl / en) ---------- */
  const isPl = (Services.locale.appLocaleAsBCP47 || "en").toLowerCase().startsWith("pl");
  const T = isPl ? {
    pin: "Przypnij na początek listy",
    unpin: "Odepnij z początku listy",
    hide: "Ukryj na końcu listy",
    unhide: "Przestań ukrywać",
    add: "Dodaj rozszerzenia",
    settings: "Ustawienia rozszerzeń",
    search: "Szukaj rozszerzeń…",
    showAll: n => `Pokaż wszystkie (ukryte: ${n})`,
    collapse: n => `Zwiń ukryte (${n})`
  } : {
    pin: "Pin to top of list",
    unpin: "Unpin from top of list",
    hide: "Hide at end of list",
    unhide: "Stop hiding",
    add: "Add extensions",
    settings: "Extension settings",
    search: "Search extensions…",
    showAll: n => `Show all (${n} hidden)`,
    collapse: n => `Collapse hidden (${n})`
  };

  /* ---------- prefs ---------- */
  function readList(pref) {
    try {
      const v = JSON.parse(Services.prefs.getStringPref(pref, "[]"));
      return Array.isArray(v) ? v : [];
    } catch (_) { return []; }
  }
  const writeList = (pref, list) => Services.prefs.setStringPref(pref, JSON.stringify(list));

  function togglePinned(id) {
    const pinned = readList(PREF_PINNED);
    const i = pinned.indexOf(id);
    if (i >= 0) pinned.splice(i, 1);
    else {
      pinned.unshift(id);
      writeList(PREF_HIDDEN, readList(PREF_HIDDEN).filter(x => x !== id)); // pin => unhide
    }
    writeList(PREF_PINNED, pinned);
    refresh(true);
  }
  function toggleHidden(id) {
    const hidden = readList(PREF_HIDDEN);
    const i = hidden.indexOf(id);
    if (i >= 0) hidden.splice(i, 1);
    else {
      hidden.push(id);
      writeList(PREF_PINNED, readList(PREF_PINNED).filter(x => x !== id)); // hide => unpin
    }
    writeList(PREF_HIDDEN, hidden);
    refresh(true);
  }

  /* ---------- helpers ---------- */
  function getExtensionId(item) {
    return item.getAttribute("extension-id")
      || item.querySelector("[data-extensionid]")?.getAttribute("data-extensionid")
      || "";
  }

  function getName(item) {
    return (item.querySelector(".unified-extensions-item-name")?.textContent
      || item.getAttribute("label") || "").trim();
  }

  function getAddonManager() {
    if (!state.addonManager) {
      try {
        state.addonManager = ChromeUtils.importESModule(
          "resource://gre/modules/AddonManager.sys.mjs"
        ).AddonManager;
      } catch (e) { console.error(`[${MOD_ID}] AddonManager unavailable`, e); }
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

  /* ---------- state -> DOM (pinned / hidden / search) ---------- */
  function applyState(list) {
    const pinned = readList(PREF_PINNED);
    const hidden = readList(PREF_HIDDEN);
    const q = state.query.trim().toLowerCase();
    let matchIdx = 0, hiddenIdx = 0, hiddenCount = 0, lastMatch = null;

    list.toggleAttribute("data-ext-searching", !!q);
    list.toggleAttribute("data-ext-show-hidden", state.showHidden);

    for (const item of document.querySelectorAll(ITEM_SELECTOR)) {
      const id = getExtensionId(item);
      const isPinned = pinned.includes(id);
      const matches = !!q && getName(item).toLowerCase().includes(q);
      const isHidden = hidden.includes(id) && !(q && matches);

      for (let p = item.parentElement; p && p !== list; p = p.parentElement) {
        if (!p.hasAttribute("data-ext-flatten")) p.setAttribute("data-ext-flatten", "");
      }

      let order = 0;
      if (isHidden) { order = 6000 + hiddenIdx++; hiddenCount++; }
      else if (matches) { order = -5000 + matchIdx++; lastMatch = item; }
      else if (isPinned) order = pinned.indexOf(id) - 1000;

      item.toggleAttribute("data-ext-pinned", isPinned && !isHidden);
      item.toggleAttribute("data-ext-hidden", isHidden);
      item.toggleAttribute("data-ext-match", matches);
      item.toggleAttribute("data-ext-last-match", false);
      const o = String(order);
      if (order === 0) item.style.removeProperty("order");
      else if (item.style.order !== o) item.style.order = o;
    }
    lastMatch?.toggleAttribute("data-ext-last-match", true);

    const toggle = document.getElementById(TOGGLE_ID);
    if (toggle) {
      toggle.hidden = hiddenCount === 0 || !!q;
      toggle.setAttribute("label", state.showHidden ? T.collapse(hiddenCount) : T.showAll(hiddenCount));
      toggle.toggleAttribute("data-expanded", state.showHidden);
    }
  }

  /* ---------- header: action buttons + search ---------- */
  function makeButton(id, label, icon, onCommand) {
    const btn = document.createXULElement("toolbarbutton");
    btn.id = id;
    btn.className = "subviewbutton subviewbutton-iconic";
    btn.setAttribute("image", icon);
    btn.setAttribute("tooltiptext", label);
    btn.setAttribute("aria-label", label);
    btn.addEventListener("command", onCommand);
    return btn;
  }

  const getPanel = () => document.getElementById(PANEL_ID);
  const closePanel = () => getPanel()?.hidePopup?.();

  function openAmo() {
    try {
      openTrustedLinkIn(AMO_URL, "tab");
    } catch (_) {
      gBrowser.selectedTab = gBrowser.addTab(AMO_URL, {
        triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal()
      });
    }
    closePanel();
  }

  function ensureHeader() {
    const list = document.getElementById(LIST_ID);
    if (!list || !document.getElementById(SECTION_ID) || document.getElementById(ACTIONS_ID)) return;

    const bar = document.createXULElement("hbox");
    bar.id = ACTIONS_ID;
    bar.append(
      makeButton("extensions-list-add", T.add, "chrome://global/skin/icons/plus.svg", openAmo),
      makeButton("extensions-list-manage", T.settings, "chrome://global/skin/icons/settings.svg",
        () => { BrowserAddonUI.openAddonsMgr("addons://list/extension"); closePanel(); })
    );

    const search = document.createElementNS(XHTML, "input");
    search.id = SEARCH_ID;
    search.type = "search";
    search.placeholder = T.search;
    search.setAttribute("aria-label", T.search);
    search.autocomplete = "off";
    search.spellcheck = false;
    search.addEventListener("input", () => {
      state.query = search.value;
      refresh(true);
    });
    search.addEventListener("keydown", e => {
      if (e.key === "Escape" && search.value) {
        e.stopPropagation();
        e.preventDefault();
        search.value = "";
        state.query = "";
        refresh(true);
      } else if (e.key !== "Escape") {
        e.stopPropagation();
      }
    });

    const toggle = document.createXULElement("toolbarbutton");
    toggle.id = TOGGLE_ID;
    toggle.className = "subviewbutton";
    toggle.hidden = true;
    toggle.addEventListener("command", () => {
      state.showHidden = !state.showHidden;
      refresh(true);
    });

    list.before(bar, search);
    list.append(toggle);
  }

  /* ---------- popup size (CSS alone doesn't resize the native popup) ---------- */
  const fit = { viewH: null, popupH: null };
  function fitPanel(reset) {
    const panel = getPanel();
    const view = panel?.querySelector("panelview#unified-extensions-view");
    if (!panel || !view || panel.state === "closed") return;
    const pr = panel.getBoundingClientRect();
    const vr = view.getBoundingClientRect();
    if (!pr.width || !vr.width) return;

    const mx = Math.max(0, vr.left - pr.left);
    const w = Math.max(PANEL_WIDTH, Math.round(vr.width + mx * 2));
    let h = Math.round(pr.height);
    if (!reset && fit.viewH != null) h = Math.round(fit.popupH + (vr.height - fit.viewH));

    if (Math.abs(w - pr.width) > 1 || Math.abs(h - pr.height) > 1) {
      try { panel.sizeTo(w, h); } catch (e) { console.warn(`[${MOD_ID}] sizeTo failed`, e); }
    }
    fit.viewH = vr.height;
    fit.popupH = h;
  }
  const fitSoon = reset => requestAnimationFrame(() => requestAnimationFrame(() => fitPanel(reset)));

  /* ---------- context menu entries ---------- */
  function ensureMenuItem(menu, id, handler) {
    let entry = document.getElementById(id);
    if (!entry) {
      entry = document.createXULElement("menuitem");
      entry.id = id;
      entry.addEventListener("command", () => {
        const extId = entry.getAttribute("data-ext-id");
        if (extId) handler(extId);
      });
    }
    return entry;
  }

  function onPopupShowing(event) {
    const menu = event.target;
    if (menu?.id !== MENU_ID) return;

    const pin = ensureMenuItem(menu, PIN_ITEM_ID, togglePinned);
    const hide = ensureMenuItem(menu, HIDE_ITEM_ID, toggleHidden);
    if (pin.parentNode !== menu) menu.prepend(pin);
    if (hide.parentNode !== menu) pin.after(hide);

    const item = menu.triggerNode?.closest?.(ITEM_SELECTOR);
    const id = menu.dataset?.extensionId || (item ? getExtensionId(item) : "");

    for (const e of [pin, hide]) {
      e.hidden = !id;
      if (id) e.setAttribute("data-ext-id", id);
    }
    if (!id) return;
    pin.setAttribute("label", readList(PREF_PINNED).includes(id) ? T.unpin : T.pin);
    hide.setAttribute("label", readList(PREF_HIDDEN).includes(id) ? T.unhide : T.hide);
  }

  /* ---------- refresh loop ---------- */
  function refresh(resize) {
    state.scheduled = false;
    document.querySelectorAll(ITEM_SELECTOR).forEach(ensureName);
    const list = document.getElementById(LIST_ID);
    if (list) {
      ensureHeader();
      applyState(list);
    }
    if (resize === true) fitSoon(false);
  }
  function schedule() {
    if (state.scheduled) return;
    state.scheduled = true;
    requestAnimationFrame(() => refresh(false));
  }

  function onPopupShown(event) {
    if (event.target?.id === PANEL_ID) {
      schedule();
      fitSoon(true);
    }
  }
  function onPopupHidden(event) {
    if (event.target?.id !== PANEL_ID) return;
    const search = document.getElementById(SEARCH_ID);
    if (search) search.value = "";
    state.query = "";
    state.showHidden = false;
    fit.viewH = fit.popupH = null;
    refresh(false);
  }

  function init() {
    refresh(false);
    new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
    document.addEventListener("popupshowing", onPopupShowing, true);
    document.addEventListener("popupshown", onPopupShown, true);
    document.addEventListener("popuphidden", onPopupHidden, true);
    document.addEventListener("ViewShown", schedule, true);
    log("initialized");
  }

  if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
