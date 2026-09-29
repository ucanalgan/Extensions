const LIST_FIELDS = ["customPhrases", "extraSendWords", "disabledSites"];
const BOOL_FIELDS = ["enabled", "requireConfirm", "checkPlainEnter"];
const NUMBER_FIELDS = ["pasteRatio", "minReadSeconds", "maxReadSeconds"];
const DAY_LABELS = ["Paz", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"];

let current = mergeSettings(null);

function parseLines(value, host = false) {
  const items = value.split("\n").map((s) => (host ? normalizeHost(s) : s.trim())).filter(Boolean);
  return [...new Set(items)];
}

function renderDetectorOptions() {
  const wrap = document.getElementById("detector-options");
  wrap.innerHTML = "";
  const span = (cls, content) => {
    const s = document.createElement("span");
    s.className = cls;
    s.textContent = content;
    return s;
  };
  for (const info of DETECTORS) {
    const label = document.createElement("label");
    label.className = "check";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = current.detectors[info.id];
    input.addEventListener("change", async () => {
      current = await saveSettings({ detectors: { ...current.detectors, [info.id]: input.checked } });
      renderTest();
    });

    const text = document.createElement("span");
    const head = span("head", info.label);
    if (info.severity === "low") head.append(span("tag", "sadece bilgi"));
    if (info.fixable) head.append(span("tag fixable", "tek tıkla düzeltilir"));
    text.append(head, span("desc", info.desc), span("why", info.why));
    if (info.examples) {
      const sample = info.examples.catch[0];
      text.append(span("example", `Örn: ${visibleText(sample.length > 70 ? sample.slice(0, 70) + "…" : sample)}`));
    }
    label.append(input, text);
    wrap.append(label);
  }
}

function fillForm() {
  for (const key of BOOL_FIELDS) document.getElementById(`opt-${key}`).checked = current[key];
  for (const key of NUMBER_FIELDS) document.getElementById(`opt-${key}`).value = current[key];
  for (const key of LIST_FIELDS) document.getElementById(`opt-${key}`).value = current[key].join("\n");
  renderDetectorOptions();
}

function bindForm() {
  for (const key of BOOL_FIELDS) {
    document.getElementById(`opt-${key}`).addEventListener("change", async (e) => {
      current = await saveSettings({ [key]: e.target.checked });
    });
  }
  for (const key of NUMBER_FIELDS) {
    document.getElementById(`opt-${key}`).addEventListener("change", async (e) => {
      const n = parseInt(e.target.value, 10);
      if (Number.isNaN(n) || n < 0) {
        e.target.value = current[key];
        return;
      }
      current = await saveSettings({ [key]: n });
    });
  }
  for (const key of LIST_FIELDS) {
    document.getElementById(`opt-${key}`).addEventListener("change", async (e) => {
      current = await saveSettings({ [key]: parseLines(e.target.value, key === "disabledSites") });
      e.target.value = current[key].join("\n");
      renderTest();
    });
  }
}

function renderTest() {
  const text = document.getElementById("test-input").value;
  const out = document.getElementById("test-results");
  out.innerHTML = "";
  if (!text.trim()) return;

  const issues = analyzeText(text, current);
  if (issues.length === 0) {
    const p = document.createElement("p");
    p.className = "clean";
    p.textContent = "Temiz görünüyor. Yine de isim, tarih ve bilgileri kendin kontrol et.";
    out.append(p);
    return;
  }

  for (const issue of issues) {
    const box = document.createElement("div");
    box.className = `result ${issue.severity}`;
    const head = document.createElement("div");
    head.className = "result-head";
    const dot = document.createElement("span");
    dot.className = "dot";
    const title = document.createElement("strong");
    title.textContent = issue.count > 1 ? `${issue.title} (${issue.count})` : issue.title;
    head.append(dot, title);
    const detail = document.createElement("p");
    detail.className = "detail";
    detail.textContent = issue.detail;
    box.append(head, detail);

    for (const hit of issue.hits.slice(0, 3)) {
      const start = Math.max(0, hit.index - 22);
      const end = Math.min(text.length, hit.index + hit.length + 22);
      const code = document.createElement("code");
      const mark = document.createElement("mark");
      mark.textContent = visibleText(hit.text);
      code.append(
        (start > 0 ? "…" : "") + visibleText(text.slice(start, hit.index)),
        mark,
        visibleText(text.slice(hit.index + hit.length, end)) + (end < text.length ? "…" : "")
      );
      box.append(code);
    }
    out.append(box);
  }

  const fixable = FIX_ORDER.filter((id) => issues.some((i) => i.id === id));
  if (fixable.length > 0) {
    const btn = document.createElement("button");
    btn.className = "fix-btn";
    btn.textContent = "Otomatik düzelt";
    btn.title = fixable.map((id) => FIX_LABELS[id]).join(" · ");
    btn.addEventListener("click", () => {
      const input = document.getElementById("test-input");
      input.value = autoFixText(input.value, FIX_ORDER.filter((id) => current.detectors[id]));
      renderTest();
    });
    out.append(btn);
  }
}

async function renderHistory() {
  const stats = await getStats();
  const chart = document.getElementById("history-chart");
  chart.innerHTML = "";

  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push({ key: todayKey(d), label: DAY_LABELS[d.getDay()] });
  }
  const max = Math.max(1, ...days.map((d) => (stats[d.key] || emptyDayStats()).blocked));

  for (const day of days) {
    const s = stats[day.key] || emptyDayStats();
    const col = document.createElement("div");
    col.className = "bar-col";
    const value = document.createElement("span");
    value.className = "bar-value";
    value.textContent = s.blocked || "";
    const stack = document.createElement("div");
    stack.className = "bar-stack";

    const fixed = Math.min(s.fixed, s.blocked);
    const bypassed = Math.min(s.bypassed, s.blocked - fixed);
    const other = s.blocked - fixed - bypassed;
    for (const [cls, n] of [["fixed", fixed], ["bypassed", bypassed], ["blocked", other]]) {
      if (n <= 0) continue;
      const seg = document.createElement("div");
      seg.className = `seg ${cls}`;
      seg.style.height = `${(n / max) * 100}%`;
      stack.append(seg);
    }

    const label = document.createElement("span");
    label.className = "bar-label";
    label.textContent = day.label;
    col.append(value, stack, label);
    chart.append(col);
  }
}

document.getElementById("test-input").addEventListener("input", renderTest);

(async () => {
  current = await getSettings();
  fillForm();
  bindForm();
  renderHistory();
})();
