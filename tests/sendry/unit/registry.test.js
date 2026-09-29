import { test } from "node:test";
import assert from "node:assert/strict";
import { loadCommon, plain } from "./load-common.js";

const S = loadCommon();
const NOW = new Date(2026, 8, 29, 12, 0); // 29 Eylül 2026, Salı
const idsIn = (text) => plain(S.analyzeText(text, S.DEFAULT_SETTINGS, { now: NOW })).map((i) => i.id);

// Every example in the registry is a test: `catch` must trigger its detector, `pass` must not.
for (const d of S.DETECTORS) {
  if (!d.examples) continue;
  test(`${d.id}: catches its examples`, () => {
    for (const text of d.examples.catch) {
      assert.ok(idsIn(text).includes(d.id), `${d.id} missed: ${JSON.stringify(text)}`);
    }
  });
  test(`${d.id}: leaves its look-alikes alone`, () => {
    for (const text of d.examples.pass) {
      assert.ok(!idsIn(text).includes(d.id), `${d.id} false alarm on: ${JSON.stringify(text)}`);
    }
  });
}

test("every detector is fully described", () => {
  const ids = new Set();
  for (const d of S.DETECTORS) {
    assert.ok(!ids.has(d.id), `duplicate id ${d.id}`);
    ids.add(d.id);
    for (const key of ["label", "desc", "why"]) assert.ok(d[key], `${d.id} has no ${key}`);
    if (!d.detect) continue;
    for (const key of ["title", "detail", "severity"]) assert.ok(d[key], `${d.id} has no ${key}`);
    if (d.id !== "custom") {
      assert.ok(d.examples && d.examples.catch.length >= 1, `${d.id} needs at least one catch example`);
      assert.ok(d.examples.pass.length >= 1, `${d.id} needs at least one pass example`);
    }
  }
});

test("detectors marked fixable have a fix, and every fix belongs to a fixable detector", () => {
  const fixable = plain(S.DETECTORS.filter((d) => d.fixable).map((d) => d.id)).sort();
  assert.deepEqual(plain(Object.keys(S.FIX_LABELS)).sort(), fixable);
  assert.deepEqual(plain(S.FIX_ORDER).sort(), fixable);
});

test("every detector has a default setting and an entry for the options page", () => {
  for (const d of S.DETECTORS) {
    assert.equal(S.DEFAULT_SETTINGS.detectors[d.id], true, d.id);
    assert.equal(S.DETECTOR_INFO[d.id].label, d.label);
  }
});

test("fixing a detector's catch examples makes that detector go quiet", () => {
  for (const d of S.DETECTORS.filter((x) => x.fixable)) {
    for (const text of d.examples.catch) {
      const fixed = S.autoFixText(text, [d.id]);
      // Tables have no automatic fix; everything else must be cleared.
      if (d.id === "markdown" && text.includes("|---|")) continue;
      assert.ok(!idsIn(fixed).includes(d.id), `${d.id} still present after fix: ${JSON.stringify(fixed)}`);
    }
  }
});

test("low-severity signals never block on their own", () => {
  const issues = plain(S.analyzeText("Toplantı — bence — iptal edilmeli.", S.DEFAULT_SETTINGS, { now: NOW }));
  assert.deepEqual(issues.map((i) => [i.id, i.severity]), [["typography", "low"]]);
});

test("date mismatch explains the correct weekday", () => {
  const issue = plain(S.analyzeText("29 Eylül 2026 Pazartesi günü", S.DEFAULT_SETTINGS, { now: NOW }))
    .find((i) => i.id === "dateMismatch");
  assert.equal(issue.detail, "29.09.2026 Salı gününe denk geliyor, metinde Pazartesi yazıyor.");
});

test("a date without a year is checked against this year and next", () => {
  // 29 Eylül is Tuesday in 2026 and Wednesday in 2027
  assert.ok(!idsIn("29 Eylül Salı günü").includes("dateMismatch"));
  assert.ok(!idsIn("29 Eylül Çarşamba günü").includes("dateMismatch"));
  assert.ok(idsIn("29 Eylül Cuma günü").includes("dateMismatch"));
});
