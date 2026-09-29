import { test, expect, ORIGIN } from "./fixtures.js";
import { SENT_EMAIL, CORRECTED_EMAIL } from "../unit/fixtures.js";

test.beforeEach(async ({ page }) => {
  await page.goto(`${ORIGIN}/form.html`);
});

const sendButton = (page) => page.locator("#portal button[type=submit]");

test("the email that was actually sent is stopped before it leaves", async ({ page, sendry }) => {
  await page.fill("#body", SENT_EMAIL);
  await sendButton(page).click();

  await expect(sendry.modal).toBeVisible();
  expect(await sendry.issueTitles()).toEqual([
    "Başlık satırı mesajın içinde",
    "Doldurulmamış yer tutucu",
    "Yapışık kelimeler",
    "Paragraflar kaybolmuş"
  ]);
  expect(await sendry.log()).toEqual([]);
  await expect.poll(() => sendry.stats()).toMatchObject({ checked: 1, blocked: 1 });
});

test("the corrected email goes straight through", async ({ page, sendry }) => {
  await page.fill("#body", CORRECTED_EMAIL);
  await sendButton(page).click();

  await expect.poll(() => sendry.log()).toEqual(["portal:submitted"]);
  await expect(sendry.modal).toHaveCount(0);
});

test("cancel buttons are never intercepted", async ({ page, sendry }) => {
  await page.fill("#body", SENT_EMAIL);
  await page.click("#cancel");
  expect(await sendry.log()).toEqual(["portal:cancel"]);
  await expect(sendry.modal).toHaveCount(0);
});

test("fix all, fill the placeholder by hand, then the send goes through and counts as fixed", async ({ page, sendry }) => {
  await page.fill("#body", SENT_EMAIL);
  await sendButton(page).click();
  await sendry.modal.locator("button.fix-all").click();

  // Only the placeholder is left, and the modal comes back for it.
  expect(await sendry.issueTitles()).toEqual(["Doldurulmamış yer tutucu"]);
  const fixed = await page.inputValue("#body");
  expect(fixed.startsWith("Sayın Onur Bey,\n\nİyi günler dilerim.")).toBe(true);
  expect(fixed).not.toContain("Subject");

  // "Düzenlemeye dön" puts the cursor on the placeholder.
  await sendry.modal.locator("button.primary").click();
  expect(await page.evaluate(() => {
    const el = document.getElementById("body");
    return el.value.slice(el.selectionStart, el.selectionEnd);
  })).toBe("[saat aralığı]");

  await page.keyboard.type("14.00-17.00");
  await sendButton(page).click();
  await expect.poll(() => sendry.log()).toEqual(["portal:submitted"]);
  await expect.poll(() => sendry.stats()).toMatchObject({ blocked: 2, fixed: 1, bypassed: 0 });
});

test("sending anyway needs the 'I read it' box and is counted", async ({ page, sendry }) => {
  await page.fill("#body", "Subject: Test\n\nMerhaba [isim]");
  await sendButton(page).click();

  const sendAnyway = sendry.modal.locator("button.ghost", { hasText: "Yine de gönder" });
  await expect(sendAnyway).toBeDisabled();
  await sendry.confirmAndSend();

  await expect.poll(() => sendry.log()).toEqual(["portal:submitted"]);
  await expect.poll(() => sendry.stats()).toMatchObject({ blocked: 1, bypassed: 1 });
});

test("a fresh paste has to be read before 'send anyway' unlocks", async ({ page, sendry }) => {
  await sendry.paste(page.locator("#body"), "Subject: Test\n\n" + "Bu uzun bir paragraf. ".repeat(40));
  await sendButton(page).click();

  expect(await sendry.issueTitles()).toContainEqual(expect.stringMatching(/^Yapıştırdıktan \d+ sn sonra gönderiyorsun$/));
  await sendry.modal.locator(".confirm input").check();
  await expect(sendry.modal.locator("button.ghost", { hasText: /Yine de gönder \(\d+ sn\)/ })).toBeDisabled();
});

test("Gmail style: Ctrl+Enter is caught, and clicking a snippet selects it in the editor", async ({ page, sendry }) => {
  await page.fill("#editor", "Sayın Hocam,\n\nToplantı {tarih} günü olsun.\n\nSaygılarımla");
  await page.press("#editor", "Control+Enter");

  await expect(sendry.modal).toBeVisible();
  expect(await sendry.log()).toEqual([]);

  await sendry.modal.locator(".snippet").first().click();
  expect(await page.evaluate(() => getSelection().toString())).toBe("{tarih}");
});

test("Gmail style: the div 'button' is caught and 'send anyway' really clicks it", async ({ page, sendry }) => {
  await page.fill("#editor", "Merhaba [isim],\n\nYarın görüşürüz.");
  await page.click("#gmail-send");
  await expect(sendry.modal).toBeVisible();
  expect(await sendry.log()).toEqual([]);

  await sendry.confirmAndSend();
  await expect.poll(() => sendry.log()).toEqual(["gmail:sent"]);
});

test("rich editor: fix all rebuilds a single-block message without losing it", async ({ page, sendry }) => {
  await page.fill("#editor", SENT_EMAIL.replace("[saat aralığı]", "14.00-17.00"));
  await page.click("#gmail-send");
  await sendry.modal.locator("button.fix-all").click();

  // Nothing blocking is left, so the modal closes and the user gets a toast instead of a send.
  await expect(sendry.modal).toHaveCount(0);
  await expect(page.locator("sendry-toast")).toHaveCount(1);
  expect(await sendry.log()).toEqual([]);

  const text = await page.locator("#editor").innerText();
  expect(text.startsWith("Sayın Onur Bey,")).toBe(true);
  expect(text).toContain("Saygılarımla,\nUmutcan Algan");
  expect(text.length).toBeGreaterThan(SENT_EMAIL.length * 0.8);
});

test("Gmail reply: the quoted message below is ignored, only the new text is checked", async ({ page, sendry }) => {
  await page.locator("#editor").evaluate((el) => {
    el.innerHTML =
      "<div>Merhaba Ayşe,</div><div><br></div><div>Tamamdır, cuma görüşürüz.</div><div><br></div><div>Saygılarımla</div>" +
      '<div class="gmail_quote"><div class="gmail_attr">---------- Forwarded message ---------<br>From: Ali<br>Subject: Toplantı</div>' +
      "<blockquote>Merhaba,<br>Toplantı [saat] olsun.<br>Saygılarımla</blockquote></div>";
    el.dispatchEvent(new InputEvent("input", { bubbles: true }));
  });
  await page.click("#gmail-send");

  await expect.poll(() => sendry.log()).toEqual(["gmail:sent"]);
  await expect(sendry.modal).toHaveCount(0);
});

test("new detectors show up in the page: wrong weekday and ChatGPT citation markers", async ({ page, sendry }) => {
  await page.fill("#body", "Sayın Hocam,\n\n29 Eylül 2026 Pazartesi günü uygunum :contentReference[oaicite:0]{index=0}\n\nSaygılarımla");
  await sendButton(page).click();

  expect(await sendry.issueTitles()).toEqual(["AI kaynak kalıntısı", "Tarih ile gün uyuşmuyor"]);
  await expect(sendry.modal.locator(".detail").nth(1)).toHaveText("29.09.2026 Salı gününe denk geliyor, metinde Pazartesi yazıyor.");

  await sendry.fixButton("Kalıntıları sil").click();
  expect(await page.inputValue("#body")).toBe("Sayın Hocam,\n\n29 Eylül 2026 Pazartesi günü uygunum\n\nSaygılarımla");
});

test("a disabled site is left alone", async ({ page, sendry }) => {
  await sendry.setSettings({ disabledSites: ["localhost"] });
  await page.reload();
  await page.fill("#body", SENT_EMAIL);
  await sendButton(page).click();
  await expect.poll(() => sendry.log()).toEqual(["portal:submitted"]);
});

test("settings changes reach open tabs without a reload", async ({ page, sendry }) => {
  await sendry.setSettings({ detectors: { header: false } });
  // storage.onChanged reaches the content script asynchronously
  await page.waitForTimeout(300);

  await page.fill("#body", "Subject: Toplantı\n\nMerhaba,\n\nYarın uygunum.");
  await sendButton(page).click();
  await expect.poll(() => sendry.log()).toEqual(["portal:submitted"]);
});
