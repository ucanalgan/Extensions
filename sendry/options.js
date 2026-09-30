const BOOL_FIELDS = ["enabled", "requireConfirm", "checkPlainEnter"];
const NUMBER_FIELDS = ["pasteRatio", "minReadSeconds", "maxReadSeconds"];
const LIST_FIELDS = ["customPhrases", "extraSendWords"];
const DAY_LABELS = ["Paz", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"];

let current = mergeSettings(null);

const $ = (id) => document.getElementById(id);

function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
}

function parseLines(value) {
  return [...new Set(value.split("\n").map((s) => s.trim()).filter(Boolean))];
}

async function save(partial) {
  current = await saveSettings(partial);
  renderRail();
  renderTest();
}

// ---------- rail ----------

function listedDetectors() {
  return DETECTORS.filter((d) => DETECTOR_GROUPS.some((g) => g.id === d.group));
}

function renderRail() {
  const listed = listedDetectors();
  $("rail-detectors").textContent = `${listed.filter((d) => current.detectors[d.id]).length}/${listed.length}`;
  $("rail-sites").textContent = current.disabledSites.length;
  const status = $("rail-status");
  status.innerHTML = "";
  if (current.enabled) status.append(el("span", "on", "Açık"), " · tüm sitelerde");
  else status.append(el("span", "off", "Kapalı"), " · hiçbir sitede çalışmıyor");
}

function watchSections() {
  const links = [...document.querySelectorAll(".rail a")];
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting) links.forEach((a) => a.classList.toggle("on", a.getAttribute("href") === `#${e.target.id}`));
    }
  }, { rootMargin: "-30% 0px -60% 0px" });
  document.querySelectorAll(".content section").forEach((s) => io.observe(s));
}

// ---------- detectors ----------

function renderDetectorGroups() {
  const wrap = $("detector-groups");
  wrap.innerHTML = "";
  for (const group of DETECTOR_GROUPS) {
    const box = el("div", "group");
    const head = el("h3");
    const counter = el("small");
    head.append(el("span", null, group.label), counter);
    box.append(head);

    const members = DETECTORS.filter((d) => d.group === group.id);
    const updateCounter = () => {
      counter.textContent = `${members.filter((d) => current.detectors[d.id]).length}/${members.length} açık`;
    };

    for (const d of members) {
      const row = el("div", "row");
      row.classList.toggle("off", !current.detectors[d.id]);

      const name = el("div", "name");
      name.append(el("span", `mk ${d.severity === "low" ? "low" : d.severity === "medium" ? "medium" : ""}`, d.mark), d.label);
      if (d.fixable) name.append(el("span", "fx", "tek tıkla düzeltilir"));
      if (d.severity === "low") name.append(el("span", "info", "sadece bilgi"));

      const toggle = el("label", "switch");
      const input = el("input");
      input.type = "checkbox";
      input.id = `det-${d.id}`;
      input.checked = current.detectors[d.id];
      input.setAttribute("aria-label", d.label);
      input.addEventListener("change", async () => {
        row.classList.toggle("off", !input.checked);
        await save({ detectors: { ...current.detectors, [d.id]: input.checked } });
        updateCounter();
      });
      toggle.append(input, el("span"));
      const ctl = el("div", "ctl");
      ctl.append(toggle);

      row.append(name, ctl, el("div", "desc", d.desc));
      if (d.why || d.examples) {
        const details = el("details");
        details.append(el("summary", null, d.examples ? "Neden ve örnek" : "Neden"));
        if (d.why) details.append(el("p", null, d.why));
        if (d.examples) details.append(el("div", "ex", visibleText(d.examples.catch[0]).replace(/ ↵ /g, "\n")));
        row.append(details);
      }
      box.append(row);
    }
    updateCounter();
    wrap.append(box);
  }
}

// ---------- sending ----------

function fillSendingForm() {
  for (const key of BOOL_FIELDS) $(`opt-${key}`).checked = current[key];
  $("opt-paste").checked = current.detectors.paste;
  for (const key of NUMBER_FIELDS) $(`opt-${key}`).value = current[key];
  for (const key of LIST_FIELDS) $(`opt-${key}`).value = current[key].join("\n");
}

function bindSendingForm() {
  for (const key of BOOL_FIELDS) {
    $(`opt-${key}`).addEventListener("change", (e) => save({ [key]: e.target.checked }));
  }
  $("opt-paste").addEventListener("change", (e) => save({ detectors: { ...current.detectors, paste: e.target.checked } }));
  for (const key of NUMBER_FIELDS) {
    $(`opt-${key}`).addEventListener("change", (e) => {
      const n = parseInt(e.target.value, 10);
      if (Number.isNaN(n) || n < 0) {
        e.target.value = current[key];
        return;
      }
      save({ [key]: n });
    });
  }
  for (const key of LIST_FIELDS) {
    $(`opt-${key}`).addEventListener("change", async (e) => {
      await save({ [key]: parseLines(e.target.value) });
      e.target.value = current[key].join("\n");
    });
  }
}

// ---------- sites ----------

function renderSites() {
  const wrap = $("sites");
  wrap.innerHTML = "";
  for (const site of current.disabledSites) {
    const chip = el("span", "site", site);
    const remove = el("button", null, "×");
    remove.type = "button";
    remove.setAttribute("aria-label", `${site} listeden çıkar`);
    remove.addEventListener("click", async () => {
      await save({ disabledSites: current.disabledSites.filter((s) => s !== site) });
      renderSites();
    });
    chip.append(remove);
    wrap.append(chip);
  }
}

$("add-site").addEventListener("submit", async (e) => {
  e.preventDefault();
  const input = $("site-input");
  const host = normalizeHost(input.value);
  input.value = "";
  if (!host || current.disabledSites.includes(host)) return;
  await save({ disabledSites: [...current.disabledSites, host] });
  renderSites();
});

// ---------- test sheet ----------

const escapeHtml = (s) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

function renderTest() {
  const input = $("test-input");
  const text = input.value;
  const layer = $("test-layer");
  const out = $("test-results");
  $("test-chars").textContent = `${text.length} karakter`;

  const issues = text.trim() ? analyzeText(text, current, { maxHits: 500 }) : [];

  // Highlights on the mirror layer, in text order, skipping any that overlap an earlier one.
  const marks = issues
    .flatMap((i) => i.hits.map((h) => ({ ...h, severity: i.severity })))
    .filter((h) => h.length > 0)
    .sort((a, b) => a.index - b.index);
  let html = "";
  let pos = 0;
  for (const m of marks) {
    if (m.index < pos) continue;
    html += escapeHtml(text.slice(pos, m.index)) + `<mark class="${m.severity}">${escapeHtml(text.slice(m.index, m.index + m.length))}</mark>`;
    pos = m.index + m.length;
  }
  layer.innerHTML = html + escapeHtml(text.slice(pos)) + "\n";

  out.innerHTML = "";
  if (!text.trim()) {
    out.append(el("p", "clean-sub", "Bir e-postayı ya da mesajı yapıştır; sorunlar burada, düzeltmen notları gibi listelenir."));
    return;
  }
  if (issues.length === 0) {
    out.append(el("p", "clean", "Temiz görünüyor."), el("p", "clean-sub", "İsimleri, tarihleri ve saatleri yine de bir kez oku."));
    return;
  }

  const blocking = issues.filter((i) => i.severity !== "low").length;
  out.append(el("p", "count", blocking ? `${blocking} sorun` : "Sadece bilgi"));
  for (const issue of issues) {
    const info = DETECTOR_INFO[issue.id] || {};
    const note = el("div", "note");
    const mark = el("span", `mk ${issue.severity === "high" ? "" : issue.severity}`, info.mark || "!");
    const title = el("div");
    title.append(el("b", null, issue.title));
    if (issue.count > 1) title.append(` (${issue.count})`);
    const sub = el("span", "sub");
    if (issue.hits[0] && issue.hits[0].note) {
      sub.textContent = issue.detail;
    } else {
      issue.hits.slice(0, 2).forEach((h, i) => {
        if (i) sub.append(" ");
        sub.append(el("code", null, visibleText(h.text)));
      });
    }
    note.append(mark, title, sub);
    out.append(note);
  }

  if (issues.some((i) => FIX_ORDER.includes(i.id))) {
    const btn = el("button", "btn primary fix-btn", "Düzeltilebilenleri düzelt");
    btn.type = "button";
    btn.addEventListener("click", () => {
      input.value = autoFixText(input.value, FIX_ORDER.filter((id) => current.detectors[id]));
      renderTest();
    });
    out.append(btn);
  }
}

function bindTest() {
  const input = $("test-input");
  const layer = $("test-layer");
  input.addEventListener("input", renderTest);
  input.addEventListener("scroll", () => { layer.scrollTop = input.scrollTop; });
  new ResizeObserver(() => { layer.style.height = `${input.offsetHeight}px`; }).observe(input);
}

// ---------- week ----------

async function renderWeek() {
  const stats = await getStats();
  const chart = $("week");
  chart.innerHTML = "";
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push({ key: todayKey(d), label: DAY_LABELS[d.getDay()] });
  }
  const max = Math.max(1, ...days.map((d) => (stats[d.key] || emptyDayStats()).blocked));
  let any = false;
  for (const day of days) {
    const s = stats[day.key] || emptyDayStats();
    const fixed = Math.min(s.fixed, s.blocked);
    const bypassed = Math.min(s.bypassed, s.blocked - fixed);
    const open = s.blocked - fixed - bypassed;
    if (s.blocked) any = true;

    const col = el("div", "day");
    col.append(el("span", "v", s.blocked ? String(s.blocked) : ""));
    const stack = el("div", "stack");
    stack.style.height = `${(s.blocked / max) * 100}%`;
    for (const [cls, n] of [["i-fixed", fixed], ["i-bypass", bypassed], ["i-open", open]]) {
      if (n <= 0) continue;
      const seg = el("i", cls);
      seg.style.flex = String(n);
      stack.append(seg);
    }
    col.append(stack, el("span", "d", day.label));
    chart.append(col);
  }
  $("week-empty").hidden = any;
}

// ---------- boot ----------

chrome.storage.onChanged.addListener((changes, area) => {
  if (isSettingsChange(changes, area)) {
    current = mergeSettings(changes.settings.newValue);
    renderRail();
  }
  if (area === "local" && changes.stats) renderWeek();
});

(async () => {
  current = await getSettings();
  renderRail();
  renderDetectorGroups();
  fillSendingForm();
  bindSendingForm();
  renderSites();
  bindTest();
  renderTest();
  renderWeek();
  watchSections();
})();
