async function getCurrentHost() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url) return null;
  try {
    const u = new URL(tab.url);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return normalizeHost(u.hostname);
  } catch {
    return null;
  }
}

async function render() {
  const settings = await getSettings();
  const stats = await getStats();
  const host = await getCurrentHost();

  document.getElementById("enabled-toggle").checked = settings.enabled;

  const siteEl = document.getElementById("current-site");
  const statusEl = document.getElementById("site-status");
  const siteBtn = document.getElementById("site-toggle-btn");
  if (host) {
    const disabled = isSiteDisabled(settings, host);
    siteEl.textContent = host;
    const on = settings.enabled && !disabled;
    statusEl.textContent = on ? "aktif" : "kapalı";
    statusEl.className = `status ${on ? "on" : "off"}`;
    siteBtn.hidden = false;
    siteBtn.textContent = disabled ? "Bu sitede aç" : "Bu sitede kapat";
  } else {
    siteEl.textContent = "Bu sayfada çalışmaz";
    statusEl.textContent = "";
    siteBtn.hidden = true;
  }

  const day = stats[todayKey()] || emptyDayStats();
  document.getElementById("stat-checked").textContent = day.checked;
  document.getElementById("stat-blocked").textContent = day.blocked;
  document.getElementById("stat-fixed").textContent = day.fixed;
  document.getElementById("stat-bypassed").textContent = day.bypassed;

  const list = document.getElementById("detector-list");
  list.innerHTML = "";
  const entries = Object.entries(day.detectors).sort((a, b) => b[1] - a[1]);
  for (const [id, n] of entries) {
    const li = document.createElement("li");
    const name = document.createElement("span");
    name.textContent = (DETECTOR_INFO[id] && DETECTOR_INFO[id].label) || id;
    const count = document.createElement("span");
    count.className = "n";
    count.textContent = `${n}×`;
    li.append(name, count);
    list.append(li);
  }
  document.getElementById("empty-state").hidden = entries.length > 0;
}

document.getElementById("enabled-toggle").addEventListener("change", async (e) => {
  await saveSettings({ enabled: e.target.checked });
  render();
});

document.getElementById("site-toggle-btn").addEventListener("click", async () => {
  const host = await getCurrentHost();
  if (!host) return;
  const settings = await getSettings();
  const disabledSites = isSiteDisabled(settings, host)
    ? settings.disabledSites.filter((s) => !(host === s || host.endsWith("." + s)))
    : [...settings.disabledSites, host];
  await saveSettings({ disabledSites });
  render();
});

document.getElementById("open-options").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

render();
