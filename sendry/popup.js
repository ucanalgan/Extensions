const $ = (id) => document.getElementById(id);

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

// "3'ünü", "2'sini", "6'sını", "9'unu": the accusative suffix follows how the number is read aloud.
const ONES = ["", "ini", "sini", "ünü", "ünü", "ini", "sını", "sini", "ini", "unu"];
const TENS = ["", "unu", "sini", "unu", "ını", "sini", "ını", "ini", "ini", "ını"];
function numberAccusative(n) {
  let suffix;
  if (n % 10) suffix = ONES[n % 10];
  else if (n % 100) suffix = TENS[(n % 100) / 10];
  else if (n % 1000) suffix = "ünü";
  else suffix = "ini";
  return `${n}'${suffix}`;
}

function summaryText(day) {
  const p = $("summary");
  p.innerHTML = "";
  const strong = (t) => {
    const s = document.createElement("strong");
    s.textContent = t;
    return s;
  };
  if (day.checked === 0) {
    p.textContent = "Bugün henüz bir gönderime bakmadım.";
  } else if (day.blocked === 0) {
    p.append("Bugün ", strong(`${day.checked} mesaja`), " baktım, hepsi temizdi.");
  } else {
    p.append("Bugün ", strong(`${day.checked} mesaja`), " baktım, ", strong(numberAccusative(day.blocked)), " gönderilmeden durdurdum.");
  }
}

async function render() {
  const settings = await getSettings();
  const stats = await getStats();
  const host = await getCurrentHost();

  $("enabled-toggle").checked = settings.enabled;

  const status = $("site-status");
  const siteBtn = $("site-toggle-btn");
  if (host) {
    const disabled = isSiteDisabled(settings, host);
    const on = settings.enabled && !disabled;
    $("current-site").textContent = host;
    status.textContent = on ? "izliyor" : "kapalı";
    status.className = `st ${on ? "on" : "off"}`;
    siteBtn.hidden = false;
    siteBtn.textContent = disabled ? "Bu sitede aç" : "Bu sitede kapat";
  } else {
    $("current-site").textContent = "Bu sayfada çalışmaz";
    status.textContent = "";
    siteBtn.hidden = true;
  }

  const day = stats[todayKey()] || emptyDayStats();
  summaryText(day);
  $("stat-blocked").textContent = day.blocked;
  $("stat-fixed").textContent = day.fixed;
  $("stat-bypassed").textContent = day.bypassed;

  const list = $("detector-list");
  list.innerHTML = "";
  const entries = Object.entries(day.detectors).sort((a, b) => b[1] - a[1]).slice(0, 4);
  for (const [id, n] of entries) {
    const info = DETECTOR_INFO[id] || {};
    const li = document.createElement("li");
    const mk = document.createElement("span");
    mk.className = "mk";
    mk.textContent = info.mark || "!";
    const name = document.createElement("span");
    name.textContent = info.title || info.label || id;
    const count = document.createElement("span");
    count.className = "n";
    count.textContent = n;
    li.append(mk, name, count);
    list.append(li);
  }
  list.hidden = entries.length === 0;
  $("checked-note").textContent = day.checked ? "" : "Mesaj gönderdikçe burada görünür.";
}

$("enabled-toggle").addEventListener("change", async (e) => {
  await saveSettings({ enabled: e.target.checked });
  render();
});

$("site-toggle-btn").addEventListener("click", async () => {
  const host = await getCurrentHost();
  if (!host) return;
  const settings = await getSettings();
  const disabledSites = isSiteDisabled(settings, host)
    ? settings.disabledSites.filter((s) => !(host === s || host.endsWith("." + s)))
    : [...settings.disabledSites, host];
  await saveSettings({ disabledSites });
  render();
});

$("open-options").addEventListener("click", () => chrome.runtime.openOptionsPage());

render();
