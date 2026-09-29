import { test, expect, ORIGIN } from "./fixtures.js";

const BAD = "Tabii! İşte yorumun:\n\nBence bu **harika** bir fikir.Teşekkürler";

test.beforeEach(async ({ page }) => {
  await page.goto(`${ORIGIN}/shadow.html`);
});

// Playwright locators pierce open shadow roots but not closed ones, so reach into the closed
// composer through the reference the page kept.
const inComposer = (page, id, selector) =>
  page.evaluateHandle(([id, sel]) => window.__roots[id].querySelector(sel), [id, selector]);

for (const id of ["open-composer", "closed-composer"]) {
  test(`${id}: a send from inside a shadow root is caught and can be fixed`, async ({ page, sendry }) => {
    const textarea = await inComposer(page, id, "textarea");
    await textarea.click();
    await page.keyboard.insertText(BAD);

    // Clicking into the text box of a "Comment composer" is not a send.
    await textarea.click();
    await expect(sendry.modal).toHaveCount(0);

    await (await inComposer(page, id, "button")).click();
    await expect(sendry.modal).toBeVisible();
    expect(await sendry.log()).toEqual([]);

    await sendry.fixButton("İşaretleri temizle").click();
    expect(await textarea.evaluate((el) => el.value)).not.toContain("**");

    await sendry.confirmAndSend();
    await expect.poll(() => sendry.log()).toEqual([`${id}:submitted`]);
  });

  test(`${id}: Enter in a shadow-root form is caught`, async ({ page, sendry }) => {
    await page.evaluate((id) => {
      const form = window.__roots[id].querySelector("form");
      form.insertAdjacentHTML("afterbegin", '<input type="text" name="title">');
    }, id);
    const input = await inComposer(page, id, "input");
    await input.click();
    await page.keyboard.insertText("[konu başlığı]");
    await page.keyboard.press("Enter");

    await expect(sendry.modal).toBeVisible();
    expect(await sendry.log()).toEqual([]);
  });
}

test("a custom-element button labelled through a slot is recognised", async ({ page, sendry }) => {
  await page.fill("#plain", "Merhaba [isim]");
  await page.click("#custom-send");
  await expect(sendry.modal).toBeVisible();
  expect(await sendry.log()).toEqual([]);
});
