import { test as base, expect, chromium } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PORT } from "../../../playwright.config.js";

const EXTENSION_PATH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../sendry");

export const ORIGIN = `http://localhost:${PORT}`;
export const OTHER_ORIGIN = `http://127.0.0.1:${PORT}`;

export const test = base.extend({
  // A fresh Chromium profile with the real, unpacked extension loaded. Extensions only run in
  // Chromium's new headless mode, which the "chromium" channel provides.
  context: async ({}, use) => {
    const context = await chromium.launchPersistentContext("", {
      channel: "chromium",
      args: [`--disable-extensions-except=${EXTENSION_PATH}`, `--load-extension=${EXTENSION_PATH}`]
    });
    await use(context);
    await context.close();
  },

  worker: async ({ context }, use) => {
    let [worker] = context.serviceWorkers();
    if (!worker) worker = await context.waitForEvent("serviceworker");
    await use(worker);
  },

  extensionId: async ({ worker }, use) => {
    await use(new URL(worker.url()).host);
  },

  page: async ({ context }, use) => {
    const page = context.pages()[0] || (await context.newPage());
    await use(page);
  },

  sendry: async ({ page, worker }, use) => {
    await use(new Sendry(page, worker));
  }
});

export { expect };

// Helpers for driving the page and reading the extension's state.
class Sendry {
  constructor(page, worker) {
    this.page = page;
    this.worker = worker;
    this.modal = page.locator("sendry-modal");
  }

  issueTitles() {
    return this.modal.locator(".issue strong").allTextContents();
  }

  fixButton(label) {
    return this.modal.locator("button.fix", { hasText: label });
  }

  async confirmAndSend() {
    await this.modal.locator(".confirm input").check();
    await this.modal.locator("button.ghost", { hasText: "Yine de gönder" }).click();
  }

  // What the page itself recorded (it pushes to window.__log when a send really happens).
  log(frame = this.page) {
    return frame.evaluate(() => window.__log.slice());
  }

  // Simulates pasting text: sets the content, then fires the paste event Sendry listens for.
  async paste(locator, text) {
    await locator.evaluate((el, value) => {
      el.focus();
      if (el.isContentEditable) el.innerText = value;
      else el.value = value;
      const data = new DataTransfer();
      data.setData("text/plain", value);
      el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, composed: true }));
      el.dispatchEvent(new InputEvent("input", { bubbles: true, composed: true }));
    }, text);
  }

  // Marks a paste as having happened long ago, so the reading-time cooldown doesn't apply.
  async agePaste(locator) {
    await locator.evaluate((el) => { el.dataset.sendryPasteTs = String(Date.now() - 10 * 60 * 1000); });
  }

  async stats() {
    return this.worker.evaluate(async () => {
      const { stats } = await chrome.storage.local.get("stats");
      return Object.values(stats || {})[0] || { checked: 0, blocked: 0, fixed: 0, bypassed: 0, detectors: {} };
    });
  }

  async setSettings(partial) {
    await this.worker.evaluate(async (p) => {
      const { settings } = await chrome.storage.sync.get("settings");
      await chrome.storage.sync.set({ settings: { ...(settings || {}), ...p } });
    }, partial);
  }
}
