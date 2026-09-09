importScripts("common.js");

chrome.runtime.onInstalled.addListener(async () => {
  chrome.alarms.create(TICK_ALARM, { periodInMinutes: 1 });
  refreshActiveDomain();
});

chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create(TICK_ALARM, { periodInMinutes: 1 });
  refreshActiveDomain();
});

async function accrueTime() {
  const store = await getStore();
  const { trackState, usage } = store;
  const now = Date.now();
  if (trackState.tracking && trackState.activeDomain) {
    const elapsedMs = Math.min(Math.max(now - trackState.lastTickTs, 0), MAX_GAP_MS);
    const elapsedSec = Math.floor(elapsedMs / 1000);
    if (elapsedSec > 0) {
      const day = todayKey();
      usage[day] = usage[day] || {};
      usage[day][trackState.activeDomain] = (usage[day][trackState.activeDomain] || 0) + elapsedSec;
      pruneDateKeyed(usage);
      await setStore({ usage });
    }
  }
  trackState.lastTickTs = now;
  await setStore({ trackState });
  return await getStore();
}

async function updateBadgeAndWarn(store, domain) {
  if (!domain) {
    await chrome.action.setBadgeText({ text: "" });
    return;
  }
  const worst = evaluateDomain(store, domain);
  if (!worst) {
    await chrome.action.setBadgeText({ text: "" });
    return;
  }

  const remainingMin = Math.max(0, Math.ceil(worst.remaining / 60));
  await chrome.action.setBadgeText({ text: String(remainingMin) });
  await chrome.action.setBadgeBackgroundColor({
    color: worst.remaining <= WARN_THRESHOLD_SEC ? "#dc2626" : "#4f46e5"
  });

  if (worst.remaining > 0 && worst.remaining <= WARN_THRESHOLD_SEC) {
    const { warned } = store;
    warned[worst.day] = warned[worst.day] || {};
    if (!warned[worst.day][worst.key]) {
      warned[worst.day][worst.key] = true;
      pruneDateKeyed(warned);
      await setStore({ warned });
      chrome.notifications.create(`warn-${worst.key}-${worst.day}`, {
        type: "basic",
        iconUrl: "icons/icon128.png",
        title: "Süre azalıyor",
        message: `${worst.label} için bugün ${remainingMin} dakikan kaldı.`
      });
    }
  }
}

async function blockTab(tabId, { key, label, reason }) {
  const url = chrome.runtime.getURL(
    `blocked.html?site=${encodeURIComponent(label)}&key=${encodeURIComponent(key || "")}&reason=${reason}`
  );
  try {
    await chrome.tabs.update(tabId, { url });
  } catch {
    // tab may already be closed/navigated away; ignore
  }
}

async function applyDomainForTab(domain, tabId, windowFocused) {
  await accrueTime();
  const store = await getStore();
  const { trackState } = store;

  if (!windowFocused || !domain) {
    trackState.activeDomain = null;
    trackState.activeTabId = null;
    trackState.tracking = false;
    trackState.lastTickTs = Date.now();
    await setStore({ trackState });
    await chrome.action.setBadgeText({ text: "" });
    return;
  }

  if (isFocusBlocked(store.focusSession, domain)) {
    trackState.activeDomain = null;
    trackState.tracking = false;
    await setStore({ trackState });
    await blockTab(tabId, { key: "", label: "Odak Modu", reason: "focus" });
    return;
  }

  trackState.activeDomain = domain;
  trackState.activeTabId = tabId;
  trackState.tracking = true;
  trackState.lastTickTs = Date.now();
  await setStore({ trackState });

  const worst = evaluateDomain(store, domain);
  if (worst && worst.remaining <= 0) {
    trackState.activeDomain = null;
    trackState.tracking = false;
    await setStore({ trackState });
    await blockTab(tabId, { key: worst.key, label: worst.label, reason: "limit" });
    return;
  }

  await updateBadgeAndWarn(store, domain);
}

async function isWindowFocused(windowId) {
  try {
    const win = await chrome.windows.get(windowId);
    return !!win.focused;
  } catch {
    return false;
  }
}

async function refreshActiveDomain() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!tab) {
      await applyDomainForTab(null, null, false);
      return;
    }
    const focused = await isWindowFocused(tab.windowId);
    const domain = getHostname(tab.url);
    await applyDomainForTab(domain, tab.id, focused);
  } catch {
    await applyDomainForTab(null, null, false);
  }
}

chrome.tabs.onActivated.addListener(async ({ tabId, windowId }) => {
  try {
    const tab = await chrome.tabs.get(tabId);
    const focused = await isWindowFocused(windowId);
    const domain = getHostname(tab.url);
    await applyDomainForTab(domain, tabId, focused);
  } catch {
    /* tab may be gone already */
  }
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (!changeInfo.url) return;
  if (!tab.active) return;
  const focused = await isWindowFocused(tab.windowId);
  const domain = getHostname(changeInfo.url);
  await applyDomainForTab(domain, tabId, focused);
});

chrome.windows.onFocusChanged.addListener(async (windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    await applyDomainForTab(null, null, false);
    return;
  }
  await refreshActiveDomain();
});

chrome.idle.onStateChanged.addListener(async (state) => {
  if (state !== "active") {
    await applyDomainForTab(null, null, false);
  } else {
    await refreshActiveDomain();
  }
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === FOCUS_END_ALARM) {
    const { focusSession } = await getStore();
    if (focusSession.active) {
      focusSession.active = false;
      await setStore({ focusSession });
      chrome.notifications.create(`focus-end-${Date.now()}`, {
        type: "basic",
        iconUrl: "icons/icon128.png",
        title: "Odak modu bitti",
        message: "Odak seansın tamamlandı."
      });
      await refreshActiveDomain();
    }
    return;
  }

  if (alarm.name !== TICK_ALARM) return;

  const store = await accrueTime();
  const { trackState } = store;
  if (!trackState.tracking || !trackState.activeDomain || trackState.activeTabId == null) return;

  const domain = trackState.activeDomain;
  const tabId = trackState.activeTabId;

  if (isFocusBlocked(store.focusSession, domain)) {
    trackState.activeDomain = null;
    trackState.tracking = false;
    await setStore({ trackState });
    await blockTab(tabId, { key: "", label: "Odak Modu", reason: "focus" });
    return;
  }

  const worst = evaluateDomain(store, domain);
  if (worst && worst.remaining <= 0) {
    trackState.activeDomain = null;
    trackState.tracking = false;
    await setStore({ trackState });
    await blockTab(tabId, { key: worst.key, label: worst.label, reason: "limit" });
    return;
  }

  await updateBadgeAndWarn(store, domain);
});
