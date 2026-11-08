/*
 * Extensions List for Zen Browser / Sine  (v1.5.0)
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
    pin: "Przypnij na początek listy",
    unpin: "Odepnij z początku listy",
    hide: "Ukryj na końcu listy",
    unhide: "Przestań ukrywać",
    add: "Dodaj rozszerzenia",
    settings: "Ustawienia rozszerzeń",
    sort: "Sortuj",
    search: "Szukaj rozszerzeń…",
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
    pin: "Pin to top of list",
    unpin: "Unpin from top of list",
    hide: "Hide at end of list",
    unhide: "Stop hiding",
    add: "Add extensions",
    settings: "Extension settings",
    sort: "Sort",
    search: "Search extensions…",
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
    document.getElementById(SORT_BTN_ID)?.toggleAttribute("data-sorted", mode !== "custom");

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
    groups.normal.forEach((e, i) => setOrder(e, cmp ? i : null));
    groups.hidden.forEach((e, i) => setOrder(e, 6000 + i));
    groups.match.at(-1)?.item.toggleAttribute("data-ext-last-match", true);

    const toggle = document.getElementById(TOGGLE_ID);
    if (toggle) {
      const count = groups.hidden.length;
      toggle.hidden = count === 0 || !!q;
      toggle.setAttribute("label", state.showHidden ? T.collapse(count) : T.showAll(count));
      toggle.toggleAttribute("data-expanded", state.showHidden);
    }
  }

  /* ---------- header: action buttons, sort menu, search ---------- */
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

  const SORT_ICON = "data:image/svg+xml," + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="context-fill">' +
    '<path d="M2 3h12v1.5H2zM2 7.25h8v1.5H2zM2 11.5h4V13H2z"/></svg>'
  );

  function buildSortMenu() {
    let popup = document.getElementById(SORT_MENU_ID);
    if (popup) return popup;
    popup = document.createXULElement("menupopup");
    popup.id = SORT_MENU_ID;
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

  function clearDropMarks(list) {
    list.querySelectorAll("[data-ext-drop]").forEach(i => i.removeAttribute("data-ext-drop"));
  }

  function updateDropTarget(drag, list) {
    clearDropMarks(list);
    const items = groupItems(list, drag.group);
    let target = null, pos = "before";
    for (const it of items) {
      const r = it.getBoundingClientRect();
      target = it;
      if (drag.lastY < r.top + r.height / 2) { pos = "before"; break; }
      pos = "after";
    }
    drag.target = target;
    drag.pos = pos;
    if (target && target !== drag.item) target.setAttribute("data-ext-drop", pos);
  }

  function commitDrag(drag, list) {
    const { item, target, pos, group } = drag;
    if (!target || target === item) return;
    const ids = groupItems(list, group).map(getExtensionId).filter(Boolean);
    const dragged = getExtensionId(item);
    const from = ids.indexOf(dragged);
    if (from < 0) return;
    ids.splice(from, 1);
    let to = ids.indexOf(getExtensionId(target));
    if (to < 0) return;
    if (pos === "after") to++;
    ids.splice(to, 0, dragged);
    if (group === "pinned") {
      writeJson(PREF_PINNED, [...ids, ...readList(PREF_PINNED).filter(x => !ids.includes(x))]);
    } else {
      writeJson(PREF_ORDER, [...ids, ...readList(PREF_ORDER).filter(x => !ids.includes(x))]);
    }
  }

  function startDrag(e, handle, list) {
    if (e.button !== 0 || getSortMode() !== "custom" || state.query.trim()) return;
    const item = handle.closest(ITEM_SELECTOR);
    if (!item) return;
    e.preventDefault();

    const drag = { item, group: groupOf(item), target: null, pos: "before", lastY: e.clientY, timer: null };
    state.drag = drag;
    item.setAttribute("data-ext-dragging", "");
    list.setAttribute("data-ext-dragging", "");
    try { handle.setPointerCapture(e.pointerId); } catch (_) {}

    const onMove = ev => { drag.lastY = ev.clientY; updateDropTarget(drag, list); };
    const finish = commit => {
      clearInterval(drag.timer);
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", onUp);
      handle.removeEventListener("pointercancel", onCancel);
      try { handle.releasePointerCapture(e.pointerId); } catch (_) {}
      if (commit) commitDrag(drag, list);
      clearDropMarks(list);
      item.removeAttribute("data-ext-dragging");
      list.removeAttribute("data-ext-dragging");
      state.drag = null;
      if (commit) refresh(true);
    };
    const onUp = () => finish(true);
    const onCancel = () => finish(false);

    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", onUp);
    handle.addEventListener("pointercancel", onCancel);

    // auto-scroll near the list edges
    drag.timer = setInterval(() => {
      const lr = list.getBoundingClientRect();
      if (drag.lastY < lr.top + 28) list.scrollTop -= 10;
      else if (drag.lastY > lr.bottom - 28) list.scrollTop += 10;
      else return;
      updateDropTarget(drag, list);
    }, 30);
    updateDropTarget(drag, list);
  }

  function ensureHeader() {
    const list = document.getElementById(LIST_ID);
    if (!list || !document.getElementById(SECTION_ID) || document.getElementById(ACTIONS_ID)) return;

    const sortMenu = buildSortMenu();
    const sortBtn = makeButton(SORT_BTN_ID, T.sort, SORT_ICON, () => {
      sortMenu.openPopup(sortBtn, "after_start");
    });
    sortBtn.setAttribute("closemenu", "none");

    const bar = document.createXULElement("hbox");
    bar.id = ACTIONS_ID;
    bar.append(
      makeButton("extensions-list-add", T.add, "chrome://global/skin/icons/plus.svg", openAmo),
      makeButton("extensions-list-manage", T.settings, "chrome://global/skin/icons/settings.svg",
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
    toggle.hidden = true;
    toggle.addEventListener("command", () => {
      state.showHidden = !state.showHidden;
      refresh(true);
      if (state.showHidden) {
        // bring the freshly revealed hidden extensions into view
        setTimeout(() => toggle.scrollIntoView({ block: "start", behavior: "smooth" }), 120);
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
  const fitSoon = reset => requestAnimationFrame(() => requestAnimationFrame(() => fitPanel(reset)));

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
