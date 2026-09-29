import { test } from "node:test";
import assert from "node:assert/strict";
import { loadCommon, plain } from "./load-common.js";
import { CORRECTED_EMAIL } from "./fixtures.js";

const S = loadCommon();
const NOW = new Date(2026, 8, 29, 12, 0);

// Ordinary messages people actually write. With 17 detectors the risk is false alarms, so none of
// these may block a send. Add any message that Sendry wrongly stopped in real use to this list.
const CLEAN = [
  CORRECTED_EMAIL,
  `Merhaba Ayşe,

Yarın 14.00-15.30 arası toplantı odası müsait mi? 30 Eylül 2026 Çarşamba için rezervasyon yapabilirim.

- Gündem: bütçe
- Katılımcılar: Ali, Zeynep

Teşekkürler,
Mehmet`,
  `Sayın Prof.Dr. Yılmaz,

Ekte ödevimi gönderiyorum. Kaynakça [1] ve [2] numaralı makalelerden oluşuyor.
Detaylar: https://example.com/odev?id=42

Saygılarımla,
Zeynep Kaya
Öğrenci No: 20210101001`,
  `Hi team,

Quick update — the release is on track for Tuesday, September 29, 2026.
Please review the PR before 17:00.

Thanks!`,
  `Hocam merhaba, cuma günü 12.00'de odanıza uğrayabilir miyim? Teşekkürler 🙏`,
  `Not: Toplantı 24:00'e kadar sürebilir, vardiya 22.00-06.00 arası.

İyi çalışmalar`,
  `Fiyat aralığı 12.50-13.20 TL, XL ve XXL bedenler stokta. WhatsApp veya LinkedIn üzerinden yazabilirsiniz.`,
  `Merhaba,

Toplantı notları:
1. Bütçe onaylandı.
2. Yeni tarih 5 Ekim 2026 Pazartesi.

Görüşmek üzere.`
];

test("ordinary messages never block a send", () => {
  for (const text of CLEAN) {
    const blocking = plain(S.analyzeText(text, S.DEFAULT_SETTINGS, { now: NOW }))
      .filter((i) => i.severity !== "low")
      .map((i) => `${i.id}: ${i.hits.map((h) => h.text).join(" | ")}`);
    assert.deepEqual(blocking, [], `false alarm in:\n${text}`);
  }
});
