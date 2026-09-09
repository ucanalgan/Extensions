function formatDuration(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  if (h > 0) return `${h}sa ${m}dk`;
  if (m > 0) return `${m}dk`;
  return `${totalSeconds}sn`;
}

function lastNDays(n) {
  const days = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(d);
  }
  return days;
}

function buildScheduleEditor(container) {
  container.innerHTML = "";

  const dayToggles = document.createElement("div");
  dayToggles.className = "day-toggles";
  for (const { label, value } of DAY_OPTIONS) {
    const wrap = document.createElement("label");
    wrap.className = "day-toggle";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.value = String(value);
    wrap.append(cb, document.createTextNode(label));
    dayToggles.appendChild(wrap);
  }

  const timeRange = document.createElement("div");
  timeRange.className = "time-range";
  const start = document.createElement("input");
  start.type = "time";
  const end = document.createElement("input");
  end.type = "time";
  timeRange.append(document.createTextNode("Saat"), start, document.createTextNode("–"), end);

  container.append(dayToggles, timeRange);
}

function readScheduleEditor(container) {
  const days = [...container.querySelectorAll('input[type="checkbox"]:checked')].map((cb) => Number(cb.value));
  const [start, end] = container.querySelectorAll('input[type="time"]');
  return { days, start: start.value || "", end: end.value || "" };
}

async function renderLimits() {
  const store = await getStore();
  const { usage, limits } = store;
  const day = todayKey();
  const todayUsage = usage[day] || {};
  const tbody = document.querySelector("#limits-table tbody");
  const noLimits = document.getElementById("no-limits");
  tbody.innerHTML = "";

  const domains = Object.keys(limits).sort();
  noLimits.hidden = domains.length > 0;

  for (const domain of domains) {
    const rule = limits[domain];
    const tr = document.createElement("tr");

    const domainTd = document.createElement("td");
    domainTd.textContent = domain;

    const limitTd = document.createElement("td");
    limitTd.textContent = `${rule.minutes} dk`;

    const scheduleTd = document.createElement("td");
    scheduleTd.textContent = summarizeSchedule(rule);

    const usedTd = document.createElement("td");
    usedTd.textContent = formatDuration(todayUsage[domain] || 0);

    const actionTd = document.createElement("td");
    const removeBtn = document.createElement("button");
    removeBtn.textContent = "Sil";
    removeBtn.className = "remove-btn";
    removeBtn.addEventListener("click", async () => {
      const { limits: current } = await getStore();
      delete current[domain];
      await setStore({ limits: current });
      renderLimits();
    });
    actionTd.appendChild(removeBtn);

    tr.append(domainTd, limitTd, scheduleTd, usedTd, actionTd);
    tbody.appendChild(tr);
  }
}

async function renderCategories() {
  const store = await getStore();
  const { usage, categories } = store;
  const day = todayKey();
  const tbody = document.querySelector("#categories-table tbody");
  const noCategories = document.getElementById("no-categories");
  tbody.innerHTML = "";

  const ids = Object.keys(categories);
  noCategories.hidden = ids.length > 0;

  for (const id of ids) {
    const cat = categories[id];
    const tr = document.createElement("tr");

    const nameTd = document.createElement("td");
    nameTd.textContent = cat.name;

    const domainsTd = document.createElement("td");
    domainsTd.textContent = cat.domains.join(", ");

    const limitTd = document.createElement("td");
    limitTd.textContent = `${cat.minutes} dk`;

    const scheduleTd = document.createElement("td");
    scheduleTd.textContent = summarizeSchedule(cat);

    const usedTd = document.createElement("td");
    usedTd.textContent = formatDuration(categoryUsageSeconds(usage, day, cat.domains));

    const actionTd = document.createElement("td");
    const removeBtn = document.createElement("button");
    removeBtn.textContent = "Sil";
    removeBtn.className = "remove-btn";
    removeBtn.addEventListener("click", async () => {
      const { categories: current } = await getStore();
      delete current[id];
      await setStore({ categories: current });
      renderCategories();
    });
    actionTd.appendChild(removeBtn);

    tr.append(nameTd, domainsTd, limitTd, scheduleTd, usedTd, actionTd);
    tbody.appendChild(tr);
  }
}

async function renderHistory() {
  const { usage } = await getStore();
  const days = lastNDays(7);
  const totals = days.map((d) => {
    const key = todayKey(d);
    const dayUsage = usage[key] || {};
    return Object.values(dayUsage).reduce((s, v) => s + v, 0);
  });
  const max = Math.max(1, ...totals);

  const chart = document.getElementById("history-chart");
  chart.innerHTML = "";
  const labels = ["Pz", "Pt", "Sa", "Ça", "Pe", "Cu", "Ct"];

  days.forEach((d, i) => {
    const wrap = document.createElement("div");
    wrap.className = "history-bar-wrap";

    const value = document.createElement("div");
    value.className = "history-value";
    value.textContent = totals[i] > 0 ? formatDuration(totals[i]) : "";

    const bar = document.createElement("div");
    bar.className = "history-bar";
    const pct = Math.round((totals[i] / max) * 100);
    bar.style.height = `${Math.max(2, pct)}%`;

    const label = document.createElement("div");
    label.className = "history-label";
    label.textContent = labels[d.getDay()];

    wrap.append(value, bar, label);
    chart.appendChild(wrap);
  });
}

const newLimitSchedule = document.getElementById("new-limit-schedule");
const newCatSchedule = document.getElementById("new-cat-schedule");
buildScheduleEditor(newLimitSchedule);
buildScheduleEditor(newCatSchedule);

document.getElementById("add-limit-btn").addEventListener("click", async () => {
  const domainInput = document.getElementById("new-domain");
  const minutesInput = document.getElementById("new-minutes");
  let domain = domainInput.value.trim().toLowerCase();
  domain = domain.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
  const minutes = parseInt(minutesInput.value, 10);
  if (!domain || !minutes || minutes <= 0) return;

  const schedule = readScheduleEditor(newLimitSchedule);
  const { limits } = await getStore();
  limits[domain] = { minutes, ...schedule };
  await setStore({ limits });

  domainInput.value = "";
  minutesInput.value = "";
  buildScheduleEditor(newLimitSchedule);
  renderLimits();
});

document.getElementById("add-cat-btn").addEventListener("click", async () => {
  const nameInput = document.getElementById("new-cat-name");
  const minutesInput = document.getElementById("new-cat-minutes");
  const domainsInput = document.getElementById("new-cat-domains");

  const name = nameInput.value.trim();
  const minutes = parseInt(minutesInput.value, 10);
  const domains = domainsInput.value
    .split(",")
    .map((s) => s.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0])
    .filter(Boolean);

  if (!name || !minutes || minutes <= 0 || domains.length === 0) return;

  const schedule = readScheduleEditor(newCatSchedule);
  const { categories } = await getStore();
  const id = newId("cat");
  categories[id] = { name, domains, minutes, ...schedule };
  await setStore({ categories });

  nameInput.value = "";
  minutesInput.value = "";
  domainsInput.value = "";
  buildScheduleEditor(newCatSchedule);
  renderCategories();
});

renderLimits();
renderCategories();
renderHistory();
