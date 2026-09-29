import { test } from "node:test";
import assert from "node:assert/strict";
import { loadCommon, plain } from "./load-common.js";
import { SENT_EMAIL, CORRECTED_EMAIL } from "./fixtures.js";

const S = loadCommon();
const ALL = ["markdown", "header", "glued", "flattened"];
const fix = (text) => S.autoFixText(text, ALL);
const remaining = (text) => plain(S.analyzeText(text, S.DEFAULT_SETTINGS)).map((i) => i.id);

test("the sent email is rebuilt into paragraphs; only the placeholder is left for the user", () => {
  const fixed = fix(SENT_EMAIL);
  assert.ok(fixed.startsWith("Sayın Onur Bey,\n\nİyi günler dilerim."), fixed.slice(0, 60));
  assert.ok(fixed.includes("(20220205023).\n\nTam zamanlı"));
  assert.ok(fixed.endsWith("Saygılarımla,\nUmutcan Algan\n20220205023\nBilişim Sistemleri Mühendisliği"));
  assert.ok(!fixed.includes("Subject"));
  assert.deepEqual(remaining(fixed), ["placeholder"]);
});

test("regression: fixing a single-block message never wipes it", () => {
  // A trailing newline (as rich editors report it) once made the whole message look like one
  // "Subject:" line, and the header fix deleted everything.
  for (const text of [SENT_EMAIL, SENT_EMAIL + "\n", "**" + SENT_EMAIL.replace("Subject:", "Subject:**")]) {
    const fixed = fix(text);
    assert.ok(fixed.length > text.length * 0.8, `lost too much text: ${fixed.length} of ${text.length}`);
    assert.ok(fixed.includes("Saygılarımla"));
  }
});

test("no single edit removes more than 200 characters", () => {
  const long = "Subject: " + "a".repeat(400) + "\nMetin";
  for (const id of ALL) {
    for (const e of plain(S.computeFixEdits(id, long))) {
      assert.ok(e.end - e.start <= 200, `${id} edit removes ${e.end - e.start} chars`);
    }
  }
});

test("clean text is never modified", () => {
  assert.equal(fix(CORRECTED_EMAIL), CORRECTED_EMAIL);
  assert.equal(fix("Merhaba,\n\nYarın görüşürüz.\n\nSaygılarımla"), "Merhaba,\n\nYarın görüşürüz.\n\nSaygılarımla");
});

test("multi-line text: header line removed, glue gets a space, markdown stripped", () => {
  const text = "Subject: Toplantı\n\nMerhaba,\nYarın görüşelim.Teşekkürler\n## Notlar\n**önemli** konu";
  assert.equal(fix(text), "Merhaba,\nYarın görüşelim. Teşekkürler\nNotlar\nönemli konu");
});

test("markdown runs first, so a bold header is removed too", () => {
  assert.equal(fix("**Konu:** Toplantı\n\nMerhaba"), "Merhaba");
});

test("edits are sorted end-to-start and never overlap", () => {
  for (const id of ALL) {
    const edits = plain(S.computeFixEdits(id, SENT_EMAIL));
    for (let i = 1; i < edits.length; i++) {
      assert.ok(edits[i].end <= edits[i - 1].start, `${id} edits overlap or are out of order`);
    }
  }
});

test("fixing is idempotent", () => {
  const once = fix(SENT_EMAIL);
  assert.equal(fix(once), once);
});
