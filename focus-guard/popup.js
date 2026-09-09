function formatDuration(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  if (h > 0) return `${h}sa ${m}dk`;
  if (m > 0) return `${m}dk`;
  return `${totalSeconds}sn`;
}

function formatCountdown(ms) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = String(Math.floor(totalSec / 60)).padStart(2, "0");
  const s = String(totalSec % 60).padStart(2, "0");
  return `${m}:${s}`;
}

async function getCurrentTabDomain() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return null;
  return getHostname(tab.url);
}

let countdownTimer = null;

async function renderFocus() {
  const { focusSession } = await getStore();
  const idleEl = document.getElementById("focus-idle");
  const activeEl = document.getElementById("focus-active");

  if (focusSession.active && focusSession.endTs > Date.now()) {
    idleEl.hidden = true;
    activeEl.hidden = false;
    const tick = () => {
      const remaining = focusSession.endTs - Date.now();
      if (remaining <= 0) {
        clearInterval(countdownTimer);
        renderFocus();
        return;
      }
      document.getElementById("focus-countdown").textContent = formatCountdown(remaining);
    };
    tick();
    clearInterval(countdownTimer);
    countdownTimer = setInterval(tick, 1000);
  } else {
    idleEl.hidden = false;
    activeEl.hidden = true;
    clearInterval(countdownTimer);
  }
}

document.getElementById("focus-start-btn").addEventListener("click", async () => {
  const minutes = parseInt(document.getElementById("focus-duration").value, 10);
  const allowlist = document
    .getElementById("focus-allowlist")
    .value.split(",")
    .map((s) => s.trim().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0])
    .filter(Boolean);

  const endTs = Date.now() + minutes * 60 * 1000;
  await setStore({ focusSession: { active: true, endTs, allowlist } });
  chrome.alarms.create(FOCUS_END_ALARM, { when: endTs });
  renderFocus();
});

document.getElementById("focus-end-btn").addEventListener("click", async () => {
  await setStore({ focusSession: { active: false, endTs: null, allowlist: [] } });
  chrome.alarms.clear(FOCUS_END_ALARM);
  renderFocus();
});

async function render() {
  const store = await getStore();
  const { usage } = store;
  const day = todayKey();
  const todayUsage = usage[day] || {};
  const entries = Object.entries(todayUsage).sort((a, b) => b[1] - a[1]);

  const total = entries.reduce((sum, [, sec]) => sum + sec, 0);
  document.getElementById("total-time").textContent = formatDuration(total);

  const list = document.getElementById("usage-list");
  const emptyState = document.getElementById("empty-state");
  list.innerHTML = "";

  if (entries.length === 0) {
    emptyState.hidden = false;
  } else {
    emptyState.hidden = true;
    for (const [domain, seconds] of entries.slice(0, 15)) {
      const rule = evaluateDomain(store, domain);
      const li = document.createElement("li");
      li.className = "usage-item";

      const top = document.createElement("div");
      top.className = "usage-top";
      const domainEl = document.createElement("span");
      domainEl.className = "usage-domain";
      domainEl.textContent = domain;
      const timeEl = document.createElement("span");
      timeEl.className = "usage-time";
      timeEl.textContent = rule
        ? `${formatDuration(seconds)} / ${formatDuration(rule.limitSec)}${rule.kind === "category" ? ` (${rule.label})` : ""}`
        : formatDuration(seconds);
      top.append(domainEl, timeEl);
      li.appendChild(top);

      if (rule) {
        const track = document.createElement("div");
        track.className = "usage-bar-track";
        const fill = document.createElement("div");
        const pct = Math.min(100, Math.round((rule.usedSec / rule.limitSec) * 100));
        fill.className = "usage-bar-fill" + (rule.remaining <= 0 ? " over" : "");
        fill.style.width = `${pct}%`;
        track.appendChild(fill);
        li.appendChild(track);
      }

      list.appendChild(li);
    }
  }

  const currentDomain = await getCurrentTabDomain();
  document.getElementById("current-domain").textContent = currentDomain || "(izlenmiyor)";
  document.getElementById("quick-add-btn").disabled = !currentDomain;
}

document.getElementById("quick-add-btn").addEventListener("click", async () => {
  const domain = document.getElementById("current-domain").textContent;
  const minutesInput = document.getElementById("quick-minutes");
  const minutes = parseInt(minutesInput.value, 10);
  if (!domain || domain === "(izlenmiyor)" || !minutes || minutes <= 0) return;

  const { limits } = await getStore();
  limits[domain] = { minutes, days: [], start: "", end: "" };
  await setStore({ limits });
  minutesInput.value = "";
  render();
});

document.getElementById("open-options").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

render();
renderFocus();
