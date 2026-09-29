import { test } from "node:test";
import assert from "node:assert/strict";
import { loadCommon, plain } from "./load-common.js";
import { SENT_EMAIL, CORRECTED_EMAIL } from "./fixtures.js";

const S = loadCommon();
const analyze = (text, opts) => plain(S.analyzeText(text, S.DEFAULT_SETTINGS, opts));
const ids = (text, opts) => analyze(text, opts).map((i) => i.id).sort();
const hitsOf = (text, id) => (analyze(text).find((i) => i.id === id) || { hits: [] }).hits.map((h) => h.text);

test("the email that was actually sent is caught on four counts", () => {
  assert.deepEqual(ids(SENT_EMAIL), ["flattened", "glued", "header", "placeholder"]);
  assert.deepEqual(hitsOf(SENT_EMAIL, "header"), ["Subject:"]);
  assert.deepEqual(hitsOf(SENT_EMAIL, "placeholder"), ["[saat aralığı]"]);
  assert.ok(hitsOf(SENT_EMAIL, "glued").includes("HakkındaSayın"));
});

test("the corrected email passes cleanly", () => {
  assert.deepEqual(ids(CORRECTED_EMAIL), []);
});

test("header lines", () => {
  assert.deepEqual(ids("Subject: Toplantı\n\nMerhaba"), ["header"]);
  assert.deepEqual(ids("Merhaba\nKonu: yarınki toplantı\nGörüşürüz"), ["header"]);
  // "konu" in the middle of a sentence is just a word
  assert.deepEqual(ids("Bu konu: önemli bir mesele."), []);
});

test("placeholders", () => {
  for (const p of ["[saat aralığı]", "{isim}", "{{company}}", "<Adınız>", "XX:XX", "XX.XX.XXXX", "Adınız Soyadınız", "____"]) {
    assert.deepEqual(ids(`Toplantı ${p} için`), ["placeholder"], p);
  }
});

test("placeholder look-alikes are left alone", () => {
  for (const text of [
    "Kaynak [1] ve [2] numaralı makaleler",
    "Adresim <ali@example.com>",
    "XX. yüzyılın başında",
    "XXL beden"
  ]) {
    assert.deepEqual(ids(text), [], text);
  }
  // A markdown link is a markdown problem, not an unfilled placeholder.
  assert.deepEqual(ids("Detaylar [burada](https://example.com) yazıyor"), ["markdown"]);
});

test("AI chat phrases and openers", () => {
  assert.deepEqual(ids("Tabii! İşte e-postanız:\n\nSayın Hocam"), ["aiPhrase"]);
  assert.deepEqual(ids("Here's a draft:\n\nDear Sir"), ["aiPhrase"]);
  assert.deepEqual(ids("Sayın Hocam,\n\nUmarım bu yardımcı olur."), ["aiPhrase"]);
  // Turkish capital İ/I must fold correctly
  assert.deepEqual(ids("İŞTE E-POSTANIZ:\n\nMerhaba"), ["aiPhrase"]);
});

test("markdown", () => {
  assert.deepEqual(ids("Bu **önemli** bir not"), ["markdown"]);
  assert.deepEqual(ids("## Başlık\nmetin"), ["markdown"]);
  assert.deepEqual(ids("```\nkod\n```"), ["markdown"]);
});

test("glued words, and the abbreviations and brand names that look glued but aren't", () => {
  assert.deepEqual(ids("Görüşürüz.Teşekkürler"), ["glued"]);
  assert.deepEqual(ids("Algan20220205023 numaralı"), ["glued"]);
  for (const text of [
    "Sayın Dr.Öğr.Üyesi Ahmet Bey",
    "Prof.Dr. Ayşe Hanım",
    "WhatsApp ve PowerPoint üzerinden",
    "JavaScript ile LinkedIn",
    "ENG454 dersi saat 14.00-14.40 arası"
  ]) {
    assert.deepEqual(ids(text), [], text);
  }
});

test("single-line inputs (subject fields) skip body-only checks", () => {
  assert.deepEqual(ids("Subject: test.Merhaba", { singleLine: true }), []);
  assert.deepEqual(ids("[konu] toplantı", { singleLine: true }), ["placeholder"]);
});

test("custom phrases", () => {
  const settings = { ...S.DEFAULT_SETTINGS, customPhrases: ["tam zamanlı"] };
  const found = plain(S.analyzeText("Tam zamanlı çalışıyorum", settings)).map((i) => i.id);
  assert.deepEqual(found, ["custom"]);
});

test("disabled detectors stay silent", () => {
  const settings = { ...S.DEFAULT_SETTINGS, detectors: { ...S.DEFAULT_SETTINGS.detectors, header: false } };
  const found = plain(S.analyzeText("Subject: X\n\nMerhaba", settings)).map((i) => i.id);
  assert.deepEqual(found, []);
});

test("read time scales with length and respects the configured bounds", () => {
  const settings = S.DEFAULT_SETTINGS;
  assert.equal(S.computeReadSeconds("kısa", settings), settings.minReadSeconds);
  assert.equal(S.computeReadSeconds("kelime ".repeat(1000), settings), settings.maxReadSeconds);
  assert.equal(S.computeReadSeconds("kelime ".repeat(120), settings), 30);
});

test("site matching covers subdomains but not look-alikes", () => {
  const settings = S.DEFAULT_SETTINGS;
  assert.equal(S.isSiteDisabled(settings, "chatgpt.com"), true);
  assert.equal(S.isSiteDisabled(settings, "www.chatgpt.com"), true);
  assert.equal(S.isSiteDisabled(settings, "gemini.google.com"), true);
  assert.equal(S.isSiteDisabled(settings, "mail.google.com"), false);
  assert.equal(S.isSiteDisabled(settings, "notchatgpt.com"), false);
});
