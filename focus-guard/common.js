const MAX_HISTORY_DAYS = 14;
const TICK_ALARM = "focus-guard-tick";
const FOCUS_END_ALARM = "focus-guard-focus-end";
const MAX_GAP_MS = 5 * 60 * 1000;
const WARN_THRESHOLD_SEC = 5 * 60;

const DAY_OPTIONS = [
  { label: "Pzt", value: 1 },
  { label: "Sal", value: 2 },
  { label: "Çar", value: 3 },
  { label: "Per", value: 4 },
  { label: "Cum", value: 5 },
  { label: "Cmt", value: 6 },
  { label: "Paz", value: 0 }
];

function todayKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getHostname(url) {
  try {
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function newId(prefix) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

function normalizeRule(rule) {
  if (typeof rule === "number") return { minutes: rule, days: [], start: "", end: "" };
  return {
    minutes: rule.minutes,
    days: Array.isArray(rule.days) ? rule.days : [],
    start: rule.start || "",
    end: rule.end || ""
  };
}

async function getStore() {
  const data = await chrome.storage.local.get([
    "trackState", "usage", "limits", "categories", "bonus", "warned", "focusSession"
  ]);
  const limits = {};
  for (const [domain, rule] of Object.entries(data.limits || {})) {
    limits[domain] = normalizeRule(rule);
  }
  const categories = {};
  for (const [id, cat] of Object.entries(data.categories || {})) {
    categories[id] = { name: cat.name, domains: cat.domains || [], ...normalizeRule(cat) };
  }
  return {
    trackState: data.trackState || { lastTickTs: Date.now(), activeDomain: null, activeTabId: null, tracking: false },
    usage: data.usage || {},
    limits,
    categories,
    bonus: data.bonus || {},
    warned: data.warned || {},
    focusSession: data.focusSession || { active: false, endTs: null, allowlist: [] }
  };
}

async function setStore(partial) {
  await chrome.storage.local.set(partial);
}

function pruneDateKeyed(obj) {
  const keys = Object.keys(obj).sort();
  while (keys.length > MAX_HISTORY_DAYS) {
    delete obj[keys.shift()];
  }
  return obj;
}

function isScheduleActive(rule, now = new Date()) {
  const days = rule.days || [];
  if (days.length > 0 && !days.includes(now.getDay())) return false;
  if (rule.start && rule.end) {
    const cur = now.getHours() * 60 + now.getMinutes();
    const [sh, sm] = rule.start.split(":").map(Number);
    const [eh, em] = rule.end.split(":").map(Number);
    const startM = sh * 60 + sm;
    const endM = eh * 60 + em;
    if (startM <= endM) {
      if (cur < startM || cur >= endM) return false;
    } else if (cur < startM && cur >= endM) {
      return false;
    }
  }
  return true;
}

function summarizeSchedule(rule) {
  const parts = [];
  if (rule.days && rule.days.length > 0) {
    const order = DAY_OPTIONS.map((d) => d.value);
    parts.push(
      order
        .filter((v) => rule.days.includes(v))
        .map((v) => DAY_OPTIONS.find((d) => d.value === v).label)
        .join("/")
    );
  }
  if (rule.start && rule.end) parts.push(`${rule.start}-${rule.end}`);
  return parts.length > 0 ? parts.join(" · ") : "Her zaman";
}

function categoryUsageSeconds(usage, day, domains) {
  const dayUsage = usage[day] || {};
  return domains.reduce((sum, d) => sum + (dayUsage[d] || 0), 0);
}

function getRulesForDomain(limits, categories, domain) {
  const rules = [];
  if (limits[domain]) {
    rules.push({ key: `d:${domain}`, label: domain, kind: "domain", domain, ...limits[domain] });
  }
  for (const [id, cat] of Object.entries(categories)) {
    if (cat.domains.includes(domain)) {
      rules.push({ key: `c:${id}`, label: cat.name, kind: "category", categoryId: id, domains: cat.domains, ...cat });
    }
  }
  return rules;
}

function evaluateDomain(store, domain, now = new Date()) {
  const day = todayKey(now);
  const rules = getRulesForDomain(store.limits, store.categories, domain);
  let worst = null;

  for (const rule of rules) {
    if (!isScheduleActive(rule, now)) continue;
    const bonusMin = (store.bonus[day] && store.bonus[day][rule.key]) || 0;
    const limitSec = (rule.minutes + bonusMin) * 60;
    const usedSec = rule.kind === "category"
      ? categoryUsageSeconds(store.usage, day, rule.domains)
      : (store.usage[day] && store.usage[day][domain]) || 0;
    const remaining = limitSec - usedSec;
    if (!worst || remaining < worst.remaining) {
      worst = { ...rule, day, limitSec, usedSec, remaining };
    }
  }
  return worst;
}

function isFocusBlocked(focusSession, domain, now = new Date()) {
  if (!focusSession.active) return false;
  if (focusSession.endTs && now.getTime() >= focusSession.endTs) return false;
  return !(focusSession.allowlist || []).includes(domain);
}
