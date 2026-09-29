const MAX_HISTORY_DAYS = 14;
const FIX_WINDOW_MS = 10 * 60 * 1000;

const DEFAULT_SETTINGS = {
  enabled: true,
  detectors: {
    header: true,
    placeholder: true,
    aiPhrase: true,
    markdown: true,
    glued: true,
    flattened: true,
    custom: true,
    paste: true
  },
  pasteRatio: 60,
  minReadSeconds: 10,
  maxReadSeconds: 60,
  requireConfirm: true,
  checkPlainEnter: false,
  disabledSites: [
    "chatgpt.com", "chat.openai.com", "claude.ai", "gemini.google.com",
    "copilot.microsoft.com", "perplexity.ai", "chat.deepseek.com", "poe.com"
  ],
  customPhrases: [],
  extraSendWords: []
};

const DETECTOR_INFO = {
  header: {
    label: "Başlık satırı gövdede",
    desc: "“Subject:”, “Konu:”, “Kime:” gibi satırlar mesajın içine yapışmış."
  },
  placeholder: {
    label: "Doldurulmamış yer tutucu",
    desc: "[saat aralığı], {isim}, <Adınız>, XX:XX gibi AI'ın senin doldurman için bıraktığı boşluklar."
  },
  aiPhrase: {
    label: "AI sohbet kalıbı",
    desc: "“İşte e-postanız:”, “Umarım yardımcı olur”, “Here's a draft” gibi AI'ın sana söylediği cümleler."
  },
  markdown: {
    label: "Markdown işaretleri",
    desc: "**kalın**, ## başlık, ``` gibi e-postada ham görünen işaretler."
  },
  glued: {
    label: "Yapışık kelimeler",
    desc: "“ederim.Saygılarımla”, “HakkındaSayın” gibi satır sonu kaybolunca birleşen kelimeler."
  },
  flattened: {
    label: "Paragraflar kaybolmuş",
    desc: "Selamlama/kapanış içeren uzun metin hiç satır sonu olmadan tek blok halinde."
  },
  custom: {
    label: "Kendi eklediğin ifadeler",
    desc: "Ayarlarda yasakladığın kelime ve ifadeler."
  },
  paste: {
    label: "Hızlı yapıştır-gönder",
    desc: "Metnin çoğu yapıştırılmış ve okumaya yetecek süre geçmeden gönderiliyor."
  }
};

const SEVERITY_ORDER = { high: 0, medium: 1, low: 2 };

const AI_PHRASES = [
  "işte e-posta", "işte e-postanız", "işte e-postan", "işte mail", "işte mesaj", "işte mesajınız",
  "işte düzenlenmiş", "işte revize", "işte daha resmi", "işte daha kısa", "işte size",
  "umarım yardımcı olur", "umarım bu yardımcı olur", "umarım işine yarar",
  "başka bir konuda yardım", "başka bir şeye ihtiyacın", "başka bir şeye ihtiyacınız",
  "bir yapay zeka olarak", "bir yapay zekâ olarak", "yapay zeka dil modeli",
  "daha resmi bir versiyon", "daha samimi bir versiyon", "daha kısa bir versiyon",
  "kendi bilgilerinle", "kendi bilgilerinizle", "gerekirse düzenleyebilirsin", "gerekirse düzenleyebilirsiniz",
  "köşeli parantez", "e-posta taslağı", "mail taslağı", "konu satırı",
  "here is the email", "here's the email", "here is your email", "here's your email",
  "here is a draft", "here's a draft", "here is a revised", "here's a revised",
  "here is a polished", "here's a polished", "i hope this helps", "hope this helps",
  "as an ai", "as a language model", "let me know if you'd like", "let me know if you want",
  "feel free to adjust", "feel free to customize", "subject line", "revised version", "polished version"
];

const OPENER_RE = /^\s*(?:(?:tabii|tabi|elbette|kesinlikle|harika|sure|certainly|of course|absolutely)[^\n]{0,20}?)?(?:işte|here is|here's|here are)[^\n]{0,80}:\s*$/u;

const PLACEHOLDER_WORDS = [
  "adınız soyadınız", "adınız ve soyadınız", "ad soyad", "isminiz", "öğrenci numaranız",
  "your name", "your company", "company name", "insert name", "insert date",
  "buraya ekle", "buraya yaz", "buraya yazın",
  "(isim)", "(ad)", "(adınız)", "(soyad)", "(tarih)", "(saat)", "(numara)", "(name)", "(date)"
];

const GREETING_MARKERS = [
  "saygılarımla", "iyi günler", "iyi çalışmalar", "teşekkür ederim", "sayın", "merhaba", "hocam",
  "regards", "sincerely", "dear", "thank you"
];

const ABBREVIATIONS = new Set([
  "dr", "prof", "doç", "doc", "öğr", "ogr", "arş", "ars", "gör", "gor", "yrd", "uzm", "av", "müh", "muh",
  "sn", "st", "mr", "mrs", "ms", "no", "vb", "vs", "bkz", "örn", "orn", "mah", "cad", "sok", "apt",
  "inc", "ltd", "co", "jr", "sr", "etc"
]);

const CAMEL_ALLOWLIST = new Set([
  "whatsapp", "powerpoint", "sharepoint", "soundcloud", "blackberry", "linkedin", "javascript",
  "typescript", "playstation", "mastercard", "wordpress", "photoshop", "coursera"
]);

const SEND_WORDS = [
  "gönder", "yanıtla", "yanıt gönder", "cevapla", "ilet", "paylaş", "yayınla",
  "send", "reply", "post", "submit", "forward", "tweet"
];

const CANCEL_WORDS = [
  "iptal", "vazgeç", "sil", "kapat", "taslak", "önizle", "önizleme",
  "cancel", "delete", "discard", "close", "draft", "preview"
];

function todayKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// Turkish-aware case folding that keeps string length, so match indexes map back to the original.
function fold(s) {
  return s.replace(/[İIı]/g, "i").toLowerCase();
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function phraseRegex(phrases, flags = "gu") {
  const parts = phrases.map((p) => fold(String(p).trim())).filter(Boolean).map(escapeRe);
  if (parts.length === 0) return null;
  return new RegExp(`(?<![\\p{L}\\p{N}])(?:${parts.join("|")})(?![\\p{L}\\p{N}])`, flags);
}

function collectHits(re, text) {
  if (!re) return [];
  return [...text.matchAll(re)].map((m) => ({ index: m.index, length: m[0].length }));
}

function dedupeHits(hits) {
  const sorted = [...hits].sort((a, b) => a.index - b.index);
  const out = [];
  let end = -1;
  for (const h of sorted) {
    if (h.index < end) continue;
    out.push(h);
    end = h.index + h.length;
  }
  return out;
}

function detectHeader(text) {
  return [
    ...collectHits(/(?<![\p{L}\p{N}])subject\s*:/giu, text),
    ...collectHits(/^[ \t]*(?:konu|başlık|kime|kimden|to|from|cc|bcc)[ \t]*:/gimu, text)
  ];
}

function detectPlaceholders(text, folded) {
  return [
    ...collectHits(/\[(?!\d+\])[^[\]\n]{2,60}\](?!\()/gu, text),
    ...collectHits(/\{\{?[^{}\n]{1,40}\}\}?/gu, text),
    ...collectHits(/<(?![^<>\n]*[@/=])\p{L}[^<>\n]{1,40}>/gu, text),
    ...collectHits(/(?<![\p{L}\p{N}])[Xx]{3,}(?![\p{L}\p{N}])/gu, text),
    ...collectHits(/(?<![\p{L}\p{N}])[Xx]{1,2}[:.][Xx]{2}(?:\.[Xx]{2,4})?(?![\p{L}\p{N}])/gu, text),
    ...collectHits(/_{3,}/g, text),
    ...collectHits(phraseRegex(PLACEHOLDER_WORDS), folded)
  ];
}

function detectAiPhrases(text, folded) {
  const hits = collectHits(phraseRegex(AI_PHRASES), folded);
  const firstLine = folded.split("\n")[0];
  if (firstLine.length <= 140 && OPENER_RE.test(firstLine)) {
    hits.push({ index: 0, length: firstLine.length });
  }
  return hits;
}

function detectMarkdown(text) {
  return [
    ...collectHits(/\*\*[^*\n]{1,80}\*\*/g, text),
    ...collectHits(/^[ \t]*#{1,6}[ \t]+\S/gm, text),
    ...collectHits(/```/g, text)
  ];
}

function detectGlued(text, folded) {
  const hits = [];

  // "ederim.Saygılarımla", "(2022…).Tam", "Saygılarımla,Umutcan"
  for (const m of text.matchAll(/(\p{L}+|\d+|\))([.!?;:,])(\p{Lu}\p{Ll})/gu)) {
    const prev = m[1];
    if (/^\p{L}+$/u.test(prev) && (ABBREVIATIONS.has(fold(prev)) || prev.length === 1)) continue;
    if (/^\p{Lu}+$/u.test(prev)) continue;
    const back = Math.min(prev.length, 12);
    const start = m.index + prev.length - back;
    const wordEnd = text.slice(m.index + m[0].length).search(/[^\p{L}]/u);
    const tail = wordEnd === -1 ? text.length - (m.index + m[0].length) : wordEnd;
    hits.push({ index: start, length: back + 1 + 2 + tail });
  }

  // "HakkındaSayın"
  for (const m of text.matchAll(/(\p{Ll}{4,})(\p{Lu}\p{Ll}{2,})/gu)) {
    const before = text.slice(0, m.index).match(/\p{L}*$/u)[0];
    const word = before + m[0];
    if (CAMEL_ALLOWLIST.has(fold(word))) continue;
    hits.push({ index: m.index - before.length, length: word.length });
  }

  // "Algan20220205023", "20220205023Bilişim"
  hits.push(...collectHits(/\p{L}{3,}\d{5,}|\d{5,}\p{Lu}\p{Ll}{2,}/gu, text));
  return hits;
}

function detectFlattened(text, folded) {
  const trimmed = text.trim();
  if (trimmed.length < 300 || trimmed.includes("\n")) return [];
  const markers = collectHits(phraseRegex(GREETING_MARKERS), folded);
  if (markers.length === 0) return [];
  const mid = markers.find((h) => h.index > 20) || markers[0];
  return [mid];
}

function analyzeText(text, settings, opts = {}) {
  const det = settings.detectors;
  const folded = fold(text);
  const issues = [];

  const add = (id, severity, title, detail, hits) => {
    const unique = dedupeHits(hits);
    if (unique.length === 0) return;
    issues.push({
      id,
      severity,
      title,
      detail,
      count: unique.length,
      hits: unique.slice(0, 5).map((h) => ({ ...h, text: text.slice(h.index, h.index + h.length) }))
    });
  };

  if (det.header && !opts.singleLine) {
    add("header", "high", "Başlık satırı mesajın içinde",
      "“Subject:/Konu:” gibi satırlar AI çıktısından gövdeye taşınmış. Konu ayrı alana yazılmalı.",
      detectHeader(text));
  }
  if (det.placeholder) {
    add("placeholder", "high", "Doldurulmamış yer tutucu",
      "AI'ın senin doldurman için bıraktığı boşluklar olduğu gibi duruyor.",
      detectPlaceholders(text, folded));
  }
  if (det.aiPhrase) {
    add("aiPhrase", "high", "AI'ın sana yazdığı cümleler",
      "Bu ifadeler karşı tarafa değil, AI'dan sana hitap ediyor.",
      detectAiPhrases(text, folded));
  }
  if (det.markdown) {
    add("markdown", "medium", "Markdown işaretleri",
      "E-postada ** veya ## işaretleri ham karakter olarak görünür.",
      detectMarkdown(text));
  }
  if (det.glued && !opts.singleLine) {
    const hits = dedupeHits(detectGlued(text, folded));
    add("glued", hits.length >= 2 ? "high" : "medium", "Yapışık kelimeler",
      "Satır sonları kaybolunca cümleler ve kelimeler birbirine yapışmış.",
      hits);
  }
  if (det.flattened && !opts.singleLine) {
    add("flattened", "high", "Paragraflar kaybolmuş",
      "Uzun mesaj tek satır halinde; selamlama, gövde ve imza birbirine girmiş.",
      detectFlattened(text, folded));
  }
  if (det.custom && settings.customPhrases.length > 0) {
    add("custom", "high", "Yasakladığın ifade",
      "Ayarlarda eklediğin bir ifade metinde geçiyor.",
      collectHits(phraseRegex(settings.customPhrases), folded));
  }

  return issues.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}

function computeReadSeconds(text, settings) {
  const words = text.split(/\s+/).filter(Boolean).length;
  const sec = Math.ceil(words / 4);
  return Math.min(settings.maxReadSeconds, Math.max(settings.minReadSeconds, sec));
}

function normalizeHost(s) {
  return String(s).trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
}

function isSiteDisabled(settings, hostname) {
  const h = normalizeHost(hostname || "");
  if (!h) return false;
  return settings.disabledSites.some((site) => h === site || h.endsWith("." + site));
}

function mergeSettings(raw) {
  const s = raw || {};
  const list = (v, fallback) => (Array.isArray(v) ? v : fallback);
  return {
    ...DEFAULT_SETTINGS,
    ...s,
    detectors: { ...DEFAULT_SETTINGS.detectors, ...(s.detectors || {}) },
    disabledSites: list(s.disabledSites, DEFAULT_SETTINGS.disabledSites),
    customPhrases: list(s.customPhrases, []),
    extraSendWords: list(s.extraSendWords, [])
  };
}

async function getSettings() {
  const { settings } = await chrome.storage.local.get("settings");
  return mergeSettings(settings);
}

async function saveSettings(partial) {
  const next = mergeSettings({ ...(await getSettings()), ...partial });
  await chrome.storage.local.set({ settings: next });
  return next;
}

function emptyDayStats() {
  return { checked: 0, blocked: 0, fixed: 0, bypassed: 0, detectors: {} };
}

function pruneDateKeyed(obj) {
  const keys = Object.keys(obj).sort();
  while (keys.length > MAX_HISTORY_DAYS) {
    delete obj[keys.shift()];
  }
  return obj;
}

async function getStats() {
  const { stats } = await chrome.storage.local.get("stats");
  return stats || {};
}

async function recordStats(delta, detectorIds = []) {
  const stats = await getStats();
  const day = todayKey();
  const d = stats[day] || (stats[day] = emptyDayStats());
  for (const [k, v] of Object.entries(delta)) d[k] = (d[k] || 0) + v;
  for (const id of detectorIds) d.detectors[id] = (d.detectors[id] || 0) + 1;
  pruneDateKeyed(stats);
  await chrome.storage.local.set({ stats });
}
