import { test, expect, ORIGIN } from "./fixtures.js";

test.beforeEach(async ({ page }) => {
  await page.goto(`${ORIGIN}/frames.html`);
});

for (const [name, selector] of [["same-origin", "#same"], ["cross-origin", "#cross"]]) {
  test(`${name} iframe: the modal opens full-size on the top page and acts on the iframe`, async ({ page, sendry }) => {
    const frame = page.frameLocator(selector);
    const editor = frame.locator("#editor");
    await editor.fill("Subject: Toplantı\n\nSayın Hocam, [tarih] günü uygun musunuz?\n\nSaygılarımla");
    await editor.press("Control+Enter");

    // The modal belongs to the top page, not the 160px iframe.
    await expect(sendry.modal).toBeVisible();
    await expect(frame.locator("sendry-modal")).toHaveCount(0);
    const frameHandle = await (await page.$(selector)).contentFrame();
    expect(await sendry.log(frameHandle)).toEqual([]);

    // A fix chosen on the top page is applied to the text inside the iframe…
    await sendry.fixButton("Satırı sil").click();
    await expect.poll(() => editor.innerText()).not.toContain("Subject");
    expect(await sendry.issueTitles()).toEqual(["Doldurulmamış yer tutucu"]);

    // …and "send anyway" replays the Ctrl+Enter inside the iframe.
    await sendry.confirmAndSend();
    await expect.poll(() => sendry.log(frameHandle)).toEqual(["editor:ctrl-enter"]);
  });

  test(`${name} iframe: a send button inside the frame is caught too`, async ({ page, sendry }) => {
    const frame = page.frameLocator(selector);
    await frame.locator("#editor").fill("Merhaba {isim}");
    await frame.locator("#send").click();

    await expect(sendry.modal).toBeVisible();
    const frameHandle = await (await page.$(selector)).contentFrame();
    expect(await sendry.log(frameHandle)).toEqual([]);
  });
}
