/*
 * Extensions List for Zen Browser / Sine  (v1.7.0)
 *  - icon action bar (AMO, extension settings, sort) + search
 *  - pin to top / hide at end (collapsible), sorted as three separate lists
 *  - sorting: name, install date, usage (click counter)
 *  - drag handle for a custom order (replaces Move Up / Move Down)
 *  - tidy context menu (separators never doubled)
 */
(() => {
  "use strict";

  const MOD_ID = "extensions-list-sine";
  const PREF_PINNED = "extensions.list.sine.pinned";
  const PREF_HIDDEN = "extensions.list.sine.hidden";
  const PREF_SORT = "extensions.list.sine.sort";
  const PREF_USAGE = "extensions.list.sine.usage";
  const PREF_ORDER = "extensions.list.sine.order";
  const ITEM_SELECTOR = ".unified-extensions-item";
  const LIST_ID = "zen-site-data-addons";
  const SECTION_ID = "zen-site-data-section-addons";
  const PANEL_ID = "zen-unified-site-data-panel";
  const ACTIONS_ID = "extensions-list-actions";
  const SEARCH_ID = "extensions-list-search";
  const SORT_BTN_ID = "extensions-list-sort";
  const SORT_MENU_ID = "extensions-list-sort-menu";
  const TOGGLE_ID = "extensions-list-hidden-toggle";
  const MENU_ID = "unified-extensions-context-menu";
  const PIN_ITEM_ID = "extensions-list-pin-menuitem";
  const HIDE_ITEM_ID = "extensions-list-hide-menuitem";
  const SEP_ID = "extensions-list-sep-top";
  const AMO_URL = "https://addons.mozilla.org/en-GB/firefox/";
  const ADD_MENU_ID = "extensions-list-add-menu";
  // Mod settings (preferences.json -> Sine settings UI)
  const PREF_ALT_ENABLED = "mod.extensions-list.show_alt_stores";
  const PREF_ALT_STORES = "mod.extensions-list.alt_stores";
  const DEFAULT_STORES = "Zen Mods|https://zen-browser.app/mods/; Sine Mods|about:preferences#sineMods";
  const XHTML = "http://www.w3.org/1999/xhtml";
  const PANEL_WIDTH = 332;
  const SORT_MODES = ["custom", "name-asc", "name-desc", "date-new", "date-old", "usage-most", "usage-recent"];

  if (window.__extensionsListSine?.installed) return;
  const state = {
    installed: true, scheduled: false, addonManager: null,
    query: "", showHidden: false, meta: new Map(), drag: null
  };
  window.__extensionsListSine = state;

  const log = (...a) => console.info(`[${MOD_ID}]`, ...a);

  /* ---------- i18n (browser language: pl / en) ---------- */
  const isPl = (Services.locale.appLocaleAsBCP47 || "en").toLowerCase().startsWith("pl");
  const T = isPl ? {
    pin: "Przypnij na górze",
    unpin: "Odepnij z góry",
    hide: "Ukryj",
    unhide: "Odkryj",
    add: "Dodaj rozszerzenia",
    addAmo: "Dodatki do Firefoksa",
    settings: "Ustawienia rozszerzeń",
    sort: "Sortuj",
    search: "Szukaj zainstalowanych rozszerzeń…",
    showAll: n => `Pokaż wszystkie (ukryte: ${n})`,
    collapse: n => `Zwiń ukryte (${n})`,
    modes: {
      "custom": "Własna kolejność",
      "name-asc": "Nazwa A–Z",
      "name-desc": "Nazwa Z–A",
      "date-new": "Data dodania: najnowsze",
      "date-old": "Data dodania: najstarsze",
      "usage-most": "Najczęściej używane",
      "usage-recent": "Ostatnio używane"
    }
  } : {
    pin: "Pin to Top",
    unpin: "Unpin from Top",
    hide: "Hide",
    unhide: "Unhide",
    add: "Add extensions",
    addAmo: "Firefox Add-ons",
    settings: "Extension settings",
    sort: "Sort",
    search: "Search installed extensions…",
    showAll: n => `Show all (${n} hidden)`,
    collapse: n => `Collapse hidden (${n})`,
    modes: {
      "custom": "Custom order",
      "name-asc": "Name A–Z",
      "name-desc": "Name Z–A",
      "date-new": "Date added: newest",
      "date-old": "Date added: oldest",
      "usage-most": "Most used",
      "usage-recent": "Recently used"
    }
  };

  /* ---------- prefs ---------- */
  function readJson(pref, fallback) {
    try {
      const v = JSON.parse(Services.prefs.getStringPref(pref, ""));
      return v && typeof v === "object" ? v : fallback;
    } catch (_) { return fallback; }
  }
  const readList = pref => { const v = readJson(pref, []); return Array.isArray(v) ? v : []; };
  const writeJson = (pref, v) => Services.prefs.setStringPref(pref, JSON.stringify(v));
  const getSortMode = () => {
    const m = Services.prefs.getStringPref(PREF_SORT, "custom");
    return SORT_MODES.includes(m) ? m : "custom";
  };
  const setSortMode = m => Services.prefs.setStringPref(PREF_SORT, m);

  function togglePinned(id) {
    const pinned = readList(PREF_PINNED);
    const i = pinned.indexOf(id);
    if (i >= 0) pinned.splice(i, 1);
    else {
      pinned.unshift(id);
      writeJson(PREF_HIDDEN, readList(PREF_HIDDEN).filter(x => x !== id));
    }
    writeJson(PREF_PINNED, pinned);
    refresh(true);
  }
  function toggleHidden(id) {
    const hidden = readList(PREF_HIDDEN);
    const i = hidden.indexOf(id);
    if (i >= 0) hidden.splice(i, 1);
    else {
      hidden.push(id);
      writeJson(PREF_PINNED, readList(PREF_PINNED).filter(x => x !== id));
    }
    writeJson(PREF_HIDDEN, hidden);
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

  async function loadAddonMeta() {
    try {
      const addons = await getAddonManager()?.getAddonsByTypes(["extension"]);
      for (const a of addons || []) {
        state.meta.set(a.id, { installDate: a.installDate?.getTime?.() || 0 });
      }
      schedule();
    } catch (e) { console.warn(`[${MOD_ID}] meta load failed`, e); }
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

  /* ---------- usage counter (clicks on extension buttons in this panel) ---------- */
  function recordUsage(id) {
    if (!id) return;
    const usage = readJson(PREF_USAGE, {});
    const u = usage[id] || { n: 0, last: 0 };
    u.n += 1;
    u.last = Date.now();
    usage[id] = u;
    writeJson(PREF_USAGE, usage);
  }

  /* ---------- sorting ---------- */
  function makeComparator(mode, usage) {
    const byName = (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true });
    const date = e => state.meta.get(e.id)?.installDate || 0;
    const n = e => usage[e.id]?.n || 0;
    const last = e => usage[e.id]?.last || 0;
    switch (mode) {
      case "name-asc": return byName;
      case "name-desc": return (a, b) => -byName(a, b);
      case "date-new": return (a, b) => date(b) - date(a) || byName(a, b);
      case "date-old": return (a, b) => date(a) - date(b) || byName(a, b);
      case "usage-most": return (a, b) => n(b) - n(a) || byName(a, b);
      case "usage-recent": return (a, b) => last(b) - last(a) || byName(a, b);
      default: return null;
    }
  }

  /* ---------- state -> DOM (pinned / hidden / search / sort) ---------- */
  function applyState(list) {
    const pinned = readList(PREF_PINNED);
    const hidden = readList(PREF_HIDDEN);
    const q = state.query.trim().toLowerCase();
    const mode = getSortMode();
    const cmp = makeComparator(mode, readJson(PREF_USAGE, {}));

    list.toggleAttribute("data-ext-searching", !!q);
    list.toggleAttribute("data-ext-show-hidden", state.showHidden);
    list.toggleAttribute("data-ext-sorted", mode !== "custom");

    const groups = { match: [], pinned: [], normal: [], hidden: [] };
    list.querySelectorAll(ITEM_SELECTOR).forEach((item, dom) => {
      const id = getExtensionId(item);
      const name = getName(item);
      const matches = !!q && name.toLowerCase().includes(q);
      const isPinned = pinned.includes(id);
      const isHidden = hidden.includes(id) && !(q && matches);
      const e = { item, id, name, dom, isPinned, matches, isHidden, pinIdx: pinned.indexOf(id) };

      for (let p = item.parentElement; p && p !== list; p = p.parentElement) {
        if (!p.hasAttribute("data-ext-flatten")) p.setAttribute("data-ext-flatten", "");
      }
      groups[isHidden ? "hidden" : matches ? "match" : isPinned ? "pinned" : "normal"].push(e);
    });

    const order = readList(PREF_ORDER);
    const rank = id => { const i = order.indexOf(id); return i < 0 ? Infinity : i; };
    const customCmp = (a, b) => {
      if (a.isPinned && b.isPinned) return a.pinIdx - b.pinIdx;
      const ra = rank(a.id), rb = rank(b.id);
      if (ra !== rb) return ra === Infinity ? 1 : rb === Infinity ? -1 : ra - rb;
      return a.dom - b.dom;
    };
    for (const g of Object.values(groups)) g.sort(cmp ? (a, b) => cmp(a, b) || a.dom - b.dom : customCmp);

    const setOrder = (e, order) => {
      e.item.toggleAttribute("data-ext-pinned", e.isPinned && !e.isHidden);
      e.item.toggleAttribute("data-ext-hidden", e.isHidden);
      e.item.toggleAttribute("data-ext-match", e.matches);
      e.item.toggleAttribute("data-ext-last-match", false);
      if (order === null) e.item.style.removeProperty("order");
      else if (e.item.style.order !== String(order)) e.item.style.order = String(order);
    };
    groups.match.forEach((e, i) => setOrder(e, -5000 + i));
    groups.pinned.forEach((e, i) => setOrder(e, -1000 + i));
    groups.normal.forEach((e, i) => setOrder(e, i));
    groups.hidden.forEach((e, i) => setOrder(e, 6000 + i));
    groups.match.at(-1)?.item.toggleAttribute("data-ext-last-match", true);

    const toggle = document.getElementById(TOGGLE_ID);
    if (toggle) {
      const count = groups.hidden.length;
      toggle.hidden = count === 0 || !!q;
      const tip = state.showHidden ? T.collapse(count) : T.showAll(count);
      toggle.setAttribute("tooltiptext", tip);
      toggle.setAttribute("aria-label", tip);
      toggle.toggleAttribute("data-expanded", state.showHidden);
    }
  }

  /* ---------- header: action buttons, sort menu, search ---------- */
  function makeButton(id, label, icon, onCommand) {
    const btn = document.createXULElement("toolbarbutton");
    btn.id = id;
    btn.className = "subviewbutton subviewbutton-iconic";
    if (icon) btn.setAttribute("image", icon);
    btn.setAttribute("tooltiptext", label);
    btn.setAttribute("aria-label", label);
    btn.addEventListener("command", () => onCommand(btn));
    return btn;
  }

  const getPanel = () => document.getElementById(PANEL_ID);
  const closePanel = () => getPanel()?.hidePopup?.();

  function openUrl(url) {
    try {
      openTrustedLinkIn(url, "tab");
    } catch (_) {
      gBrowser.selectedTab = gBrowser.addTab(url, {
        triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal()
      });
    }
    closePanel();
  }

  function getAltStores() {
    try {
      if (!Services.prefs.getBoolPref(PREF_ALT_ENABLED, false)) return [];
      const raw = Services.prefs.getStringPref(PREF_ALT_STORES, DEFAULT_STORES);
      return raw.split(/[;\n]+/).map(s => s.trim()).filter(Boolean).map(s => {
        const i = s.indexOf("|");
        const name = i > 0 ? s.slice(0, i).trim() : "";
        const url = (i > 0 ? s.slice(i + 1) : s).trim();
        return { name: name || url, url };
      }).filter(s => /^(https?:\/\/|about:)/i.test(s.url));
    } catch (_) { return []; }
  }

  /* A popup that closes when its button is pressed again. */
  function prepareToggleMenu(popup) {
    popup.setAttribute("consumeoutsideclicks", "true");
    popup.addEventListener("popuphidden", () => { popup._hiddenAt = performance.now(); });
  }
  function toggleMenu(popup, anchor) {
    if (popup.state === "open" || popup.state === "showing") { popup.hidePopup(); return; }
    if (performance.now() - (popup._hiddenAt || 0) < 300) return; // this very click just closed it
    popup.openPopup(anchor, "after_start");
  }

  function onAddClick(btn) {
    const stores = getAltStores();
    if (!stores.length) { openUrl(AMO_URL); return; }

    let popup = document.getElementById(ADD_MENU_ID);
    if (!popup) {
      popup = document.createXULElement("menupopup");
      popup.id = ADD_MENU_ID;
      prepareToggleMenu(popup);
      (document.getElementById("mainPopupSet") || document.documentElement).append(popup);
    }
    if (popup.state === "open" || popup.state === "showing") { popup.hidePopup(); return; }
    if (performance.now() - (popup._hiddenAt || 0) < 300) return;

    popup.replaceChildren();
    const add = (label, url) => {
      const mi = document.createXULElement("menuitem");
      mi.setAttribute("label", label);
      mi.setAttribute("tooltiptext", url);
      mi.addEventListener("command", () => openUrl(url));
      popup.append(mi);
    };
    add(T.addAmo, AMO_URL);
    popup.append(document.createXULElement("menuseparator"));
    for (const s of stores) add(s.name, s.url);
    popup.openPopup(btn, "after_start");
  }

  function buildSortMenu() {
    let popup = document.getElementById(SORT_MENU_ID);
    if (popup) return popup;
    popup = document.createXULElement("menupopup");
    popup.id = SORT_MENU_ID;
    prepareToggleMenu(popup);
    for (const mode of SORT_MODES) {
      const mi = document.createXULElement("menuitem");
      mi.setAttribute("type", "radio");
      mi.setAttribute("name", "extlistsort");
      mi.setAttribute("label", T.modes[mode]);
      mi.dataset.mode = mode;
      mi.addEventListener("command", () => requestSort(mode));
      popup.append(mi);
      if (mode === "custom") popup.append(document.createXULElement("menuseparator"));
    }
    popup.addEventListener("popupshowing", () => {
      const cur = getSortMode();
      for (const mi of popup.querySelectorAll("menuitem")) {
        if (mi.dataset.mode === cur) mi.setAttribute("checked", "true");
        else mi.removeAttribute("checked");
      }
    });
    (document.getElementById("mainPopupSet") || document.documentElement).append(popup);
    return popup;
  }

  function requestSort(mode) {
    if (mode === getSortMode()) return;
    setSortMode(mode);
    refresh(true);
  }

  /* ---------- drag handle (custom order only) ---------- */
  const groupOf = item =>
    item.hasAttribute("data-ext-hidden") ? "hidden" : item.hasAttribute("data-ext-pinned") ? "pinned" : "normal";

  function groupItems(list, group) {
    return [...list.querySelectorAll(ITEM_SELECTOR)]
      .filter(i => groupOf(i) === group && i.getBoundingClientRect().height > 0)
      .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
  }

  function ensureHandles(list) {
    for (const item of list.querySelectorAll(ITEM_SELECTOR)) {
      if (item.querySelector(".ext-drag-handle")) continue;
      const row = item.querySelector(".unified-extensions-item-row-wrapper");
      const menuBtn = row?.querySelector(".unified-extensions-item-menu-button");
      if (!row) continue;
      const handle = document.createElementNS(XHTML, "div");
      handle.className = "ext-drag-handle";
      row.insertBefore(handle, menuBtn || null);
    }
  }

  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  function resetDragVisuals(list) {
    for (const it of list.querySelectorAll("[data-ext-shift], [data-ext-dragging], [data-ext-settling]")) {
      it.removeAttribute("data-ext-shift");
      it.removeAttribute("data-ext-dragging");
      it.removeAttribute("data-ext-settling");
      it.style.removeProperty("--ext-shift");
    }
    list.removeAttribute("data-ext-dragging");
  }

  function startDrag(e, handle, list) {
    if (e.button !== 0 || getSortMode() !== "custom" || state.query.trim() || state.drag) return;
    const item = handle.closest(ITEM_SELECTOR);
    if (!item) return;
    const group = groupOf(item);
    const items = groupItems(list, group);
    const from = items.indexOf(item);
    if (from < 0 || items.length < 2) return;
    e.preventDefault();

    // positions in scroll-content coordinates (stable while items are only translated)
    const lr = list.getBoundingClientRect();
    const slots = items.map(it => {
      const r = it.getBoundingClientRect();
      return { top: r.top - lr.top + list.scrollTop, h: r.height };
    });
    const drag = {
      item, items, group, from, to: from, slots,
      startY: e.clientY, startScroll: list.scrollTop, lastY: e.clientY,
      minDy: slots[0].top - slots[from].top,
      maxDy: slots.at(-1).top - slots[from].top,
      timer: null, settling: false
    };
    state.drag = drag;
    item.setAttribute("data-ext-dragging", "");
    list.setAttribute("data-ext-dragging", "");
    try { handle.setPointerCapture(e.pointerId); } catch (_) {}

    const setShift = (el, px) => {
      el.style.setProperty("--ext-shift", `${px}px`);
      if (el !== item) el.toggleAttribute("data-ext-shift", px !== 0);
    };

    const update = () => {
      const dy = clamp(drag.lastY - drag.startY + (list.scrollTop - drag.startScroll), drag.minDy, drag.maxDy);
      setShift(item, dy);

      // slot nearest to the dragged row's centre
      const center = slots[from].top + dy + slots[from].h / 2;
      let to = from, best = Infinity;
      slots.forEach((s, i) => {
        const d = Math.abs(s.top + s.h / 2 - center);
        if (d < best) { best = d; to = i; }
      });
      drag.to = to;

      items.forEach((it, i) => {
        if (it === item) return;
        let shift = 0;
        if (to > from && i > from && i <= to) shift = slots[i - 1].top - slots[i].top;
        else if (to < from && i >= to && i < from) shift = slots[i + 1].top - slots[i].top;
        setShift(it, shift);
      });
    };

    const detach = () => {
      clearInterval(drag.timer);
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", onUp);
      handle.removeEventListener("pointercancel", onCancel);
      try { handle.releasePointerCapture(e.pointerId); } catch (_) {}
    };
    const done = commit => {
      resetDragVisuals(list);
      state.drag = null;
      if (commit) refresh(true);
    };
    const onMove = ev => { drag.lastY = ev.clientY; update(); };
    const onCancel = () => { detach(); done(false); };
    const onUp = () => {
      detach();
      const { to } = drag;
      if (to === from) {          // glide back, nothing to save
        item.setAttribute("data-ext-settling", "");
        setShift(item, 0);
        setTimeout(() => done(false), 170);
        return;
      }
      // glide into the target slot, then persist
      item.setAttribute("data-ext-settling", "");
      setShift(item, slots[to].top - slots[from].top);
      setTimeout(() => {
        const ids = items.map(getExtensionId).filter(Boolean);
        const dragged = getExtensionId(item);
        ids.splice(ids.indexOf(dragged), 1);
        ids.splice(to, 0, dragged);
        if (group === "pinned") {
          writeJson(PREF_PINNED, [...ids, ...readList(PREF_PINNED).filter(x => !ids.includes(x))]);
        } else {
          writeJson(PREF_ORDER, [...ids, ...readList(PREF_ORDER).filter(x => !ids.includes(x))]);
        }
        done(true);
      }, 170);
    };

    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", onUp);
    handle.addEventListener("pointercancel", onCancel);

    // auto-scroll near the list edges
    drag.timer = setInterval(() => {
      const r = list.getBoundingClientRect();
      if (drag.lastY < r.top + 28) list.scrollTop -= 10;
      else if (drag.lastY > r.bottom - 28) list.scrollTop += 10;
      else return;
      update();
    }, 30);
    update();
  }

  function ensureHeader() {
    const list = document.getElementById(LIST_ID);
    if (!list || !document.getElementById(SECTION_ID) || document.getElementById(ACTIONS_ID)) return;

    const sortMenu = buildSortMenu();
    const sortBtn = makeButton(SORT_BTN_ID, T.sort, null, btn => toggleMenu(sortMenu, btn));
    sortBtn.setAttribute("closemenu", "none");
    const addBtn = makeButton("extensions-list-add", T.add, "chrome://global/skin/icons/plus.svg", onAddClick);
    addBtn.setAttribute("closemenu", "none");

    const bar = document.createXULElement("hbox");
    bar.id = ACTIONS_ID;
    bar.append(
      addBtn,
      makeButton("extensions-list-manage", T.settings, null,
        () => { BrowserAddonUI.openAddonsMgr("addons://list/extension"); closePanel(); }),
      sortBtn
    );

    const search = document.createElementNS(XHTML, "input");
    search.id = SEARCH_ID;
    search.type = "search";
    search.placeholder = T.search;
    search.setAttribute("aria-label", T.search);
    search.autocomplete = "off";
    search.spellcheck = false;
    search.addEventListener("input", () => { state.query = search.value; refresh(true); });
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
    toggle.setAttribute("closemenu", "none");
    toggle.setAttribute("label", "");
    toggle.hidden = true;
    toggle.addEventListener("command", () => {
      state.showHidden = !state.showHidden;
      refresh(false);
      if (state.showHidden) {
        // ease the list down so the revealed rows come into view while they unfold
        const lr = list.getBoundingClientRect();
        const target = toggle.getBoundingClientRect().top - lr.top + list.scrollTop - 4;
        trackFit(460, target);
      } else {
        trackFit(380);
      }
    });

    list.before(bar, search);
    list.append(toggle);

    list.addEventListener("pointerdown", e => {
      const handle = e.target.closest?.(".ext-drag-handle");
      if (handle) startDrag(e, handle, list);
    }, true);

    // usage counter: any click on an extension's main button in this panel
    list.addEventListener("click", e => {
      if (e.button !== 0) return;
      const btn = e.target.closest?.(".unified-extensions-item-action-button");
      if (!btn || btn.disabled || btn.hasAttribute("disabled")) return;
      recordUsage(getExtensionId(btn.closest(ITEM_SELECTOR)));
    }, true);
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
  /* Make the list's height a whole number of rows so the last visible row is never cut in half. */
  function fitList() {
    const list = document.getElementById(LIST_ID);
    if (!list) return;
    const first = [...list.querySelectorAll(ITEM_SELECTOR)].find(i => i.getBoundingClientRect().height > 0);
    if (!first) { list.style.removeProperty("max-height"); return; }
    const pitch = first.getBoundingClientRect().height + 2; // row + 2px gap
    const rows = Math.max(3, Math.floor((window.innerHeight * 0.7) / pitch));
    list.style.setProperty("max-height", `${rows * pitch - 2}px`, "important");
  }
  /* Keep list height + popup size in step with a running CSS animation (optionally easing the scroll too). */
  function trackFit(ms, scrollTo = null) {
    const list = document.getElementById(LIST_ID);
    const t0 = performance.now();
    const startTop = list?.scrollTop || 0;
    const step = now => {
      const t = now - t0;
      fitList();
      fitPanel(false);
      if (list && scrollTo !== null) {
        const p = Math.min(1, t / ms);
        const eased = 1 - Math.pow(1 - p, 3);
        const max = Math.max(0, list.scrollHeight - list.clientHeight);
        list.scrollTop = Math.min(max, startTop + (scrollTo - startTop) * eased);
      }
      if (t < ms) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
  const fitSoon = reset => requestAnimationFrame(() => requestAnimationFrame(() => { fitList(); fitPanel(reset); }));

  /* ---------- context menu ---------- */
  function ensureMenuItem(id, handler) {
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

  /* Order: [permissions…] ─ Pin to Toolbar, Pin to top, Hide ─ Manage/Remove/Report (Move Up/Down replaced by the drag handle) */
  function arrangeMenu(menu, pin, hide) {
    let sep = document.getElementById(SEP_ID);
    if (!sep) {
      sep = document.createXULElement("menuseparator");
      sep.id = SEP_ID;
    }
    const q = s => menu.querySelector(s);
    const wanted = [
      sep,
      q("#unified-extensions-context-menu-pin-to-toolbar"),
      pin,
      hide
    ].filter(Boolean);
    const anchor = q(".unified-extensions-context-menu-management-separator")
      || q("#unified-extensions-context-menu-manage-extension");

    const current = [...menu.children];
    const idx = wanted.map(n => current.indexOf(n));
    const inOrder = idx.every((v, i) => v >= 0 && (i === 0 || v === idx[i - 1] + 1));
    if (inOrder && (!anchor || current.indexOf(anchor) === idx[idx.length - 1] + 1)) return;

    for (const node of wanted) {
      if (anchor) anchor.before(node);
      else menu.append(node);
    }
  }

  /* Collapse leading / trailing / consecutive separators ourselves, based on what is really visible. */
  function cleanSeparators(menu) {
    const seps = [...menu.children].filter(c => c.localName === "menuseparator");
    seps.forEach(s => s.removeAttribute("data-ext-sep-collapsed"));

    const visible = el => !el.hidden && !el.collapsed && window.getComputedStyle(el).display !== "none";
    let prevContent = false;
    let lastKept = null;
    for (const child of menu.children) {
      if (!visible(child)) continue;
      if (child.localName === "menuseparator") {
        if (!prevContent) child.setAttribute("data-ext-sep-collapsed", "");
        else { lastKept = child; prevContent = false; }
      } else {
        prevContent = true;
        if (lastKept) lastKept = null;
      }
    }
    lastKept?.setAttribute("data-ext-sep-collapsed", ""); // separator with nothing after it
  }

  function onPopupShowing(event) {
    const menu = event.target;
    if (menu?.id !== MENU_ID) return;

    const pin = ensureMenuItem(PIN_ITEM_ID, togglePinned);
    const hide = ensureMenuItem(HIDE_ITEM_ID, toggleHidden);
    arrangeMenu(menu, pin, hide);

    // only for extensions listed in our panel (not for the ones pinned to the toolbar)
    const item = menu.triggerNode?.closest?.(`#${LIST_ID} ${ITEM_SELECTOR}`);
    const panelOpen = getPanel()?.state === "open";
    const id = item ? getExtensionId(item) : (panelOpen && !menu.triggerNode ? menu.dataset?.extensionId || "" : "");
    for (const e of [pin, hide]) {
      e.hidden = !id;
      if (id) e.setAttribute("data-ext-id", id);
    }
    if (id) {
      pin.setAttribute("label", readList(PREF_PINNED).includes(id) ? T.unpin : T.pin);
      hide.setAttribute("label", readList(PREF_HIDDEN).includes(id) ? T.unhide : T.hide);
    }
    cleanSeparators(menu);
  }

  /* ---------- refresh loop ---------- */
  function refresh(resize) {
    state.scheduled = false;
    const list = document.getElementById(LIST_ID);
    if (list) {
      list.querySelectorAll(ITEM_SELECTOR).forEach(ensureName);
      ensureHeader();
      ensureHandles(list);
      if (!state.drag) applyState(list);
      fitList();
    }
    if (resize === true) fitSoon(false);
  }
  function schedule() {
    if (state.scheduled) return;
    state.scheduled = true;
    requestAnimationFrame(() => refresh(false));
  }

  function onPopupShown(event) {
    const t = event.target;
    if (t?.id === PANEL_ID) {
      loadAddonMeta();
      schedule();
      fitSoon(true);
    } else if (t?.id === MENU_ID) {
      cleanSeparators(t); // Firefox may have changed visibility after our popupshowing
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
    loadAddonMeta();
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
