// Top-level names use `var` so background.js can re-inject this file into a tab that already has it
// (a second `const` declaration in the same content-script world would throw and abort the script).
var MAX_HISTORY_DAYS = 14;
var FIX_WINDOW_MS = 10 * 60 * 1000;

// ---------- word lists ----------

var AI_PHRASES = [
  // Turkish: the assistant talking to the user, not the user talking to the recipient
  "işte e-posta", "işte e-postanız", "işte e-postan", "işte mail", "işte mailiniz", "işte mesaj", "işte mesajınız",
  "işte düzenlenmiş", "işte revize", "işte daha resmi", "işte daha kısa", "işte daha samimi", "işte size",
  "işte önerim", "işte bir örnek", "işte taslak",
  "umarım yardımcı olur", "umarım bu yardımcı olur", "umarım işine yarar", "umarım işinize yarar",
  "başka bir konuda yardım", "başka bir şeye ihtiyacın", "başka bir şeye ihtiyacınız",
  "bir yapay zeka olarak", "bir yapay zekâ olarak", "yapay zeka dil modeli", "bir dil modeli olarak",
  "daha resmi bir versiyon", "daha samimi bir versiyon", "daha kısa bir versiyon", "daha uzun bir versiyon",
  "daha resmi bir ton", "farklı bir ton", "versiyonunu da hazırlayabilirim",
  "hazırlamamı ister", "yazmamı ister", "düzenlememi ister", "kısaltmamı ister",
  "kendi bilgilerinle", "kendi bilgilerinizle", "kendi durumuna göre", "kendi durumunuza göre",
  "gerekirse düzenleyebilirsin", "gerekirse düzenleyebilirsiniz", "ihtiyacına göre düzenle", "ihtiyacınıza göre düzenle",
  "köşeli parantez", "e-posta taslağı", "mail taslağı", "konu satırı", "konu önerisi",
  // English
  "here is the email", "here's the email", "here is your email", "here's your email",
  "here is a draft", "here's a draft", "here is a revised", "here's a revised",
  "here is a polished", "here's a polished", "here is a more", "here's a more",
  "i hope this helps", "hope this helps", "as an ai", "as a language model",
  "let me know if you'd like", "let me know if you want", "let me know if you need",
  "would you like me to", "want me to make", "i can also make", "i can also write",
  "feel free to adjust", "feel free to customize", "feel free to modify", "feel free to tweak",
  "subject line", "revised version", "polished version", "more formal version", "more casual version"
];

var OPENER_RE = /^\s*(?:(?:tabii|tabi|elbette|kesinlikle|harika|memnuniyetle|sure|certainly|of course|absolutely|great)[^\n]{0,20}?)?(?:işte|here is|here's|here are|aşağıda)[^\n]{0,80}:\s*$/u;

var PLACEHOLDER_WORDS = [
  "adınız soyadınız", "adınız ve soyadınız", "ad soyad", "isminiz", "öğrenci numaranız", "numaranız",
  "your name", "your company", "company name", "recipient name", "insert name", "insert date",
  "buraya ekle", "buraya yaz", "buraya yazın", "buraya ekleyin", "buraya girin",
  "(isim)", "(ad)", "(adınız)", "(soyad)", "(tarih)", "(saat)", "(numara)", "(name)", "(date)"
];

var GREETING_MARKERS = [
  "saygılarımla", "iyi günler", "iyi çalışmalar", "teşekkür ederim", "sayın", "merhaba", "hocam",
  "regards", "sincerely", "dear", "thank you"
];

var CLOSING_LINES = ["saygılarımla", "iyi çalışmalar", "sevgilerimle", "best regards", "kind regards", "sincerely", "regards"];
var OPENING_LINES = ["sayın", "dear"];

var NOTE_EDIT_WORDS = [
  "düzenle", "değiştir", "uyarla", "ekleyebilir", "çıkarabilir", "kişiselleştir", "güncelle",
  "kendi", "istersen", "isterseniz", "customize", "adjust", "replace", "tailor", "personalize",
  "modify", "tweak", "if you", "you can", "you may"
];

var ABBREVIATIONS = new Set([
  "dr", "prof", "doç", "doc", "öğr", "ogr", "arş", "ars", "gör", "gor", "yrd", "uzm", "av", "müh", "muh",
  "sn", "st", "mr", "mrs", "ms", "no", "vb", "vs", "bkz", "örn", "orn", "mah", "cad", "sok", "apt",
  "inc", "ltd", "co", "jr", "sr", "etc"
]);

var CAMEL_ALLOWLIST = new Set([
  "whatsapp", "powerpoint", "sharepoint", "soundcloud", "blackberry", "linkedin", "javascript",
  "typescript", "playstation", "mastercard", "wordpress", "photoshop", "coursera"
]);

var SEND_WORDS = [
  "gönder", "yanıtla", "yanıt gönder", "cevapla", "ilet", "paylaş", "yayınla", "yorum yap", "yorumla",
  "send", "reply", "post", "submit", "forward", "tweet", "comment"
];

var CANCEL_WORDS = [
  "iptal", "vazgeç", "sil", "kapat", "taslak", "önizle", "önizleme",
  "cancel", "delete", "discard", "close", "draft", "preview"
];

// Month and weekday names, keyed by their fold()ed spelling (so "Salı", "SALI" and "sali" all match).
var MONTHS = {
  ocak: 1, şubat: 2, mart: 3, nisan: 4, mayis: 5, haziran: 6, temmuz: 7, ağustos: 8, eylül: 9, ekim: 10, kasim: 11, aralik: 12,
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12
};
var WEEKDAYS = {
  pazar: 0, pazartesi: 1, sali: 2, çarşamba: 3, perşembe: 4, cuma: 5, cumartesi: 6,
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6
};
var WEEKDAY_NAMES_TR = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"];

var INVISIBLE_RE = /[\u200B-\u200D\u2060\uFEFF\u00AD\u202A-\u202E\u2066-\u2069]/gu;

// ---------- detector implementations ----------

function detectHeader({ text }) {
  return [
    ...collectHits(/(?<![\p{L}\p{N}])subject\s*:/giu, text),
    ...collectHits(/^[ \t]*(?:konu|başlık|kime|kimden|to|from|cc|bcc)[ \t]*:/gimu, text)
  ];
}

function detectPlaceholders({ text, folded }) {
  return [
    ...collectHits(/\[(?!\d+\])(?!cite)[^[\]\n]{2,60}\](?!\()/gu, text),
    ...collectHits(/\{\{?[^{}\n]{1,40}\}\}?/gu, text),
    ...collectHits(/<(?![^<>\n]*[@/=])\p{L}[^<>\n]{1,40}>/gu, text),
    ...collectHits(/(?<![\p{L}\p{N}])[Xx]{3,}(?![\p{L}\p{N}])/gu, text),
    ...collectHits(/(?<![\p{L}\p{N}])[Xx]{1,2}[:.][Xx]{2}(?:\.[Xx]{2,4})?(?![\p{L}\p{N}])/gu, text),
    ...collectHits(/_{3,}/g, text),
    ...collectHits(phraseRegex(PLACEHOLDER_WORDS), folded),
    // "Sayın ," / "Dear ,": the name that should follow was never filled in
    ...collectHits(/(?<![\p{L}\p{N}])(?:sayin|dear)[ \t]*[,.:]/gu, folded),
    // "(buraya ders adını yaz)", "(insert date here)": instructions left in parentheses
    ...collectHits(/\((?=[^()\n]{0,60}(?:buraya|yazın|yaz\)|ekleyin|girin|insert|add your|fill in))[^()\n]{2,60}\)/gu, folded)
  ];
}

function detectAiPhrases({ folded }) {
  const hits = collectHits(phraseRegex(AI_PHRASES), folded);
  const firstLine = folded.split("\n")[0];
  if (firstLine.length <= 140 && OPENER_RE.test(firstLine)) {
    hits.push({ index: 0, length: firstLine.length });
  }
  return hits;
}

function detectVersions({ folded }) {
  return [
    ...collectHits(/^[ \t]*(?:\*\*)?(?:seçenek|versiyon|alternatif|varyasyon|taslak|option|version|variant|draft)[ \t]*(?:\d{1,2}|[a-c]|bir|iki|üç|one|two|three)?[ \t]*(?:\*\*)?[ \t]*[:)–-](?![\d])/gimu, folded),
    ...collectHits(/^[ \t]*(?:\*\*)?(?:daha[ \t]+)?(?:kisa|uzun|resmi|samimi|formal|casual|short|long)[ \t]+(?:versiyon|sürüm|version)[ \t]*(?:\*\*)?[ \t]*:/gimu, folded)
  ];
}

function detectAiNote({ folded }) {
  const hits = [];
  for (const m of folded.matchAll(/^[ \t]*(?:\*\*)?(?:not|note|ipucu|tip|öneri|p\.?s\.?)(?:\*\*)?[ \t]*:[^\n]*/gimu)) {
    if (NOTE_EDIT_WORDS.some((w) => m[0].includes(w))) hits.push({ index: m.index, length: m[0].length });
  }
  return hits;
}

function detectDuplicate({ text, folded }) {
  const hits = [];
  const seen = new Map();
  for (const m of folded.matchAll(/[^.!?\n]{40,}[.!?]?/gu)) {
    const key = m[0].replace(/\s+/g, " ").trim();
    if (key.length < 40) continue;
    if (seen.has(key)) hits.push({ index: m.index, length: m[0].length });
    else seen.set(key, m.index);
  }
  for (const words of [CLOSING_LINES, OPENING_LINES]) {
    const re = new RegExp(`^[ \\t]*(?:${words.map((w) => escapeRe(fold(w))).join("|")})(?![\\p{L}])`, "gimu");
    const lines = collectHits(re, folded);
    if (lines.length >= 2) hits.push(...lines.slice(1));
  }
  return hits;
}

function detectAiArtifact({ text }) {
  return [
    ...collectHits(/:?contentReference\[oaicite:\d+\](?:\{index=\d+\})?/g, text),
    ...collectHits(/oaicite:\d+/g, text),
    ...collectHits(/(?:cite)?(?:turn\d+(?:search|news|view|fetch|file|image)\d+)+/g, text),
    ...collectHits(/【[^】\n]{0,40}†[^】\n]{0,40}】/gu, text),
    ...collectHits(/[?&]utm_source=(?:chatgpt\.com|openai(?:\.com)?|perplexity(?:\.ai)?|copilot[^&\s)]*)/gi, text),
    ...collectHits(/\[cite(?:_start|_end|:\s*[\d,\s]+)\]/gi, text)
  ];
}

function detectInvisible({ text }) {
  const hits = [];
  for (const m of text.matchAll(INVISIBLE_RE)) {
    // A zero-width joiner between emoji is part of the emoji (👨‍👩‍👧), not a leftover.
    if (m[0] === "\u200D" && /\p{Extended_Pictographic}/u.test(text.slice(Math.max(0, m.index - 2), m.index))) continue;
    hits.push({ index: m.index, length: 1 });
  }
  return hits;
}

function checkDate(day, month, year, weekday, now) {
  const years = year ? [year] : [now.getFullYear(), now.getFullYear() + 1];
  let first = null;
  for (const y of years) {
    const d = new Date(y, month - 1, day);
    if (d.getMonth() !== month - 1) return `${day}.${month} diye bir tarih yok.`;
    if (weekday === undefined || d.getDay() === weekday) return null;
    if (!first) first = { d, y };
  }
  return `${day}.${String(month).padStart(2, "0")}.${first.y} ${WEEKDAY_NAMES_TR[first.d.getDay()]} gününe denk geliyor, metinde ${WEEKDAY_NAMES_TR[weekday]} yazıyor.`;
}

function detectDateMismatch({ folded, now }) {
  const month = Object.keys(MONTHS).join("|");
  const weekday = Object.keys(WEEKDAYS).sort((a, b) => b.length - a.length).join("|");
  const B = "(?<![\\p{L}\\p{N}])";
  const E = "(?![\\p{L}])";
  const patterns = [
    // 29 Eylül 2026 Salı / 29 Eylül Salı
    { re: `${B}(\\d{1,2})[ .]+(${month})${E}(?:[ ,]+(\\d{4}))?[ ,]+(${weekday})${E}`, map: (m) => [m[1], MONTHS[m[2]], m[3], m[4]] },
    // Salı, 29 Eylül 2026
    { re: `${B}(${weekday})[ ,]+(\\d{1,2})[ .]+(${month})${E}(?:[ ,]+(\\d{4}))?`, map: (m) => [m[2], MONTHS[m[3]], m[4], m[1]] },
    // Tuesday, September 29, 2026
    { re: `${B}(${weekday}),?[ ]+(${month})[ ]+(\\d{1,2})(?:st|nd|rd|th)?(?:,?[ ]+(\\d{4}))?`, map: (m) => [m[3], MONTHS[m[2]], m[4], m[1]] },
    // 29.09.2026 Salı
    { re: `${B}(\\d{1,2})[./](\\d{1,2})[./](\\d{4})[ ,]+(${weekday})${E}`, map: (m) => [m[1], Number(m[2]), m[3], m[4]] },
    // 31 Şubat (no weekday: only impossible dates)
    { re: `${B}(\\d{1,2})[ .]+(${month})${E}`, map: (m) => [m[1], MONTHS[m[2]], undefined, undefined] }
  ];
  const hits = [];
  for (const { re, map } of patterns) {
    for (const m of folded.matchAll(new RegExp(re, "gu"))) {
      const [d, mo, y, wd] = map(m);
      if (!mo || mo > 12) continue;
      const note = checkDate(Number(d), mo, y ? Number(y) : undefined, wd === undefined ? undefined : WEEKDAYS[wd], now);
      if (note) hits.push({ index: m.index, length: m[0].length, note });
    }
  }
  return hits;
}

function detectTimeRange({ text }) {
  const hits = [];
  const minutes = (h, m) => Number(h) * 60 + Number(m);
  const valid = (h, m) => (Number(h) < 24 && Number(m) < 60) || (Number(h) === 24 && Number(m) === 0);
  for (const m of text.matchAll(/(?<![\d.:])(\d{1,2})[.:](\d{2})\s*[-–\u2014]\s*(\d{1,2})[.:](\d{2})(?![\d.:])(?!\s*(?:tl|₺|\$|€|usd|eur|%|puan|gpa))/giu)) {
    const [, h1, m1, h2, m2] = m;
    let note = null;
    if (!valid(h1, m1) || !valid(h2, m2)) note = "Geçersiz saat.";
    else {
      const start = minutes(h1, m1);
      const end = minutes(h2, m2);
      // 22.00-01.00 crosses midnight; 17.00-14.00 is simply backwards
      if (end <= start && start - end <= 8 * 60) note = "Bitiş saati başlangıçtan önce.";
    }
    if (note) hits.push({ index: m.index, length: m[0].length, note });
  }
  for (const m of text.matchAll(/(?<![\d.:])(\d{1,2}):(\d{2})(?![\d:])/g)) {
    if (!valid(m[1], m[2])) hits.push({ index: m.index, length: m[0].length, note: "Geçersiz saat." });
  }
  return hits;
}

function detectMarkdown({ text }) {
  return [
    ...collectHits(/\*\*[^*\n]{1,80}\*\*/g, text),
    ...collectHits(/^[ \t]*#{1,6}[ \t]+\S/gm, text),
    ...collectHits(/```/g, text),
    ...collectHits(/\[[^\]\n]{1,80}\]\(https?:\/\/[^)\s]+\)/g, text),
    ...collectHits(/^[ \t]*\|?[ \t]*:?-{3,}:?[ \t]*\|[ \t:|-]*$/gm, text),
    ...collectHits(/(?<!`)`[^`\n]{1,40}`(?!`)/g, text)
  ];
}

function detectEmojiBullets({ text }) {
  const lines = collectHits(/^[ \t]*\p{Extended_Pictographic}\uFE0F?[ \t]+\S/gmu, text);
  return lines.length >= 2 ? lines : [];
}

function detectTypography({ text }) {
  const dashes = collectHits(/\u2014/g, text);
  return dashes.length >= 2 ? dashes : [];
}

function detectGlued({ text }) {
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
    const cut = m.index + prev.length + 1;
    hits.push({ index: start, length: back + 1 + 2 + tail, cut, kind: m[2] === "," ? "comma" : "punct" });
  }

  // "HakkındaSayın"
  for (const m of text.matchAll(/(\p{Ll}{4,})(\p{Lu}\p{Ll}{2,})/gu)) {
    const before = text.slice(0, m.index).match(/\p{L}*$/u)[0];
    const word = before + m[0];
    if (CAMEL_ALLOWLIST.has(fold(word))) continue;
    hits.push({ index: m.index - before.length, length: word.length, cut: m.index + m[1].length, kind: "camel" });
  }

  // "Algan20220205023", "20220205023Bilişim"
  for (const m of text.matchAll(/\p{L}{3,}(?=\d{5,})/gu)) {
    const cut = m.index + m[0].length;
    const digits = text.slice(cut).match(/^\d+/)[0];
    hits.push({ index: m.index, length: m[0].length + digits.length, cut, kind: "digit" });
  }
  for (const m of text.matchAll(/\d{5,}(?=\p{Lu}\p{Ll}{2,})/gu)) {
    const cut = m.index + m[0].length;
    const word = text.slice(cut).match(/^\p{L}+/u)[0];
    hits.push({ index: m.index, length: m[0].length + word.length, cut, kind: "digit" });
  }
  return hits;
}

function detectFlattened({ text, folded }) {
  const trimmed = text.trim();
  if (trimmed.length < 300 || trimmed.includes("\n")) return [];
  const markers = collectHits(phraseRegex(GREETING_MARKERS), folded);
  if (markers.length === 0) return [];
  const mid = markers.find((h) => h.index > 20) || markers[0];
  return [mid];
}

function detectCustom({ folded, settings }) {
  return collectHits(phraseRegex(settings.customPhrases), folded);
}

// ---------- detector registry ----------
//
// Every check lives here with everything the UI and the tests need. `examples.catch` must trigger
// the detector and `examples.pass` must not; tests/sendry/unit/registry.test.js runs all of them,
// so a new rule can't ship without proof of what it catches and what it leaves alone.
//
//   severity  "high" | "medium" block the send; "low" is shown only when something else blocks.
//   bodyOnly  skipped for single-line inputs such as a subject field.
//   covers    ids whose hits inside this detector's hits are dropped, so one problem shows once.
//   group     where the options page lists it (see DETECTOR_GROUPS).
//   mark      the proofreader's mark shown next to it: ꝺ delete, # add space, ¶ new paragraph,
//             ? fill in, ! check the fact.

var FLAT_EXAMPLE =
  "Sayın Hocam, bu dönem yarı zamanlı çalıştığım için salı günleri derse katılamayacağım. " +
  "Duyurunuzda cuma öğleden sonra odanıza gelinebileceğini belirtmiştiniz. " +
  "Uygun görürseniz cuma günü saat on ikide ofisinize gelmek isterim. " +
  "Bu saat uygun değilse belirleyeceğiniz başka bir zamana da uyum sağlayabilirim. " +
  "Saygılarımla, Umut";

var DETECTORS = [
  {
    id: "aiArtifact",
    group: "ai",
    mark: "ꝺ",
    label: "AI kaynak kalıntıları",
    desc: "ChatGPT/Gemini'nin metne gömdüğü kaynak işaretleri ve takip parametreleri.",
    why: "Karşı tarafta anlamsız kod parçaları olarak görünür ve metnin doğrudan AI'dan kopyalandığını ele verir.",
    title: "AI kaynak kalıntısı",
    detail: "AI'ın kaynak gösterme işaretleri metinde kalmış; karşı tarafa anlamsız kod olarak görünür.",
    severity: "high",
    fixable: true,
    detect: detectAiArtifact,
    examples: {
      catch: [
        "Rapor hazır :contentReference[oaicite:0]{index=0}",
        "Güncel bilgi citeturn0search3",
        "Kaynak 【4†source】 burada",
        "Link: https://example.com/?utm_source=chatgpt.com",
        "[cite_start]Proje yeni başladı.[cite: 1]"
      ],
      pass: ["https://example.com/?utm_source=newsletter", "Kaynak [1] makalesi", "Saat 14.00'te dönüş yaptım"]
    }
  },
  {
    id: "header",
    group: "format",
    mark: "ꝺ",
    label: "Konu satırı mesajın içinde",
    desc: "\"Subject:\", \"Konu:\", \"Kime:\" gibi satırlar mesajın içine yapışmış.",
    why: "AI e-postayı konu satırıyla birlikte yazar; hepsini kopyalayınca konu, mesajın ilk satırı olarak gider.",
    title: "Konu satırı mesajın içinde",
    detail: "\"Subject:/Konu:\" gibi satırlar AI çıktısından gövdeye taşınmış. Konu ayrı alana yazılmalı.",
    severity: "high",
    bodyOnly: true,
    fixable: true,
    detect: detectHeader,
    examples: {
      catch: ["Subject: Toplantı\n\nMerhaba", "Merhaba\nKonu: yarınki toplantı\nGörüşürüz", "Kime: Onur Bey\n\nSayın Hocam"],
      pass: ["Bu konu: önemli bir mesele.", "Toplantı konusu yarın netleşir.", "Kime yazacağımı bilemedim."]
    }
  },
  {
    id: "placeholder",
    group: "facts",
    mark: "?",
    label: "Doldurulmamış yer tutucu",
    desc: "[saat aralığı], {isim}, <Adınız>, XX:XX, \"Sayın ,\" gibi AI'ın senin doldurman için bıraktığı boşluklar.",
    why: "AI bilmediği bilgiyi uydurmak yerine boşluk bırakır; doldurulmazsa mesaj yarım görünür.",
    title: "Doldurulmamış yer tutucu",
    detail: "AI'ın senin doldurman için bıraktığı boşluklar olduğu gibi duruyor.",
    severity: "high",
    detect: detectPlaceholders,
    examples: {
      catch: [
        "Cuma günü [saat aralığı] arasında",
        "Sayın {isim},",
        "Saygılarımla, Adınız Soyadınız",
        "Saat XX:XX'te",
        "Sayın , toplantı hakkında",
        "Dersim (buraya ders adını yazın) saatinde"
      ],
      pass: [
        "Kaynak [1] ve [2] numaralı makaleler",
        "Detaylar [burada](https://example.com) yazıyor",
        "Adresim <ali@example.com>",
        "XX. yüzyılın başında",
        "XXL beden",
        "Merhaba, nasılsınız?",
        "Sayın Hocam, iyi günler"
      ]
    }
  },
  {
    id: "aiPhrase",
    group: "ai",
    mark: "ꝺ",
    label: "AI sohbet kalıbı",
    desc: "\"İşte e-postanız:\", \"Umarım yardımcı olur\", \"Here's a draft\" gibi AI'ın sana söylediği cümleler.",
    why: "Bu cümleler AI'ın sana yazdığı kısımdır; karşı tarafa gidince mesajın AI'dan kopyalandığı anlaşılır.",
    title: "AI'ın sana yazdığı cümleler",
    detail: "Bu ifadeler karşı tarafa değil, AI'dan sana hitap ediyor.",
    severity: "high",
    detect: detectAiPhrases,
    examples: {
      catch: [
        "Tabii! İşte e-postanız:\n\nSayın Hocam",
        "Sayın Hocam,\n\nUmarım bu yardımcı olur.",
        "Here's a draft:\n\nDear Sir",
        "Would you like me to make it shorter?",
        "İŞTE E-POSTANIZ:\n\nMerhaba"
      ],
      pass: ["İşte bu yüzden toplantıya katılamadım.", "Umarım iyisinizdir.", "Size yardımcı olabilirsem sevinirim."]
    }
  },
  {
    id: "versions",
    group: "ai",
    mark: "ꝺ",
    label: "Birden fazla versiyon",
    desc: "\"Seçenek 1:\", \"Versiyon 2:\", \"Daha resmi versiyon:\" gibi AI'ın sunduğu alternatiflerin hepsi yapıştırılmış.",
    why: "AI birkaç alternatif yazdığında hepsini kopyalamak kolaydır; karşı taraf aynı mesajın iki halini okur.",
    title: "Birden fazla versiyon yapıştırılmış",
    detail: "AI'ın sunduğu alternatiflerin başlıkları metinde; büyük ihtimalle birden fazla versiyon kopyalandı.",
    severity: "high",
    bodyOnly: true,
    detect: detectVersions,
    examples: {
      catch: ["Seçenek 1:\nSayın Hocam\n\nSeçenek 2:\nMerhaba Hocam", "Option A:\nDear team", "**Versiyon 2:**\nMerhaba", "Daha resmi versiyon:\nSayın Hocam"],
      pass: ["Versiyon 2.1 yayınlandı.", "Bir seçenek olarak cuma günü gelebilirim.", "Alternatif olarak perşembe gelebilirim."]
    }
  },
  {
    id: "aiNote",
    group: "ai",
    mark: "ꝺ",
    label: "AI'ın sana notu",
    desc: "\"Not: Tarihleri kendine göre düzenleyebilirsin.\" gibi AI'ın metnin sonuna eklediği açıklamalar.",
    why: "AI çoğu zaman çıktının altına sana yönelik bir not ekler; bu not mesajın parçası değildir.",
    title: "AI'ın sana bıraktığı not",
    detail: "Bu not karşı tarafa değil sana yazılmış; mesajdan çıkarılmalı.",
    severity: "high",
    bodyOnly: true,
    covers: ["aiPhrase", "placeholder"],
    detect: detectAiNote,
    examples: {
      catch: ["Sayın Hocam,\n\nNot: Tarihleri kendine göre düzenleyebilirsin.", "Note: Feel free to adjust the tone.", "İpucu: Kendi bilgilerini ekleyebilirsin."],
      pass: ["Not: Toplantı 14.00'te başlayacak.", "Note: the office is closed on Friday."]
    }
  },
  {
    id: "duplicate",
    group: "ai",
    mark: "ꝺ",
    label: "Tekrarlanan metin",
    desc: "Aynı cümle iki kez, iki \"Saygılarımla\" ya da iki \"Sayın …\" satırı.",
    why: "Metin iki kez yapıştırıldığında ya da iki versiyon birleştiğinde olur.",
    title: "Metin tekrar ediyor",
    detail: "Aynı cümle veya selamlama/kapanış birden fazla kez geçiyor; metin iki kez yapıştırılmış olabilir.",
    severity: "high",
    bodyOnly: true,
    detect: detectDuplicate,
    examples: {
      catch: [
        "Toplantıya bu hafta katılamayacağımı bildirmek istiyorum. Toplantıya bu hafta katılamayacağımı bildirmek istiyorum.",
        "Sayın Hocam,\nMerhaba.\nSaygılarımla\nUmut\n\nSayın Hocam,\nSaygılarımla"
      ],
      pass: ["Teşekkürler. Teşekkürler.", "Sayın Hocam,\n\nYarın uygunum.\n\nSaygılarımla,\nUmut"]
    }
  },
  {
    id: "dateMismatch",
    group: "facts",
    mark: "!",
    label: "Tarih-gün uyuşmazlığı",
    desc: "\"29 Eylül 2026 Pazartesi\" gibi tarihin haftanın gününe uymaması ya da \"31 Şubat\" gibi olmayan tarihler.",
    why: "AI tarihlerin hangi güne denk geldiğini sık sık yanlış hesaplar; yanlış gün toplantıyı kaçırtır.",
    title: "Tarih ile gün uyuşmuyor",
    detail: (hits) => hits[0].note,
    severity: "high",
    detect: detectDateMismatch,
    examples: {
      catch: ["29 Eylül 2026 Pazartesi günü", "Pazartesi, 29 Eylül 2026", "Monday, September 29, 2026", "29.09.2026 Pazartesi", "31 Şubat 2026 tarihinde"],
      pass: ["29 Eylül 2026 Salı günü", "Salı, 29 Eylül 2026", "Tuesday, September 29, 2026", "30 Eylül 2026 Çarşamba", "Mart ayında 3 gün izinliyim"]
    }
  },
  {
    id: "timeRange",
    group: "facts",
    mark: "!",
    label: "Hatalı saat",
    desc: "\"17.00-14.00\" gibi ters aralıklar ya da \"25:00\" gibi olmayan saatler.",
    why: "AI saat aralıklarını karıştırabilir; hatalı saat karşı tarafı yanlış zamana yönlendirir.",
    title: "Saat hatalı görünüyor",
    detail: (hits) => hits[0].note,
    severity: "medium",
    detect: detectTimeRange,
    examples: {
      catch: ["Cuma 17.00-14.00 arası", "Saat 25:00'te", "14.70-15.00 arasında"],
      pass: ["14.00-14.40 saatlerinde", "09.00-13.00 arası", "Fiyat 12.50-13.20 TL", "22.00-01.00 arası vardiya", "Saat 24:00'te"]
    }
  },
  {
    id: "markdown",
    group: "format",
    mark: "ꝺ",
    label: "Markdown işaretleri",
    desc: "**kalın**, ## başlık, ```kod```, [link](url), tablolar gibi e-postada ham görünen işaretler.",
    why: "AI sohbet ekranında biçimli görünen metin, e-postaya yapıştırınca yıldız ve diyez işaretleriyle görünür.",
    title: "Markdown işaretleri",
    detail: "E-postada **, ## veya [link](url) işaretleri ham karakter olarak görünür.",
    severity: "medium",
    fixable: true,
    detect: detectMarkdown,
    examples: {
      catch: [
        "Bu **önemli** bir not",
        "## Başlık\nmetin",
        "```\nkod\n```",
        "Detaylar [burada](https://example.com) yazıyor",
        "| Gün | Saat |\n|---|---|\n| Pzt | 14 |",
        "Komut `npm test` ile çalışır"
      ],
      pass: ["2 * 3 = 6", "- madde bir\n- madde iki", "Önemli: yarın 14.00"]
    }
  },
  {
    id: "emojiBullets",
    group: "format",
    mark: "ꝺ",
    label: "Emoji madde işaretleri",
    desc: "✅ 📌 🔹 gibi emojilerle başlayan satırlar.",
    why: "AI listeleri emojilerle süsler; resmi bir e-postada yapay görünür.",
    title: "Emoji madde işaretleri",
    detail: "Satırlar AI tarzı emojilerle başlıyor; resmi yazışmada yapay durur.",
    severity: "medium",
    bodyOnly: true,
    detect: detectEmojiBullets,
    examples: {
      catch: ["✅ Birinci madde\n✅ İkinci madde", "📌 Not\n🔹 Detay"],
      pass: ["Teşekkürler 🙏", "✅ Tamamdır", "Harika 👍 görüşürüz 👋"]
    }
  },
  {
    id: "glued",
    group: "format",
    mark: "#",
    label: "Yapışık kelimeler",
    desc: "\"ederim.Saygılarımla\", \"HakkındaSayın\" gibi satır sonu kaybolunca birleşen kelimeler.",
    why: "Biçimli metin düz metin kutusuna yapıştırılınca satır sonları kaybolur ve cümleler birleşir.",
    title: "Yapışık kelimeler",
    detail: "Satır sonları kaybolunca cümleler ve kelimeler birbirine yapışmış.",
    severity: (hits) => (hits.length >= 2 ? "high" : "medium"),
    bodyOnly: true,
    fixable: true,
    detect: detectGlued,
    examples: {
      catch: ["Görüşürüz.Teşekkürler", "Katılım HakkındaSayın Hocam", "Algan20220205023 numaralı"],
      pass: ["Sayın Dr.Öğr.Üyesi Ahmet Bey", "WhatsApp ve PowerPoint üzerinden", "ENG454 dersi saat 14.00-14.40 arası", "Prof.Dr. Ayşe Hanım"]
    }
  },
  {
    id: "flattened",
    group: "format",
    mark: "¶",
    label: "Paragraflar kaybolmuş",
    desc: "Selamlama/kapanış içeren uzun metin hiç satır sonu olmadan tek blok halinde.",
    why: "Karşı taraf selamlama, gövde ve imzayı ayırt edemediği tek bir paragraf görür.",
    title: "Paragraflar kaybolmuş",
    detail: "Uzun mesaj tek satır halinde; selamlama, gövde ve imza birbirine girmiş.",
    severity: "high",
    bodyOnly: true,
    fixable: true,
    detect: detectFlattened,
    examples: {
      catch: [FLAT_EXAMPLE],
      pass: [FLAT_EXAMPLE.replace("Sayın Hocam, ", "Sayın Hocam,\n\n"), "Kısa bir mesaj, saygılarımla."]
    }
  },
  {
    id: "invisible",
    group: "format",
    mark: "ꝺ",
    label: "Gizli karakterler",
    desc: "Sıfır genişlikli boşluk gibi görünmeyen ama metinde duran karakterler.",
    why: "Kopyalanan metinlerde kalır; arama, kopyalama ve bazı sistemlerde metnin bozulmasına yol açabilir.",
    title: "Görünmeyen karakterler var",
    detail: "Metinde gözle görülmeyen karakterler var; genelde başka bir yerden kopyalanan metinden kalır.",
    severity: "medium",
    fixable: true,
    detect: detectInvisible,
    examples: {
      catch: ["Mer\u200Bhaba Hocam", "Test\uFEFF metni"],
      pass: ["Aile 👨\u200D👩\u200D👧 fotoğrafı", "Merhaba\u00A0Hocam"]
    }
  },
  {
    id: "typography",
    group: "ai",
    mark: "·",
    label: "AI yazım izleri",
    desc: "Türkçe klavyeyle neredeyse hiç yazılmayan uzun tire karakterinin sık kullanımı.",
    why: "Tek başına sorun değildir, ama metnin kopyalandığına işaret eder. Sadece başka bir sorun varsa gösterilir.",
    title: "Metin kopyalanmış gibi görünüyor",
    detail: "Uzun tire Türkçe klavyeyle pek yazılmaz; AI metinlerinde çok sık görülür.",
    severity: "low",
    detect: detectTypography,
    examples: {
      catch: ["Toplantı \u2014 bence \u2014 iptal edilmeli."],
      pass: ["Toplantı - bence - iptal edilmeli.", "Tek bir \u2014 tire"]
    }
  },
  {
    id: "custom",
    group: "facts",
    mark: "!",
    label: "Kendi eklediğin ifadeler",
    desc: "Ayarlarda yasakladığın kelime ve ifadeler.",
    why: "Sana özel hataları (örneğin \"tam zamanlı\") yakalamak için.",
    title: "Yasakladığın ifade",
    detail: "Ayarlarda eklediğin bir ifade metinde geçiyor.",
    severity: "high",
    detect: detectCustom
  },
  {
    // Handled in content.js: it needs the paste history of the live text field.
    id: "paste",
    group: "send",
    mark: "⏱",
    label: "Hızlı yapıştır-gönder",
    desc: "Metnin çoğu yapıştırılmış ve okumaya yetecek süre geçmeden gönderiliyor.",
    why: "Asıl hataların çoğu, yapıştırılan metin hiç okunmadan gönderildiğinde olur."
  }
];

var DETECTOR_GROUPS = [
  { id: "ai", label: "AI'dan kalanlar" },
  { id: "format", label: "Biçim bozulmaları" },
  { id: "facts", label: "Bilgi hataları" }
];

var DETECTOR_INFO = Object.fromEntries(DETECTORS.map((d) => [d.id, d]));

var DEFAULT_SETTINGS = {
  enabled: true,
  detectors: Object.fromEntries(DETECTORS.map((d) => [d.id, true])),
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

var SEVERITY_ORDER = { high: 0, medium: 1, low: 2 };

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

// For showing snippets: line breaks and invisible characters become visible markers.
function visibleText(s) {
  return s.replace(/\n/g, " ↵ ").replace(INVISIBLE_RE, "⍽");
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

// Blank out AI citation markers (same length, so offsets don't move) before the other checks run.
// ":contentReference[oaicite:0]{index=0}" is one problem, not also a placeholder and a glued word.
function maskArtifacts(text) {
  let masked = text;
  for (const h of detectAiArtifact({ text })) {
    masked = masked.slice(0, h.index) + " ".repeat(h.length) + masked.slice(h.index + h.length);
  }
  return masked;
}

function analyzeText(text, settings, opts = {}) {
  const now = opts.now || new Date();
  const masked = maskArtifacts(text);
  const raw = { text, folded: fold(text), settings, now };
  const ctx = masked === text ? raw : { text: masked, folded: fold(masked), settings, now };
  const found = new Map();
  for (const d of DETECTORS) {
    if (!d.detect || !settings.detectors[d.id]) continue;
    if (opts.singleLine && d.bodyOnly) continue;
    found.set(d.id, dedupeHits(d.detect(d.id === "aiArtifact" ? raw : ctx)));
  }
  // A detector that `covers` others claims their hits inside its own: an AI note line that says
  // "feel free to adjust" is one AI note, not also an AI phrase.
  for (const d of DETECTORS) {
    if (!d.covers || !found.has(d.id)) continue;
    const outer = found.get(d.id);
    for (const id of d.covers) {
      if (!found.has(id)) continue;
      found.set(id, found.get(id).filter((h) =>
        !outer.some((o) => h.index >= o.index && h.index + h.length <= o.index + o.length)));
    }
  }

  const issues = [];
  for (const d of DETECTORS) {
    const hits = found.get(d.id);
    if (!hits || hits.length === 0) continue;
    issues.push({
      id: d.id,
      severity: typeof d.severity === "function" ? d.severity(hits) : d.severity,
      title: d.title,
      detail: typeof d.detail === "function" ? d.detail(hits) : d.detail,
      count: hits.length,
      hits: hits.slice(0, opts.maxHits || 5).map((h) => ({ ...h, text: text.slice(h.index, h.index + h.length) }))
    });
  }
  // Array sort is stable, so within a severity the registry order is kept.
  return issues.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}

// ---------- one-click fixes ----------

var FIX_LABELS = {
  aiArtifact: "Kalıntıları sil",
  invisible: "Gizli karakterleri sil",
  header: "Satırı sil",
  markdown: "İşaretleri temizle",
  glued: "Ayır",
  flattened: "Paragraflara ayır"
};
// Artifacts and invisible characters go first because they can sit inside words the later fixes
// look at; markdown before header so "**Konu:** …" becomes a plain header line the header fix removes.
var FIX_ORDER = ["aiArtifact", "invisible", "markdown", "header", "glued", "flattened"];

// A single-line message lost its line breaks, so glue points become breaks; otherwise just spaces.
function fixMode(text) {
  return text.trim().includes("\n") ? "space" : "break";
}

function glueReplacement(hit, mode) {
  if (mode === "space") return " ";
  if (hit.kind === "comma") return hit.cut < 60 ? "\n\n" : "\n";
  if (hit.kind === "digit") return "\n";
  return "\n\n";
}

function headerEdits(text) {
  const cuts = detectGlued({ text }).map((h) => h.cut);
  return dedupeHits(detectHeader({ text })).map((h) => {
    const lineStart = text.lastIndexOf("\n", h.index - 1) + 1;
    const atLineStart = !text.slice(lineStart, h.index).trim();
    const lineEnd = text.indexOf("\n", h.index);
    let start = atLineStart ? lineStart : h.index;
    let end;
    // A real header line is short; a very long "line" is the whole message with its breaks lost.
    if (lineEnd !== -1 && lineEnd - h.index <= 200) {
      end = atLineStart ? lineEnd + 1 : lineEnd;
    } else {
      // Flattened text: the subject runs straight into the body, so cut at the first glue point.
      const cut = cuts.filter((c) => c > h.index + h.length && c - h.index <= 200).sort((a, b) => a - b)[0];
      end = cut !== undefined ? cut : h.index + h.length + (text.slice(h.index + h.length).match(/^\s*/)[0].length);
    }
    if (start === 0) {
      while (end < text.length && /\s/.test(text[end])) end += 1;
    } else if (!atLineStart) {
      while (start > 0 && text[start - 1] === " ") start -= 1;
    }
    return { start, end, text: "" };
  });
}

function markdownEdits(text) {
  const edits = [];
  for (const m of text.matchAll(/\*\*([^*\n]{1,80})\*\*/g)) {
    edits.push({ start: m.index, end: m.index + 2, text: "" });
    edits.push({ start: m.index + m[0].length - 2, end: m.index + m[0].length, text: "" });
  }
  for (const m of text.matchAll(/^[ \t]*#{1,6}[ \t]+/gm)) {
    edits.push({ start: m.index, end: m.index + m[0].length, text: "" });
  }
  for (const m of text.matchAll(/^[ \t]*```[^\n]*\n?/gm)) {
    edits.push({ start: m.index, end: m.index + m[0].length, text: "" });
  }
  // [metin](https://…) → metin (https://…)
  for (const m of text.matchAll(/\[([^\]\n]{1,80})\]\((https?:\/\/[^)\s]+)\)/g)) {
    edits.push({ start: m.index, end: m.index + m[0].length, text: `${m[1]} (${m[2]})` });
  }
  // `kod` → kod
  for (const m of text.matchAll(/(?<!`)`([^`\n]{1,40})`(?!`)/g)) {
    edits.push({ start: m.index, end: m.index + 1, text: "" });
    edits.push({ start: m.index + m[0].length - 1, end: m.index + m[0].length, text: "" });
  }
  return edits;
}

function artifactEdits(text) {
  return dedupeHits(detectAiArtifact({ text })).map((h) => {
    let start = h.index;
    const end = h.index + h.length;
    // "?utm_source=chatgpt.com&page=2" keeps its other parameters: "?page=2"
    if (text[start] === "?" && text[end] === "&") return { start, end: end + 1, text: "?" };
    // Don't leave a double space where a marker sat between two words.
    if (text[start - 1] === " " && (end === text.length || /[\s.,;:!?)]/.test(text[end]))) start -= 1;
    return { start, end, text: "" };
  });
}

// A single-block message: split at glue points, and also give the greeting and the sign-off their
// own lines, which is where a flattened email most obviously lost its structure.
function flattenedEdits(text) {
  const folded = fold(text);
  const edits = glueEdits(text, "break");
  const greeting = folded.match(/^\s*(?:sayin|sevgili|merhaba|değerli|dear|hi|hello)[^,\n]{0,40},([ \t]+)(?=\S)/u);
  if (greeting) {
    const end = greeting[0].length;
    edits.push({ start: end - greeting[1].length, end, text: "\n\n" });
  }
  const closing = new RegExp(`[ \\t]+(${CLOSING_LINES.map((w) => escapeRe(fold(w))).join("|")})(?![\\p{L}])(,?)([ \\t]+)?`, "gu");
  const last = [...folded.matchAll(closing)].pop();
  if (last && last.index > text.length / 2) {
    const spaceEnd = last.index + last[0].length - (last[3] || "").length - last[2].length - last[1].length;
    edits.push({ start: last.index, end: spaceEnd, text: "\n\n" });
    if (last[3]) {
      const afterComma = last.index + last[0].length;
      edits.push({ start: afterComma - last[3].length, end: afterComma, text: "\n" });
    }
  }
  return edits;
}

function invisibleEdits(text) {
  return detectInvisible({ text }).map((h) => ({ start: h.index, end: h.index + 1, text: "" }));
}

function glueEdits(text, mode) {
  const seen = new Set();
  const edits = [];
  for (const h of detectGlued({ text })) {
    if (seen.has(h.cut)) continue;
    seen.add(h.cut);
    edits.push({ start: h.cut, end: h.cut, text: glueReplacement(h, mode) });
  }
  return edits;
}

// Returns non-overlapping edits sorted from the end of the text to the start,
// so applying them in order never shifts the positions of the ones still to come.
function computeFixEdits(id, text, mode = fixMode(text)) {
  let edits = [];
  if (id === "aiArtifact") edits = artifactEdits(text);
  else if (id === "invisible") edits = invisibleEdits(text);
  else if (id === "header") edits = headerEdits(text);
  else if (id === "markdown") edits = markdownEdits(text);
  else if (id === "glued") edits = glueEdits(text, mode);
  else if (id === "flattened") edits = flattenedEdits(text);

  // Safety net: a fix only trims artifacts, it never removes a large chunk of the message.
  edits = edits.filter((e) => e.end - e.start <= 200);
  edits.sort((a, b) => b.start - a.start || b.end - a.end);
  const out = [];
  let floor = Infinity;
  for (const e of edits) {
    if (e.end > floor) continue;
    out.push(e);
    floor = e.start;
  }
  return out;
}

function applyEditsToString(text, edits) {
  let t = text;
  for (const e of edits) t = t.slice(0, e.start) + e.text + t.slice(e.end);
  return t;
}

function autoFixText(text, ids) {
  const mode = fixMode(text);
  let t = text;
  for (const id of FIX_ORDER) {
    if (ids.includes(id)) t = applyEditsToString(t, computeFixEdits(id, t, mode));
  }
  return t;
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

// Settings live in storage.sync so they follow the user's Chrome profile to other devices.
// Stats stay in storage.local: they are per-device and change far too often for sync quotas.
// If sync is unavailable (disabled, over quota), settings quietly fall back to local.
async function readSettingsRaw() {
  try {
    const { settings } = await chrome.storage.sync.get("settings");
    if (settings) return settings;
  } catch {
    // sync unavailable; fall through to local
  }
  const { settings: local } = await chrome.storage.local.get("settings");
  if (local) {
    // Settings saved by Sendry 1.1 or earlier: move them to sync once.
    try {
      await chrome.storage.sync.set({ settings: local });
      await chrome.storage.local.remove("settings");
    } catch {
      // keep them in local
    }
  }
  return local;
}

async function getSettings() {
  return mergeSettings(await readSettingsRaw());
}

async function saveSettings(partial) {
  const next = mergeSettings({ ...(await getSettings()), ...partial });
  try {
    await chrome.storage.sync.set({ settings: next });
    await chrome.storage.local.remove("settings");
  } catch {
    await chrome.storage.local.set({ settings: next });
  }
  return next;
}

function isSettingsChange(changes, area) {
  return (area === "sync" || area === "local") && !!changes.settings && !!changes.settings.newValue;
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
