import { test, expect, ORIGIN } from "./fixtures.js";

test("re-injecting the content script (what an update does) leaves exactly one active copy", async ({ page, worker, sendry }) => {
  await page.goto(`${ORIGIN}/form.html`);

  // Same call background.js makes for open tabs after install/update.
  await worker.evaluate(async (url) => {
    const [tab] = await chrome.tabs.query({ url });
    await chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, files: ["common.js", "content.js"] });
  }, `${ORIGIN}/form.html`);

  await page.fill("#body", "Merhaba [isim]");
  await page.click("#portal button[type=submit]");

  await expect(sendry.modal).toHaveCount(1);
  await expect.poll(() => sendry.stats()).toMatchObject({ checked: 1, blocked: 1 });
});

test("options page: the test box finds issues and auto-fix cleans them", async ({ page, extensionId }) => {
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  await page.fill("#test-input", "**Konu:** Test\nMerhaba,\nYarın uygunum.Teşekkürler");

  await expect(page.locator(".result strong")).toHaveText(["Yapışık kelimeler", "Markdown işaretleri"]);
  await page.click(".fix-btn");
  await expect(page.locator("#test-input")).toHaveValue("Merhaba,\nYarın uygunum. Teşekkürler");
  await expect(page.locator(".clean")).toBeVisible();
});

test("options page: settings are saved to sync storage", async ({ page, extensionId, worker }) => {
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  await page.fill("#opt-customPhrases", "tam zamanlı");
  await page.locator("#opt-customPhrases").blur();

  await expect.poll(() => worker.evaluate(async () => {
    const { settings } = await chrome.storage.sync.get("settings");
    return settings && settings.customPhrases;
  })).toEqual(["tam zamanlı"]);
});

test("popup shows today's numbers", async ({ page, extensionId, sendry }) => {
  await page.goto(`${ORIGIN}/form.html`);
  await page.fill("#body", "Merhaba [isim]");
  await page.click("#portal button[type=submit]");
  await expect.poll(() => sendry.stats()).toMatchObject({ blocked: 1 });

  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await expect(page.locator("#stat-blocked")).toHaveText("1");
  await expect(page.locator("#detector-list li")).toContainText(["Doldurulmamış yer tutucu"]);
});
